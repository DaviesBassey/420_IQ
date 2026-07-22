'use client';

import type { CSSProperties } from 'react';

export interface AudioArmProps {
  armed: boolean;
  muted: boolean;
  onArm: () => void;
  onToggleMute: () => void;
}

const enableButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.65rem 1.35rem',
  borderRadius: '999px',
  border: '1px solid var(--amber-bright)',
  background: 'var(--amber-deep)',
  color: 'var(--graphite-900)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.95rem',
  fontWeight: 700,
  letterSpacing: '0.03em',
  cursor: 'pointer',
};

const toggleButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.35rem 0.85rem',
  borderRadius: '999px',
  border: '1px solid var(--amber-deep)',
  background: 'var(--graphite-700)',
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.85rem',
  fontWeight: 600,
  letterSpacing: '0.03em',
  cursor: 'pointer',
};

/** Broadcast Mode's audio arm/mute control -- see useBroadcastAudio for the engine it drives. */
export function AudioArm({ armed, muted, onArm, onToggleMute }: AudioArmProps) {
  if (!armed) {
    return (
      <button type="button" style={enableButtonStyle} onClick={onArm} data-testid="audio-arm-enable">
        Enable broadcast sound
      </button>
    );
  }

  return (
    <button
      type="button"
      style={toggleButtonStyle}
      onClick={onToggleMute}
      aria-pressed={muted}
      data-testid="audio-arm-toggle"
    >
      {muted ? 'Unmute' : 'Mute'}
    </button>
  );
}
