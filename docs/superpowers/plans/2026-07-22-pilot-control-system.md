# 420 IQ Pilot Control System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-first Next.js studio game system that runs a complete 420 IQ episode offline: question bank + workflow, balanced-random pack builder, event-sourced live game engine, producer console, host/contestant/stage displays, both lifelines, and an audit trail.

**Architecture:** Three layers in one Next.js app — pure-TypeScript domain layer (FSM, scoring, fairness solver; no I/O), data layer (Drizzle + SQLite behind repository interfaces), app layer (API routes, SSE stream, display UIs). The server game engine is the single authority for state and score; displays only render pushed state.

**Tech Stack:** Next.js 16 (App Router; installed by create-next-app, plan updated from 15 — route handlers use async params), React 19, TypeScript 5 (strict), pnpm, Drizzle ORM + better-sqlite3, zod, Vitest + fast-check, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-pilot-control-system-design.md` — every task implicitly obeys it.
- Scoring values (format v1): Spark 100 (no penalty), Flame 250 (−50 miss), Inferno 500 (opens 200-point steal), Wild 420 = 420. Confidence Curious ×1 / Confident ×1.5 / Certain ×2 (Certain miss ⇒ steal), max 3 confidence uses per contestant. Finals: Hold 250 / Rise 500 / Reach 1000. Score never drops below zero. Whole-number scores only.
- Fairness constraints (pack lanes): equal question count; total difficulty weight within ±5%; per-domain exposure difference ≤1; no more than two same-difficulty questions consecutively; ≥1 Spark in first three; ≥1 Inferno per lane; no duplicate `factKey` anywhere in a pack; mean reading-time difference ≤20%; sensitive-question (Tier 3) count difference ≤1.
- **Answer security:** the correct answer index must never appear in any payload sent to contestant/stage/host-before-reveal clients. Public payloads use the `PublicQuestion` type only.
- Every game state change is an appended immutable event; undo is a compensating event. Score is always derived by folding score events.
- Rehearsal sessions (`mode: 'rehearsal'`) never write question usage history.
- Design tokens from the spec's palette table go in `src/styles/tokens.css`; no green brand color, no leaf iconography, no color-only correctness cues (always pair icon/text).
- Offline-first: no external network calls at runtime (fonts self-hosted, no CDNs).
- All dates recorded in data are absolute ISO-8601.
- Commit after every green test cycle; push to `origin main` after each completed task.

## File Structure

```
src/
  domain/            # pure TS, no I/O
    types.ts         # shared enums/types
    formatConfig.ts  # FORMAT_V1 scoring constants
    scoring.ts       # computeScore fold
    fsm.ts           # states, transition table, guard
    rng.ts           # deterministic seeded RNG (SHA-256 counter)
    fairness.ts      # lane constraint evaluation + balance score
    laneGenerator.ts # candidate generation + best-pick
    publicQuestion.ts# privileged→public projection
  data/
    schema.ts        # Drizzle tables
    db.ts            # SQLite connection factory
    repos.ts         # repository interfaces + Drizzle implementations
  server/
    bus.ts           # in-process event bus for SSE fanout
    gameEngine.ts    # server-authoritative engine service
    packService.ts   # generate/diagnose/approve packs
    auth.ts          # role PIN claim + signed cookie
  app/
    api/...          # route handlers
    claim/           # device role claim page
    console/         # producer console
    host/            # host display
    contestant/[n]/  # contestant displays
    stage/           # stage display
    editor/          # question + pack editor
  components/
    KnowledgeRing.tsx
  styles/
    tokens.css
scripts/
  seed.ts            # prototype import + demo bank
  fairness-sim.ts    # 10,000-run report
tests/               # vitest unit/property tests mirror src/domain, src/server
e2e/                 # playwright
docs/prototype/AUDIT.md
```

---

### Task 1: Project scaffold and design tokens

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `src/styles/tokens.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: runnable `pnpm dev`, `pnpm test`; CSS custom properties (`--amber-deep`, `--ultraviolet`, etc.) available app-wide.

- [ ] **Step 1: Scaffold app**

```bash
cd /Users/daviesbassey/Desktop/420_IQ
pnpm create next-app@latest . --ts --app --src-dir --no-tailwind --eslint --import-alias "@/*" --no-turbopack --skip-install
pnpm add drizzle-orm better-sqlite3 zod
pnpm add -D vitest fast-check @types/better-sqlite3 drizzle-kit @vitejs/plugin-react
```

If `create next-app` refuses a non-empty dir, run it in a temp dir and move files in, preserving `docs/`.

- [ ] **Step 2: Configure Vitest**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

Add scripts to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Write smoke test, watch it fail, make it pass**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs TypeScript tests', () => {
    const x: number = 1 + 1;
    expect(x).toBe(2);
  });
});
```

Run: `pnpm test` → PASS (this one passes immediately; it verifies the toolchain, not logic).

- [ ] **Step 4: Design tokens**

`src/styles/tokens.css`:
```css
:root {
  --amber-deep: #D98E04;
  --amber-bright: #FFB438;
  --ultraviolet: #7B3BF2;
  --violet-deep: #3D1E8F;
  --graphite-900: #101318;
  --graphite-700: #1C2129;
  --graphite-500: #2E3642;
  --offwhite: #F2EFE8;
  --mineral-red: #C0452A;
  --signal-green: #3FA66A;
  --signal-red: #D4453A;
  --ease-premium: cubic-bezier(0.2, 0, 0, 1);
  --dur-micro: 160ms;
  --dur-reveal: 400ms;
  --dur-ceremony: 1200ms;
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-micro: 0ms; --dur-reveal: 150ms; --dur-ceremony: 150ms; }
}
body { background: var(--graphite-900); color: var(--offwhite); }
```

Import `./styles/tokens.css` (adjust relative path) in `src/app/layout.tsx`. Root page renders `<h1>420 IQ</h1>` placeholder.

- [ ] **Step 5: Verify dev server boots**

Run: `pnpm build` — expected: successful production build.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with vitest and design tokens" && git push
```

---

### Task 2: Domain types and format config

**Files:**
- Create: `src/domain/types.ts`, `src/domain/formatConfig.ts`
- Test: `tests/domain/formatConfig.test.ts`

**Interfaces:**
- Produces (used by every later task):

```ts
// src/domain/types.ts
export type Domain =
  | 'SCIENCE' | 'HISTORY' | 'AFRICA_INDIGENOUS' | 'LAW_POLICY'
  | 'HEALTH_SAFETY' | 'CULTURE_MEDIA' | 'BUSINESS_ETHICS' | 'FUTURE_INNOVATION';
export type Difficulty = 'SPARK' | 'FLAME' | 'INFERNO' | 'WILD_420';
export type Confidence = 'CURIOUS' | 'CONFIDENT' | 'CERTAIN';
export type RiskBand = 'HOLD' | 'RISE' | 'REACH';
export type SensitivityTier = 1 | 2 | 3;
export type QuestionStatus =
  | 'DRAFT' | 'EDITORIAL_REVIEW' | 'COUNCIL_REVIEW' | 'APPROVED'
  | 'LOCKED' | 'USED' | 'RETIRED' | 'EXPIRED';
export type SessionMode = 'rehearsal' | 'live';
export type LifelineType = 'TRUSTED_CIRCLE' | 'SOURCE_SIGNAL';

export interface QuestionVersionData {
  questionId: string;
  version: number;
  domain: Domain;
  difficulty: Difficulty;
  stem: string;
  choices: string[];          // 4–5 entries
  correctIndex: number;       // PRIVILEGED — never serialized publicly
  explanation: string;
  knowledgeDrop: string | null;
  sourceTitle: string;
  sourceUrl: string;
  correctAsOf: string;        // ISO date
  jurisdiction: string | null;
  sensitivityTier: SensitivityTier;
  expiresAt: string | null;   // ISO date; required for tier 3
  readTimeSec: number;
  factKey: string;            // dedupe key, e.g. slug of core fact
  demoFlag: string | null;    // e.g. 'general-trivia', 'demo-seed'
}
```

```ts
// src/domain/formatConfig.ts
import type { Confidence, Difficulty, RiskBand } from './types';

export const FORMAT_V1 = {
  id: 'format-v1',
  difficulties: {
    SPARK:   { points: 100, missPenalty: 0,  weight: 1, opensSteal: false },
    FLAME:   { points: 250, missPenalty: 50, weight: 2, opensSteal: false },
    INFERNO: { points: 500, missPenalty: 0,  weight: 4, opensSteal: true },
    WILD_420:{ points: 420, missPenalty: 0,  weight: 3, opensSteal: false },
  } satisfies Record<Difficulty, { points: number; missPenalty: number; weight: number; opensSteal: boolean }>,
  confidence: { CURIOUS: 1, CONFIDENT: 1.5, CERTAIN: 2 } satisfies Record<Confidence, number>,
  certainMissOpensSteal: true,
  maxConfidenceUses: 3,
  stealPoints: 200,
  final: { HOLD: 250, RISE: 500, REACH: 1000 } satisfies Record<RiskBand, number>,
  scoreFloor: 0,
  timersSec: { question: 30, steal: 10, circleAdvice: 25, circleLock: 10, sourceSignal: 20 },
} as const;
export type FormatConfig = typeof FORMAT_V1;
```

- [ ] **Step 1: Write failing test** — `tests/domain/formatConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FORMAT_V1 } from '@/domain/formatConfig';

describe('FORMAT_V1', () => {
  it('encodes the spec scoring values', () => {
    expect(FORMAT_V1.difficulties.SPARK.points).toBe(100);
    expect(FORMAT_V1.difficulties.FLAME.missPenalty).toBe(50);
    expect(FORMAT_V1.difficulties.INFERNO.opensSteal).toBe(true);
    expect(FORMAT_V1.difficulties.WILD_420.points).toBe(420);
    expect(FORMAT_V1.stealPoints).toBe(200);
    expect(FORMAT_V1.final.REACH).toBe(1000);
    expect(FORMAT_V1.confidence.CERTAIN).toBe(2);
    expect(FORMAT_V1.maxConfidenceUses).toBe(3);
    expect(FORMAT_V1.scoreFloor).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `pnpm test tests/domain/formatConfig.test.ts` — expected FAIL (module not found).
- [ ] **Step 3: Create the two files exactly as in Interfaces above.**
- [ ] **Step 4: Run again** — expected PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: domain types and format v1 scoring config" && git push`

---

### Task 3: Scoring engine (event fold)

**Files:**
- Create: `src/domain/scoring.ts`
- Test: `tests/domain/scoring.test.ts`

**Interfaces:**
- Consumes: `FORMAT_V1`, types from Task 2.
- Produces:

```ts
export type ScoreEvent =
  | { kind: 'ANSWER'; contestantId: string; difficulty: Difficulty; confidence: Confidence; correct: boolean }
  | { kind: 'STEAL'; contestantId: string; correct: boolean }
  | { kind: 'FINAL'; contestantId: string; band: RiskBand; correct: boolean }
  | { kind: 'ADJUSTMENT'; contestantId: string; delta: number; reason: string; approvedBy: string };

export function applyEvent(score: number, ev: ScoreEvent, cfg: FormatConfig): number;
export function computeScore(events: ScoreEvent[], contestantId: string, cfg: FormatConfig): number;
```

Rules: `ANSWER` correct ⇒ `+round(points × confidenceMultiplier)`; wrong ⇒ `−round(missPenalty × confidenceMultiplier)`. `STEAL` correct ⇒ `+stealPoints`, wrong ⇒ 0. `FINAL` correct ⇒ `+final[band]`, wrong ⇒ `−final[band]`. `ADJUSTMENT` ⇒ `+delta`. After **every** event the running score clamps to `max(scoreFloor, score)`. All results whole numbers.

