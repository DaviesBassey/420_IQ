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

// Hard cap on evaluateLanes calls per candidate, across all iterations of the
// local search below. Bounds worst-case cost at production scale (2-3 lanes ×
// 17 questions) so a pathological pool cannot hang the producer console. When
// the budget runs out mid-search, the loop stops and returns the best lanes
// found so far — those lanes simply fail validation for that candidate if
// violations remain, same as if no improving swap had been found.
const MAX_EVALS_PER_CANDIDATE = 20000;

// Deterministic local-search repair: greedily swap two questions (within the
// same lane, to fix ordering, or across lanes, to fix cross-lane balance)
// whenever the swap strictly reduces the number of fairness violations. No
// randomness is involved — swap candidates are scanned in a fixed order and
// the first improving swap is taken, repeating until no improving swap
// remains or an iteration cap is hit. This complements repairLane (which only
// looks at ordering within a single lane) by also resolving cross-lane
// imbalances such as domain exposure, difficulty weight, sensitivity spread,
// and "no Inferno in this lane" that per-lane repair cannot touch.
function localSearchRepair(
  lanes: Lane[],
  cfg: FormatConfig,
  maxIters = 500,
): { lanes: Lane[]; report: FairnessReport } {
  let current = lanes.map(l => [...l]);
  let evalCount = 0;
  let report = evaluateLanes(current, cfg);
  evalCount++;

  outer:
  for (let iter = 0; iter < maxIters && report.violations.length > 0; iter++) {
    let improved = false;
    for (let a = 0; a < current.length && !improved; a++) {
      for (let b = a; b < current.length && !improved; b++) {
        for (let i = 0; i < current[a].length && !improved; i++) {
          const jStart = b === a ? i + 1 : 0;
          for (let j = jStart; j < current[b].length && !improved; j++) {
            if (evalCount >= MAX_EVALS_PER_CANDIDATE) break outer;
            const trial = current.map(l => [...l]);
            [trial[a][i], trial[b][j]] = [trial[b][j], trial[a][i]];
            const trialReport = evaluateLanes(trial, cfg);
            evalCount++;
            if (trialReport.violations.length < report.violations.length) {
              current = trial;
              report = trialReport;
              improved = true;
            }
          }
        }
      }
    }
    if (!improved) break;
  }

  return { lanes: current, report };
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
    const preRepaired = lanes.map(repairLane);
    const { lanes: repaired, report } = localSearchRepair(preRepaired, cfg);
    if (report.violations.length === 0 && (!best || report.balanceScore > best.report.balanceScore)) {
      best = { seed, lanes: repaired, report, candidatesTried: c + 1 };
    }
  }
  if (!best) throw new Error('NO_VALID_SEQUENCE');
  return { ...best, candidatesTried: candidates };
}
