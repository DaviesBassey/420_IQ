import { TRANSITIONS, type GameState } from '@/domain/fsm';

export function nextActions(state: GameState): GameState[] {
  return TRANSITIONS[state];
}
