# 420 IQ — Pilot Control System

420 IQ is a knowledge-competition game show: contestants answer questions
across eight domains (science, history, Africa/indigenous knowledge, law &
policy, health & safety, culture & media, business ethics, future innovation)
at escalating difficulty and stakes, with lifelines, confidence wagers, and a
steal mechanic — the premise is that it tests *knowledge*, not consumption or
trivia recall of pop culture. This repository is the local-first, offline,
server-authoritative studio control system that runs a full episode taping on
a single laptop or venue LAN: a question bank with an editorial workflow, a
fairness-constrained pack builder, an event-sourced live game engine, a
producer console, and host/contestant/stage displays, all pushed in real time
over Server-Sent Events.

## Setup

```bash
pnpm i
pnpm seed   # imports the prototype's 16 trivia questions as drafts + a labelled demo bank
pnpm dev    # starts on http://localhost:3000
```

The dev server uses a local SQLite file (`data/420iq.sqlite` by default,
created on first run) — no external services, no internet access required at
runtime.

## Environment variables

All are optional; every one has a working default for local/rehearsal use.
Set them (e.g. in a `.env.local`, or exported in the shell) before a real
taping so the pilot doesn't run on default PINs and a fixed dev secret.

| Variable | Purpose | Default |
|---|---|---|
| `DB_PATH` | Path to the SQLite database file | `data/420iq.sqlite` |
| `SESSION_SECRET` | HMAC secret signing the role session cookie | fixed dev secret (insecure — set this for anything beyond local rehearsal) |
| `ROLE_PIN_PRODUCER` | PIN to claim the Producer role | `4200` |
| `ROLE_PIN_HOST` | PIN to claim the Host role | `4201` |
| `ROLE_PIN_CONTESTANT` | PIN to claim the Contestant role | `4202` |
| `ROLE_PIN_STAGE` | PIN to claim the Stage role | `4203` |
| `ROLE_PIN_EDITOR` | PIN to claim the Editor role | `4204` |

## Display URLs

Each of these is a separate browser tab/device; open `/claim` first on each
device to claim its role (PIN-gated) before navigating to the display itself.

| URL | Role | Purpose |
|---|---|---|
| `/claim` | — | Claim a device's role via PIN |
| `/console` | Producer | Run-of-show controls: create games, drive state transitions, adjust scores |
| `/editor` | Editor | Question authoring/review workflow, pack generation + approval |
| `/host?game=<id>` | Host | Host monitor view |
| `/contestant/1?game=<id>` | Contestant | Contestant 1's display (`/contestant/2` for the second, etc.) |
| `/stage?game=<id>` | Stage | Audience/stage display — knowledge ring, scores, Knowledge Drop overlay |

## Game-day quickstart

1. **Claim producer** at `/claim` on the console laptop (PIN from
   `ROLE_PIN_PRODUCER`, default `4200`).
2. **Editor:** at `/editor`, generate a pack for the episode (lane count,
   questions per lane) and approve it once the fairness report looks right.
3. **Console:** at `/console`, create a game from the approved pack, add
   contestants, and step through the run-of-show controls.
4. **Open the displays** on their respective devices (`/host`, `/contestant/1`,
   `/contestant/2`, `/stage`), each appending `?game=<id>` for the game just
   created.
5. **Run the show** — every producer action pushes state to all connected
   displays over SSE; the correct answer never reaches a contestant/stage
   client before the producer transitions to `REVEAL`.

**Rehearsal vs. live:** create the game with `mode: 'rehearsal'` for run-throughs.
Rehearsal games never mark questions as `USED`, so the same pack can be
rehearsed repeatedly without burning through the question bank; use
`mode: 'live'` only for the actual taping.

## Tests

```bash
pnpm test       # unit + component tests (vitest)
pnpm fairness   # 10,000-run pack-fairness simulation report
pnpm e2e        # Playwright end-to-end game flow (starts its own dev server)
```

## Backup

The entire game state lives in one SQLite file (`DB_PATH`, default
`data/420iq.sqlite`). Before and during a taping, back it up by simply copying
that file (e.g. `cp data/420iq.sqlite data/420iq.sqlite.bak-<timestamp>`) —
there is no separate state to capture.

## Further reading

- `docs/superpowers/specs/2026-07-22-pilot-control-system-design.md` — full design spec
- `docs/superpowers/plans/2026-07-22-pilot-control-system.md` — implementation plan
- `docs/prototype/AUDIT.md` — audit of the prototype this system replaces
- `docs/reports/fairness-report.md` — fairness simulation report
