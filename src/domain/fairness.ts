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
