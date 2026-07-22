import { describe, it, expect } from 'vitest';
import { nextActions } from '@/app/console/nextActions';

describe('nextActions', () => {
  it('offers only legal transitions', () => {
    expect(nextActions('PRE_SHOW')).toEqual(['INTRO']);
    expect(nextActions('REVEAL')).toEqual(['KNOWLEDGE_DROP', 'SCORE_COMMITTED']);
    expect(nextActions('COMPLETE')).toEqual([]);
  });
});
