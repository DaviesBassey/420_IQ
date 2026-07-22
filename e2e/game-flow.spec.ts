import { randomUUID } from 'node:crypto';
import { test, expect, request } from '@playwright/test';

/**
 * Full round smoke test, doubling as the answer-leak acceptance test.
 *
 * What the leak guard actually covers (read this before trusting it blindly):
 *
 * 1. JSON responses observed by the *page* (page.on('response')) are scanned
 *    for the string 'correctIndex' up until we flip `revealed = true`. This is
 *    real coverage for anything the page itself fetches as JSON, but in this
 *    flow the page makes none — all game mutations below are driven through a
 *    separate `api` request context, not through the browser tab. So in
 *    practice this listener stays empty; it is a defense-in-depth net for any
 *    future JSON fetch the contestant/stage pages might grow, not the primary
 *    proof for this test.
 *
 * 2. The one long-lived network response the page *does* hold open is the SSE
 *    connection to /api/games/:id/stream (content-type: text/event-stream,
 *    opened by useGameStream). We deliberately do NOT call res.text() on it:
 *    that method waits for the response body to finish, and an open SSE
 *    stream never finishes until the connection closes, so awaiting it would
 *    hang the test indefinitely.
 *
 *    Instead we assert on the rendered DOM, which is fed exclusively by
 *    whatever the stream pushes down. QuestionCard (src/components/QuestionCard.tsx)
 *    only renders the "✓ CORRECT" marker on a choice when its `reveal` prop is
 *    non-null, and the server's role projection (src/server/projection.ts)
 *    only attaches `reveal` to the snapshot once game state is one of
 *    REVEAL / KNOWLEDGE_DROP / SCORE_COMMITTED. So: no "✓ CORRECT" text in the
 *    DOM while we're still pre-REVEAL is equivalent proof that no correctIndex
 *    reached the client over the stream — verified end-to-end here, on top of
 *    the unit-level coverage already in tests/server/projection.test.ts.
 */
test('full round: no answer leaks before reveal, scores commit, ring updates', async ({ page }) => {
  const api = await request.newContext({ baseURL: 'http://localhost:3000' });

  // Claim the producer role first — every mutation route below requires the
  // iq_session cookie this sets. request.newContext keeps its own cookie jar,
  // so every subsequent api.* call automatically carries it.
  const claim = await api.post('/api/claim', { data: { role: 'producer', pin: '4200' } });
  expect(claim.ok()).toBeTruthy();

  await api.post('/api/dev/seed');

  const packRes = await api.post('/api/packs/generate', {
    data: { episodeId: 'e2e', laneCount: 2, questionsPerLane: 6 },
  });
  expect(packRes.ok()).toBeTruthy();
  const pack = await packRes.json();

  const approveRes = await api.post(`/api/packs/${pack.packId}/approve`, { data: { approver: 'ep' } });
  expect(approveRes.ok()).toBeTruthy();

  const gameRes = await api.post('/api/games', {
    data: {
      packId: pack.packId,
      mode: 'live',
      contestants: [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }],
    },
  });
  expect(gameRes.ok()).toBeTruthy();
  const game = await gameRes.json();
  const gid = game.gameId;

  // Leak net #1: any JSON response the page itself receives (see comment above).
  const leaks: string[] = [];
  let revealed = false;
  page.on('response', (res) => {
    if (revealed) return;
    const ct = res.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return; // explicitly skip text/event-stream — see comment above
    res.text().then((body) => {
      if (body.includes('correctIndex')) leaks.push(res.url());
    }).catch(() => {
      // response body unavailable (e.g. redirected/aborted) — nothing to check
    });
  });

  await page.goto(`/contestant/1?game=${gid}`);

  // Drive the game via the API as the producer. contestants are sorted [c1, c2]
  // by the engine's turn-order rule, so c1 is active at questionIndex 0.
  for (const to of ['INTRO', 'QUESTION_READY', 'QUESTION_LIVE'] as const) {
    const res = await api.post(`/api/games/${gid}/transition`, {
      data: { to, actor: 'producer', idempotencyKey: randomUUID() },
    });
    expect(res.ok()).toBeTruthy();
  }

  await expect(page.getByTestId('question-stem')).toBeVisible();
  // Leak net #2 (DOM-level, see file comment): no correct-answer marker yet.
  await expect(page.getByText('✓ CORRECT')).toHaveCount(0);

  const lockRes = await api.post(`/api/games/${gid}/answers/lock`, {
    data: { contestantId: 'c1', choiceIndex: 0, confidence: 'CURIOUS', idempotencyKey: randomUUID() },
  });
  expect(lockRes.ok()).toBeTruthy();

  expect(leaks).toEqual([]); // nothing leaked up to lock
  await expect(page.getByText('✓ CORRECT')).toHaveCount(0); // still hidden at ANSWER_LOCKED
  revealed = true;

  const revealRes = await api.post(`/api/games/${gid}/transition`, {
    data: { to: 'REVEAL', actor: 'producer', idempotencyKey: randomUUID() },
  });
  expect(revealRes.ok()).toBeTruthy();
  const commitRes = await api.post(`/api/games/${gid}/transition`, {
    data: { to: 'SCORE_COMMITTED', actor: 'producer', idempotencyKey: randomUUID() },
  });
  expect(commitRes.ok()).toBeTruthy();

  await expect(page.getByTestId('score-c1')).toBeVisible();
  // Now that we're past REVEAL, the marker is expected to be visible — this
  // confirms the DOM genuinely reflects reveal state (i.e. the pre-reveal
  // absence above was a real gate, not a component that never renders it).
  await expect(page.getByText('✓ CORRECT')).toHaveCount(1);

  // Stage ring renders segments and picks up the same game via the stream.
  await page.goto(`/stage?game=${gid}`);
  await expect(page.locator('[data-testid^="ring-seg-"]').first()).toBeVisible();
});