- [ ] **Step 1: Write failing tests** — `tests/domain/scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeScore, type ScoreEvent } from '@/domain/scoring';
import { FORMAT_V1 } from '@/domain/formatConfig';

const C = 'c1';
const ans = (difficulty: any, confidence: any, correct: boolean): ScoreEvent =>
  ({ kind: 'ANSWER', contestantId: C, difficulty, confidence, correct });

describe('computeScore', () => {
  it('scores a correct Spark at face value', () => {
    expect(computeScore([ans('SPARK', 'CURIOUS', true)], C, FORMAT_V1)).toBe(100);
  });
  it('applies confidence multiplier with whole numbers (Flame ×1.5 = 375)', () => {
    expect(computeScore([ans('FLAME', 'CONFIDENT', true)], C, FORMAT_V1)).toBe(375);
  });
  it('penalises a wrong Flame ×1.5 as −75, floored at zero', () => {
    expect(computeScore([ans('FLAME', 'CONFIDENT', false)], C, FORMAT_V1)).toBe(0);
    expect(computeScore([ans('SPARK', 'CURIOUS', true), ans('FLAME', 'CONFIDENT', false)], C, FORMAT_V1)).toBe(25);
  });
  it('wrong Spark costs nothing', () => {
    expect(computeScore([ans('SPARK', 'CERTAIN', false)], C, FORMAT_V1)).toBe(0);
  });
  it('steal awards 200 on success, 0 on failure', () => {
    expect(computeScore([{ kind: 'STEAL', contestantId: C, correct: true }], C, FORMAT_V1)).toBe(200);
    expect(computeScore([{ kind: 'STEAL', contestantId: C, correct: false }], C, FORMAT_V1)).toBe(0);
  });
  it('final Reach swings ±1000 but never below zero', () => {
    const base: ScoreEvent[] = [ans('INFERNO', 'CURIOUS', true)]; // 500
    expect(computeScore([...base, { kind: 'FINAL', contestantId: C, band: 'REACH', correct: false }], C, FORMAT_V1)).toBe(0);
    expect(computeScore([...base, { kind: 'FINAL', contestantId: C, band: 'REACH', correct: true }], C, FORMAT_V1)).toBe(1500);
  });
  it('ignores other contestants events', () => {
    expect(computeScore([{ ...ans('SPARK', 'CURIOUS', true), contestantId: 'other' } as ScoreEvent], C, FORMAT_V1)).toBe(0);
  });
  it('adjustment applies delta with floor', () => {
    expect(computeScore([{ kind: 'ADJUSTMENT', contestantId: C, delta: -50, reason: 'x', approvedBy: 'p' }], C, FORMAT_V1)).toBe(0);
    expect(computeScore([ans('SPARK','CURIOUS',true), { kind: 'ADJUSTMENT', contestantId: C, delta: 42, reason: 'x', approvedBy: 'p' }], C, FORMAT_V1)).toBe(142);
  });
});
```

- [ ] **Step 2: Run** — expected FAIL (module not found).
- [ ] **Step 3: Implement** `src/domain/scoring.ts`:

```ts
import type { Confidence, Difficulty, RiskBand } from './types';
import type { FormatConfig } from './formatConfig';

export type ScoreEvent =
  | { kind: 'ANSWER'; contestantId: string; difficulty: Difficulty; confidence: Confidence; correct: boolean }
  | { kind: 'STEAL'; contestantId: string; correct: boolean }
  | { kind: 'FINAL'; contestantId: string; band: RiskBand; correct: boolean }
  | { kind: 'ADJUSTMENT'; contestantId: string; delta: number; reason: string; approvedBy: string };

export function applyEvent(score: number, ev: ScoreEvent, cfg: FormatConfig): number {
  let next = score;
  switch (ev.kind) {
    case 'ANSWER': {
      const d = cfg.difficulties[ev.difficulty];
      const m = cfg.confidence[ev.confidence];
      next += ev.correct ? Math.round(d.points * m) : -Math.round(d.missPenalty * m);
      break;
    }
    case 'STEAL':
      next += ev.correct ? cfg.stealPoints : 0;
      break;
    case 'FINAL':
      next += ev.correct ? cfg.final[ev.band] : -cfg.final[ev.band];
      break;
    case 'ADJUSTMENT':
      next += ev.delta;
      break;
  }
  return Math.max(cfg.scoreFloor, Math.round(next));
}

export function computeScore(events: ScoreEvent[], contestantId: string, cfg: FormatConfig): number {
  return events
    .filter((e) => e.contestantId === contestantId)
    .reduce((s, e) => applyEvent(s, e, cfg), 0);
}
```

- [ ] **Step 4: Run** — expected PASS (all 8).
- [ ] **Step 5: Property test (append to same file):** score is never negative for any event sequence.

```ts
import fc from 'fast-check';

const arbEvent: fc.Arbitrary<ScoreEvent> = fc.oneof(
  fc.record({
    kind: fc.constant('ANSWER' as const), contestantId: fc.constant(C),
    difficulty: fc.constantFrom('SPARK', 'FLAME', 'INFERNO', 'WILD_420') as any,
    confidence: fc.constantFrom('CURIOUS', 'CONFIDENT', 'CERTAIN') as any,
    correct: fc.boolean(),
  }),
  fc.record({ kind: fc.constant('STEAL' as const), contestantId: fc.constant(C), correct: fc.boolean() }),
  fc.record({
    kind: fc.constant('FINAL' as const), contestantId: fc.constant(C),
    band: fc.constantFrom('HOLD', 'RISE', 'REACH') as any, correct: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('ADJUSTMENT' as const), contestantId: fc.constant(C),
    delta: fc.integer({ min: -2000, max: 2000 }), reason: fc.constant('r'), approvedBy: fc.constant('p'),
  }),
);

it('property: score is never negative and always an integer', () => {
  fc.assert(fc.property(fc.array(arbEvent, { maxLength: 60 }), (evs) => {
    const s = computeScore(evs, C, FORMAT_V1);
    return s >= 0 && Number.isInteger(s);
  }));
});
```

- [ ] **Step 6: Run full suite** `pnpm test` — expected PASS.
- [ ] **Step 7: Commit** — `git commit -am "feat: event-fold scoring engine with floor and property tests" && git push`

---

### Task 4: Finite-state machine

**Files:**
- Create: `src/domain/fsm.ts`
- Test: `tests/domain/fsm.test.ts`

**Interfaces:**
- Produces:

```ts
export type GameState =
  | 'PRE_SHOW' | 'INTRO' | 'QUESTION_READY' | 'QUESTION_LIVE' | 'ANSWER_LOCKED'
  | 'LIFELINE_ACTIVE' | 'REVEAL' | 'KNOWLEDGE_DROP' | 'SCORE_COMMITTED'
  | 'NEXT_QUESTION' | 'FINAL' | 'COMPLETE';

export const TRANSITIONS: Record<GameState, GameState[]>;
export function canTransition(from: GameState, to: GameState): boolean;
```

Transition table (exact):

```ts
export const TRANSITIONS: Record<GameState, GameState[]> = {
  PRE_SHOW: ['INTRO'],
  INTRO: ['QUESTION_READY'],
  QUESTION_READY: ['QUESTION_LIVE'],
  QUESTION_LIVE: ['ANSWER_LOCKED', 'LIFELINE_ACTIVE'],
  LIFELINE_ACTIVE: ['QUESTION_LIVE', 'ANSWER_LOCKED'],
  ANSWER_LOCKED: ['REVEAL'],
  REVEAL: ['KNOWLEDGE_DROP', 'SCORE_COMMITTED'],
  KNOWLEDGE_DROP: ['SCORE_COMMITTED'],
  SCORE_COMMITTED: ['NEXT_QUESTION', 'FINAL'],
  NEXT_QUESTION: ['QUESTION_READY'],
  FINAL: ['COMPLETE'],
  COMPLETE: [],
};
```

- [ ] **Step 1: Failing test** — `tests/domain/fsm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TRANSITIONS, canTransition, type GameState } from '@/domain/fsm';

describe('fsm', () => {
  it('allows the happy path', () => {
    const path: GameState[] = ['PRE_SHOW','INTRO','QUESTION_READY','QUESTION_LIVE','ANSWER_LOCKED','REVEAL','KNOWLEDGE_DROP','SCORE_COMMITTED','NEXT_QUESTION','QUESTION_READY'];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it('blocks illegal transitions', () => {
    expect(canTransition('PRE_SHOW', 'REVEAL')).toBe(false);
    expect(canTransition('QUESTION_LIVE', 'SCORE_COMMITTED')).toBe(false);
    expect(canTransition('COMPLETE', 'PRE_SHOW')).toBe(false);
    expect(canTransition('REVEAL', 'QUESTION_LIVE')).toBe(false);
  });
  it('lifeline loops back to live question or straight to lock', () => {
    expect(canTransition('QUESTION_LIVE', 'LIFELINE_ACTIVE')).toBe(true);
    expect(canTransition('LIFELINE_ACTIVE', 'QUESTION_LIVE')).toBe(true);
    expect(canTransition('LIFELINE_ACTIVE', 'ANSWER_LOCKED')).toBe(true);
  });
  it('property: canTransition agrees exactly with the table', () => {
    const states = Object.keys(TRANSITIONS) as GameState[];
    fc.assert(fc.property(fc.constantFrom(...states), fc.constantFrom(...states), (a, b) =>
      canTransition(a, b) === TRANSITIONS[a].includes(b)));
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `src/domain/fsm.ts` with the table above and `canTransition = (f, t) => TRANSITIONS[f].includes(t)`. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: game finite-state machine with transition table" && git push`

---

### Task 5: Deterministic seeded RNG

**Files:**
- Create: `src/domain/rng.ts`
- Test: `tests/domain/rng.test.ts`

**Interfaces:**
- Produces:

```ts
export function createSeededRng(seed: string): () => number; // uniform [0,1)
export function seededShuffle<T>(items: readonly T[], rng: () => number): T[];
export function generateSeed(): string; // 32 hex chars from crypto.randomBytes
```

Implementation approach: SHA-256(`${seed}:${counter}`) via `node:crypto`, take first 6 bytes as an integer, divide by 2^48. Deterministic, no external deps, strong seed source for `generateSeed`.

- [ ] **Step 1: Failing test** — `tests/domain/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createSeededRng, seededShuffle, generateSeed } from '@/domain/rng';

describe('rng', () => {
  it('same seed produces identical sequences', () => {
    const a = createSeededRng('seed-1'), b = createSeededRng('seed-1');
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('different seeds diverge', () => {
    const a = createSeededRng('seed-1'), b = createSeededRng('seed-2');
    expect(Array.from({ length: 5 }, a)).not.toEqual(Array.from({ length: 5 }, b));
  });
  it('values are uniform in [0,1)', () => {
    const r = createSeededRng('u');
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('seededShuffle is a permutation and deterministic', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = seededShuffle(items, createSeededRng('s'));
    const s2 = seededShuffle(items, createSeededRng('s'));
    expect(s1).toEqual(s2);
    expect([...s1].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
  });
  it('generateSeed returns 32 hex chars, unique across calls', () => {
    const s = generateSeed();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSeed()).not.toBe(s);
  });
  it('property: shuffle preserves multiset for any array', () => {
    fc.assert(fc.property(fc.array(fc.integer(), { maxLength: 40 }), fc.string(), (arr, seed) => {
      const out = seededShuffle(arr, createSeededRng(seed));
      return out.length === arr.length &&
        JSON.stringify([...out].sort()) === JSON.stringify([...arr].sort());
    }));
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `src/domain/rng.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';

export function createSeededRng(seed: string): () => number {
  let counter = 0;
  return () => {
    const h = createHash('sha256').update(`${seed}:${counter++}`).digest();
    return h.readUIntBE(0, 6) / 2 ** 48;
  };
}

