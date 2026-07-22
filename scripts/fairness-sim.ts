import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateLanes } from '../src/domain/laneGenerator';
import { generateSeed } from '../src/domain/rng';
import { FORMAT_V1 } from '../src/domain/formatConfig';
import { DEMO_BANK } from '../src/data/seedData';
import type { LaneQuestion } from '../src/domain/fairness';

const RUNS = 10_000;
const LANE_COUNT = 2;
const QUESTIONS_PER_LANE = 6;
const REPORT_DATE = '2026-07-22';
const REPORT_PATH = 'docs/reports/fairness-report.md';

const pool: LaneQuestion[] = DEMO_BANK.map((q) => ({
  id: q.factKey,
  domain: q.domain,
  difficulty: q.difficulty,
  readTimeSec: q.readTimeSec,
  sensitivityTier: q.sensitivityTier,
  factKey: q.factKey,
}));

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

function main() {
  console.log(
    `Fairness simulation: ${RUNS} runs, pool=${pool.length} questions, ` +
      `${LANE_COUNT} lanes x ${QUESTIONS_PER_LANE} questions/lane, candidates=default`,
  );

  const balanceScores: number[] = [];
  const weightSpreads: number[] = [];
  const firstSlotDifficultyCounts: Record<string, number> = {};
  let validCount = 0;

  const start = process.hrtime.bigint();

  for (let i = 0; i < RUNS; i++) {
    const seed = generateSeed();

    let pack: ReturnType<typeof generateLanes>;
    try {
      pack = generateLanes(
        pool,
        { seed, laneCount: LANE_COUNT, questionsPerLane: QUESTIONS_PER_LANE },
        FORMAT_V1,
      );
    } catch (err) {
      console.error(`\nFAIL at run ${i + 1}/${RUNS} — seed threw during generation: ${seed}`);
      console.error(err);
      process.exit(1);
    }

    const { report, lanes } = pack;

    if (report.violations.length > 0) {
      console.error(`\nFAIL at run ${i + 1}/${RUNS} — seed: ${seed}`);
      console.error('Violations:');
      for (const v of report.violations) console.error(`  - ${v}`);
      process.exit(1);
    }
    validCount++;

    balanceScores.push(report.balanceScore);

    const weights = report.diagnostics.weightPerLane;
    weightSpreads.push(Math.max(...weights) - Math.min(...weights));

    for (const lane of lanes) {
      const firstDifficulty = lane[0].difficulty;
      firstSlotDifficultyCounts[firstDifficulty] = (firstSlotDifficultyCounts[firstDifficulty] ?? 0) + 1;
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`... ${i + 1}/${RUNS} runs complete`);
    }
  }

  const end = process.hrtime.bigint();
  const totalMs = Number(end - start) / 1e6;
  const avgMs = totalMs / RUNS;

  console.log(`\n${validCount}/${RUNS} valid packs`);
  console.log(`Wall-clock: ${(totalMs / 1000).toFixed(2)}s total, ${avgMs.toFixed(3)}ms/run average`);

  const sha = gitShortSha();
  const pass = validCount === RUNS;

  const balanceMin = Math.min(...balanceScores);
  const balanceMax = Math.max(...balanceScores);
  const balanceMedian = median(balanceScores);

  const weightSpreadMin = Math.min(...weightSpreads);
  const weightSpreadMax = Math.max(...weightSpreads);
  const weightSpreadMedian = median(weightSpreads);

  const totalFirstSlots = Object.values(firstSlotDifficultyCounts).reduce((a, b) => a + b, 0);
  const difficultyOrder = ['SPARK', 'FLAME', 'INFERNO', 'WILD_420'];
  const firstSlotRows = difficultyOrder
    .filter((d) => firstSlotDifficultyCounts[d] !== undefined)
    .map((d) => {
      const count = firstSlotDifficultyCounts[d] ?? 0;
      const pct = totalFirstSlots > 0 ? ((count / totalFirstSlots) * 100).toFixed(2) : '0.00';
      return `| ${d} | ${count} | ${pct}% |`;
    })
    .join('\n');

  const report = `# Fairness Simulation Report

## Run parameters

| Parameter | Value |
| --- | --- |
| Date | ${REPORT_DATE} |
| Git SHA | ${sha} |
| Runs | ${RUNS} |
| Pool size | ${pool.length} |
| Lanes | ${LANE_COUNT} |
| Questions/lane | ${QUESTIONS_PER_LANE} |
| Candidates | default |

## Result

**${pass ? 'PASS' : 'FAIL'}** — ${validCount}/${RUNS} valid (violation-free) packs.

## Stats

| Metric | Min | Median | Max |
| --- | --- | --- | --- |
| Balance score | ${balanceMin} | ${balanceMedian} | ${balanceMax} |
| Per-run weight spread (max-min lane weight) | ${weightSpreadMin} | ${weightSpreadMedian} | ${weightSpreadMax} |

## First-slot difficulty frequency distribution

| Difficulty | Count | % of first slots |
| --- | --- | --- |
${firstSlotRows}

## Timing

| Metric | Value |
| --- | --- |
| Total wall-clock | ${(totalMs / 1000).toFixed(2)}s |
| Average per run | ${avgMs.toFixed(3)}ms |
`;

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, report);
  console.log(`Report written to ${REPORT_PATH}`);

  if (!pass) process.exit(1);
}

main();
