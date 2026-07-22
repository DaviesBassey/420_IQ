import type { CSSProperties, JSX } from 'react';
import { KnowledgeRing } from '@/components/KnowledgeRing';

// Number of ring segments shown while holding — purely decorative (no game
// data is displayed on a hold screen), 17 matches the KnowledgeRing's
// documented example segment count.
const HOLD_SEGMENTS = 17;

const containerStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2rem',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
};

const wordmarkStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'clamp(2rem, 5vw, 4rem)',
  letterSpacing: '0.08em',
};

export function HoldScreen(): JSX.Element {
  return (
    <div style={containerStyle} data-testid="hold-screen">
      <KnowledgeRing segments={Array(HOLD_SEGMENTS).fill('pending')} ringState="idle" />
      <div style={wordmarkStyle}>420 IQ</div>
    </div>
  );
}
