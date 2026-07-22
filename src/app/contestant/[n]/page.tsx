'use client';

import { Suspense, use, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGameStream } from '@/components/useGameStream';
import { QuestionCard } from '@/components/QuestionCard';
import { HoldScreen } from '@/components/HoldScreen';
import type { LifelineType } from '@/domain/types';

const LIFELINE_LABELS: Record<LifelineType, string> = {
  TRUSTED_CIRCLE: 'Trusted Circle',
  SOURCE_SIGNAL: 'Source Signal',
};
const LIFELINE_TYPES: LifelineType[] = ['TRUSTED_CIRCLE', 'SOURCE_SIGNAL'];

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
};

const waitingStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-ui)',
  textAlign: 'center',
  padding: '1.5rem',
};

const topRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.75rem',
};

const stateBadgeStyle: CSSProperties = {
  padding: '0.4rem 0.9rem',
  borderRadius: '999px',
  background: 'var(--amber-deep)',
  color: 'var(--graphite-900)',
  fontWeight: 700,
  fontSize: '0.9rem',
  letterSpacing: '0.04em',
};

const scoreStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '1.75rem',
};

const lifelineRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  flexWrap: 'wrap',
};

function lifelineChipStyle(used: boolean): CSSProperties {
  return {
    padding: '0.5rem 0.9rem',
    borderRadius: '999px',
    border: `1px solid ${used ? 'var(--graphite-500)' : 'var(--signal-green)'}`,
    color: used ? 'var(--offwhite)' : 'var(--signal-green)',
    opacity: used ? 0.6 : 1,
    fontSize: '0.9rem',
    fontFamily: 'var(--font-ui)',
  };
}

const confidenceBadgeStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: '0.4rem 0.9rem',
  borderRadius: '999px',
  background: 'var(--ultraviolet)',
  color: 'var(--offwhite)',
  fontWeight: 700,
  fontSize: '0.85rem',
  letterSpacing: '0.04em',
};

function ContestantView({ n }: { n: string }) {
  const searchParams = useSearchParams();
  const gameId = searchParams.get('game');
  const snapshot = useGameStream(gameId ?? '', 'contestant');

  if (!gameId) {
    return <div style={waitingStyle}>Waiting for game — append ?game=&lt;id&gt; to this URL.</div>;
  }
  if (!snapshot) {
    return <div style={waitingStyle}>Waiting for game {gameId}…</div>;
  }

  // Contestant slot mapping: ProjectedSnapshot has no notion of a positional
  // "contestant N" — it only exposes a scores map keyed by contestantId. The
  // [n] route param (1-based, matching the /contestant/1, /contestant/2
  // display links the console hands out) is mapped onto contestant ids by
  // sorting the scores keys and indexing into that sorted list. This is
  // stable across renders (scores keys don't change once the game starts)
  // but is a documented simplification: it assumes contestant ids sort in
  // the order the producer intends to badge them as "1" and "2".
  const contestantIds = Object.keys(snapshot.scores).sort();
  const index = Number(n) - 1;
  const contestantId = contestantIds[index];

  if (!contestantId) {
    return <div style={waitingStyle}>No contestant assigned to slot {n} yet.</div>;
  }

  if (snapshot.hold) {
    return <HoldScreen />;
  }

  const lifelines = snapshot.lifelines[contestantId];
  // snapshot.confidence reflects the confidence level of whichever answer is
  // currently in view (ANSWER_LOCKED/REVEAL/etc.); it isn't itself tagged
  // with a contestantId. During those states activeContestantId still points
  // at the contestant who answered (questionIndex only advances on
  // NEXT_QUESTION), so gating the badge on activeContestantId === this
  // contestant's id correctly attributes it instead of showing it to both.
  const showConfidence = snapshot.confidence && snapshot.activeContestantId === contestantId;

  return (
    <div style={pageStyle}>
      <div style={topRowStyle}>
        <div style={stateBadgeStyle}>{snapshot.state}</div>
        <div data-testid={`score-${contestantId}`} style={scoreStyle}>
          {snapshot.scores[contestantId]}
        </div>
      </div>

      <div style={lifelineRowStyle}>
        {LIFELINE_TYPES.map((type) => (
          <span key={type} style={lifelineChipStyle(Boolean(lifelines?.[type]))}>
            {LIFELINE_LABELS[type]}: {lifelines?.[type] ? 'used' : 'available'}
          </span>
        ))}
      </div>

      {showConfidence && <div style={confidenceBadgeStyle}>{snapshot.confidence}</div>}

      {snapshot.publicQuestion ? (
        <QuestionCard q={snapshot.publicQuestion} reveal={snapshot.reveal} lockedChoice={snapshot.lockedChoice} />
      ) : (
        <p>No active question.</p>
      )}
    </div>
  );
}

function ContestantRouter({ params }: { params: Promise<{ n: string }> }) {
  const { n } = use(params);
  return <ContestantView n={n} />;
}

export default function ContestantPage({ params }: { params: Promise<{ n: string }> }) {
  return (
    <Suspense fallback={null}>
      <ContestantRouter params={params} />
    </Suspense>
  );
}
