'use client';

import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useGameStream } from '@/components/useGameStream';
import { TimerChip } from '@/components/TimerChip';
import { nextActions } from './nextActions';
import type { GameState } from '@/domain/fsm';
import type { Confidence, LifelineType, RiskBand } from '@/domain/types';

// The console always acts as 'producer' — approvedBy on a score adjustment
// must differ from this value (enforced server-side, checked here too for
// immediate feedback).
const ACTOR = 'producer';

const LIFELINE_LABELS: Record<LifelineType, string> = {
  TRUSTED_CIRCLE: 'Trusted Circle',
  SOURCE_SIGNAL: 'Source Signal',
};

const LIFELINE_TYPES: LifelineType[] = ['TRUSTED_CIRCLE', 'SOURCE_SIGNAL'];
const CONFIDENCE_OPTIONS: Confidence[] = ['CURIOUS', 'CONFIDENT', 'CERTAIN'];
const RISK_BANDS: RiskBand[] = ['HOLD', 'RISE', 'REACH'];

// Trusted Circle phase progression the console can drive via
// /lifelines/circle/resolve — null once there's no further phase to advance
// to (LOCK is terminal; CONSENSUS_FALLBACK never has an advice/lock phase).
const CIRCLE_NEXT_PHASE: Record<string, 'ADVICE' | 'LOCK' | null> = {
  CONNECTING: 'ADVICE',
  ADVICE: 'LOCK',
  LOCK: null,
  CONSENSUS_FALLBACK: null,
};

function displayLinks(gameId: string): { label: string; path: string }[] {
  return [
    { label: 'Host', path: `/host?game=${gameId}` },
    { label: 'Contestant 1', path: `/contestant/1?game=${gameId}` },
    { label: 'Contestant 2', path: `/contestant/2?game=${gameId}` },
    { label: 'Stage', path: `/stage?game=${gameId}` },
  ];
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof (data as { error?: unknown })?.error === 'string' ? (data as { error: string }).error : `Request failed (${res.status})`;
    throw new Error(message);
  }
}

// --- styles (design tokens only — no hardcoded colors) --------------------

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  fontFamily: 'system-ui, sans-serif',
  padding: '1rem',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  marginBottom: '0.75rem',
};

const linksRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
};

const linkChipStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.35rem 0.6rem',
  borderRadius: '6px',
  background: 'var(--graphite-700)',
  border: '1px solid var(--graphite-500)',
  fontSize: '0.8rem',
};

const copyButtonStyle: CSSProperties = {
  padding: '0.25rem 0.5rem',
  borderRadius: '4px',
  border: '1px solid var(--graphite-500)',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  cursor: 'pointer',
  fontSize: '0.75rem',
};

const rehearsalBannerStyle: CSSProperties = {
  border: '2px solid var(--amber-bright)',
  color: 'var(--amber-bright)',
  background: 'var(--graphite-700)',
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textAlign: 'center',
  marginBottom: '0.75rem',
};

const errorStripStyle: CSSProperties = {
  background: 'var(--signal-red)',
  color: 'var(--offwhite)',
  padding: '0.6rem 1rem',
  borderRadius: '6px',
  marginBottom: '0.75rem',
  fontSize: '0.875rem',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 280px) minmax(320px, 1fr) minmax(280px, 340px)',
  gap: '1rem',
  alignItems: 'start',
};

const panelStyle: CSSProperties = {
  background: 'var(--graphite-700)',
  border: '1px solid var(--graphite-500)',
  borderRadius: '8px',
  padding: '1rem',
};

const stateBadgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '0.3rem 0.7rem',
  borderRadius: '999px',
  background: 'var(--amber-deep)',
  color: 'var(--graphite-900)',
  fontWeight: 700,
  fontSize: '0.8rem',
  marginBottom: '0.5rem',
};

const sectionTitleStyle: CSSProperties = {
  fontSize: '0.95rem',
  color: 'var(--amber-bright)',
  margin: '0.75rem 0 0.5rem',
};

const contestantCardStyle: CSSProperties = {
  border: '1px solid var(--graphite-500)',
  borderRadius: '6px',
  padding: '0.5rem 0.75rem',
  marginBottom: '0.5rem',
};

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginBottom: '0.75rem',
};

