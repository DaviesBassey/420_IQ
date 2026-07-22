'use client';

import { Suspense, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGameStream } from '@/components/useGameStream';
import { QuestionCard } from '@/components/QuestionCard';
import { HoldScreen } from '@/components/HoldScreen';

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  padding: '2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
  maxWidth: '960px',
  margin: '0 auto',
};

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
  alignSelf: 'flex-start',
  padding: '0.35rem 0.85rem',
  borderRadius: '999px',
  background: 'var(--amber-deep)',
  color: 'var(--graphite-900)',
  fontWeight: 700,
  fontSize: '0.85rem',
  letterSpacing: '0.04em',
};

const revealPanelStyle: CSSProperties = {
  background: 'var(--graphite-700)',
  border: '1px solid var(--amber-deep)',
  borderRadius: '10px',
  padding: '1.25rem',
  fontFamily: 'var(--font-ui)',
};

const sourceLineStyle: CSSProperties = {
  fontSize: '0.85rem',
  opacity: 0.8,
  marginTop: '0.5rem',
};

const knowledgeDropStyle: CSSProperties = {
  marginTop: '0.75rem',
  padding: '0.75rem 1rem',
  borderRadius: '8px',
  background: 'var(--ultraviolet)',
  color: 'var(--offwhite)',
};

function HostView({ gameId }: { gameId: string }) {
  const snapshot = useGameStream(gameId, 'host');

  if (!snapshot) {
    return <div style={waitingStyle}>Waiting for game {gameId}…</div>;
  }

  if (snapshot.hold) {
    return <HoldScreen />;
  }

  return (
    <div style={pageStyle}>
      <div style={stateBadgeStyle}>{snapshot.state}</div>

      {snapshot.publicQuestion ? (
        <QuestionCard q={snapshot.publicQuestion} reveal={snapshot.reveal} lockedChoice={snapshot.lockedChoice} />
      ) : (
        <p>No active question.</p>
      )}

      {/* Explanation/knowledge-drop panel renders only from snapshot.reveal —
          never fetched separately, so it never risks showing privileged data
          before the producer has transitioned into a reveal-visible state. */}
      {snapshot.reveal && (
        <section style={revealPanelStyle} aria-label="Explanation">
          <p>{snapshot.reveal.explanation}</p>
          <p style={sourceLineStyle}>
            Source: {snapshot.reveal.sourceTitle} ({snapshot.reveal.correctAsOf})
          </p>
          {snapshot.reveal.knowledgeDrop && (
            <div style={knowledgeDropStyle}>
              <strong>Knowledge Drop:</strong> {snapshot.reveal.knowledgeDrop}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function HostRouter() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get('game');

  if (!gameId) {
    return <div style={waitingStyle}>Waiting for game — append ?game=&lt;id&gt; to this URL.</div>;
  }
  return <HostView gameId={gameId} />;
}

export default function HostPage() {
  return (
    <Suspense fallback={null}>
      <HostRouter />
    </Suspense>
  );
}
