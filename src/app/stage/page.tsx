'use client';

import { Suspense, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGameStream } from '@/components/useGameStream';
import { KnowledgeRing, type RingSegmentState, type KnowledgeRingProps } from '@/components/KnowledgeRing';
import { HoldScreen } from '@/components/HoldScreen';
import { TimerChip } from '@/components/TimerChip';
import type { GameState } from '@/domain/fsm';
import '@/styles/stage.css';

const waitingStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-ui)',
};

const stateBadgeStyle: CSSProperties = {
  padding: '0.4rem 1rem',
  borderRadius: '999px',
  background: 'var(--amber-deep)',
  color: 'var(--graphite-900)',
  fontWeight: 700,
  fontSize: '0.9rem',
  letterSpacing: '0.06em',
};

const domainLineStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.5rem',
  fontWeight: 600,
  letterSpacing: '0.05em',
};

function scoreCardStyle(active: boolean): CSSProperties {
  return {
    padding: '0.75rem 1.5rem',
    borderRadius: '10px',
    background: 'var(--graphite-700)',
    border: `2px solid ${active ? 'var(--amber-bright)' : 'var(--graphite-500)'}`,
    textAlign: 'center',
    minWidth: '160px',
  };
}

const scoreCardIdStyle: CSSProperties = {
  fontSize: '0.85rem',
  opacity: 0.8,
  fontFamily: 'var(--font-ui)',
};

const scoreCardValueStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '2rem',
};

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(16, 19, 24, 0.85)',
  zIndex: 10,
};

const overlayCardStyle: CSSProperties = {
  maxWidth: '720px',
  padding: '2rem 2.5rem',
  borderRadius: '16px',
  background: 'var(--graphite-700)',
  border: '2px solid var(--ultraviolet)',
  textAlign: 'center',
};

const overlayTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
  fontWeight: 700,
  color: 'var(--ultraviolet)',
  marginBottom: '1rem',
};

const overlayBodyStyle: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: '1.1rem',
};

const stealBannerStyle: CSSProperties = {
  padding: '0.5rem 1.25rem',
  borderRadius: '999px',
  background: 'var(--signal-red)',
  color: 'var(--offwhite)',
  fontWeight: 700,
  fontSize: '1rem',
  letterSpacing: '0.06em',
  fontFamily: 'var(--font-ui)',
};

const lifelineStatusStyle: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: '1rem',
  opacity: 0.9,
};

// Legible, simple status line for the stage display — the full lifeline
// detail (signal texts, contact roster) lives on the console/contestant
// pages; the stage only needs to communicate that a lifeline is in play and
// roughly where it stands.
function lifelineStatusText(detail: { type: 'TRUSTED_CIRCLE'; phase: string } | { type: 'SOURCE_SIGNAL'; verifiedIndex: number | null } | null): string | null {
  if (!detail) return null;
  if (detail.type === 'TRUSTED_CIRCLE') return `Trusted Circle — ${detail.phase}`;
  return `Source Signal — ${detail.verifiedIndex !== null ? 'revealed' : 'selecting'}`;
}

// ANSWER_LOCKED gets the ring's single pulse ("locked"); COMPLETE gets the
// slow victory glow; PRE_SHOW/INTRO (before any question has gone live) is
// idle; every other in-round state drives the plain "live" ring.
function ringStateFor(state: GameState): KnowledgeRingProps['ringState'] {
  if (state === 'ANSWER_LOCKED') return 'locked';
  if (state === 'COMPLETE') return 'victory';
  if (state === 'PRE_SHOW' || state === 'INTRO') return 'idle';
  return 'live';
}

// Ring segments — documented simplification: ProjectedSnapshot only carries
// the current questionIndex, not a per-question correct/wrong history, so a
// past segment's actual outcome cannot be reconstructed from it (that would
// need a dedicated history field added to the snapshot, out of scope here).
// Every segment before the current one therefore renders 'pending' (the
// ring's neutral/dimmed state) rather than a fabricated correct/wrong mark;
// only the current question is 'active'. The ring grows by one segment per
// question reached instead of pre-declaring a fixed total, since the total
// question count for the game isn't part of ProjectedSnapshot either.
function segmentsFor(questionIndex: number): RingSegmentState[] {
  const total = Math.max(questionIndex + 1, 1);
  return Array.from({ length: total }, (_, i) => (i === questionIndex ? 'active' : 'pending'));
}

function StageView({ gameId, vertical }: { gameId: string; vertical: boolean }) {
  const snapshot = useGameStream(gameId, 'stage');

  if (!snapshot) {
    return <div style={waitingStyle}>Waiting for game {gameId}…</div>;
  }
  if (snapshot.hold) {
    return <HoldScreen />;
  }

  // Contestant order and display names come from snapshot.contestants (array
  // order + name field), not a sort of the scores map's keys/ids (IMPORTANT 6)
  // — the stage should read as names to a studio audience, not internal ids.
  const contestants = snapshot.contestants;
  const segments = segmentsFor(snapshot.questionIndex);
  const ringState = ringStateFor(snapshot.state);
  const knowledgeDropText = snapshot.state === 'KNOWLEDGE_DROP' ? snapshot.reveal?.knowledgeDrop ?? null : null;
  const lifelineStatus = lifelineStatusText(snapshot.lifelineDetail);

  return (
    <div className={`stage-grid${vertical ? ' stage-grid--vertical' : ''}`}>
      <div className="stage-grid__ribbon">
        {contestants.map((c) => (
          <div key={c.id} style={scoreCardStyle(snapshot.activeContestantId === c.id)}>
            <div style={scoreCardIdStyle}>{c.name}</div>
            <div style={scoreCardValueStyle}>{snapshot.scores[c.id]}</div>
          </div>
        ))}
      </div>

      <div className="stage-grid__ring">
        <div style={stateBadgeStyle}>{snapshot.state}</div>
        {snapshot.timer && <TimerChip deadline={snapshot.timer.deadline} kind={snapshot.timer.kind} />}
        {snapshot.stealOpen && <div style={stealBannerStyle}>STEAL WINDOW</div>}
        {lifelineStatus && <div style={lifelineStatusStyle}>{lifelineStatus}</div>}
        <KnowledgeRing
          segments={segments}
          ringState={ringState}
          difficulty={snapshot.publicQuestion?.difficulty}
          size={vertical ? 340 : 460}
        />
        {snapshot.publicQuestion && (
          <p style={domainLineStyle}>{snapshot.publicQuestion.domain.replace(/_/g, ' ')}</p>
        )}
      </div>

      {knowledgeDropText && (
        <div style={overlayStyle}>
          <div style={overlayCardStyle}>
            <h2 style={overlayTitleStyle}>Knowledge Drop</h2>
            <p style={overlayBodyStyle}>{knowledgeDropText}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StageRouter() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get('game');
  const vertical = searchParams.get('aspect') === '916';

  if (!gameId) {
    return <div style={waitingStyle}>Waiting for game — append ?game=&lt;id&gt; to this URL.</div>;
  }
  return <StageView gameId={gameId} vertical={vertical} />;
}

export default function StagePage() {
  return (
    <Suspense fallback={null}>
      <StageRouter />
    </Suspense>
  );
}