const actionButtonStyle: CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: '6px',
  border: '1px solid var(--graphite-500)',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

function holdButtonStyle(hold: boolean): CSSProperties {
  return {
    width: '100%',
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid var(--graphite-500)',
    background: hold ? 'var(--signal-red)' : 'var(--graphite-900)',
    color: 'var(--offwhite)',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '0.5rem',
  };
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '0.3rem',
  fontSize: '0.8rem',
  color: 'var(--offwhite)',
};

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  marginBottom: '0.75rem',
  borderRadius: '6px',
  border: '1px solid var(--graphite-500)',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  fontSize: '0.9rem',
};

const choiceRowStyle: CSSProperties = {
  padding: '0.4rem 0',
  borderBottom: '1px solid var(--graphite-500)',
};

const revealPanelStyle: CSSProperties = {
  marginTop: '0.75rem',
  padding: '0.75rem',
  borderRadius: '6px',
  border: '1px solid var(--amber-deep)',
  background: 'var(--graphite-900)',
};

const knowledgeDropStyle: CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.5rem 0.75rem',
  borderRadius: '6px',
  background: 'var(--ultraviolet)',
  color: 'var(--offwhite)',
};

const detailsStyle: CSSProperties = {
  marginTop: '0.5rem',
  border: '1px solid var(--graphite-500)',
  borderRadius: '6px',
  padding: '0.5rem 0.75rem',
};

const summaryStyle: CSSProperties = {
  cursor: 'pointer',
  color: 'var(--amber-bright)',
  fontWeight: 600,
};

