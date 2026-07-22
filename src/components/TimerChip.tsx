'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { TimerKind } from '@/server/gameEngine';

export interface TimerChipProps {
  deadline: string; // ISO timestamp
  kind: TimerKind;
}

const TIMER_LABELS: Record<TimerKind, string> = {
  question: 'Question',
  steal: 'Steal',
  circleAdvice: 'Circle — Advice',
  circleLock: 'Circle — Lock',
  sourceSignal: 'Source Signal',
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.35rem 0.85rem',
  borderRadius: '999px',
  background: 'var(--graphite-700)',
  border: '1px solid var(--amber-deep)',
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.85rem',
  fontWeight: 600,
  letterSpacing: '0.03em',
};

const valueStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
};

// Derived purely from Date.now() vs. the server-issued deadline — never
// cached, so every display computes the same remaining time independently
// (and shows 0 once the deadline has passed, rather than going negative).
function remainingSeconds(deadline: string): number {
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

export function TimerChip({ deadline, kind }: TimerChipProps) {
  // `remaining` is derived straight from props at render time (never stored
  // in state, so there's no duplicate/stale copy to keep in sync when
  // `deadline` changes) — the effect's only job is forcing a re-render every
  // 250ms so that derivation re-runs against the current Date.now().
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = remainingSeconds(deadline);

  return (
    <div style={chipStyle} role="timer" data-testid="timer-chip">
      <span>{TIMER_LABELS[kind]}</span>
      <span style={valueStyle}>{remaining}s</span>
    </div>
  );
}
