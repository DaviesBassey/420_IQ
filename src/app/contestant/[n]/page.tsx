'use client';

import { Suspense, use, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGameStream } from '@/components/useGameStream';
import { QuestionCard } from '@/components/QuestionCard';
import { HoldScreen } from '@/components/HoldScreen';
import { TimerChip } from '@/components/TimerChip';
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

const stealBannerStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: '0.5rem 1rem',
  borderRadius: '999px',
  background: 'var(--signal-red)',
  color: 'var(--offwhite)',
  fontWeight: 700,
  fontSize: '0.95rem',
  letterSpacing: '0.06em',
};

const lifelinePanelStyle: CSSProperties = {
  background: 'var(--graphite-700)',
  border: '1px solid var(--graphite-500)',
  borderRadius: '10px',
  padding: '1rem 1.25rem',
  fontFamily: 'var(--font-ui)',
};

const signalListStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '0.5rem 0 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

function signalItemStyle(highlighted: boolean): CSSProperties {
  return {
    padding: '0.6rem 0.85rem',
    borderRadius: '8px',
    border: `2px solid ${highlighted ? 'var(--amber-bright)' : 'var(--graphite-500)'}`,
    background: 'var(--graphite-900)',
  };
}

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

  // Contestant slot mapping: the [n] route param (1-based, matching the
  // /contestant/1, /contestant/2 display links the console hands out) is
  // mapped onto contestant ids by indexing into snapshot.contestants, which
  // preserves the producer's actual createGame array order — not a sort of
  // the scores map's keys (which is an unordered object with no guaranteed
  // relationship to that order).
  const contestantIds = snapshot.contestants.map((c) => c.id);
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
  const signalDetail = snapshot.lifelineDetail?.type === 'SOURCE_SIGNAL' ? snapshot.lifelineDetail : null;
  const circleDetail = snapshot.lifelineDetail?.type === 'TRUSTED_CIRCLE' ? snapshot.lifelineDetail : null;

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

      {snapshot.timer && <TimerChip deadline={snapshot.timer.deadline} kind={snapshot.timer.kind} />}

      {snapshot.stealOpen && <div style={stealBannerStyle}>STEAL WINDOW</div>}

      {showConfidence && <div style={confidenceBadgeStyle}>{snapshot.confidence}</div>}

      {signalDetail && (
        <section style={lifelinePanelStyle} aria-label="Source Signal">
          <strong>Source Signal</strong>
          <ul style={signalListStyle}>
            {signalDetail.signals.map((s, idx) => (
              <li key={idx} style={signalItemStyle(signalDetail.verifiedIndex === idx)}>
                {signalDetail.verifiedIndex === idx ? '✓ VERIFIED — ' : ''}{s.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {circleDetail && (
        <section style={lifelinePanelStyle} aria-label="Trusted Circle">
          <strong>Trusted Circle</strong>
          <p style={{ margin: '0.4rem 0 0' }}>
            Phase: {circleDetail.phase}
            {' · '}
            {circleDetail.contactName
              ? `Contact: ${circleDetail.contactName}`
              : 'No contact available (consensus fallback)'}
          </p>
        </section>
      )}

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
