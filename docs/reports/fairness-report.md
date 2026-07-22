# Fairness Simulation Report

## Run parameters

| Parameter | Value |
| --- | --- |
| Date | 2026-07-22 |
| Git SHA | 3615397 |
| Runs | 10000 |
| Pool size | 96 |
| Lanes | 2 |
| Questions/lane | 6 |
| Candidates | default |

## Result

**PASS** — 10000/10000 valid (violation-free) packs.

## Stats

| Metric | Min | Median | Max |
| --- | --- | --- | --- |
| Balance score | 907 | 952 | 1000 |
| Per-run weight spread (max-min lane weight) | 0 | 0 | 1 |

## First-slot difficulty frequency distribution

| Difficulty | Count | % of first slots |
| --- | --- | --- |
| SPARK | 10764 | 53.82% |
| FLAME | 4396 | 21.98% |
| INFERNO | 3766 | 18.83% |
| WILD_420 | 1074 | 5.37% |

## Timing

| Metric | Value |
| --- | --- |
| Total wall-clock | 257.50s |
| Average per run | 25.750ms |
