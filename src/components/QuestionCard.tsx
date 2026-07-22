import type { CSSProperties, JSX } from 'react';
import type { PublicQuestion, RevealPayload } from '@/domain/publicQuestion';

export interface QuestionCardProps {
  q: PublicQuestion;
  reveal: RevealPayload | null;
  lockedChoice: number | null;
}

const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'];

const cardStyle: CSSProperties = {
  background: 'var(--graphite-700)',
  border: '2px solid var(--cat-accent, var(--graphite-500))',
  borderRadius: '12px',
  padding: '1.5rem',
  color: 'var(--offwhite)',
};

const metaRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'center',
  marginBottom: '0.75rem',
  fontSize: '0.85rem',
  fontFamily: 'var(--font-ui)',
  opacity: 0.85,
};

const domainChipStyle: CSSProperties = {
  padding: '0.2rem 0.6rem',
  borderRadius: '999px',
  border: '1px solid var(--cat-accent, var(--graphite-500))',
  color: 'var(--cat-accent, var(--offwhite))',
  letterSpacing: '0.04em',
};

const difficultyChipStyle: CSSProperties = {
  padding: '0.2rem 0.6rem',
  borderRadius: '999px',
  background: 'var(--graphite-900)',
  letterSpacing: '0.04em',
};

// Stem sizing: clamp scales with viewport width so the same component reads
// large on a wide stage display (clamps to 4.5rem / 72px, comfortably above
// the 64px "stage minimum" target) and shrinks gracefully on host/contestant
// screens without a separate size prop or breakpoint media queries.
const stemStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'clamp(2rem, 4vw, 4.5rem)',
  lineHeight: 1.15,
  margin: '0 0 1.5rem',
};

const choiceListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  listStyle: 'none',
  padding: 0,
  margin: 0,
};

const baseChoiceStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.85rem 1rem',
  borderRadius: '8px',
  border: '2px solid var(--graphite-500)',
  background: 'var(--graphite-900)',
  fontFamily: 'var(--font-ui)',
  fontSize: '1.1rem',
};

const letterBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '2rem',
  height: '2rem',
  borderRadius: '999px',
  background: 'var(--graphite-700)',
  fontWeight: 700,
  flexShrink: 0,
};

const choiceTextStyle: CSSProperties = { flex: 1 };

const markStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: '0.9rem',
  flexShrink: 0,
};

function choiceStyle(isCorrect: boolean, isLockedWrong: boolean, isLockedPreReveal: boolean): CSSProperties {
  if (isCorrect) {
    return { ...baseChoiceStyle, borderColor: 'var(--amber-deep)', boxShadow: '0 0 0 1px var(--amber-deep)' };
  }
  if (isLockedWrong) {
    return { ...baseChoiceStyle, opacity: 0.55, borderColor: 'var(--graphite-500)' };
  }
  if (isLockedPreReveal) {
    return { ...baseChoiceStyle, borderColor: 'var(--amber-bright)' };
  }
  return baseChoiceStyle;
}

export function QuestionCard({ q, reveal, lockedChoice }: QuestionCardProps): JSX.Element {
  return (
    <div className={`question-card theme-${q.domain}`} style={cardStyle}>
      <div style={metaRowStyle}>
        <span style={domainChipStyle}>{q.domain.replace(/_/g, ' ')}</span>
        {q.difficulty !== 'HIDDEN' && <span style={difficultyChipStyle}>{q.difficulty}</span>}
      </div>

      <h2 data-testid="question-stem" style={stemStyle}>
        {q.stem}
      </h2>

      <ul style={choiceListStyle}>
        {q.choices.map((choice, idx) => {
          const isCorrect = reveal !== null && idx === reveal.correctIndex;
          const isLockedWrong = reveal !== null && !isCorrect && lockedChoice === idx;
          const isLockedPreReveal = reveal === null && lockedChoice === idx;

          return (
            <li key={idx} style={choiceStyle(isCorrect, isLockedWrong, isLockedPreReveal)}>
              <span style={letterBadgeStyle}>{CHOICE_LETTERS[idx] ?? idx + 1}</span>
              <span style={choiceTextStyle}>{choice}</span>
              {isCorrect && (
                <span style={{ ...markStyle, color: 'var(--amber-bright)' }}>✓ CORRECT</span>
              )}
              {isLockedWrong && (
                <span style={{ ...markStyle, color: 'var(--offwhite)' }}>✗</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
