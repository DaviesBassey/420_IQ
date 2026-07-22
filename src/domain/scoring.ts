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
