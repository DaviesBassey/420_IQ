# 420 IQ — Pilot Control System Design

**Date:** 2026-07-22
**Scope:** Spec Phases 0 + 1 (prototype audit + pilot studio control system)
**Source:** `420_IQ_Format_Engine_Bible_and_App_Spec.md` (read-only copy in `docs/prototype/`)

## Goal

A local-first, server-authoritative studio game system that can run a complete
420 IQ episode on a single laptop or venue LAN with no internet: question bank
with workflow, balanced-random pack builder, live finite-state game engine,
producer console, host/contestant/stage displays, both lifelines, event-sourced
scoring, and an immutable audit trail.

## Decisions made

| Decision | Choice |
|---|---|
| First build scope | Phase 0 audit + Phase 1 pilot control system |
| Stack | Next.js (App Router) + TypeScript, pnpm |
| Database | SQLite via Drizzle ORM, behind a repository layer for later PostgreSQL migration |
| Realtime | Server-Sent Events (server → displays); commands as POSTs with idempotency keys |
| Question data | Import 16 prototype questions as Draft + `demo: general-trivia` flag; generate a clearly-labelled demo bank covering all 8 domains × 4 difficulties |
| Trusted Circle A/V | Modeled around an external call line (phone/Zoom); the app handles contact selection, consent tracking, timers, one-use enforcement and fallback. No WebRTC in the pilot. |
| Auth (pilot) | Device-claim screen: role + PIN issued from the console, signed session cookie. IdP/MFA is Phase 4. |

## Phase 0 — Audit findings and migration stance

`premium_quiz.html` (5,705 lines, two identical copies in Downloads) is a
solo-play trivia quiz: 16 generic questions (no cannabis domains), localStorage
leaderboard, round logic. It has none of the format mechanics (no lifelines,
confidence, steal, teams, multi-display) and embeds correct answers in the
client payload — the exact security flaw the spec prohibits.

**Stance: nothing structural is migrated.** Deliverables:

- Read-only copy preserved at `docs/prototype/premium_quiz.html`.
- Written audit report at `docs/prototype/AUDIT.md` (features, security issues,
  reusable assets, gaps, migration map).
- The 16 questions imported as `Draft` with a demo flag.
- Visual identity built fresh from the spec palette (deep amber, ultraviolet,
  polished graphite, controlled off-white, knowledge ring device).

## Architecture

One Next.js app, three layers:

1. **Domain layer** (`src/domain/`): pure TypeScript — FSM, scoring, fairness
   solver, entity types. No I/O; fully unit/property testable.
2. **Data layer** (`src/data/`): Drizzle schema + repository interfaces
   (`QuestionRepo`, `PackRepo`, `GameRepo`, `AuditRepo`, …). SQLite today;
   swapping to PostgreSQL touches only Drizzle config/migrations.
3. **App layer** (`src/app/`): routes, API handlers, SSE stream, display UIs.

**Server authority:** the game-engine module on the server owns state,
scoring and timers. Displays render pushed state and never calculate.

**Realtime:** `GET /api/games/[id]/stream?role=…` per display (SSE).
Role-scoped payload projection happens server-side before send.

**Routes:** `/console` (producer), `/host`, `/contestant/[n]`, `/stage`,
`/editor` (questions + packs), `/claim` (device role claim).

## Data model

Core entities: `Question` → immutable `QuestionVersion` (stem, choices,
correct index, explanation, Knowledge Drop, source title/URL/dates,
jurisdiction, "correct as of", sensitivity tier, expiry, read-time estimate),
`EpisodePack` (frozen: seed, checksum, approver, format-version scoring
config) → `PackQuestion` lanes, `GameSession` (mode: rehearsal | live),
`GameEvent` (append-only: actor, timestamp, prev state, next state, payload),
`Answer`, `ScoreEvent`, `LifelineUse`, `TrustedContact`, `AuditEvent`.

Rules:

- Question workflow: `Draft → EditorialReview → CouncilReview(when required) →
  Approved → Locked → Used → Retired/Expired`. A used question references an
  immutable version.
- Score is derived by folding `ScoreEvent`s; cached, never editable directly.
- Expired sensitive (Tier 3) questions are ineligible for packs — enforced at
  pack generation and revalidation.
- Rehearsal sessions never write usage history or contaminate stats.
- **Answer security:** correct answers exist only in privileged server
  loaders. Contestant/stage payloads derive from a `PublicQuestion` type that
  structurally cannot hold the correct index; a test asserts every outbound
  payload shape.

## Pack builder & balanced randomisation

Per the spec's algorithm: filter eligible questions (approved, unexpired,
unexposed, jurisdiction-ok, not used/rehearsed) → generate 50–200 candidate
lane sets from a seeded CSPRNG (seed stored) → score candidates against all
constraints:

