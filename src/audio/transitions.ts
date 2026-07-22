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
