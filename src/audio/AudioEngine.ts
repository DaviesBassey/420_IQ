import type { CueName } from './cueNames';
import { CUES } from './cues';

type TensionNodes = {
  sub: OscillatorNode;
  pulse: OscillatorNode;
  filter: BiquadFilterNode;
  bedGain: GainNode;
};

/** A floor gain value used instead of 0 -- exponentialRamp cannot target 0. */
const SILENT = 0.0001;

function impulseResponse(ctx: BaseAudioContext, seconds = 1.6, decay = 3.2): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

/**
 * Web Audio engine for Broadcast Mode's synthesized cues. Owns a single
 * AudioContext, a master gain feeding the destination, and a parallel
 * convolver reverb fed by a generated (not sampled) impulse response. All
 * cues from `CUES` connect into a shared bus that feeds both the dry
 * (masterGain) and wet (convolver -> masterGain) paths.
 *
 * The AudioContext is created lazily -- never at module load or in the
 * constructor -- so importing this module is safe under SSR/Node, where
 * `AudioContext` does not exist as a global. It is only instantiated when
 * `arm()` runs, which callers must trigger from a user gesture.
 */
export class AudioEngine {
  private readonly ctxFactory: () => AudioContext;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbReturn: GainNode | null = null;
  private cueBus: GainNode | null = null;
  private tensionNodes: TensionNodes | null = null;

  private _armed = false;
  private _muted = false;

  constructor(ctxFactory?: () => AudioContext) {
    this.ctxFactory = ctxFactory ?? (() => new AudioContext());
  }

  get armed(): boolean {
    return this._armed;
  }

  get muted(): boolean {
    return this._muted;
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setValueAtTime(m ? 0 : 1, now);
    }
  }

  async arm(): Promise<void> {
    if (!this.ctx) {
      const ctx = this.ctxFactory();
      this.ctx = ctx;

      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);

      const convolver = ctx.createConvolver();
      convolver.buffer = impulseResponse(ctx);

      const reverbReturn = ctx.createGain();
      reverbReturn.gain.setValueAtTime(0.25, ctx.currentTime);
      convolver.connect(reverbReturn);
      reverbReturn.connect(masterGain);

      const cueBus = ctx.createGain();
      cueBus.connect(masterGain); // dry path
      cueBus.connect(convolver); // wet send

      this.masterGain = masterGain;
      this.convolver = convolver;
      this.reverbReturn = reverbReturn;
      this.cueBus = cueBus;
    }

    await this.ctx.resume();
    this._armed = true;
  }

  play(cue: CueName): void {
    if (!this._armed || this._muted) return;
    if (!this.ctx || !this.cueBus) return;

    const now = this.ctx.currentTime;

    if (cue === 'tensionStart') {
      this.startTensionBed(now);
      return;
    }
    if (cue === 'tensionStop') {
      this.stopLoops();
      return;
    }

    CUES[cue](this.ctx, this.cueBus, now);
  }

  private startTensionBed(now: number): void {
    if (!this.ctx || !this.cueBus) return;
    this.stopLoops(); // replace any existing bed

    const ctx = this.ctx;

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(55, now);

    const pulse = ctx.createOscillator();
    pulse.type = 'sawtooth';
    pulse.frequency.setValueAtTime(110, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.Q.setValueAtTime(4, now);

    const bedGain = ctx.createGain();
    bedGain.gain.setValueAtTime(SILENT, now);
    bedGain.gain.linearRampToValueAtTime(0.18, now + 1.5);

    sub.connect(bedGain);
    pulse.connect(filter);
    filter.connect(bedGain);
    bedGain.connect(this.cueBus);

    sub.start(now);
    pulse.start(now);

    this.tensionNodes = { sub, pulse, filter, bedGain };
  }

  stopLoops(): void {
    if (!this.tensionNodes) return;
    const { sub, pulse, filter, bedGain } = this.tensionNodes;
    sub.stop();
    pulse.stop();
    sub.disconnect();
    pulse.disconnect();
    filter.disconnect();
    bedGain.disconnect();
    this.tensionNodes = null;
  }

  dispose(): void {
    this.stopLoops();
    this.cueBus?.disconnect();
    this.convolver?.disconnect();
    this.reverbReturn?.disconnect();
    this.masterGain?.disconnect();
    this.cueBus = null;
    this.convolver = null;
    this.reverbReturn = null;
    this.masterGain = null;
    this.ctx = null;
    this._armed = false;
  }
}
