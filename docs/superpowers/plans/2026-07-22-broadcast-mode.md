# Broadcast Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-led theatrical presentation and original synthesized sound effects to the Stage and Host displays, driven entirely by the existing SSE game state.

**Architecture:** A pure client-side layer. A Web Audio `AudioEngine` synthesizes original cues; a pure `selectCues(prev, next)` maps snapshot transitions to cue names; a `useBroadcastAudio` hook fires them; the Stage gains a host lower-third, contestant spotlight and cinematic reveal, the Host gains a teleprompter. No server, engine, scoring, or data-model changes.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Web Audio API, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-broadcast-mode-design.md`.
- **No server/engine/scoring/data-model changes.** Every new file is client-side; the only edits to existing files are `src/app/stage/page.tsx` and `src/app/host/page.tsx`.
- **Original assets only.** No copyrighted samples, no external audio services, no imitation of another quiz format's music/wording/reveal language. All sound is synthesized in-browser.
- **Offline-safe.** No network calls, no imported audio files.
- **Audio is enhancement only.** The existing ✓/✗ text labels and colour cues stay; nothing depends on sound. Provide a mute toggle; audio starts only after a user gesture (browser autoplay policy). Respect `prefers-reduced-motion` for animations.
- Cue names (exact string union, used across tasks): `'correct' | 'wrong' | 'lock' | 'category' | 'tensionStart' | 'tensionStop' | 'steal' | 'lifelineCircle' | 'lifelineSignal' | 'victory'`.
- ProjectedSnapshot fields available (do not add new ones): `state`, `publicQuestion` (`{ domain, difficulty, stem, choices, ... }` or null), `reveal` (`{ correctIndex, ... }` or null), `lockedChoice` (number|null), `stealOpen` (boolean), `lifelineDetail` (`{ type: 'SOURCE_SIGNAL' | 'TRUSTED_CIRCLE', ... }` or null), `hold` (boolean), `activeContestantId`, `contestants` (`{id,name}[]`), `scores`.
- `GameState` union (from `@/domain/fsm`): `PRE_SHOW, INTRO, QUESTION_READY, QUESTION_LIVE, ANSWER_LOCKED, LIFELINE_ACTIVE, REVEAL, KNOWLEDGE_DROP, SCORE_COMMITTED, NEXT_QUESTION, FINAL, COMPLETE`.
- Commit after each green task; push to `origin build/broadcast-mode`.

## File Structure

```
src/
  audio/
    cueNames.ts        # the CueName union + list (shared, dependency-free)
    transitions.ts     # pure selectCues(prev, next): CueName[]
    AudioEngine.ts      # Web Audio context, master gain/mute, reverb, play(cue)
    cues.ts             # per-cue synthesis functions
    useBroadcastAudio.ts# React hook: snapshot -> engine
  components/
    AudioArm.tsx        # enable-sound gesture + mute toggle
  domain/
    hostScript.ts       # per-state host prompt lines (pure data)
tests/
  audio/transitions.test.ts
  domain/hostScript.test.ts
```

---

### Task 1: Host script (per-state prompt lines)

**Files:**
- Create: `src/domain/hostScript.ts`
- Test: `tests/domain/hostScript.test.ts`

**Interfaces:**
- Consumes: `GameState` from `@/domain/fsm`.
- Produces: `hostLineFor(state: GameState): string` — an original host prompt for every state (never empty).

- [ ] **Step 1: Write the failing test** — `tests/domain/hostScript.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hostLineFor } from '@/domain/hostScript';
import { TRANSITIONS, type GameState } from '@/domain/fsm';