- equal question count per lane; total difficulty weight within ±5%
- category exposure difference ≤ 1 per domain
- no more than two same-difficulty questions consecutively
- ≥ 1 Spark in first three; ≥ 1 Inferno after warm-up
- no duplicate/near-duplicate fact or answer set
- comparable reading time and visual complexity
- sensitive questions distributed equally

Select the highest-scoring candidate; show a balance diagnostics report (never
a "pick the easier pack" choice); editorial lock freezes version + checksum +
approver. Replacements only from the eligible pool, with automatic
revalidation, logged. Same seed + same pack ⇒ identical output (tested).

## Live game engine

FSM: `PRE_SHOW → INTRO → QUESTION_READY → QUESTION_LIVE → ANSWER_LOCKED →
[LIFELINE_ACTIVE] → REVEAL → [KNOWLEDGE_DROP] → SCORE_COMMITTED →
NEXT_QUESTION → FINAL → COMPLETE`.

- Illegal transitions rejected server-side; every transition writes an
  immutable `GameEvent`. Undo/rewind = compensating event, never deletion.
- Scoring: Spark 100 / Flame 250 (−50 miss) / Inferno 500 (opens 200-point
  steal) / Wild 420. Confidence Lock ×1 / ×1.5 / ×2 (Certain miss ⇒ steal),
  max three uses per contestant, whole-number scores. Finals: Hold 250 /
  Rise 500 / Reach 1000. Score never drops below zero. All values come from
  the format-version config frozen into the pack.
- Manual score adjustment requires reason + producer confirmation and writes
  a visible audit marker.
- Timers run server-side; displays render ticks from the stream.

**Lifelines (one use each, engine-enforced):**

- *Trusted Circle:* roster of two consented adult contacts per contestant with
  availability status; app randomly selects an available contact, runs the
  25 s advice + 10 s lock timers, records the use. If producer marks both
  unavailable, auto-converts to Circle Consensus (studio-audience poll state).
- *Source Signal:* stores three approved signals (verified / unreliable belief
  / distractor); 20 s selection; verified label revealed only after selection.

## Visual identity & design system

The pilot ships with the real brand system, not placeholder UI. Everything
below is implemented as CSS design tokens (`src/styles/tokens.css`) consumed
by every surface, so the identity stays consistent and later theming
(territories, sponsors) is a token swap.

### Core palette (design tokens)

| Token | Value | Role |
|---|---|---|
| `--amber-deep` | `#D98E04` | Insight, warmth, reveal moments, "verified" resolution |
| `--amber-bright` | `#FFB438` | Highlights, correct-answer glow, trophy light |
| `--ultraviolet` | `#7B3BF2` | Uncertainty, strategy, culture, timers under tension |
| `--violet-deep` | `#3D1E8F` | Backgrounds under UV states, gradients |
| `--graphite-900` | `#101318` | Base surface (near-black polished graphite) |
| `--graphite-700` | `#1C2129` | Panels, cards |
| `--graphite-500` | `#2E3642` | Borders, dividers, inactive states |
| `--offwhite` | `#F2EFE8` | Primary text, evidence surfaces, legibility layer |
| `--mineral-red` | `#C0452A` | Africa & Indigenous Knowledge accents only |
| `--signal-green` | `#3FA66A` | Correctness cue (always paired with icon/shape, never color-only) |
| `--signal-red` | `#D4453A` | Incorrect cue (same pairing rule) |

Dark graphite is the default ground everywhere; amber and ultraviolet are
*light sources*, used as glows, edges and gradients — never as flat page
backgrounds. Skin-tone-safe: stage/contestant UI avoids full-screen violet
washes behind camera-facing areas.

### Typography

- **Display / brand:** Archivo Expanded (SemiBold/Bold) — wide, architectural,
  broadcast-legible; used for the wordmark lockup, question stems on stage,
  scores and category titles. All-caps with generous tracking for labels.
- **UI / body:** Inter — operator consoles, editor, metadata, explanations.
- **Numerals:** tabular lining figures everywhere scores or timers render.
- Both fonts are open (SIL OFL), self-hosted — no external font CDN, keeping
  the offline-LAN guarantee.
- Broadcast type scale: question stem ≥ 64 px at 1080p on the stage display,
  choices ≥ 40 px, ribbon/leaderboard ≥ 28 px; operator UIs use a standard
  14/16/20/24 scale.

### The Knowledge Ring (hero device)

A single React component (`<KnowledgeRing/>`) rendered as layered SVG,
reused at every scale: stage centerpiece, app loader, score badge, favicon.

Construction: a circle of **17 segments** (one per main-game question:
6 + 6 + 5) plus a detached **final arc** for The 420 Decision. Segments are
stroked arcs on a graphite track with an inner amber core-glow and an outer
ultraviolet edge.