export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateSeed(): string {
  return randomBytes(16).toString('hex');
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** — `git commit -am "feat: deterministic seeded rng and shuffle" && git push`

---

### Task 6: Fairness constraint evaluation

**Files:**
- Create: `src/domain/fairness.ts`
- Test: `tests/domain/fairness.test.ts`

**Interfaces:**
- Consumes: `Difficulty`, `Domain`, `FORMAT_V1` (difficulty `weight`).
- Produces:

```ts
export interface LaneQuestion {
  id: string;
  domain: Domain;
  difficulty: Difficulty;
  readTimeSec: number;
  sensitivityTier: SensitivityTier;
  factKey: string;
}
export type Lane = LaneQuestion[];

export interface FairnessReport {
  violations: string[];       // empty ⇒ pack is valid
  balanceScore: number;       // higher is better; used to rank candidates
  diagnostics: {
    weightPerLane: number[];
    domainExposure: Record<string, number[]>;
    meanReadTimePerLane: number[];
    sensitivePerLane: number[];
  };
}
export function evaluateLanes(lanes: Lane[], cfg: FormatConfig): FairnessReport;
```

Checks (each failed check pushes a human-readable string into `violations`):
1. All lanes same length.
2. Total difficulty weight per lane within ±5% of the mean.
3. For every domain, max−min exposure across lanes ≤ 1.
4. No lane has 3 same-difficulty questions consecutively.
5. Each lane has ≥1 SPARK among its first three questions.
6. Each lane has ≥1 INFERNO.
7. No `factKey` appears twice anywhere in the pack.
8. Mean readTimeSec per lane within ±20% of the overall mean.
9. Tier-3 count difference across lanes ≤ 1.

`balanceScore = 1000 − (weightSpreadPct × 10) − (readTimeSpreadPct × 5) − (totalDomainImbalance × 20)`; any violation caps it at 0.

- [ ] **Step 1: Failing tests** — `tests/domain/fairness.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateLanes, type Lane, type LaneQuestion } from '@/domain/fairness';
import { FORMAT_V1 } from '@/domain/formatConfig';

let n = 0;
const q = (difficulty: LaneQuestion['difficulty'], domain: LaneQuestion['domain'] = 'SCIENCE',
  over: Partial<LaneQuestion> = {}): LaneQuestion => ({
  id: `q${n++}`, domain, difficulty, readTimeSec: 10, sensitivityTier: 1, factKey: `f${n}`, ...over,
});

// A balanced 6-question lane: S F S F I W (weights 1+2+1+2+4+3 = 13)
const balancedLane = (domain2: LaneQuestion['domain']): Lane => [
  q('SPARK'), q('FLAME', domain2), q('SPARK', domain2), q('FLAME'), q('INFERNO'), q('WILD_420', domain2),
];

describe('evaluateLanes', () => {
  it('passes a balanced two-lane pack', () => {
    const r = evaluateLanes([balancedLane('HISTORY'), balancedLane('HISTORY')], FORMAT_V1);
    expect(r.violations).toEqual([]);
    expect(r.balanceScore).toBeGreaterThan(0);
  });
  it('flags unequal lane lengths', () => {
    const r = evaluateLanes([balancedLane('HISTORY'), balancedLane('HISTORY').slice(1)], FORMAT_V1);
    expect(r.violations.some(v => v.includes('length'))).toBe(true);
  });
  it('flags weight imbalance beyond ±5%', () => {
    const heavy: Lane = [q('SPARK'), q('INFERNO'), q('SPARK'), q('INFERNO'), q('INFERNO'), q('INFERNO')]; // 1+4+1+4+4+4=18
    const r = evaluateLanes([balancedLane('HISTORY'), heavy], FORMAT_V1);
    expect(r.violations.some(v => v.includes('weight'))).toBe(true);
  });
  it('flags three same difficulties in a row', () => {
    const streaky: Lane = [q('SPARK'), q('FLAME'), q('FLAME'), q('FLAME'), q('INFERNO'), q('WILD_420')];
    const r = evaluateLanes([streaky, streaky.map(x => ({ ...x, id: x.id + 'b', factKey: x.factKey + 'b' }))], FORMAT_V1);
    expect(r.violations.some(v => v.includes('consecutive'))).toBe(true);
  });
  it('flags missing early Spark and missing Inferno', () => {
    const noSparkEarly: Lane = [q('FLAME'), q('FLAME'), q('INFERNO'), q('SPARK'), q('SPARK'), q('WILD_420')];
    const r1 = evaluateLanes([noSparkEarly], FORMAT_V1);
    expect(r1.violations.some(v => v.includes('Spark'))).toBe(true);
    const noInferno: Lane = [q('SPARK'), q('FLAME'), q('SPARK'), q('FLAME'), q('SPARK'), q('WILD_420')];
    const r2 = evaluateLanes([noInferno], FORMAT_V1);
    expect(r2.violations.some(v => v.includes('Inferno'))).toBe(true);
  });
  it('flags duplicate factKey across lanes', () => {
    const l1 = balancedLane('HISTORY');
    const l2 = balancedLane('HISTORY').map((x, i) => i === 0 ? { ...x, factKey: l1[0].factKey } : x);
    const r = evaluateLanes([l1, l2], FORMAT_V1);
    expect(r.violations.some(v => v.includes('duplicate'))).toBe(true);
  });
  it('flags sensitive-question imbalance > 1', () => {
    const l1 = balancedLane('HISTORY').map(x => ({ ...x, sensitivityTier: 3 as const }));
    const l2 = balancedLane('HISTORY');
    const r = evaluateLanes([l1, l2], FORMAT_V1);
    expect(r.violations.some(v => v.includes('sensitive'))).toBe(true);
  });
  it('flags domain exposure difference > 1', () => {
    const l1: Lane = [q('SPARK','LAW_POLICY'), q('FLAME','LAW_POLICY'), q('SPARK','LAW_POLICY'), q('FLAME'), q('INFERNO'), q('WILD_420')];
    const l2 = balancedLane('HISTORY');
    const r = evaluateLanes([l1, l2], FORMAT_V1);
    expect(r.violations.some(v => v.includes('domain'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `src/domain/fairness.ts`:

```ts
import type { Domain, Difficulty, SensitivityTier } from './types';
import type { FormatConfig } from './formatConfig';

export interface LaneQuestion {
  id: string; domain: Domain; difficulty: Difficulty;
  readTimeSec: number; sensitivityTier: SensitivityTier; factKey: string;
}
export type Lane = LaneQuestion[];

export interface FairnessReport {
  violations: string[];
  balanceScore: number;
  diagnostics: {
    weightPerLane: number[];
    domainExposure: Record<string, number[]>;
    meanReadTimePerLane: number[];
    sensitivePerLane: number[];
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const spreadPct = (xs: number[]) => {
  const m = mean(xs);
  return m === 0 ? 0 : ((Math.max(...xs) - Math.min(...xs)) / m) * 100;
};

export function evaluateLanes(lanes: Lane[], cfg: FormatConfig): FairnessReport {
  const violations: string[] = [];

  if (new Set(lanes.map(l => l.length)).size > 1)
    violations.push('Lanes have unequal question length');

  const weightPerLane = lanes.map(l =>
    l.reduce((s, x) => s + cfg.difficulties[x.difficulty].weight, 0));
  if (spreadPct(weightPerLane) > 10) // max−min vs mean; ±5% band ⇒ 10% total spread
    violations.push(`Difficulty weight imbalance exceeds ±5% (per-lane weights: ${weightPerLane.join(', ')})`);

  const domains = [...new Set(lanes.flat().map(x => x.domain))];
  const domainExposure: Record<string, number[]> = {};
  for (const d of domains) {
    const counts = lanes.map(l => l.filter(x => x.domain === d).length);
    domainExposure[d] = counts;
    if (Math.max(...counts) - Math.min(...counts) > 1)
      violations.push(`Unbalanced domain exposure for ${d} (${counts.join(' vs ')})`);
  }

  for (const [i, l] of lanes.entries()) {
    for (let k = 2; k < l.length; k++)
      if (l[k].difficulty === l[k - 1].difficulty && l[k].difficulty === l[k - 2].difficulty) {
        violations.push(`Lane ${i + 1}: three consecutive ${l[k].difficulty} questions`);
        break;
      }
    if (!l.slice(0, 3).some(x => x.difficulty === 'SPARK'))
      violations.push(`Lane ${i + 1}: no Spark in first three questions`);
    if (!l.some(x => x.difficulty === 'INFERNO'))
      violations.push(`Lane ${i + 1}: no Inferno question`);
  }

  const factKeys = lanes.flat().map(x => x.factKey);
  if (new Set(factKeys).size !== factKeys.length)
    violations.push('Pack contains duplicate/near-duplicate facts (factKey collision)');

  const meanReadTimePerLane = lanes.map(l => mean(l.map(x => x.readTimeSec)));
  if (spreadPct(meanReadTimePerLane) > 40) // ±20% band ⇒ 40% total spread
    violations.push('Mean reading time differs by more than ±20% between lanes');

  const sensitivePerLane = lanes.map(l => l.filter(x => x.sensitivityTier === 3).length);
  if (Math.max(...sensitivePerLane) - Math.min(...sensitivePerLane) > 1)
    violations.push(`Unequal sensitive-question distribution (${sensitivePerLane.join(' vs ')})`);

  const totalDomainImbalance = Object.values(domainExposure)
    .reduce((s, counts) => s + (Math.max(...counts) - Math.min(...counts)), 0);
  const balanceScore = violations.length > 0 ? 0 : Math.max(1,
    Math.round(1000 - spreadPct(weightPerLane) * 10 - spreadPct(meanReadTimePerLane) * 5 - totalDomainImbalance * 20));

  return { violations, balanceScore, diagnostics: { weightPerLane, domainExposure, meanReadTimePerLane, sensitivePerLane } };
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** — `git commit -am "feat: fairness constraint evaluation with balance scoring" && git push`

---

### Task 7: Lane generator (constraint solver)

**Files:**
- Create: `src/domain/laneGenerator.ts`
- Test: `tests/domain/laneGenerator.test.ts`

**Interfaces:**
- Consumes: `createSeededRng`, `seededShuffle` (Task 5); `evaluateLanes`, `LaneQuestion`, `FairnessReport` (Task 6).
- Produces:

```ts
export interface GenerateOptions {
  seed: string;
  laneCount: number;          // contestants/teams
  questionsPerLane: number;   // e.g. 17 for a full episode, 6 for a round
  candidates?: number;        // default 100 (spec range 50–200)
}
export interface GeneratedPack {
  seed: string;
  lanes: Lane[];              // lanes[i] is contestant i's ordered questions
  report: FairnessReport;
  candidatesTried: number;
}
export function generateLanes(pool: LaneQuestion[], opts: GenerateOptions, cfg: FormatConfig): GeneratedPack;
// throws Error('POOL_TOO_SMALL') if pool.length < laneCount * questionsPerLane
// throws Error('NO_VALID_SEQUENCE') if no candidate satisfies all constraints
```

Algorithm: for each candidate `c` in `0..candidates-1`, derive rng from `` `${seed}:${c}` ``, shuffle the pool, deal round-robin into `laneCount` lanes of `questionsPerLane`, then **repair ordering** inside each lane (deterministic: move a Spark into the first three by swapping with the earliest Spark found later; resolve 3-in-a-row by swapping with the next question of a different difficulty). Evaluate; keep the best violation-free candidate by `balanceScore`. Deterministic for a fixed seed.

- [ ] **Step 1: Failing tests** — `tests/domain/laneGenerator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateLanes } from '@/domain/laneGenerator';
import type { LaneQuestion } from '@/domain/fairness';
import { FORMAT_V1 } from '@/domain/formatConfig';

const DOMAINS = ['SCIENCE','HISTORY','AFRICA_INDIGENOUS','LAW_POLICY','HEALTH_SAFETY','CULTURE_MEDIA','BUSINESS_ETHICS','FUTURE_INNOVATION'] as const;
const DIFFS = ['SPARK','SPARK','FLAME','FLAME','INFERNO','WILD_420'] as const;

function makePool(size: number): LaneQuestion[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `q${i}`,
    domain: DOMAINS[i % DOMAINS.length],
    difficulty: DIFFS[i % DIFFS.length],
    readTimeSec: 8 + (i % 5),
    sensitivityTier: (i % 10 === 0 ? 3 : 1) as 1 | 3,
    factKey: `fact-${i}`,
  }));
}

describe('generateLanes', () => {
  it('produces a violation-free pack from an adequate pool', () => {
    const pack = generateLanes(makePool(80), { seed: 'abc', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    expect(pack.report.violations).toEqual([]);
    expect(pack.lanes).toHaveLength(2);
    expect(pack.lanes[0]).toHaveLength(6);
  });
  it('is reproducible: same seed + pool ⇒ identical lanes', () => {
    const pool = makePool(80);
    const a = generateLanes(pool, { seed: 'seed-x', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    const b = generateLanes(pool, { seed: 'seed-x', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    expect(a.lanes.map(l => l.map(q => q.id))).toEqual(b.lanes.map(l => l.map(q => q.id)));
  });
  it('different seeds give different lanes', () => {
    const pool = makePool(80);
    const a = generateLanes(pool, { seed: 's1', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    const b = generateLanes(pool, { seed: 's2', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    expect(a.lanes.map(l => l.map(q => q.id))).not.toEqual(b.lanes.map(l => l.map(q => q.id)));
  });
  it('never assigns the same question to two lanes', () => {
    const pack = generateLanes(makePool(80), { seed: 'abc', laneCount: 3, questionsPerLane: 6 }, FORMAT_V1);
    const ids = pack.lanes.flat().map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('throws POOL_TOO_SMALL when pool cannot fill lanes', () => {
    expect(() => generateLanes(makePool(10), { seed: 'a', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1))
      .toThrow('POOL_TOO_SMALL');
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `src/domain/laneGenerator.ts`:

```ts
import { createSeededRng, seededShuffle } from './rng';
import { evaluateLanes, type Lane, type LaneQuestion, type FairnessReport } from './fairness';
import type { FormatConfig } from './formatConfig';

export interface GenerateOptions {
  seed: string; laneCount: number; questionsPerLane: number; candidates?: number;
}
export interface GeneratedPack {
  seed: string; lanes: Lane[]; report: FairnessReport; candidatesTried: number;
}

function repairLane(lane: Lane): Lane {
  const l = [...lane];
  // Ensure a Spark in the first three
  if (!l.slice(0, 3).some(q => q.difficulty === 'SPARK')) {
    const idx = l.findIndex((q, i) => i >= 3 && q.difficulty === 'SPARK');
    if (idx > -1) [l[0], l[idx]] = [l[idx], l[0]];
  }
  // Break 3-in-a-row streaks
  for (let i = 2; i < l.length; i++) {
    if (l[i].difficulty === l[i - 1].difficulty && l[i].difficulty === l[i - 2].difficulty) {
      const j = l.findIndex((q, k) => k > i && q.difficulty !== l[i].difficulty);
      if (j > -1) [l[i], l[j]] = [l[j], l[i]];
    }
  }
  return l;
}

export function generateLanes(pool: LaneQuestion[], opts: GenerateOptions, cfg: FormatConfig): GeneratedPack {
  const { seed, laneCount, questionsPerLane, candidates = 100 } = opts;
  const need = laneCount * questionsPerLane;
  if (pool.length < need) throw new Error('POOL_TOO_SMALL');

  let best: GeneratedPack | null = null;
  for (let c = 0; c < candidates; c++) {
    const rng = createSeededRng(`${seed}:${c}`);
    const shuffled = seededShuffle(pool, rng);
    const lanes: Lane[] = Array.from({ length: laneCount }, () => []);
    for (let i = 0; i < need; i++) lanes[i % laneCount].push(shuffled[i]);
    const repaired = lanes.map(repairLane);
    const report = evaluateLanes(repaired, cfg);
    if (report.violations.length === 0 && (!best || report.balanceScore > best.report.balanceScore)) {
      best = { seed, lanes: repaired, report, candidatesTried: c + 1 };
    }
  }
  if (!best) throw new Error('NO_VALID_SEQUENCE');
  return { ...best, candidatesTried: candidates };
}
```

- [ ] **Step 4: Run** — PASS. If `produces a violation-free pack` fails because the synthetic pool can't satisfy a constraint, adjust the test pool's difficulty mix (keep constraints untouched — the constraints are the spec).
- [ ] **Step 5: Commit** — `git commit -am "feat: seeded candidate lane generator with repair and best-pick" && git push`

---

### Task 8: PublicQuestion projection (answer security)

**Files:**
- Create: `src/domain/publicQuestion.ts`
- Test: `tests/domain/publicQuestion.test.ts`

**Interfaces:**
- Consumes: `QuestionVersionData` (Task 2).
- Produces:

```ts
export interface PublicQuestion {
  questionId: string;
  domain: Domain;
  difficulty: Difficulty;   // revealed only when state permits; projection includes it, caller decides
  stem: string;
  choices: string[];
  knowledgeDropAvailable: boolean;
}
export function toPublicQuestion(qv: QuestionVersionData): PublicQuestion;
export interface RevealPayload extends PublicQuestion {
  correctIndex: number;
  explanation: string;
  knowledgeDrop: string | null;
  sourceTitle: string;
  correctAsOf: string;
}
export function toRevealPayload(qv: QuestionVersionData): RevealPayload;
```

- [ ] **Step 1: Failing test** — `tests/domain/publicQuestion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toPublicQuestion, toRevealPayload } from '@/domain/publicQuestion';
import type { QuestionVersionData } from '@/domain/types';

const qv: QuestionVersionData = {
  questionId: 'q1', version: 1, domain: 'SCIENCE', difficulty: 'FLAME',
  stem: 'Which compound?', choices: ['A', 'B', 'C', 'D'], correctIndex: 2,
  explanation: 'Because.', knowledgeDrop: 'Drop.', sourceTitle: 'Src', sourceUrl: 'https://x',
  correctAsOf: '2026-07-01', jurisdiction: null, sensitivityTier: 1, expiresAt: null,
  readTimeSec: 9, factKey: 'compound-x', demoFlag: 'demo-seed',
};

describe('answer security', () => {
  it('public projection contains no correct answer, explanation or source detail', () => {
    const pub = toPublicQuestion(qv);
    const json = JSON.stringify(pub);
    expect(json).not.toContain('correctIndex');
    expect(json).not.toContain('"2"');
    expect((pub as Record<string, unknown>).correctIndex).toBeUndefined();
    expect((pub as Record<string, unknown>).explanation).toBeUndefined();
    expect(pub.choices).toEqual(['A', 'B', 'C', 'D']);
  });
  it('reveal payload carries answer and provenance', () => {
    const r = toRevealPayload(qv);
    expect(r.correctIndex).toBe(2);
    expect(r.sourceTitle).toBe('Src');
    expect(r.correctAsOf).toBe('2026-07-01');
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `src/domain/publicQuestion.ts` — build the objects **field by field** (never spread `qv` into a public object; spreading is how leaks happen):

```ts
import type { Domain, Difficulty, QuestionVersionData } from './types';

export interface PublicQuestion {
  questionId: string; domain: Domain; difficulty: Difficulty;
  stem: string; choices: string[]; knowledgeDropAvailable: boolean;
}

export function toPublicQuestion(qv: QuestionVersionData): PublicQuestion {
  return {
    questionId: qv.questionId,
    domain: qv.domain,
    difficulty: qv.difficulty,
    stem: qv.stem,
    choices: [...qv.choices],
    knowledgeDropAvailable: qv.knowledgeDrop !== null,
  };
}

export interface RevealPayload extends PublicQuestion {
  correctIndex: number; explanation: string; knowledgeDrop: string | null;
  sourceTitle: string; correctAsOf: string;
}

export function toRevealPayload(qv: QuestionVersionData): RevealPayload {
  return {
    ...toPublicQuestion(qv),
    correctIndex: qv.correctIndex,
    explanation: qv.explanation,
    knowledgeDrop: qv.knowledgeDrop,
    sourceTitle: qv.sourceTitle,
    correctAsOf: qv.correctAsOf,
  };
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** — `git commit -am "feat: public/reveal question projections with answer-security test" && git push`

---

### Task 9: Drizzle schema, db factory and repositories

**Files:**
- Create: `src/data/schema.ts`, `src/data/db.ts`, `src/data/repos.ts`, `drizzle.config.ts`
- Test: `tests/data/repos.test.ts`

**Interfaces:**
- Consumes: domain types (Task 2), `ScoreEvent` (Task 3).
- Produces repository API used by all server tasks:

```ts
export interface Repos {
  questions: {
    create(q: QuestionVersionData & { status: QuestionStatus }): Promise<string>; // returns questionId
    latestVersion(questionId: string): Promise<QuestionVersionData | null>;
    listByStatus(status: QuestionStatus): Promise<(QuestionVersionData & { status: QuestionStatus })[]>;
    setStatus(questionId: string, status: QuestionStatus, actor: string): Promise<void>; // validates workflow order
    eligibleForPack(nowIso: string): Promise<QuestionVersionData[]>; // APPROVED, not expired, not USED
  };
  packs: {
    create(p: { episodeId: string; seed: string; lanes: string[][]; reportJson: string }): Promise<string>;
    approve(packId: string, approver: string): Promise<{ checksum: string }>;
    get(packId: string): Promise<{ id: string; episodeId: string; seed: string; lanes: string[][]; approvedBy: string | null; checksum: string | null; reportJson: string } | null>;
  };
  games: {
    create(g: { packId: string; mode: SessionMode; contestants: { id: string; name: string }[] }): Promise<string>;
    get(gameId: string): Promise<GameSessionRow | null>;
    appendEvent(e: GameEventInsert): Promise<void>;       // rejects duplicate idempotencyKey silently-idempotent (returns without inserting)
    events(gameId: string): Promise<GameEventRow[]>;      // ordered by seq
    appendScoreEvent(gameId: string, ev: ScoreEvent): Promise<void>;
    scoreEvents(gameId: string): Promise<ScoreEvent[]>;
    recordLifelineUse(gameId: string, contestantId: string, type: LifelineType): Promise<void>; // throws 'LIFELINE_ALREADY_USED'
    lifelineUsed(gameId: string, contestantId: string, type: LifelineType): Promise<boolean>;
    markQuestionsUsed(questionIds: string[]): Promise<void>; // no-op for rehearsal callers
  };
  audit: { log(e: { actor: string; action: string; detail: string }): Promise<void>; list(): Promise<{ actor: string; action: string; detail: string; at: string }[]> };
}
export function createRepos(dbPath: string): Repos; // ':memory:' for tests
```

`GameEventInsert = { gameId, idempotencyKey, actor, prevState, nextState, payloadJson }`; rows gain `seq` (autoincrement) and `at` (ISO). Checksum = sha256 of canonical JSON of `{seed, lanes}`. Workflow validation in `setStatus`: only allow moves defined in `QUESTION_WORKFLOW: Record<QuestionStatus, QuestionStatus[]>` (DRAFT→EDITORIAL_REVIEW; EDITORIAL_REVIEW→COUNCIL_REVIEW|APPROVED; COUNCIL_REVIEW→APPROVED|DRAFT; APPROVED→LOCKED|RETIRED; LOCKED→USED|RETIRED; USED→RETIRED; any→EXPIRED). Tier 3 with no `expiresAt` cannot reach APPROVED (`throw Error('TIER3_REQUIRES_EXPIRY')`).

Schema tables (Drizzle, SQLite): `questions(id, status, createdAt)`, `question_versions(questionId, version, …all QuestionVersionData fields, choicesJson)`, `packs(id, episodeId, seed, lanesJson, reportJson, approvedBy, checksum, createdAt)`, `game_sessions(id, packId, mode, contestantsJson, createdAt)`, `game_events(seq pk autoinc, gameId, idempotencyKey unique, actor, prevState, nextState, payloadJson, at)`, `score_events(seq pk autoinc, gameId, eventJson, at)`, `lifeline_uses(gameId, contestantId, type, at, unique(gameId,contestantId,type))`, `audit_events(seq, actor, action, detail, at)`.

- [ ] **Step 1: Failing tests** — `tests/data/repos.test.ts` (in-memory SQLite):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRepos, type Repos } from '@/data/repos';
import type { QuestionVersionData } from '@/domain/types';

const qv = (over: Partial<QuestionVersionData> = {}): QuestionVersionData & { status: 'DRAFT' } => ({
  questionId: '', version: 1, domain: 'SCIENCE', difficulty: 'SPARK', stem: 'S?',
  choices: ['a','b','c','d'], correctIndex: 0, explanation: 'e', knowledgeDrop: null,
  sourceTitle: 't', sourceUrl: 'u', correctAsOf: '2026-07-01', jurisdiction: null,
  sensitivityTier: 1, expiresAt: null, readTimeSec: 8, factKey: `f${Math.random()}`,
  demoFlag: 'demo-seed', status: 'DRAFT', ...over,
});

let repos: Repos;
beforeEach(() => { repos = createRepos(':memory:'); });

describe('question workflow', () => {
  it('walks Draft → Editorial → Approved and appears in eligible pool', async () => {
    const id = await repos.questions.create(qv());
    await repos.questions.setStatus(id, 'EDITORIAL_REVIEW', 'editor');
    await repos.questions.setStatus(id, 'APPROVED', 'editor');
    const pool = await repos.questions.eligibleForPack('2026-07-22');
    expect(pool.map(p => p.questionId)).toContain(id);
  });
  it('rejects illegal workflow jumps', async () => {
    const id = await repos.questions.create(qv());
    await expect(repos.questions.setStatus(id, 'USED', 'editor')).rejects.toThrow();
  });
  it('blocks Tier 3 approval without expiry, and expired Tier 3 from the pool', async () => {
    const id = await repos.questions.create(qv({ sensitivityTier: 3 }));
    await repos.questions.setStatus(id, 'EDITORIAL_REVIEW', 'editor');
    await repos.questions.setStatus(id, 'COUNCIL_REVIEW', 'editor');
    await expect(repos.questions.setStatus(id, 'APPROVED', 'council')).rejects.toThrow('TIER3_REQUIRES_EXPIRY');

    const id2 = await repos.questions.create(qv({ sensitivityTier: 3, expiresAt: '2026-01-01' }));
    await repos.questions.setStatus(id2, 'EDITORIAL_REVIEW', 'e');
    await repos.questions.setStatus(id2, 'COUNCIL_REVIEW', 'e');
    await repos.questions.setStatus(id2, 'APPROVED', 'c');
    const pool = await repos.questions.eligibleForPack('2026-07-22');
    expect(pool.map(p => p.questionId)).not.toContain(id2); // expired
  });
});

describe('game events', () => {
  it('is idempotent on duplicate idempotencyKey', async () => {
    const g = await repos.games.create({ packId: 'p', mode: 'live', contestants: [{ id: 'c1', name: 'A' }] });
    const e = { gameId: g, idempotencyKey: 'k1', actor: 'producer', prevState: 'PRE_SHOW', nextState: 'INTRO', payloadJson: '{}' };
    await repos.games.appendEvent(e);
    await repos.games.appendEvent(e);
    expect(await repos.games.events(g)).toHaveLength(1);
  });
  it('enforces one lifeline use per contestant per type', async () => {
    const g = await repos.games.create({ packId: 'p', mode: 'live', contestants: [{ id: 'c1', name: 'A' }] });
    await repos.games.recordLifelineUse(g, 'c1', 'TRUSTED_CIRCLE');
    await expect(repos.games.recordLifelineUse(g, 'c1', 'TRUSTED_CIRCLE')).rejects.toThrow('LIFELINE_ALREADY_USED');
    await repos.games.recordLifelineUse(g, 'c1', 'SOURCE_SIGNAL'); // other type still fine
  });
  it('round-trips score events in order', async () => {
    const g = await repos.games.create({ packId: 'p', mode: 'live', contestants: [{ id: 'c1', name: 'A' }] });
    await repos.games.appendScoreEvent(g, { kind: 'ANSWER', contestantId: 'c1', difficulty: 'SPARK', confidence: 'CURIOUS', correct: true });
    await repos.games.appendScoreEvent(g, { kind: 'STEAL', contestantId: 'c1', correct: true });
    const evs = await repos.games.scoreEvents(g);
    expect(evs.map(e => e.kind)).toEqual(['ANSWER', 'STEAL']);
  });
});

describe('packs', () => {
  it('approve freezes a checksum; same content ⇒ same checksum', async () => {
    const p1 = await repos.packs.create({ episodeId: 'ep1', seed: 's', lanes: [['q1'],['q2']], reportJson: '{}' });
    const p2 = await repos.packs.create({ episodeId: 'ep2', seed: 's', lanes: [['q1'],['q2']], reportJson: '{}' });
    const { checksum: c1 } = await repos.packs.approve(p1, 'ep');
    const { checksum: c2 } = await repos.packs.approve(p2, 'ep');
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** schema + `createRepos` using `drizzle-orm/better-sqlite3`. `db.ts` runs `CREATE TABLE IF NOT EXISTS` DDL directly on open (pilot; drizzle-kit migrations come with the Postgres move). IDs: `crypto.randomUUID()`. Timestamps: `new Date().toISOString()`.
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** — `git commit -am "feat: sqlite schema and repositories with workflow, idempotency and lifeline guards" && git push`

---

### Task 10: Seed script (prototype import + demo bank)

**Files:**
- Create: `scripts/seed.ts`, `src/data/seedData.ts`
- Test: `tests/data/seed.test.ts`

**Interfaces:**
- Consumes: `createRepos` (Task 9).
- Produces: `seedDatabase(repos: Repos): Promise<{ imported: number; demo: number }>` and CLI `pnpm seed` (script: `"seed": "tsx scripts/seed.ts"`; add `tsx` dev dep).

`src/data/seedData.ts` contains:
1. `PROTOTYPE_QUESTIONS`: the 16 questions extracted from `docs/prototype/premium_quiz.html` (extract them with a small one-off parse while writing the file — copy stem/choices/correctAnswer/explanation verbatim), each mapped to `demoFlag: 'general-trivia'`, `status: 'DRAFT'`, `domain: 'CULTURE_MEDIA'` (placeholder), `difficulty: 'SPARK'`, `sourceTitle: 'premium_quiz.html prototype'`.
2. `DEMO_BANK`: 96 generated demo questions — 12 per domain × 8 domains, difficulty mix per domain `[4× SPARK, 4× FLAME, 3× INFERNO, 1× WILD_420]`, stems like `"[DEMO] SCIENCE Flame question 3: which statement is accurate?"`, 4 choices, rotating `correctIndex`, `demoFlag: 'demo-seed'`, unique `factKey` (`demo-science-3`), `readTimeSec` 7–14, every 10th question `sensitivityTier: 3` with `expiresAt: '2027-01-01'`, rest tier 1. All seeded straight to `status: 'APPROVED'` so the pack builder has an eligible pool (they are clearly labelled demo records, per spec).

- [ ] **Step 1: Failing test** — `tests/data/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRepos } from '@/data/repos';
import { seedDatabase } from '@/data/seedData';

describe('seedDatabase', () => {
  it('imports 16 prototype drafts and 96 approved demo questions', async () => {
    const repos = createRepos(':memory:');
    const r = await seedDatabase(repos);
    expect(r.imported).toBe(16);
    expect(r.demo).toBe(96);
    expect((await repos.questions.listByStatus('DRAFT'))).toHaveLength(16);
    const pool = await repos.questions.eligibleForPack('2026-07-22');
    expect(pool.length).toBe(96);
    expect(pool.every(q => q.demoFlag !== null)).toBe(true);
  });
  it('is idempotent (second run adds nothing)', async () => {
    const repos = createRepos(':memory:');
    await seedDatabase(repos);
    const again = await seedDatabase(repos);
    expect(again.imported + again.demo).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (idempotency: skip when a question with the same `factKey` already exists; add `questions.existsByFactKey(factKey)` to the repo). **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: seed script with prototype import and labelled demo bank" && git push`

---

### Task 11: Pack service + API routes

**Files:**
- Create: `src/server/packService.ts`, `src/app/api/packs/generate/route.ts`, `src/app/api/packs/[id]/approve/route.ts`, `src/server/context.ts`
- Test: `tests/server/packService.test.ts`

**Interfaces:**
- Consumes: `generateLanes` (Task 7), `Repos` (Task 9), `FORMAT_V1`.
- Produces:

```ts
// src/server/context.ts — singleton wiring
export function getRepos(): Repos;  // opens data/420iq.sqlite (env DB_PATH overrides); memoized

// src/server/packService.ts
export async function generatePack(repos: Repos, opts: {
  episodeId: string; laneCount: number; questionsPerLane: number; seed?: string;
}): Promise<{ packId: string; seed: string; report: FairnessReport; lanes: string[][] }>;
export async function approvePack(repos: Repos, packId: string, approver: string):
  Promise<{ checksum: string }>;
```

`generatePack`: pull `eligibleForPack(nowIso)`, map to `LaneQuestion` (factKey, readTimeSec, tier from version data), call `generateLanes` with `seed ?? generateSeed()`, persist via `packs.create` (lanes as question-id matrix), audit-log the generation with seed + balance score. API routes are thin zod-validated wrappers returning the service result; approve route also audit-logs approver identity.

- [ ] **Step 1: Failing tests** — `tests/server/packService.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRepos, type Repos } from '@/data/repos';
import { seedDatabase } from '@/data/seedData';
import { generatePack, approvePack } from '@/server/packService';

let repos: Repos;
beforeEach(async () => { repos = createRepos(':memory:'); await seedDatabase(repos); });

describe('packService', () => {
  it('generates a violation-free pack from the seeded pool', async () => {
    const r = await generatePack(repos, { episodeId: 'ep1', laneCount: 2, questionsPerLane: 6 });
    expect(r.report.violations).toEqual([]);
    expect(r.lanes[0]).toHaveLength(6);
    expect(r.seed).toMatch(/^[0-9a-f]{32}$/);
  });
  it('same explicit seed reproduces identical lanes', async () => {
    const a = await generatePack(repos, { episodeId: 'e', laneCount: 2, questionsPerLane: 6, seed: 'f'.repeat(32) });
    const b = await generatePack(repos, { episodeId: 'e', laneCount: 2, questionsPerLane: 6, seed: 'f'.repeat(32) });
    expect(a.lanes).toEqual(b.lanes);
  });
  it('approve freezes checksum and stores approver', async () => {
    const { packId } = await generatePack(repos, { episodeId: 'e', laneCount: 2, questionsPerLane: 6 });
    const { checksum } = await approvePack(repos, packId, 'exec-producer');
    const stored = await repos.packs.get(packId);
    expect(stored?.checksum).toBe(checksum);
    expect(stored?.approvedBy).toBe('exec-producer');
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement service, then the two route handlers** (`POST /api/packs/generate` body `{episodeId, laneCount, questionsPerLane, seed?}`; `POST /api/packs/[id]/approve` body `{approver}` — replaced by session identity in Task 13). **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: pack service with generation, diagnostics persistence and approval" && git push`

---

### Task 12: Game engine service + API

**Files:**
- Create: `src/server/gameEngine.ts`, `src/server/bus.ts`, `src/app/api/games/route.ts` (create), `src/app/api/games/[id]/transition/route.ts`, `src/app/api/games/[id]/answers/lock/route.ts`, `src/app/api/games/[id]/lifelines/[type]/activate/route.ts`
- Test: `tests/server/gameEngine.test.ts`

**Interfaces:**
- Consumes: FSM (Task 4), scoring (Task 3), projections (Task 8), `Repos` (Task 9).
- Produces:

```ts
// src/server/bus.ts
export const bus: EventEmitter;             // emits ('game:<id>', GameSnapshot)

// src/server/gameEngine.ts
export interface GameSnapshot {
  gameId: string;
  state: GameState;
  mode: SessionMode;
  questionIndex: number;                    // position in the active lane sequence
  activeContestantId: string | null;
  scores: Record<string, number>;
  lifelines: Record<string, Record<LifelineType, boolean>>; // used flags
  publicQuestion: PublicQuestion | null;    // present from QUESTION_READY
  reveal: RevealPayload | null;             // present only in REVEAL/KNOWLEDGE_DROP/SCORE_COMMITTED
  confidence: Confidence | null;
  stealOpen: boolean;
}
export class GameEngine {
  constructor(repos: Repos);
  createGame(packId: string, mode: SessionMode, contestants: {id:string; name:string}[]): Promise<string>;
  snapshot(gameId: string): Promise<GameSnapshot>;          // rebuilt from events (source of truth)
  transition(gameId: string, to: GameState, actor: string, idempotencyKey: string, payload?: unknown): Promise<GameSnapshot>;
  lockAnswer(gameId: string, contestantId: string, choiceIndex: number, confidence: Confidence, idempotencyKey: string): Promise<GameSnapshot>;
  recordSteal(gameId: string, contestantId: string, choiceIndex: number, idempotencyKey: string): Promise<GameSnapshot>;
  activateLifeline(gameId: string, contestantId: string, type: LifelineType, actor: string, idempotencyKey: string): Promise<GameSnapshot>;
  adjustScore(gameId: string, contestantId: string, delta: number, reason: string, approvedBy: string, actor: string): Promise<GameSnapshot>;
}
export function getEngine(): GameEngine;    // singleton over getRepos()
```

Engine rules:
- `transition` throws `Error('ILLEGAL_TRANSITION:<from>-><to>')` unless `canTransition`. Every accepted mutation appends a `GameEvent` and emits the fresh snapshot on `bus`.
- Snapshot is **derived by replaying events** — nothing cached across restarts; that is the refresh-recovery guarantee.
- `lockAnswer` valid only in `QUESTION_LIVE`/`LIFELINE_ACTIVE`; moves state to `ANSWER_LOCKED`; grades against the privileged loader; appends the `ScoreEvent` when the producer transitions to `SCORE_COMMITTED` (grading result carried in the `ANSWER_LOCKED` event payload so REVEAL can show it). Confidence `CERTAIN` or difficulty `INFERNO` + wrong ⇒ `stealOpen: true` during REVEAL.
- Confidence uses beyond `maxConfidenceUses` per contestant ⇒ `Error('CONFIDENCE_EXHAUSTED')` (CURIOUS is always allowed and doesn't count).
- `activateLifeline` valid only in `QUESTION_LIVE`; records use (repo enforces one-shot), transitions to `LIFELINE_ACTIVE`.
- On `FINAL→COMPLETE` in **live** mode: `markQuestionsUsed(all pack question ids)`; rehearsal skips this.
- `adjustScore` requires non-empty `reason` and `approvedBy !== actor`, writes an `ADJUSTMENT` ScoreEvent plus an audit log entry.

- [ ] **Step 1: Failing tests** — `tests/server/gameEngine.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRepos, type Repos } from '@/data/repos';
import { seedDatabase } from '@/data/seedData';
import { generatePack, approvePack } from '@/server/packService';
import { GameEngine } from '@/server/gameEngine';

let repos: Repos; let engine: GameEngine; let gameId: string;
const CONTESTANTS = [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }];

beforeEach(async () => {
  repos = createRepos(':memory:');
  await seedDatabase(repos);
  const { packId } = await generatePack(repos, { episodeId: 'e1', laneCount: 2, questionsPerLane: 6 });
  await approvePack(repos, packId, 'ep');
  engine = new GameEngine(repos);
  gameId = await engine.createGame(packId, 'live', CONTESTANTS);
});

async function toLiveQuestion() {
  await engine.transition(gameId, 'INTRO', 'prod', 'k1');
  await engine.transition(gameId, 'QUESTION_READY', 'prod', 'k2');
  return engine.transition(gameId, 'QUESTION_LIVE', 'prod', 'k3');
}

describe('GameEngine', () => {
  it('starts in PRE_SHOW with zero scores', async () => {
    const s = await engine.snapshot(gameId);
    expect(s.state).toBe('PRE_SHOW');
    expect(s.scores).toEqual({ c1: 0, c2: 0 });
  });
  it('blocks illegal transitions', async () => {
    await expect(engine.transition(gameId, 'REVEAL', 'prod', 'kx')).rejects.toThrow('ILLEGAL_TRANSITION');
  });
  it('serves a public question with no correct index from QUESTION_READY', async () => {
    const s = await toLiveQuestion();
    expect(s.publicQuestion).not.toBeNull();
    expect(JSON.stringify(s.publicQuestion)).not.toContain('correctIndex');
    expect(s.reveal).toBeNull();
  });
  it('locks an answer, reveals, commits score', async () => {
    await toLiveQuestion();
    let s = await engine.lockAnswer(gameId, 'c1', 0, 'CURIOUS', 'k4');
    expect(s.state).toBe('ANSWER_LOCKED');
    s = await engine.transition(gameId, 'REVEAL', 'prod', 'k5');
    expect(s.reveal?.correctIndex).toBeGreaterThanOrEqual(0);
    s = await engine.transition(gameId, 'SCORE_COMMITTED', 'prod', 'k6');
    const total = s.scores.c1;
    expect(Number.isInteger(total)).toBe(true); // scored (0 if wrong guess, >0 if right)
  });
  it('is idempotent on repeated transition keys', async () => {
    await engine.transition(gameId, 'INTRO', 'prod', 'same-key');
    const s = await engine.transition(gameId, 'INTRO', 'prod', 'same-key'); // replay, not error
    expect(s.state).toBe('INTRO');
    expect((await repos.games.events(gameId)).length).toBe(1);
  });
  it('snapshot rebuilds identically after engine restart', async () => {
    await toLiveQuestion();
    await engine.lockAnswer(gameId, 'c1', 1, 'CONFIDENT', 'k7');
    const before = await engine.snapshot(gameId);
    const engine2 = new GameEngine(repos); // fresh instance = restart
    expect(await engine2.snapshot(gameId)).toEqual(before);
  });
  it('enforces one lifeline use and loops back to the live question', async () => {
    await toLiveQuestion();
    const s = await engine.activateLifeline(gameId, 'c1', 'SOURCE_SIGNAL', 'prod', 'k8');
    expect(s.state).toBe('LIFELINE_ACTIVE');
    await engine.transition(gameId, 'QUESTION_LIVE', 'prod', 'k9');
    await expect(engine.activateLifeline(gameId, 'c1', 'SOURCE_SIGNAL', 'prod', 'k10'))
      .rejects.toThrow('LIFELINE_ALREADY_USED');
  });
  it('rejects score adjustment without independent approver', async () => {
    await expect(engine.adjustScore(gameId, 'c1', 100, 'fix', 'prod', 'prod')).rejects.toThrow();
    await engine.adjustScore(gameId, 'c1', 100, 'mis-scored Q3', 'exec', 'prod');
    expect((await engine.snapshot(gameId)).scores.c1).toBe(100);
  });
  it('rehearsal mode never marks questions used', async () => {
    const { packId } = await generatePack(repos, { episodeId: 'e2', laneCount: 2, questionsPerLane: 6 });
    await approvePack(repos, packId, 'ep');
    const rehearsalId = await engine.createGame(packId, 'rehearsal', CONTESTANTS);
    // walk a minimal path to COMPLETE via FINAL
    await engine.transition(rehearsalId, 'INTRO', 'p', 'r1');
    await engine.transition(rehearsalId, 'QUESTION_READY', 'p', 'r2');
    await engine.transition(rehearsalId, 'QUESTION_LIVE', 'p', 'r3');
    await engine.lockAnswer(rehearsalId, 'c1', 0, 'CURIOUS', 'r4');
    await engine.transition(rehearsalId, 'REVEAL', 'p', 'r5');
    await engine.transition(rehearsalId, 'SCORE_COMMITTED', 'p', 'r6');
    await engine.transition(rehearsalId, 'FINAL', 'p', 'r7');
    await engine.transition(rehearsalId, 'COMPLETE', 'p', 'r8');
    const pool = await repos.questions.eligibleForPack('2026-07-22');
    expect(pool.length).toBe(96); // nothing consumed
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `bus.ts` (plain `new EventEmitter()` export) and `GameEngine` as an event-sourced reducer: `snapshot()` = fold `events(gameId)` through a pure `reduce(snapshot, event)` function; mutations validate against the folded state, append, re-fold, emit. Then add the four thin route handlers (zod-validated, calling `getEngine()`).
- [ ] **Step 4: Run** — PASS (10 tests). **Step 5: Commit** — `git commit -am "feat: event-sourced game engine with idempotency, lifelines and rehearsal isolation" && git push`

---

### Task 13: Device-claim auth (role + PIN, signed cookie)

**Files:**
- Create: `src/server/auth.ts`, `src/app/claim/page.tsx`, `src/app/api/claim/route.ts`, `src/middleware.ts`
- Test: `tests/server/auth.test.ts`

**Interfaces:**
- Produces:

```ts
// src/server/auth.ts
export type Role = 'producer' | 'host' | 'contestant' | 'stage' | 'editor';
export function signSession(role: Role, secret: string): string;          // `${role}.${hmacSha256Hex(role, secret)}`
export function verifySession(token: string | undefined, secret: string): Role | null;
export const ROLE_PINS: Record<Role, string>;  // from env ROLE_PIN_<ROLE>, defaults '4200','4201','4202','4203','4204'
export function getSecret(): string;           // env SESSION_SECRET, default dev secret with console warning
```

`POST /api/claim` body `{role, pin}` → sets `iq_session` httpOnly cookie, redirects handled client-side. `src/middleware.ts` guards `/console`, `/editor` (producer/editor roles) and `/host` (host or producer); `/contestant`, `/stage`, `/claim` open on the LAN (they render nothing privileged — answer security is enforced server-side by projection, not by hiding pages). `/claim` page: role dropdown + PIN input + submit, styled with tokens.

- [ ] **Step 1: Failing test** — `tests/server/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '@/server/auth';

describe('session', () => {
  it('round-trips a valid token', () => {
    expect(verifySession(signSession('producer', 's3cret'), 's3cret')).toBe('producer');
  });
  it('rejects tampered role or wrong secret', () => {
    const t = signSession('contestant', 's3cret');
    expect(verifySession(t.replace('contestant', 'producer'), 's3cret')).toBeNull();
    expect(verifySession(t, 'other')).toBeNull();
    expect(verifySession(undefined, 's3cret')).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** with `node:crypto` HMAC + `timingSafeEqual`. Then claim page, API route, middleware. **Step 4: Run** — PASS; `pnpm build` green.
- [ ] **Step 5: Commit** — `git commit -am "feat: role pin device claim with signed session cookie and route guards" && git push`

---

### Task 14: SSE stream with role-scoped projection

**Files:**
- Create: `src/server/projection.ts`, `src/app/api/games/[id]/stream/route.ts`, `src/app/api/games/[id]/hold/route.ts`, `src/components/useGameStream.ts`
- Test: `tests/server/projection.test.ts`

**Interfaces:**
- Consumes: `GameSnapshot` (Task 12), `bus`, `Role` (Task 13).
- Produces:

```ts
// src/server/projection.ts
export interface ProjectedSnapshot extends Omit<GameSnapshot, 'reveal'> {
  reveal: RevealPayload | null;   // stripped per role/state rules below
  hold: boolean;
}
export function projectForRole(snap: GameSnapshot, role: Role, hold: boolean): ProjectedSnapshot;
export const holdFlags: Map<string, boolean>;  // gameId → display hold

// src/components/useGameStream.ts (client)
export function useGameStream(gameId: string, role: string): ProjectedSnapshot | null;
```

Projection rules (single source of truth, unit-tested):
- `reveal` passes through **only** when `state ∈ {REVEAL, KNOWLEDGE_DROP, SCORE_COMMITTED}` — for every role including producer/host (spec: host answer hidden until reveal).
- For roles `contestant`/`stage`: `publicQuestion.difficulty` is masked to `'SPARK'`-typed literal `'HIDDEN' as never`? **No** — change `PublicQuestion.difficulty` type to `Difficulty | 'HIDDEN'` in Task 8's file, and mask to `'HIDDEN'` while `state === 'QUESTION_READY'` (difficulty is not shown until the question is committed).
- `hold: true` ⇒ displays render the neutral holding screen regardless of other fields.

Stream route: on connect, send current projected snapshot; subscribe `bus.on('game:'+id)`; re-project per connection role on each emit; heartbeat comment every 15 s; cleanup on abort. Hold route: `POST {on: boolean}` (producer only) flips `holdFlags`, re-emits snapshot.

- [ ] **Step 1: Failing test** — `tests/server/projection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { projectForRole } from '@/server/projection';
import type { GameSnapshot } from '@/server/gameEngine';

const base = (over: Partial<GameSnapshot>): GameSnapshot => ({
  gameId: 'g', state: 'QUESTION_READY', mode: 'live', questionIndex: 0,
  activeContestantId: 'c1', scores: { c1: 0 }, lifelines: { c1: { TRUSTED_CIRCLE: false, SOURCE_SIGNAL: false } },
  publicQuestion: { questionId: 'q', domain: 'SCIENCE', difficulty: 'INFERNO', stem: 's', choices: ['a','b'], knowledgeDropAvailable: false },
  reveal: null, confidence: null, stealOpen: false, ...over,
});

describe('projectForRole', () => {
  it('never leaks reveal outside reveal states, any role', () => {
    const withReveal = base({ state: 'ANSWER_LOCKED', reveal: { correctIndex: 1 } as any });
    for (const role of ['producer','host','contestant','stage'] as const)
      expect(projectForRole(withReveal, role, false).reveal).toBeNull();
  });
  it('passes reveal through in REVEAL state', () => {
    const s = base({ state: 'REVEAL', reveal: { correctIndex: 1 } as any });
    expect(projectForRole(s, 'host', false).reveal).not.toBeNull();
  });
  it('masks difficulty for contestant and stage before commit', () => {
    expect(projectForRole(base({}), 'contestant', false).publicQuestion?.difficulty).toBe('HIDDEN');
    expect(projectForRole(base({}), 'stage', false).publicQuestion?.difficulty).toBe('HIDDEN');
    expect(projectForRole(base({}), 'producer', false).publicQuestion?.difficulty).toBe('INFERNO');
    expect(projectForRole(base({ state: 'QUESTION_LIVE' }), 'contestant', false).publicQuestion?.difficulty).toBe('INFERNO');
  });
  it('carries the hold flag', () => {
    expect(projectForRole(base({}), 'stage', true).hold).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** projection + stream + hold routes + hook. **Step 4: Run** — PASS. **Step 5: Commit** — `git commit -am "feat: sse stream with role-scoped projection and display hold" && git push`

---

### Task 15: KnowledgeRing component

**Files:**
- Create: `src/components/KnowledgeRing.tsx`
- Modify: `vitest.config.ts` (add `environmentMatchGlobs: [['tests/components/**', 'jsdom']]`), `package.json` (add `-D jsdom @testing-library/react @testing-library/jest-dom`)
- Test: `tests/components/KnowledgeRing.test.tsx`

**Interfaces:**
- Produces:

```tsx
export type RingSegmentState = 'pending' | 'active' | 'correct' | 'wrong';
export interface KnowledgeRingProps {
  segments: RingSegmentState[];       // one per question, e.g. 17
  ringState: 'idle' | 'live' | 'locked' | 'victory';
  difficulty?: Difficulty | 'HIDDEN';
  size?: number;                      // px, default 480
}
export function KnowledgeRing(props: KnowledgeRingProps): JSX.Element;
```

SVG: graphite track circle; one stroked arc per segment with 2° gaps; fill by state — pending `var(--graphite-500)`, active = difficulty color (SPARK `--amber-bright`, FLAME `--amber-deep`, INFERNO `--ultraviolet`, WILD_420 alternating gradient, HIDDEN `--offwhite` at 40%), correct `--amber-deep`, wrong `--graphite-500` with a fracture line (short white tick rotated 12°). `ringState: 'locked'` adds a `ring-pulse` CSS class (300 ms scale pulse), `'victory'` adds `ring-victory` (all segments amber + slow breathing glow), `'idle'` adds shimmer class. All animation classes are no-ops under `prefers-reduced-motion` (they only animate `--dur-*` tokens which collapse to ≤150 ms). Every segment gets `data-testid="ring-seg-{i}"` and `data-state`.

- [ ] **Step 1: Failing test** — `tests/components/KnowledgeRing.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { KnowledgeRing } from '@/components/KnowledgeRing';

describe('KnowledgeRing', () => {
  it('renders one segment per question with state attributes', () => {
    const segs = Array(17).fill('pending' as const);
    segs[3] = 'active';
    const { getByTestId, container } = render(
      <KnowledgeRing segments={segs} ringState="live" difficulty="FLAME" />);
    expect(container.querySelectorAll('[data-testid^="ring-seg-"]')).toHaveLength(17);
    expect(getByTestId('ring-seg-3').getAttribute('data-state')).toBe('active');
  });
  it('applies victory class in victory state', () => {
    const { container } = render(
      <KnowledgeRing segments={Array(17).fill('correct')} ringState="victory" />);
    expect(container.querySelector('.ring-victory')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** component + `src/styles/ring.css` (imported by the component's consumers via layout). **Step 4: Run** — PASS. **Step 5: Commit** — `git commit -am "feat: knowledge ring svg component with difficulty and ceremony states" && git push`

---

### Task 16: Producer Console

**Files:**
- Create: `src/app/console/page.tsx`, `src/app/console/GameControls.tsx`, `src/app/api/games/[id]/adjust/route.ts`
- Test: `e2e` covers this (Task 20); unit-test only the pure helper `nextActions(state)`.
- Create: `src/app/console/nextActions.ts`, `tests/components/nextActions.test.ts`

**Interfaces:**
- Consumes: `useGameStream`, `TRANSITIONS` (Task 4), API routes (Tasks 11–14).
- Produces: `/console` — create game (pick pack, mode, contestants), then run-of-show controls.

`nextActions.ts`:
```ts
import { TRANSITIONS, type GameState } from '@/domain/fsm';
export function nextActions(state: GameState): GameState[] { return TRANSITIONS[state]; }
```

Console page (client component): left column = snapshot summary (state badge, per-contestant scores, lifeline flags, rehearsal watermark banner when `mode==='rehearsal'`); center = active question with **reveal shown only when snapshot.reveal present**; right = controls:
- One button per `nextActions(state)` → `POST /api/games/{id}/transition` with `{to, idempotencyKey: crypto.randomUUID()}`.
- Lifeline buttons per contestant (disabled when used) → activate route.
- Confidence + choice lock form (producer operates contestant locks in pilot) → lock route.
- Score adjust dialog: contestant, delta, reason, approvedBy (must differ from actor) → adjust route.
- Hold toggle → hold route. Buttons disabled while a request is in flight; errors surface as a visible toast row, never swallowed.

- [ ] **Step 1: Failing test** for `nextActions` (trivial but pins the contract):

```ts
import { describe, it, expect } from 'vitest';
import { nextActions } from '@/app/console/nextActions';

it('offers only legal transitions', () => {
  expect(nextActions('PRE_SHOW')).toEqual(['INTRO']);
  expect(nextActions('REVEAL')).toEqual(['KNOWLEDGE_DROP', 'SCORE_COMMITTED']);
  expect(nextActions('COMPLETE')).toEqual([]);
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement helper + console UI.** Build the page with plain fetch + `useGameStream`; keep all styling on design tokens. **Step 4: Run tests + `pnpm build`** — PASS. **Step 5: Commit** — `git commit -am "feat: producer console with run-of-show controls" && git push`

---

### Task 17: Host, Contestant and Stage displays

**Files:**
- Create: `src/app/host/page.tsx`, `src/app/contestant/[n]/page.tsx`, `src/app/stage/page.tsx`, `src/components/QuestionCard.tsx`, `src/components/HoldScreen.tsx`
- Test: `tests/components/QuestionCard.test.tsx`

**Interfaces:**
- Consumes: `useGameStream`, `KnowledgeRing`, `ProjectedSnapshot`.
- Produces: three display routes; all take `?game=<id>` query param (console shows copyable display links after creating a game).

`QuestionCard` (shared): stem (Archivo, large), choices A–E as lettered cards; props `{ q: PublicQuestion; reveal: RevealPayload | null; lockedChoice: number | null }`. When `reveal` present: correct choice gets amber border **plus** a "✓ CORRECT" text label; a locked wrong choice gets graphite dim **plus** "✗" label (non-color cues). Category theme class `theme-{domain}` on the card root drives the per-domain edge colors (add `src/styles/themes.css` with the 8 theme classes from the spec table).

- Host: QuestionCard + pronunciation/explanation panel that renders **only** from `snapshot.reveal` (never fetches privileged data), timer, next-state hint.
- Contestant `[n]`: QuestionCard sized for touch, own score, own lifeline status, confidence badge, difficulty chip hidden when `'HIDDEN'`.
- Stage: KnowledgeRing center (segments derived: `questionIndex` active, committed results correct/wrong from snapshot history counts), scoreboard ribbon, Knowledge Drop overlay in `KNOWLEDGE_DROP` state, `HoldScreen` when `hold` (static 420 IQ ring on graphite, no data). Stage has a `?aspect=916` mode: vertical layout via CSS grid swap.

- [ ] **Step 1: Failing test** — `tests/components/QuestionCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionCard } from '@/components/QuestionCard';

const q = { questionId: 'q', domain: 'HISTORY', difficulty: 'HIDDEN', stem: 'When?', choices: ['1900', '1961'], knowledgeDropAvailable: false } as any;

describe('QuestionCard', () => {
  it('shows choices with no correctness marks before reveal', () => {
    render(<QuestionCard q={q} reveal={null} lockedChoice={null} />);
    expect(screen.getByText('When?')).toBeDefined();
    expect(screen.queryByText(/CORRECT/)).toBeNull();
  });
  it('marks the verified answer with text label on reveal', () => {
    render(<QuestionCard q={q} reveal={{ ...q, correctIndex: 1, explanation: 'x', knowledgeDrop: null, sourceTitle: 's', correctAsOf: '2026-01-01' }} lockedChoice={0} />);
    expect(screen.getByText(/CORRECT/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** shared components, themes.css, three pages. **Step 4: Run + `pnpm build`** — PASS. **Step 5: Commit** — `git commit -am "feat: host, contestant and stage displays with category themes" && git push`

---

### Task 18: Question & Pack Editor

**Files:**
- Create: `src/app/editor/page.tsx`, `src/app/editor/QuestionForm.tsx`, `src/app/api/questions/route.ts` (GET list, POST create), `src/app/api/questions/[id]/status/route.ts`, `src/app/api/packs/route.ts` (GET list)
- Test: `tests/server/questionApi.test.ts`

**Interfaces:**
- Consumes: `Repos` (Task 9), pack service (Task 11).
- Produces: `/editor` with two tabs — **Questions** (table: stem, domain, difficulty, tier, status, expiry; status-advance buttons respecting the workflow; "new question" form with zod validation mirroring `QuestionVersionData`, tier-3 requires expiry + jurisdiction) and **Packs** (generate form: episodeId, laneCount, questionsPerLane, optional seed; renders the FairnessReport diagnostics — per-lane weights, domain exposure grid, violations list in `--signal-red` with icon; approve button freezes and shows checksum; approved packs list feeds the console's create-game picker).

- [ ] **Step 1: Failing API test** — `tests/server/questionApi.test.ts` exercises the zod schema + handler functions directly (extract `createQuestionSchema` and handler logic into `src/server/questionService.ts` so it's testable without HTTP):

```ts
import { describe, it, expect } from 'vitest';
import { createQuestionSchema } from '@/server/questionService';

describe('createQuestionSchema', () => {
  const valid = {
    domain: 'SCIENCE', difficulty: 'FLAME', stem: 'Q?', choices: ['a','b','c','d'],
    correctIndex: 1, explanation: 'e', knowledgeDrop: null, sourceTitle: 't', sourceUrl: 'https://x',
    correctAsOf: '2026-07-01', jurisdiction: null, sensitivityTier: 1, expiresAt: null,
    readTimeSec: 9, factKey: 'k1', demoFlag: null,
  };
  it('accepts a valid tier-1 question', () => {
    expect(createQuestionSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects tier 3 without expiry or jurisdiction', () => {
    expect(createQuestionSchema.safeParse({ ...valid, sensitivityTier: 3 }).success).toBe(false);
    expect(createQuestionSchema.safeParse({ ...valid, sensitivityTier: 3, expiresAt: '2027-01-01', jurisdiction: 'NG' }).success).toBe(true);
  });
  it('rejects correctIndex outside choices', () => {
    expect(createQuestionSchema.safeParse({ ...valid, correctIndex: 9 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `questionService.ts` (schema + create/list/setStatus wrappers), routes, editor UI. **Step 4: Run + build** — PASS. **Step 5: Commit** — `git commit -am "feat: question and pack editor with workflow enforcement and balance report" && git push`

---

### Task 19: 10,000-run fairness simulation

**Files:**
- Create: `scripts/fairness-sim.ts`
- Test: the script IS the test artifact; add package script `"fairness": "tsx scripts/fairness-sim.ts"`.

**Interfaces:**
- Consumes: `generateLanes`, `evaluateLanes`, `seedDatabase` pool shape.

Script: build the 96-question demo pool (reuse `DEMO_BANK` from `src/data/seedData.ts`), run 10,000 generations with fresh random seeds (2 lanes × 6 questions), collect: violation-free rate (must be 100% — any violation aborts with exit 1), balance-score distribution (min/median/max), per-difficulty first-slot frequencies, per-lane weight spread stats, wall-clock time. Write `docs/reports/fairness-report.md` with a summary table and the run parameters + git SHA.

- [ ] **Step 1: Write script.** **Step 2: Run** `pnpm fairness` — expected: `10000/10000 valid packs`, report file written. If any run fails, that is a real solver bug: fix `laneGenerator` repair logic, re-run.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "test: 10k-run fairness simulation with committed report" && git push`

---

### Task 20: Playwright E2E, prototype audit report, README

**Files:**
- Create: `playwright.config.ts`, `e2e/game-flow.spec.ts`, `docs/prototype/AUDIT.md`, `README.md`
- Modify: `package.json` (add `-D @playwright/test`; scripts `"e2e": "playwright test"`)

**Interfaces:** consumes everything.

`playwright.config.ts`: `webServer: { command: 'pnpm dev', port: 3000, reuseExistingServer: true }`, single chromium project. Test DB: `DB_PATH=data/e2e.sqlite` env in webServer, deleted in `globalSetup`.

- [ ] **Step 1: Write E2E spec** — `e2e/game-flow.spec.ts`:

```ts
import { test, expect, request } from '@playwright/test';

test('full round: no answer leaks before reveal, scores commit, ring updates', async ({ page, context }) => {
  // Setup via API: seed, pack, approve, game
  const api = await request.newContext({ baseURL: 'http://localhost:3000' });
  await api.post('/api/dev/seed');                                  // dev-only route added for e2e: runs seedDatabase
  const pack = await (await api.post('/api/packs/generate', { data: { episodeId: 'e2e', laneCount: 2, questionsPerLane: 6 } })).json();
  await api.post(`/api/packs/${pack.packId}/approve`, { data: { approver: 'ep' } });
  const game = await (await api.post('/api/games', { data: { packId: pack.packId, mode: 'live', contestants: [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }] } })).json();
  const gid = game.gameId;

  // Watch every response the contestant page receives; none may contain correctIndex pre-reveal
  const leaks: string[] = [];
  let revealed = false;
  page.on('response', async (res) => {
    if (revealed) return;
    const ct = res.headers()['content-type'] ?? '';
    if (ct.includes('json') || ct.includes('event-stream')) {
      const body = await res.text().catch(() => '');
      if (body.includes('correctIndex')) leaks.push(res.url());
    }
  });

  await page.goto(`/contestant/1?game=${gid}`);

  // Drive the game via API as the producer
  const key = () => crypto.randomUUID();
  for (const to of ['INTRO', 'QUESTION_READY', 'QUESTION_LIVE'])
    await api.post(`/api/games/${gid}/transition`, { data: { to, idempotencyKey: key() } });

  await expect(page.getByTestId('question-stem')).toBeVisible();

  await api.post(`/api/games/${gid}/answers/lock`, { data: { contestantId: 'c1', choiceIndex: 0, confidence: 'CURIOUS', idempotencyKey: key() } });
  expect(leaks).toEqual([]);            // nothing leaked up to lock
  revealed = true;
  await api.post(`/api/games/${gid}/transition`, { data: { to: 'REVEAL', idempotencyKey: key() } });
  await api.post(`/api/games/${gid}/transition`, { data: { to: 'SCORE_COMMITTED', idempotencyKey: key() } });

  await expect(page.getByTestId('score-c1')).toBeVisible();

  // Stage ring renders segments
  await page.goto(`/stage?game=${gid}`);
  await expect(page.locator('[data-testid^="ring-seg-"]').first()).toBeVisible();
});
```

Add the referenced `data-testid`s (`question-stem`, `score-c1`) to the display components, and `src/app/api/dev/seed/route.ts` guarded by `process.env.NODE_ENV !== 'production'`.

- [ ] **Step 2: Run** `pnpm e2e` — expected PASS.
- [ ] **Step 3: Write `docs/prototype/AUDIT.md`** — findings already established: 5,705-line single HTML file; 16 generic trivia questions embedded client-side with `correctAnswer` index exposed (critical); localStorage-only persistence; no lifelines/confidence/steal/teams/multi-display/realtime; salvage = question content (imported as drafts by Task 10) and nothing else; migration map = this plan.
- [ ] **Step 4: Write `README.md`** — setup (`pnpm i`, `pnpm seed`, `pnpm dev`), env vars (`DB_PATH`, `SESSION_SECRET`, `ROLE_PIN_*`), display URLs, role PINs table, game-day quickstart (seed → editor: generate+approve pack → console: create game → open displays → run show), test commands (`pnpm test`, `pnpm fairness`, `pnpm e2e`), rehearsal-vs-live note, backup note (copy the sqlite file).
- [ ] **Step 5: Full verification** — `pnpm test && pnpm build && pnpm e2e && pnpm fairness` all green.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "test: e2e game flow with answer-leak guard; docs: audit report and readme" && git push`

---

### Task 21: Lifeline detail flows and server timers

**Files:**
- Modify: `src/data/schema.ts` + `src/data/repos.ts` (add `trusted_contacts` and `source_signals` tables + repo methods), `src/server/gameEngine.ts`, `src/app/console/GameControls.tsx`
- Create: `src/app/api/games/[id]/lifelines/circle/resolve/route.ts`
- Test: `tests/server/lifelines.test.ts`

**Interfaces:**
- Produces (added to `Repos`):

```ts
contacts: {
  add(c: { contestantId: string; name: string; consentRecordedAt: string; available: boolean }): Promise<string>;
  forContestant(contestantId: string): Promise<{ id: string; name: string; available: boolean }[]>;
  setAvailability(id: string, available: boolean): Promise<void>;
};
signals: {
  set(questionId: string, signals: { text: string; kind: 'VERIFIED' | 'UNRELIABLE' | 'DISTRACTOR' }[]): Promise<void>; // exactly 3, one VERIFIED
  get(questionId: string): Promise<{ text: string; kind: string }[] | null>;
};
```

- Added to `GameSnapshot`:

```ts
timer: { kind: 'question' | 'steal' | 'circleAdvice' | 'circleLock' | 'sourceSignal'; deadline: string } | null; // ISO deadline; displays compute remaining locally
lifelineDetail:
  | { type: 'TRUSTED_CIRCLE'; contactName: string | null; phase: 'CONNECTING' | 'ADVICE' | 'LOCK' | 'CONSENSUS_FALLBACK' }
  | { type: 'SOURCE_SIGNAL'; signals: { text: string }[]; verifiedIndex: number | null } // verifiedIndex null until contestant selects
  | null;
```

Engine behavior:
- Timers are **deadline-based**, not tick-based: entering `QUESTION_LIVE` sets `timer = {kind:'question', deadline: now + timersSec.question}`; each lifeline phase sets its own deadline. Deadlines live in event payloads, so snapshots rebuild them after restart. Displays render countdowns from the deadline; the producer (not a background job) advances state when time expires — the deadline is a broadcast fact, expiry enforcement stays human in the pilot.
- Trusted Circle activation: engine picks a random **available** contact using `createSeededRng(gameId + questionIndex)` for auditability; if none available ⇒ `phase: 'CONSENSUS_FALLBACK'` (Circle Consensus). `circle/resolve` route lets the producer advance CONNECTING → ADVICE → LOCK phases (each phase re-emits with its deadline).
- Source Signal activation: engine loads the question's three signals **without kinds** into `lifelineDetail.signals` (order shuffled by the same seeded rng); a `selectSignal(gameId, index, idempotencyKey)` engine method sets `verifiedIndex` to the shuffled position of the VERIFIED signal — revealed only after selection. If a question has no stored signals, activation throws `Error('NO_SIGNALS_FOR_QUESTION')` (console disables the button via a flag in the snapshot). Seed script (Task 10) stores three demo signals for every demo question.

- [ ] **Step 1: Failing tests** — `tests/server/lifelines.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRepos, type Repos } from '@/data/repos';
import { seedDatabase } from '@/data/seedData';
import { generatePack, approvePack } from '@/server/packService';
import { GameEngine } from '@/server/gameEngine';

let repos: Repos; let engine: GameEngine; let gameId: string;

beforeEach(async () => {
  repos = createRepos(':memory:');
  await seedDatabase(repos);
  const { packId } = await generatePack(repos, { episodeId: 'e', laneCount: 2, questionsPerLane: 6 });
  await approvePack(repos, packId, 'ep');
  engine = new GameEngine(repos);
  gameId = await engine.createGame(packId, 'live', [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }]);
  for (const [to, k] of [['INTRO','k1'],['QUESTION_READY','k2'],['QUESTION_LIVE','k3']] as const)
    await engine.transition(gameId, to, 'prod', k);
});

describe('timers', () => {
  it('QUESTION_LIVE carries a question deadline that survives restart', async () => {
    const s = await engine.snapshot(gameId);
    expect(s.timer?.kind).toBe('question');
    expect(new Date(s.timer!.deadline).getTime()).toBeGreaterThan(Date.now());
    expect((await new GameEngine(repos).snapshot(gameId)).timer).toEqual(s.timer);
  });
});

describe('Trusted Circle', () => {
  it('selects an available contact deterministically, else falls back to consensus', async () => {
    await repos.contacts.add({ contestantId: 'c1', name: 'Zik', consentRecordedAt: '2026-07-20', available: true });
    await repos.contacts.add({ contestantId: 'c1', name: 'Efe', consentRecordedAt: '2026-07-20', available: false });
    const s = await engine.activateLifeline(gameId, 'c1', 'TRUSTED_CIRCLE', 'prod', 'kA');
    expect(s.lifelineDetail).toMatchObject({ type: 'TRUSTED_CIRCLE', contactName: 'Zik', phase: 'CONNECTING' });
  });
  it('falls back to Circle Consensus when no contact is available', async () => {
    const s = await engine.activateLifeline(gameId, 'c2', 'TRUSTED_CIRCLE', 'prod', 'kB');
    expect(s.lifelineDetail).toMatchObject({ type: 'TRUSTED_CIRCLE', contactName: null, phase: 'CONSENSUS_FALLBACK' });
  });
});

describe('Source Signal', () => {
  it('serves three unlabelled signals and reveals verified only after selection', async () => {
    const s = await engine.activateLifeline(gameId, 'c1', 'SOURCE_SIGNAL', 'prod', 'kC');
    if (s.lifelineDetail?.type !== 'SOURCE_SIGNAL') throw new Error('wrong detail');
    expect(s.lifelineDetail.signals).toHaveLength(3);
    expect(s.lifelineDetail.verifiedIndex).toBeNull();
    expect(JSON.stringify(s.lifelineDetail)).not.toContain('VERIFIED');
    const after = await engine.selectSignal(gameId, 1, 'kD');
    if (after.lifelineDetail?.type !== 'SOURCE_SIGNAL') throw new Error('wrong detail');
    expect(after.lifelineDetail.verifiedIndex).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** repo additions, engine changes, resolve route, console phase controls, demo signals in seed (extend Task 10's `DEMO_BANK` writer to call `signals.set` per question with `[VERIFIED, UNRELIABLE, DISTRACTOR]` texts). **Step 4: Run full suite** — PASS. **Step 5: Commit** — `git commit -am "feat: trusted circle roster with consensus fallback, source signal reveal, deadline timers" && git push`

---

## Acceptance-test traceability (spec §25, pilot subset)

| # | Criterion | Covered by |
|---|---|---|
| 1 | Lanes meet fairness constraints over 10,000 runs | Task 19 |
| 2 | Same seed + pack ⇒ same sequence | Tasks 7, 11 |
| 3 | No client gets an answer before reveal | Tasks 8, 14, 20 |
| 4 | Duplicate submissions idempotent | Tasks 9, 12 |
| 5 | Lifeline single-use + fallback state | Tasks 9, 12 (Circle Consensus = producer marks contacts unavailable → engine converts) |
| 6 | Score survives restart, rebuilds from events | Task 12 (restart test) |
| 7 | Illegal transitions blocked | Tasks 4, 12 |
| 9 | Manual correction records operator/approver/reason | Task 12 |
| 10 | Expired sensitive questions excluded from packs | Tasks 9, 11 |
| 11 | Rehearsal cannot contaminate usage | Task 12 |
| 12 | Keyboard + reduced-motion operation | Tokens (Task 1), components (15–17), verified manually in Task 20 Step 5 |
| 13 | 16:9 and 9:16 legibility | Task 17 stage aspect mode |

(#8 offline-sync node and #14–15 audience-mode tests are Phase 3/4 scope.)