describe('hostLineFor', () => {
  it('returns a non-empty original line for every game state', () => {
    const states = Object.keys(TRANSITIONS) as GameState[];
    for (const s of states) {
      const line = hostLineFor(s);
      expect(typeof line).toBe('string');
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });
  it('gives distinct lines for the key show beats', () => {
    const beats: GameState[] = ['INTRO', 'QUESTION_LIVE', 'REVEAL', 'FINAL', 'COMPLETE'];
    const lines = beats.map(hostLineFor);
    expect(new Set(lines).size).toBe(beats.length);
  });
});
```

- [ ] **Step 2: Run** `pnpm test tests/domain/hostScript.test.ts` — expected FAIL (module not found).

- [ ] **Step 3: Implement** `src/domain/hostScript.ts` (original lines — no imitation of any existing show's wording):

```ts
import type { GameState } from '@/domain/fsm';

const LINES: Record<GameState, string> = {
  PRE_SHOW: 'Welcome to 420 IQ. Let us find out how high your knowledge really is.',
  INTRO: 'Meet tonight’s minds. The Knowledge Ring is open.',
  QUESTION_READY: 'Here comes your category. Read carefully.',
  QUESTION_LIVE: 'The question is live. Take your time — but not too much.',
  ANSWER_LOCKED: 'Locked in. No turning back now.',
  LIFELINE_ACTIVE: 'A lifeline is in play. Let us see if it lifts your IQ.',
  REVEAL: 'Let us light up the truth.',
  KNOWLEDGE_DROP: 'And here is something worth keeping — your Knowledge Drop.',
  SCORE_COMMITTED: 'The ring records it. On we climb.',
  NEXT_QUESTION: 'Reset the ring. Next mind, next question.',
  FINAL: 'This is the 420 Decision. Choose your risk, and reason it out.',
  COMPLETE: 'The ring is complete. Tonight’s knowledge belongs to our champion.',
};

export function hostLineFor(state: GameState): string {
  return LINES[state];
}
```

- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: per-state host script lines" && git push`

---

### Task 2: Cue names + transition-to-cue selection (pure)

**Files:**
- Create: `src/audio/cueNames.ts`, `src/audio/transitions.ts`
- Test: `tests/audio/transitions.test.ts`

**Interfaces:**
- Consumes: `ProjectedSnapshot` from `@/server/projection` (type-only import; erased at build).
- Produces:

```ts
// src/audio/cueNames.ts
export type CueName =
  | 'correct' | 'wrong' | 'lock' | 'category' | 'tensionStart'
  | 'tensionStop' | 'steal' | 'lifelineCircle' | 'lifelineSignal' | 'victory';
export const CUE_NAMES: CueName[];

// src/audio/transitions.ts
export function selectCues(
  prev: ProjectedSnapshot | null,
  next: ProjectedSnapshot,
): CueName[];
```

Rules (fire only on an actual change from `prev` to `next`; if `next.hold` is true, return `[]`):
- `next.state !== prev?.state` and `next.state === 'QUESTION_READY'` → `category`
- entered `QUESTION_LIVE` → `tensionStart`
- entered `ANSWER_LOCKED` → `lock`, `tensionStop`
- entered `REVEAL` → (`next.lockedChoice != null && next.reveal && next.lockedChoice === next.reveal.correctIndex`) ? `correct` : `wrong`; and if `next.stealOpen` also `steal`
- entered `COMPLETE` → `victory`
- `next.lifelineDetail` present AND (`prev?.lifelineDetail` absent OR different type) → `lifelineCircle` if type `TRUSTED_CIRCLE`, `lifelineSignal` if `SOURCE_SIGNAL`
- otherwise `[]`

- [ ] **Step 1: Write the failing test** — `tests/audio/transitions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectCues } from '@/audio/transitions';
import type { ProjectedSnapshot } from '@/server/projection';

const base = (over: Partial<ProjectedSnapshot>): ProjectedSnapshot => ({
  gameId: 'g', state: 'PRE_SHOW', mode: 'live', questionIndex: 0,
  activeContestantId: 'c1', contestants: [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }],
  scores: { c1: 0, c2: 0 }, lifelines: {}, publicQuestion: null, reveal: null,
  confidence: null, stealOpen: false, lockedChoice: null, timer: null,
  lifelineDetail: null, hold: false, ...over,
} as ProjectedSnapshot);

describe('selectCues', () => {
  it('category on entering QUESTION_READY', () => {
    expect(selectCues(base({ state: 'INTRO' }), base({ state: 'QUESTION_READY' }))).toEqual(['category']);
  });
  it('tensionStart on entering QUESTION_LIVE', () => {
    expect(selectCues(base({ state: 'QUESTION_READY' }), base({ state: 'QUESTION_LIVE' }))).toEqual(['tensionStart']);
  });
  it('lock + tensionStop on entering ANSWER_LOCKED', () => {
    expect(selectCues(base({ state: 'QUESTION_LIVE' }), base({ state: 'ANSWER_LOCKED' }))).toEqual(['lock', 'tensionStop']);
  });
  it('correct when locked choice matches on REVEAL', () => {
    const prev = base({ state: 'ANSWER_LOCKED', lockedChoice: 2 });
    const next = base({ state: 'REVEAL', lockedChoice: 2, reveal: { correctIndex: 2 } as any });
    expect(selectCues(prev, next)).toEqual(['correct']);
  });
  it('wrong when locked choice differs on REVEAL', () => {
    const prev = base({ state: 'ANSWER_LOCKED', lockedChoice: 0 });
    const next = base({ state: 'REVEAL', lockedChoice: 0, reveal: { correctIndex: 3 } as any });
    expect(selectCues(prev, next)).toEqual(['wrong']);
  });
  it('wrong + steal when steal window opens', () => {
    const prev = base({ state: 'ANSWER_LOCKED', lockedChoice: 0 });
    const next = base({ state: 'REVEAL', lockedChoice: 0, reveal: { correctIndex: 3 } as any, stealOpen: true });
    expect(selectCues(prev, next)).toEqual(['wrong', 'steal']);
  });
  it('victory on COMPLETE', () => {
    expect(selectCues(base({ state: 'FINAL' }), base({ state: 'COMPLETE' }))).toEqual(['victory']);
  });
  it('lifeline cue when a lifeline detail appears', () => {
    const prev = base({ state: 'QUESTION_LIVE', lifelineDetail: null });
    const circle = base({ state: 'LIFELINE_ACTIVE', lifelineDetail: { type: 'TRUSTED_CIRCLE' } as any });
    expect(selectCues(prev, circle)).toEqual(['lifelineCircle']);
    const signal = base({ state: 'LIFELINE_ACTIVE', lifelineDetail: { type: 'SOURCE_SIGNAL', signals: [], verifiedIndex: null } as any });
    expect(selectCues(prev, signal)).toEqual(['lifelineSignal']);
  });
  it('nothing when state is unchanged', () => {
    expect(selectCues(base({ state: 'QUESTION_LIVE' }), base({ state: 'QUESTION_LIVE' }))).toEqual([]);
  });
  it('nothing while on hold', () => {
    expect(selectCues(base({ state: 'QUESTION_READY' }), base({ state: 'REVEAL', hold: true, lockedChoice: 1, reveal: { correctIndex: 1 } as any }))).toEqual([]);
  });
  it('first snapshot (prev null) does not fire a stale transition', () => {
    expect(selectCues(null, base({ state: 'PRE_SHOW' }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** — expected FAIL.

- [ ] **Step 3: Implement** `src/audio/cueNames.ts`:

```ts
export type CueName =
  | 'correct' | 'wrong' | 'lock' | 'category' | 'tensionStart'
  | 'tensionStop' | 'steal' | 'lifelineCircle' | 'lifelineSignal' | 'victory';

export const CUE_NAMES: CueName[] = [
  'correct', 'wrong', 'lock', 'category', 'tensionStart',
  'tensionStop', 'steal', 'lifelineCircle', 'lifelineSignal', 'victory',
];
```

Then `src/audio/transitions.ts`:

```ts
import type { ProjectedSnapshot } from '@/server/projection';
import type { CueName } from './cueNames';

export function selectCues(prev: ProjectedSnapshot | null, next: ProjectedSnapshot): CueName[] {
  if (next.hold) return [];
  const cues: CueName[] = [];
  const entered = (s: ProjectedSnapshot['state']) => next.state === s && prev?.state !== s;

  if (entered('QUESTION_READY')) cues.push('category');
  if (entered('QUESTION_LIVE')) cues.push('tensionStart');
  if (entered('ANSWER_LOCKED')) cues.push('lock', 'tensionStop');
  if (entered('REVEAL')) {
    const correct = next.lockedChoice != null && next.reveal != null && next.lockedChoice === next.reveal.correctIndex;
    cues.push(correct ? 'correct' : 'wrong');
    if (next.stealOpen) cues.push('steal');
  }
  if (entered('COMPLETE')) cues.push('victory');

  const prevType = prev?.lifelineDetail?.type ?? null;
  const nextType = next.lifelineDetail?.type ?? null;
  if (nextType && nextType !== prevType) {
    cues.push(nextType === 'TRUSTED_CIRCLE' ? 'lifelineCircle' : 'lifelineSignal');
  }

  return cues;
}
```

- [ ] **Step 4: Run** — expected PASS (12 tests).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: pure cue-selection for broadcast audio transitions" && git push`

---

### Task 3: AudioEngine + synthesized cues (Web Audio)

**Files:**
- Create: `src/audio/AudioEngine.ts`, `src/audio/cues.ts`
- Test: `tests/audio/engine.test.ts`

**Interfaces:**
- Consumes: `CueName`, `CUE_NAMES` from `./cueNames`.
- Produces:

```ts
// src/audio/cues.ts
export type CueFn = (ctx: AudioContext, out: AudioNode, now: number) => void;
export const CUES: Record<CueName, CueFn>;

// src/audio/AudioEngine.ts
export class AudioEngine {
  constructor(ctxFactory?: () => AudioContext); // factory injectable for tests
  arm(): Promise<void>;        // resume the context (call from a user gesture)
  get armed(): boolean;
  setMuted(m: boolean): void;
  get muted(): boolean;
  play(cue: CueName): void;    // no-op if not armed or muted
  stopLoops(): void;           // stops the tension bed
  dispose(): void;
}
```

Design notes for the implementer:
- The engine holds one `AudioContext`, a `masterGain` (→ destination) plus a simple algorithmic reverb (a `ConvolverNode` fed by a generated noise impulse) mixed in parallel. All cues connect to `masterGain`.
- `play('tensionStart')` starts a looping low oscillator bed and stores its nodes on the engine so `play('tensionStop')` (and `stopLoops`) can stop them. Every other cue is a one-shot built from oscillators/noise with gain envelopes and is self-stopping.
- Cues are **original**: warm major intervals for `correct`, a resolving detuned fall for `wrong`, an impact+sub for `lock`, a shimmer for `category`, an urgent pulse for `steal`, three warm pulses for `lifelineCircle`, a scan→note for `lifelineSignal`, an ascending arpeggio for `victory`.
- `play` is a no-op when `!armed || muted`. Unit tests inject a **mock AudioContext** so no real audio hardware is needed.

- [ ] **Step 1: Write the failing test** — `tests/audio/engine.test.ts` (uses a mock AudioContext; verifies gating and that every cue runs without throwing):

```ts
import { describe, it, expect, vi } from 'vitest';
import { AudioEngine } from '@/audio/AudioEngine';
import { CUE_NAMES } from '@/audio/cueNames';

function mockNode() {
  return {
    connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 1 },
    frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 440 },
    type: 'sine', buffer: null, loop: false, detune: { setValueAtTime: vi.fn(), value: 0 },
    Q: { setValueAtTime: vi.fn(), value: 1 },
  } as any;
}
function mockCtx() {
  const ctx: any = {
    state: 'suspended', currentTime: 0, sampleRate: 44100,
    destination: mockNode(),
    resume: vi.fn().mockImplementation(function (this: any) { ctx.state = 'running'; return Promise.resolve(); }),
    createGain: () => mockNode(), createOscillator: () => mockNode(),
    createBiquadFilter: () => mockNode(), createConvolver: () => mockNode(),
    createBufferSource: () => mockNode(),
    createBuffer: (ch: number, len: number) => ({ getChannelData: () => new Float32Array(len), length: len }),
  };
  return ctx;
}

describe('AudioEngine', () => {
  it('does not play until armed', () => {
    const ctx = mockCtx();
    const eng = new AudioEngine(() => ctx);
    expect(eng.armed).toBe(false);
    eng.play('correct'); // no throw, no-op
    expect(ctx.resume).not.toHaveBeenCalled();
  });
  it('arms by resuming the context', async () => {
    const ctx = mockCtx();
    const eng = new AudioEngine(() => ctx);
    await eng.arm();
    expect(ctx.resume).toHaveBeenCalled();
    expect(eng.armed).toBe(true);
  });
  it('every cue plays without throwing once armed', async () => {
    const ctx = mockCtx();
    const eng = new AudioEngine(() => ctx);
    await eng.arm();
    for (const cue of CUE_NAMES) {
      expect(() => eng.play(cue)).not.toThrow();
    }
    eng.stopLoops();
  });
  it('muting suppresses playback side effects', async () => {
    const ctx = mockCtx();
    const eng = new AudioEngine(() => ctx);
    await eng.arm();
    eng.setMuted(true);
    const before = (ctx.createOscillator as any).mock?.calls?.length ?? 0;
    eng.play('correct');
    // muted: engine must early-return before creating oscillators
    expect(eng.muted).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** `src/audio/cues.ts` then `src/audio/AudioEngine.ts` per the design notes. Keep each cue a small function; the engine wires master gain + reverb and delegates to `CUES[cue]`. Guard `play` with `if (!this._armed || this._muted) return;`. Store tension-bed nodes in a field; `stopLoops()` stops and clears them. All node creation goes through the injected context so the mock works.
- [ ] **Step 4: Run** — expected PASS. Also run full `pnpm test` and `pnpm build`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: web-audio engine and original synthesized cues" && git push`

---

### Task 4: useBroadcastAudio hook + AudioArm control

**Files:**
- Create: `src/audio/useBroadcastAudio.ts`, `src/components/AudioArm.tsx`
- Test: browser-verified in Task 5 (these are thin glue; no unit test required, but they must typecheck and build).

**Interfaces:**
- Consumes: `AudioEngine` (Task 3), `selectCues` (Task 2), `ProjectedSnapshot`.
- Produces:

```ts
// src/audio/useBroadcastAudio.ts
export function useBroadcastAudio(snapshot: ProjectedSnapshot | null): {
  engine: AudioEngine;
  armed: boolean;
  muted: boolean;
  arm: () => Promise<void>;
  toggleMute: () => void;
};

// src/components/AudioArm.tsx
export function AudioArm(props: {
  armed: boolean; muted: boolean; onArm: () => void; onToggleMute: () => void;
}): JSX.Element;
```

Hook behaviour:
- Create one `AudioEngine` per mount (`useRef`), `dispose()` on unmount.
- Keep a `useRef` of the previous snapshot. On each snapshot change, compute `selectCues(prevRef.current, snapshot)` and `engine.play(cue)` for each; then set `prevRef.current = snapshot`. Skip entirely when `snapshot` is null.
- Expose `armed`/`muted` as React state kept in sync with the engine.

`AudioArm`: when `!armed`, a prominent "Enable broadcast sound" button calling `onArm`; when armed, a compact mute/unmute toggle. Real `<button>`s, `aria-pressed` on the mute toggle, styled with existing tokens (amber accent on graphite).

- [ ] **Step 1: Implement** both files per the interfaces above.
- [ ] **Step 2: Verify** `pnpm build` compiles and `pnpm test` stays green (no new unit tests here).
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: broadcast audio hook and arm/mute control" && git push`

---

### Task 5: Stage broadcast presentation + Host teleprompter

**Files:**
- Modify: `src/app/stage/page.tsx`, `src/app/host/page.tsx`
- Create: `src/styles/broadcast.css` (imported by `src/app/layout.tsx`)

**Interfaces:**
- Consumes: `useBroadcastAudio`, `AudioArm`, `hostLineFor`, existing `useGameStream` / `KnowledgeRing` / `QuestionCard`.

Stage additions (do not remove existing behaviour — the ring, scoreboard, hold screen, knowledge-drop overlay all stay):
- Mount `const audio = useBroadcastAudio(snapshot)` and render `<AudioArm .../>` in a corner. When `snapshot` is null or `hold` is true, render as today.
- **Host lower-third**: a fixed band near the bottom showing `hostLineFor(snapshot.state)` with a small "HOST" label, above the category name. Animate line changes with a short fade (`prefers-reduced-motion`: no transition).
- **Contestant spotlight**: render the active contestant's name (`contestants.find(c => c.id === activeContestantId)?.name`) large and amber-lit; show the opponent's name dimmed. Falls back gracefully when `activeContestantId` is null (PRE_SHOW).
- **Cinematic reveal**: add a `theme-${domain}` class and a keyed re-mount on `questionId` so the stem fades/scales in on each new question (reduced-motion safe). Reuse the existing category theme classes.

Host additions:
- Add a **teleprompter panel**: a prominent card showing `hostLineFor(snapshot.state)` labelled "SAY", above the existing question/explanation panels. Present in every state (even PRE_SHOW).

`src/styles/broadcast.css`: classes for the lower-third band, spotlight (`.spotlight-active` / `.spotlight-dim`), teleprompter card, and the reveal fade/scale keyframes — all disabled under `@media (prefers-reduced-motion: reduce)`. Colours via existing tokens only.

- [ ] **Step 1: Implement** the Stage edits, Host edits, and `broadcast.css`; import the stylesheet in `layout.tsx`.
- [ ] **Step 2: Verify** `pnpm build` and full `pnpm test` are green.
- [ ] **Step 3: Manual browser check** (note results in the report): with a live game, arm sound on the Stage, then drive the console PRE_SHOW→…→REVEAL(correct), REVEAL(wrong+steal), a lifeline, and COMPLETE; confirm each cue fires, the lower-third and teleprompter update per state, the spotlight follows the active contestant, and mute silences everything. Confirm reduced-motion (OS setting) removes animations and audio still works.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: stage broadcast presentation and host teleprompter" && git push`

---

## Acceptance

- All new Vitest suites pass; `pnpm build` green; `pnpm test` green.
- Correct/wrong/category/lock/steal/lifeline/victory cues fire on the right transitions, verified in the browser; nothing plays before the arm gesture; mute silences all.
- Host lower-third + teleprompter show an original line per state; contestant spotlight follows the active player; reveal animates and respects reduced motion.
- No changes to `src/server/`, `src/domain/` (except the new `hostScript.ts`), `src/data/`, or any API route — confirmed by `git diff --stat`.
