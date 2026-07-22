# 420 IQ — Broadcast Mode Design (host presentation + original SFX)

**Date:** 2026-07-22
**Scope:** Additive presentation + audio layer on the existing pilot.
**Source request:** A host/guest theatrical, game-show-style presentation with
sound effects for correct/wrong answers and category reveals.

## Principle

No server, game-engine, scoring, fairness, or data-model changes. Broadcast
Mode is a **pure client presentation-and-audio layer** driven entirely by the
existing SSE `ProjectedSnapshot`. All tested mechanics stay untouched; the
feature is safe to add and easy to remove.

## Brand/legal guardrail

The 420 IQ format bible forbids imitating any existing quiz format's ladder,
wording, lifelines, set, music, or reveal language, and requires audio that is
original, ownable, and works offline. Broadcast Mode therefore uses **only
420 IQ's own language** (Knowledge Ring, amber/ultraviolet palette, Confidence
Lock) and **original synthesized sound** — no copyrighted samples, no external
audio services, nothing that reads as a clone of another show.

## Decisions locked

| Decision | Choice |
|---|---|
| Structure | Presentation layer only; keep the 2-contestant head-to-head format |
| Audio source | Web Audio API synthesis (original, offline, ownable). AI SFX generation was ruled out — the available audio tool is text-to-speech only and forbids using its SFX model for standalone audio |
| Category audio | One shared elegant category-reveal sting (not 8 per-category) |
| Audio surface | Stage (audience/broadcast screen) only, behind a one-click arm gesture |

## Sound system (`src/audio/`)

`AudioEngine` owns one shared `AudioContext`, a master gain (mute/volume), and
a light algorithmic reverb tail for a produced feel. Browsers block audio until
a user gesture, so the engine starts suspended and is resumed by an arm button.

Cue catalog (each original, layered oscillators + filtered noise + envelopes):

- **correct** — warm amber major-interval bloom, soft rise
- **wrong** — deep ultraviolet detuned fall that resolves (not a harsh buzzer)
- **lock** — percussive impact + sub thump (mirrors the ring lock pulse)
- **category** — elegant shimmer sting on domain reveal
- **tensionStart / tensionStop** — low evolving riser loop while a question is live
- **steal** — urgent pulsing alert
- **lifelineCircle** — three warm pulses (Trusted Circle identity)
- **lifelineSignal** — data-scan resolving to one verified "truth" note
- **victory** — ring-completion fanfare at COMPLETE

Audio is enhancement only: the existing ✓/✗ text labels and colour cues remain,
so nothing depends on sound (WCAG intact). A mute toggle sits beside the arm
button. Cinematic animations respect `prefers-reduced-motion`.

## Cue triggering

`useBroadcastAudio(snapshot)` keeps the previous snapshot and, on each new one,
calls a **pure** `selectCues(prev, next)` that returns the cue names to fire.
Rules (all from data already in the stream):

- state → `QUESTION_READY`: `category`
- state → `QUESTION_LIVE`: `tensionStart`
- state → `ANSWER_LOCKED`: `lock` (+ `tensionStop`)
- state → `REVEAL`: `correct` when `lockedChoice === reveal.correctIndex`, else
  `wrong`; additionally `steal` when `snapshot.stealOpen`
- `lifelineDetail` newly present: `lifelineCircle` or `lifelineSignal` by type
- state → `COMPLETE`: `victory`
- any state with `hold` true: suppress cues (holding graphic)

`selectCues` is unit-tested (Vitest). The synthesis itself is verified in the
browser.

## Host + guest presentation (Stage broadcast screen)

- **Host lower-third**: a per-state prompt line from `src/domain/hostScript.ts`
  (curated original lines: intro beat, "lock it in" beat, reveal beat, final
  beat, victory beat). The same map feeds a **teleprompter panel on the Host
  display** so the host is scripted and present.
- **Contestant (guest) spotlight**: the active contestant's name rendered large
  and lit during their turn; the opponent dims — the "hot seat" feeling without
  changing the 2-player format.
- **Cinematic question reveal**: the stem animates in with the category lighting
  state and the category sting; the Knowledge Ring remains the hero device.

## Files (all additive)

- `src/audio/AudioEngine.ts` — context, master gain, reverb, `play(cue)`
- `src/audio/cues.ts` — the cue catalog (synthesis per cue)
- `src/audio/transitions.ts` — pure `selectCues(prev, next)` + names
- `src/audio/useBroadcastAudio.ts` — React hook wiring snapshot → engine
- `src/components/AudioArm.tsx` — enable-sound gesture + mute toggle
- `src/domain/hostScript.ts` — per-state host prompt lines (pure data)
- Edit `src/app/stage/page.tsx` — lower-third, spotlight, cinematic reveal, mount audio
- Edit `src/app/host/page.tsx` — teleprompter panel

Tests: Vitest for `transitions.ts` and `hostScript.ts`; browser verification for
sound and presentation.

## Out of scope (this cycle)

Solo hot-seat mode; 8 per-category unique stings; swappable audio-file loading;
recorded host voice-over. All cleanly addable later.
