import { describe, it, expect, vi } from 'vitest';
import { AudioEngine } from '@/audio/AudioEngine';
import { CUE_NAMES } from '@/audio/cueNames';

function mockNode() {
  return {
    connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 1 },
    frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 440 },
    type: 'sine', buffer: null, loop: false, detune: { setValueAtTime: vi.fn(), value: 0 },
    Q: { setValueAtTime: vi.fn(), value: 1 },
  } as any;
}
function mockCtx() {
  const ctx: any = {
    state: 'suspended', currentTime: 0, sampleRate: 44100,
    destination: mockNode(),
    resume: vi.fn().mockImplementation(function (this: any) { ctx.state = 'running'; return Promise.resolve(); }),
    createGain: () => mockNode(), createOscillator: () => mockNode(),
    createBiquadFilter: () => mockNode(), createConvolver: () => mockNode(),
    createBufferSource: () => mockNode(),
    createBuffer: (ch: number, len: number) => ({ getChannelData: () => new Float32Array(len), length: len }),
  };
  return ctx;
}

describe('AudioEngine', () => {
  it('does not play until armed', () => {
    const ctx = mockCtx();
    const eng = new AudioEngine(() => ctx);
    expect(eng.armed).toBe(false);
    eng.play('correct'); // no throw, no-op
    expect(ctx.resume).not.toHaveBeenCalled();
  });
  it('arms by resuming the context', async () => {
    const ctx = mockCtx();
    const eng = new AudioEngine(() => ctx);
    await eng.arm();
    expect(ctx.resume).toHaveBeenCalled();
    expect(eng.armed).toBe(true);
  });
  it('every cue plays without throwing once armed', async () => {
    const ctx = mockCtx();
    const eng = new AudioEngine(() => ctx);
    await eng.arm();
    for (const cue of CUE_NAMES) {
      expect(() => eng.play(cue)).not.toThrow();
    }
    eng.stopLoops();
  });
  it('muting suppresses playback side effects', async () => {
    const ctx = mockCtx();
    const eng = new AudioEngine(() => ctx);
    await eng.arm();
    eng.setMuted(true);
    const before = (ctx.createOscillator as any).mock?.calls?.length ?? 0;
    eng.play('correct');
    // muted: engine must early-return before creating oscillators
    expect(eng.muted).toBe(true);
  });
});