| State | Behavior |
|---|---|
| Idle / pre-show | Slow ultraviolet shimmer travels the track (12 s loop) |
| Question ready | Active segment brightens; color = difficulty (Spark amber-soft, Flame amber-deep, Inferno ultraviolet-white, Wild 420 alternating amber/violet) |
| Confidence chosen | Ring gathers: neighboring segments lean light toward the active one (×1.5 subtle, ×2 pronounced) |
| Answer locked | Single hard pulse from core outward (300 ms) |
| Correct reveal | Segment fills solid amber; chime-synced bloom |
| Wrong reveal | Segment fractures: splits into shards that settle dim graphite (no red flood) |
| Steal window | Fractured segment gets an ultraviolet outline countdown |
| Victory | All segments sweep to full amber, ring completes and holds a slow breathing glow around the winner/trophy card |

Reduced-motion variant: all of the above collapse to ≤150 ms opacity/color
cross-fades; the idle shimmer becomes static. State is always also conveyed
by text/icon, never motion alone.

### Category lighting states

Each domain maps to a CSS theme class that recolors panel edges, ring edge
light and background gradient on question screens:

| Domain | Theme |
|---|---|
| Science & Plant Literacy | Cool ultraviolet + precise white hairlines; radial-scan motif |
| History & Global Roots | Deep amber + aged gold; horizontal timeline motif |
| Law & Policy | Graphite + white, narrow amber edge; grid motif |
| Public Health & Safety | Soft white + restrained violet; pulse-bar motif |
| Culture & Media | Saturated violet + amber accents; collage motif |
| Business & Ethics | Metallic graphite + crisp amber; network-grid motif |
| Africa & Indigenous Knowledge | Amber + mineral red + violet; topographic contour motif (never generic tribal patterns) |
| Future & Innovation | Ultraviolet→white gradient; forward ring-tunnel motif |

Motifs are subtle background SVG patterns at ≤8% opacity — texture, not
decoration; question legibility always wins.

### Motion principles

- Durations: micro-interactions 120–200 ms, state reveals 300–500 ms,
  ceremonial moments (victory, trophy) up to 1.5 s. Easing: `cubic-bezier(0.2,
  0, 0, 1)` ("precise premium"), no bounce/elastic.
- Nothing strobes; nothing loops faster than 1 Hz; `prefers-reduced-motion`
  honored globally via a motion-token layer.
- Lifeline identities: Trusted Circle = three warm amber pulses + orbiting
  contact nodes; Source Signal = graphite data-scan wipe with three tonal
  markers, resolving to a single amber "verified" underline. (Visual only in
  the pilot; original audio stems are a production task, with cue hooks left
  in the code.)

### Hard don'ts

No cannabis-leaf wallpaper or leaf iconography in UI chrome; no smoke/haze
effects over text; no dispensary retail aesthetics; no green-as-brand-color;
no imitation of existing quiz-show looks (no dramatic blue-and-gold money
ladders); no color-only correctness signals; no flat neon "sci-fi plastic" —
gradients and glows stay physical and restrained.

## Surfaces

- **Producer Console:** run-of-show, transitions, timers, lifeline triggers,
  score adjust, blackout/hold, rehearsal/live toggle (rehearsal watermarked).
- **Host Display:** question, pronunciation notes, approved explanation;
  answer hidden until `REVEAL` state.
- **Contestant Displays:** question, choices, timer, confidence choice,
  score, lifeline status.
- **Stage Display:** knowledge-ring motion states (CSS/SVG: segment by
  difficulty, pulse on lock, fracture on wrong, complete at victory),
  scoreboard, category lighting states, Knowledge Drops. 16:9 primary with a
  9:16-safe layout mode.
- **Question/Pack Editor:** question CRUD with workflow, sources, tiers,
  expiry; pack builder with balance report. (Pilot slice of the Council
  workspace; multi-reviewer workflow is Phase 2.)

Accessibility from the start: keyboard operation, visible focus,
reduced-motion variants, non-color correctness cues (WCAG 2.2 AA target).

## Testing

- TDD throughout; Vitest for unit tests.
- Property-based tests (fast-check) for FSM legality, scoring, and fairness
  constraints.
- 10,000-run fairness simulation script; report committed as an artifact.
- Playwright E2E: console → displays happy path, answer-security check,
  lifeline flows, refresh/restart recovery.
- Pilot acceptance criteria: spec tests #1–7 and #9–13. (#8 offline-sync and
  #14–15 audience are later phases.)

## Out of scope this cycle

Audience PWA, leaderboards/QR join, Council multi-reviewer workflow, semantic
duplicate detection (exact-duplicate detection is in), media/rights
management, MFA/RBAC hardening, LAN sync node, localisation. Schema fields
exist where cheap so these bolt on without migration pain.