export function GameControls({ gameId }: { gameId: string }) {
  const snapshot = useGameStream(gameId, 'producer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [lockContestantId, setLockContestantId] = useState('');
  const [confidence, setConfidence] = useState<Confidence>('CURIOUS');

  const [adjContestantId, setAdjContestantId] = useState('');
  const [adjDelta, setAdjDelta] = useState('0');
  const [adjReason, setAdjReason] = useState('');
  const [adjApprovedBy, setAdjApprovedBy] = useState('');

  const [stealContestantId, setStealContestantId] = useState('');
  const [finalContestantId, setFinalContestantId] = useState('');
  const [finalBand, setFinalBand] = useState<RiskBand>('HOLD');

  // Contestant order comes from snapshot.contestants (array order), not a
  // sort of the scores map's keys — the latter is an unordered object and
  // gives no guarantee its key order matches the producer's intended slot
  // assignment (IMPORTANT 6).
  const contestantIds = useMemo(() => (snapshot?.contestants ?? []).map((c) => c.id), [snapshot]);
  const nameById = useMemo(
    () => Object.fromEntries((snapshot?.contestants ?? []).map((c) => [c.id, c.name])),
    [snapshot],
  );
  const nameFor = (cid: string) => nameById[cid] ?? cid;
  const effectiveLockContestantId = lockContestantId || snapshot?.activeContestantId || contestantIds[0] || '';
  const effectiveAdjContestantId = adjContestantId || contestantIds[0] || '';
  // Steal is only ever available to the contestant who did NOT just answer —
  // activeContestantId still points at the answering contestant through
  // REVEAL (questionIndex only advances on NEXT_QUESTION), so the opponent is
  // whichever other contestant id exists.
  const nonActiveContestantId = contestantIds.find((cid) => cid !== snapshot?.activeContestantId) ?? contestantIds[0] ?? '';
  const effectiveStealContestantId = stealContestantId || nonActiveContestantId;
  const effectiveFinalContestantId = finalContestantId || contestantIds[0] || '';

  if (!snapshot) {
    return (
      <div style={pageStyle}>
        <p>Connecting to game {gameId}…</p>
      </div>
    );
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  function handleTransition(to: GameState) {
    void run(() => postJson(`/api/games/${gameId}/transition`, {
      to, actor: ACTOR, idempotencyKey: crypto.randomUUID(),
    }));
  }

  function handleLifeline(contestantId: string, type: LifelineType) {
    void run(() => postJson(`/api/games/${gameId}/lifelines/${type}/activate`, {
      contestantId, actor: ACTOR, idempotencyKey: crypto.randomUUID(),
    }));
  }

  function handleLock(choiceIndex: number) {
    if (!effectiveLockContestantId) return;
    void run(() => postJson(`/api/games/${gameId}/answers/lock`, {
      contestantId: effectiveLockContestantId,
      choiceIndex,
      confidence,
      idempotencyKey: crypto.randomUUID(),
    }));
  }

  function handleSteal(choiceIndex: number) {
    if (!effectiveStealContestantId) return;
    void run(() => postJson(`/api/games/${gameId}/steal`, {
      contestantId: effectiveStealContestantId,
      choiceIndex,
      idempotencyKey: crypto.randomUUID(),
    }));
  }

  function handleSignalSelect(index: number) {
    void run(() => postJson(`/api/games/${gameId}/lifelines/signal/select`, {
      index,
      idempotencyKey: crypto.randomUUID(),
    }));
  }

  function handleCircleAdvance(phase: 'ADVICE' | 'LOCK') {
    void run(() => postJson(`/api/games/${gameId}/lifelines/circle/resolve`, {
      phase, actor: ACTOR, idempotencyKey: crypto.randomUUID(),
    }));
  }

  function handleFinalLock(choiceIndex: number) {
    if (!effectiveFinalContestantId) return;
    void run(() => postJson(`/api/games/${gameId}/final/lock`, {
      contestantId: effectiveFinalContestantId,
      band: finalBand,
      choiceIndex,
      idempotencyKey: crypto.randomUUID(),
    }));
  }

  function handleAdjustSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!effectiveAdjContestantId) return;
    if (adjApprovedBy.trim() === ACTOR) {
      setError('Approved by must be a different person than the producer.');
      return;
    }
    const delta = Number(adjDelta);
    void run(async () => {
      await postJson(`/api/games/${gameId}/adjust`, {
        contestantId: effectiveAdjContestantId,
        delta,
        reason: adjReason,
        approvedBy: adjApprovedBy,
        actor: ACTOR,
        idempotencyKey: crypto.randomUUID(),
      });
      setAdjReason('');
      setAdjApprovedBy('');
      setAdjDelta('0');
    });
  }

  function handleHoldToggle() {
    void run(() => postJson(`/api/games/${gameId}/hold`, { on: !(snapshot?.hold ?? false) }));
  }

  async function handleCopy(label: string, path: string) {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(label);
      setTimeout(() => setCopied((current) => (current === label ? null : current)), 1500);
    } catch {
      setError(`Could not copy ${label} link — copy it manually: ${url}`);
    }
  }

  const choices = snapshot.publicQuestion?.choices ?? [];
  const actions = nextActions(snapshot.state);
  const circleDetail = snapshot.lifelineDetail?.type === 'TRUSTED_CIRCLE' ? snapshot.lifelineDetail : null;
  const circleNextPhase = circleDetail ? CIRCLE_NEXT_PHASE[circleDetail.phase] : null;

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={{ fontSize: '1.1rem', color: 'var(--amber-bright)' }}>Producer Console — {gameId}</h1>
        <div style={linksRowStyle}>
          {displayLinks(gameId).map(({ label, path }) => (
            <div key={label} style={linkChipStyle}>
              <span>{label}</span>
              <button type="button" style={copyButtonStyle} onClick={() => handleCopy(label, path)}>
                {copied === label ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          ))}
        </div>
      </header>

      {snapshot.mode === 'rehearsal' && (
        <div style={rehearsalBannerStyle}>REHEARSAL MODE — NOT LIVE</div>
      )}

      {snapshot.timer && (
        <div style={{ marginBottom: '0.75rem' }}>
          <TimerChip deadline={snapshot.timer.deadline} kind={snapshot.timer.kind} />
        </div>
      )}

      {error && (
        <div style={errorStripStyle} role="alert">
          {error}
        </div>
      )}

      <div style={gridStyle}>
        <section style={panelStyle} aria-label="Game summary">
          <div style={stateBadgeStyle}>{snapshot.state}</div>
          <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Question {snapshot.questionIndex + 1}</p>

          <h2 style={sectionTitleStyle}>Contestants</h2>
          {contestantIds.map((cid) => (
            <div key={cid} style={contestantCardStyle}>
              <div style={{ fontWeight: 600 }}>
                {nameFor(cid)}
                {snapshot.activeContestantId === cid ? ' (active)' : ''}
              </div>
              <div>Score: {snapshot.scores[cid]}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                {LIFELINE_TYPES.map((type) => (
                  <span key={type} style={{ marginRight: '0.75rem' }}>
                    {LIFELINE_LABELS[type]}: {snapshot.lifelines[cid]?.[type] ? 'used' : 'available'}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <button type="button" style={holdButtonStyle(snapshot.hold)} onClick={handleHoldToggle} disabled={busy}>
            Hold: {snapshot.hold ? 'ON' : 'OFF'}
          </button>
        </section>

        <section style={panelStyle} aria-label="Current question">
          {snapshot.publicQuestion ? (
            <>
              <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                {snapshot.publicQuestion.domain} · {snapshot.publicQuestion.difficulty}
              </p>
              <h2 style={{ ...sectionTitleStyle, margin: '0.25rem 0 0.75rem', fontSize: '1.05rem' }}>
                {snapshot.publicQuestion.stem}
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {snapshot.publicQuestion.choices.map((choice, idx) => (
                  <li key={idx} style={choiceRowStyle}>
                    {choice}
                    {snapshot.reveal && idx === snapshot.reveal.correctIndex ? ' ✓ correct' : ''}
                  </li>
                ))}
              </ul>

              {snapshot.reveal && (
                <div style={revealPanelStyle}>
                  <p>{snapshot.reveal.explanation}</p>
                  <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                    Source: {snapshot.reveal.sourceTitle} ({snapshot.reveal.correctAsOf})
                  </p>
                  {snapshot.reveal.knowledgeDrop && (
                    <div style={knowledgeDropStyle}>
                      <strong>Knowledge Drop:</strong> {snapshot.reveal.knowledgeDrop}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p>No active question.</p>
          )}
        </section>

        <section style={panelStyle} aria-label="Controls">
          <h2 style={sectionTitleStyle}>Transitions</h2>
          <div style={buttonRowStyle}>
            {actions.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>No transitions available.</p>}
            {actions.map((to) => (
              <button key={to} type="button" style={actionButtonStyle} onClick={() => handleTransition(to)} disabled={busy}>
                {to}
              </button>
            ))}
          </div>

          <h2 style={sectionTitleStyle}>Lifelines</h2>
          {contestantIds.map((cid) => (
            <div key={cid} style={buttonRowStyle}>
              <span style={{ fontSize: '0.8rem', marginRight: '0.25rem', alignSelf: 'center' }}>{nameFor(cid)}:</span>
              {LIFELINE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  style={actionButtonStyle}
                  onClick={() => handleLifeline(cid, type)}
                  disabled={busy || Boolean(snapshot.lifelines[cid]?.[type])}
                >
                  {LIFELINE_LABELS[type]}
                </button>
              ))}
            </div>
          ))}

          <h2 style={sectionTitleStyle}>Lock answer</h2>
          <label style={labelStyle} htmlFor="lockContestant">Contestant</label>
          <select
            id="lockContestant"
            style={fieldStyle}
            value={effectiveLockContestantId}
            onChange={(e) => setLockContestantId(e.target.value)}
          >
            {contestantIds.map((cid) => (
              <option key={cid} value={cid}>{nameFor(cid)}</option>
            ))}
          </select>

          <label style={labelStyle} htmlFor="confidence">Confidence</label>
          <select
            id="confidence"
            style={fieldStyle}
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as Confidence)}
          >
            {CONFIDENCE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>

          <div style={buttonRowStyle}>
            {choices.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>No choices to lock.</p>}
            {choices.map((choice, idx) => (
              <button
                key={idx}
                type="button"
                style={actionButtonStyle}
                onClick={() => handleLock(idx)}
                disabled={busy || !effectiveLockContestantId}
              >
                {idx + 1}. {choice}
              </button>
            ))}
          </div>

          {snapshot.stealOpen && (
            <>
              <h2 style={sectionTitleStyle}>Steal</h2>
              <label style={labelStyle} htmlFor="stealContestant">Contestant</label>
              <select
                id="stealContestant"
                style={fieldStyle}
                value={effectiveStealContestantId}
                onChange={(e) => setStealContestantId(e.target.value)}
              >
                {contestantIds.map((cid) => (
                  <option key={cid} value={cid}>{nameFor(cid)}</option>
                ))}
              </select>
              <div style={buttonRowStyle}>
                {choices.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>No choices to steal.</p>}
                {choices.map((choice, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={actionButtonStyle}
                    onClick={() => handleSteal(idx)}
                    disabled={busy || !effectiveStealContestantId}
                  >
                    {idx + 1}. {choice}
                  </button>
                ))}
              </div>
            </>
          )}

          {snapshot.lifelineDetail?.type === 'SOURCE_SIGNAL' && snapshot.lifelineDetail.verifiedIndex === null && (
            <>
              <h2 style={sectionTitleStyle}>Source Signal — pick one</h2>
              <div style={buttonRowStyle}>
                {snapshot.lifelineDetail.signals.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={actionButtonStyle}
                    onClick={() => handleSignalSelect(idx)}
                    disabled={busy}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </>
          )}

          {circleDetail && (
            <>
              <h2 style={sectionTitleStyle}>Trusted Circle</h2>
              <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>
                Phase: {circleDetail.phase}
                {' · '}
                {circleDetail.contactName
                  ? `Contact: ${circleDetail.contactName}`
                  : 'No contact available (consensus fallback)'}
              </p>
              {circleNextPhase && (
                <button
                  type="button"
                  style={actionButtonStyle}
                  disabled={busy}
                  onClick={() => handleCircleAdvance(circleNextPhase)}
                >
                  Advance to {circleNextPhase}
                </button>
              )}
            </>
          )}

          {snapshot.state === 'FINAL' && (
            <>
              <h2 style={sectionTitleStyle}>Final Lock</h2>
              <label style={labelStyle} htmlFor="finalContestant">Contestant</label>
              <select
                id="finalContestant"
                style={fieldStyle}
                value={effectiveFinalContestantId}
                onChange={(e) => setFinalContestantId(e.target.value)}
              >
                {contestantIds.map((cid) => (
                  <option key={cid} value={cid}>{nameFor(cid)}</option>
                ))}
              </select>

              <label style={labelStyle} htmlFor="finalBand">Risk band</label>
              <select
                id="finalBand"
                style={fieldStyle}
                value={finalBand}
                onChange={(e) => setFinalBand(e.target.value as RiskBand)}
              >
                {RISK_BANDS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <div style={buttonRowStyle}>
                {choices.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>No final question loaded.</p>}
                {choices.map((choice, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={actionButtonStyle}
                    onClick={() => handleFinalLock(idx)}
                    disabled={busy || !effectiveFinalContestantId}
                  >
                    {idx + 1}. {choice}
                  </button>
                ))}
              </div>
            </>
          )}

          <details style={detailsStyle}>
            <summary style={summaryStyle}>Adjust score</summary>
            <form onSubmit={handleAdjustSubmit} style={{ marginTop: '0.75rem' }}>
              <label style={labelStyle} htmlFor="adjContestant">Contestant</label>
              <select
                id="adjContestant"
                style={fieldStyle}
                value={effectiveAdjContestantId}
                onChange={(e) => setAdjContestantId(e.target.value)}
              >
                {contestantIds.map((cid) => (
                  <option key={cid} value={cid}>{nameFor(cid)}</option>
                ))}
              </select>

              <label style={labelStyle} htmlFor="adjDelta">Delta</label>
              <input
                id="adjDelta"
                type="number"
                style={fieldStyle}
                value={adjDelta}
                onChange={(e) => setAdjDelta(e.target.value)}
              />

              <label style={labelStyle} htmlFor="adjReason">Reason</label>
              <input
                id="adjReason"
                type="text"
                style={fieldStyle}
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                required
              />

              <label style={labelStyle} htmlFor="adjApprovedBy">Approved by</label>
              <input
                id="adjApprovedBy"
                type="text"
                style={fieldStyle}
                value={adjApprovedBy}
                onChange={(e) => setAdjApprovedBy(e.target.value)}
                required
              />

              <button type="submit" style={actionButtonStyle} disabled={busy}>
                Submit adjustment
              </button>
            </form>
          </details>
        </section>
      </div>
    </div>
  );
}
