import type { CueName } from './cueNames';

/**
 * A cue is a self-contained, self-stopping synthesis routine. It receives the
 * live AudioContext, the bus to connect into (`out`), and the scheduling
 * anchor `now` (== ctx.currentTime at trigger time). Every cue here is a
 * one-shot: it schedules its own envelopes/oscillator stop times and never
 * needs external cleanup.
 *
 * 'tensionStart' / 'tensionStop' are exceptions: the looping tension bed is a
 * long-lived set of nodes that AudioEngine must be able to stop on demand
 * (see stopLoops()), so AudioEngine.play() intercepts those two names and
 * manages the loop directly rather than dispatching to CUES. The entries
 * below exist only to satisfy the Record<CueName, CueFn> type and are inert.
 */
export type CueFn = (ctx: AudioContext, out: AudioNode, now: number) => void;

/** A floor gain value used instead of 0 -- exponentialRamp cannot target 0. */
const SILENT = 0.0001;

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** warm major-interval bloom + soft rise into pitch. */
const correct: CueFn = (ctx, out, now) => {
  const root = 440; // A4
  const intervals = [1, 5 / 4, 3 / 2]; // root, major third, perfect fifth
  const dur = 0.65;
  intervals.forEach((ratio, i) => {
    const f = root * ratio;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * 0.985, now);
    osc.frequency.linearRampToValueAtTime(f, now + 0.12); // soft rise into pitch

    const g = ctx.createGain();
    const peak = 0.22 / (i + 1);
    g.gain.setValueAtTime(SILENT, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.08 + i * 0.03); // staggered bloom
    g.gain.exponentialRampToValueAtTime(SILENT, now + dur);

    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  });
};

/** resolving detuned fall -- not a harsh buzzer, settles into a low resolve. */
const wrong: CueFn = (ctx, out, now) => {
  const dur = 0.7;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, now);
  filter.frequency.exponentialRampToValueAtTime(220, now + dur);
  filter.Q.setValueAtTime(1, now);

  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, now);
  g.gain.linearRampToValueAtTime(0.22, now + 0.04);
  g.gain.exponentialRampToValueAtTime(SILENT, now + dur);

  filter.connect(g);
  g.connect(out);

  [-6, 6].forEach((detune) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + dur); // resolving fall
    osc.detune.setValueAtTime(detune, now);
    osc.connect(filter);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  });
};

/** impact transient + sub thump. */
const lock: CueFn = (ctx, out, now) => {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.18);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1800, now);
  noiseFilter.Q.setValueAtTime(0.7, now);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.35, now);
  noiseGain.gain.exponentialRampToValueAtTime(SILENT, now + 0.15);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(out);
  noise.start(now);
  noise.stop(now + 0.2);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(120, now);
  sub.frequency.exponentialRampToValueAtTime(40, now + 0.3);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.5, now);
  subGain.gain.exponentialRampToValueAtTime(SILENT, now + 0.35);
  sub.connect(subGain);
  subGain.connect(out);
  sub.start(now);
  sub.stop(now + 0.4);
};

/** shimmer sting -- bright open triad plus a whisper of high noise. */
const category: CueFn = (ctx, out, now) => {
  const dur = 0.5;
  const freqs = [880, 1318.5, 1760]; // A5, E6, A6
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(SILENT, now);
    g.gain.linearRampToValueAtTime(0.15 / (i + 1), now + 0.02);
    g.gain.exponentialRampToValueAtTime(SILENT, now + dur - i * 0.05);
    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + dur);
  });

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(6000, now);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.06, now);
  noiseGain.gain.exponentialRampToValueAtTime(SILENT, now + dur);
  noise.connect(hp);
  hp.connect(noiseGain);
  noiseGain.connect(out);
  noise.start(now);
  noise.stop(now + dur);
};

/** urgent pulse -- rapid repeated beeps. */
const steal: CueFn = (ctx, out, now) => {
  const pulses = 4;
  const gap = 0.14;
  for (let i = 0; i < pulses; i++) {
    const t = now + i * gap;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660 + i * 20, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(SILENT, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.015);
    g.gain.exponentialRampToValueAtTime(SILENT, t + 0.1);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.12);
  }
};

/** three warm pulses. */
const lifelineCircle: CueFn = (ctx, out, now) => {
  const offsets = [0, 0.3, 0.6];
  offsets.forEach((offset) => {
    const t = now + offset;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(392, t); // G4, warm
    const g = ctx.createGain();
    g.gain.setValueAtTime(SILENT, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.05);
    g.gain.exponentialRampToValueAtTime(SILENT, t + 0.25);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.3);
  });
};

/** data-scan sweep resolving into a single verified note. */
const lifelineSignal: CueFn = (ctx, out, now) => {
  const scanDur = 0.35;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, scanDur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.setValueAtTime(8, now);
  bp.frequency.setValueAtTime(400, now);
  bp.frequency.exponentialRampToValueAtTime(4000, now + scanDur); // scanning sweep
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.12, now);
  noiseGain.gain.setValueAtTime(0.12, now + scanDur - 0.03);
  noiseGain.gain.exponentialRampToValueAtTime(SILENT, now + scanDur);
  noise.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(out);
  noise.start(now);
  noise.stop(now + scanDur + 0.02);

  const t = now + scanDur + 0.05;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, t); // verified tone
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.linearRampToValueAtTime(0.28, t + 0.02);
  g.gain.exponentialRampToValueAtTime(SILENT, t + 0.4);
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + 0.45);
};

/** ascending arpeggio. */
const victory: CueFn = (ctx, out, now) => {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => {
    const t = now + i * 0.12;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(SILENT, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.03);
    g.gain.exponentialRampToValueAtTime(SILENT, t + 0.4);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.45);
  });
};

/** Inert placeholders: AudioEngine.play() intercepts these two names and
 * manages the looping tension bed directly (see AudioEngine.ts), so these
 * are never dispatched to. They exist to satisfy Record<CueName, CueFn>. */
const tensionStart: CueFn = () => {};
const tensionStop: CueFn = () => {};

export const CUES: Record<CueName, CueFn> = {
  correct,
  wrong,
  lock,
  category,
  tensionStart,
  tensionStop,
  steal,
  lifelineCircle,
  lifelineSignal,
  victory,
};
