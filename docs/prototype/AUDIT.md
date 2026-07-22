# Prototype Audit: `premium_quiz.html`

This audit covers `docs/prototype/premium_quiz.html`, the pre-existing prototype
that the pilot control system (this repo) replaces. It exists to document what
was inherited, what was salvageable, and why the prototype could not simply be
patched into a production tool for a live studio recording.

## What it is

A single self-contained HTML file, **5,705 lines**, mixing markup, inline CSS,
and inline JavaScript in one document (`<script>` and `<style>` blocks embedded
directly, no build step, no server). It runs entirely client-side in a browser
tab. There is no backend, no database, and no network protocol of any kind —
every concept of "game state" lives in that one tab's DOM and JS variables.

## Critical finding: correct answers are shipped to the client

The question bank is a hard-coded JS array (`defaultQuestions`, lines
3268–3477) embedded directly in the page:

```js
{
  "category": "Geography",
  "question": "What is the capital of Nigeria?",
  "answers": ["Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt"],
  "correctAnswer": 1,
  "explanation": "Abuja became Nigeria's official capital in 1991, replacing Lagos."
}
```

`correctAnswer` — the index of the correct choice — is present in the same
object the browser uses to render the question, for every question, from the
moment the page loads. Anyone with the browser's dev tools open (or view-source)
can read every correct answer before a single question is asked. For a
knowledge-competition format where contestants and viewers share the same
network and often the same room as the control laptop, this is not a
theoretical risk — it is a guaranteed leak the moment someone glances at the
page source or the JS console.

A second array, `defaultTieBreakers` (lines 3478–3635, ~12 questions), has the
identical problem and was not even considered for import (see Salvage below).

This single finding is why the new system's answer-security invariant exists
(`docs/superpowers/specs/2026-07-22-pilot-control-system-design.md`): the
correct index is a server-side-only field (`QuestionVersionData.correctIndex`)
that is stripped by construction before any question payload reaches a
network boundary (`src/domain/publicQuestion.ts`'s `PublicQuestion` type has no
`correctIndex` field at all — it is not merely omitted at serialization time,
it does not exist on the type contestants/stage receive), and is verified
end-to-end by `e2e/game-flow.spec.ts`.

## Persistence: `localStorage` only

All game state — scores, question progress, tie-breaker results — is written
to the browser's `localStorage` under two keys, `quizRoyalePremiumState` and
`quizRoyaleQuestionSet` (lines 3638, 3805). Consequences:

- **Single point of failure.** Closing the tab, clearing site data, or a
  browser crash mid-episode loses the entire game. There is no server record
  to recover from.
- **No multi-display architecture.** `localStorage` is scoped to one browser
  tab/origin; there is no mechanism for a second screen (stage display,
  contestant podium, host monitor) to see the same live state. The prototype
  is fundamentally a single-screen tool, not a multi-display studio control
  system.
- **No audit trail.** Nothing is append-only or event-sourced; state is
  overwritten in place, so there is no way to reconstruct what actually
  happened during a taping after the fact.

## Missing format features

The prototype implements a single fixed multiple-choice quiz loop with a
tie-breaker fallback. None of the format's actual game mechanics exist:

- No lifelines (Trusted Circle, Source Signal) — no concept of a lifeline at all.
- No confidence wagering (Curious/Confident/Certain multipliers).
- No steal mechanic.
- No teams / multi-contestant turn order — it is architected for one player
  answering a static question list, not two-or-more contestants alternating
  lanes.
- No multi-display support (host / contestant / stage) — one page renders
  everything for one viewer.
- No realtime push of any kind — no SSE/WebSocket, no server, so nothing can
  be projected to a second screen even in principle.
- No question workflow (draft → review → approved → locked → used → retired),
  no fairness/balance constraints across a pack, no PIN-gated roles, no
  event-sourced score ledger.

In short: the prototype is a demo of the general quiz-show *idea*, not an
implementation of the 420 IQ format as specified.

## Salvage

What was reusable from the prototype, and nothing more:

- **The 16 `defaultQuestions` entries** (general trivia — capital cities,
  planets, arithmetic, etc.) were extracted verbatim (stem, choices,
  correctIndex, explanation) and imported as `DRAFT`-status questions by the
  seed script (`src/data/seedData.ts`'s `PROTOTYPE_QUESTIONS`, sourced from
  `docs/prototype/premium_quiz.html`, `sourceUrl` field preserved for
  traceability). They are explicitly generic-trivia filler, not 420 IQ-domain
  content, and sit in `DRAFT` — they still have to pass the same editorial
  workflow as any other question before they could air. The 12
  `defaultTieBreakers` were **not** imported; they share the same client-side
  exposure problem and add no format-relevant content over what was already
  pulled in.
- Nothing else. No UI code, no state management pattern, no styling, and no
  architectural component from the prototype was carried forward. The design
  tokens, layout, and every mechanic in the new system were built fresh against
  the spec.

## Migration

The prototype is not being incrementally upgraded — it is being replaced
outright. The full replacement plan and design are:

- `docs/superpowers/specs/2026-07-22-pilot-control-system-design.md` — format
  spec: game states, scoring, lifelines, fairness constraints, answer-security
  invariant, display roles.
- `docs/superpowers/plans/2026-07-22-pilot-control-system.md` — the
  task-by-task implementation plan that built this repo (event-sourced
  server-authoritative engine, role-scoped SSE projection, question workflow,
  pack fairness solver, producer console, host/contestant/stage displays,
  editor, PIN-gated roles, audit log).
- `docs/reports/fairness-report.md` — the 10,000-run fairness simulation
  report for the pack-generation solver that replaced the prototype's static
  question list.

`docs/prototype/premium_quiz.html` itself is retained only as a historical
reference for the salvage note above; it is not loaded, imported, or referenced
by any runtime code path in this repo.
