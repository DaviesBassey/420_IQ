export type CueName =
  | 'correct' | 'wrong' | 'lock' | 'category' | 'tensionStart'
  | 'tensionStop' | 'steal' | 'lifelineCircle' | 'lifelineSignal' | 'victory';

export const CUE_NAMES: CueName[] = [
  'correct', 'wrong', 'lock', 'category', 'tensionStart',
  'tensionStop', 'steal', 'lifelineCircle', 'lifelineSignal', 'victory',
];
