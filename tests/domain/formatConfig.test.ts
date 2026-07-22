import { describe, it, expect } from 'vitest';
import { FORMAT_V1 } from '@/domain/formatConfig';

describe('FORMAT_V1', () => {
  it('encodes the spec scoring values', () => {
    expect(FORMAT_V1.difficulties.SPARK.points).toBe(100);
    expect(FORMAT_V1.difficulties.FLAME.missPenalty).toBe(50);
    expect(FORMAT_V1.difficulties.INFERNO.opensSteal).toBe(true);
    expect(FORMAT_V1.difficulties.WILD_420.points).toBe(420);
    expect(FORMAT_V1.stealPoints).toBe(200);
    expect(FORMAT_V1.final.REACH).toBe(1000);
    expect(FORMAT_V1.confidence.CERTAIN).toBe(2);
    expect(FORMAT_V1.maxConfidenceUses).toBe(3);
    expect(FORMAT_V1.scoreFloor).toBe(0);
  });
});
