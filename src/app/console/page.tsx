'use client';

import { Suspense, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GameControls } from './GameControls';

interface PackOption { id: string; episodeId: string; approvedBy: string | null }

const containerStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  fontFamily: 'system-ui, sans-serif',
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '420px',
  padding: '2rem',
  borderRadius: '12px',
  background: 'var(--graphite-700)',
  border: '1px solid var(--graphite-500)',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '0.5rem',
  fontSize: '0.875rem',
  color: 'var(--offwhite)',
};

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  marginBottom: '1.25rem',
  borderRadius: '6px',
  border: '1px solid var(--graphite-500)',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  fontSize: '1rem',
};

const buttonStyle: CSSProperties = {
  width: '100%',
  padding: '0.7rem',
  borderRadius: '6px',
  border: 'none',
  background: 'var(--amber-deep)',
  color: 'var(--graphite-900)',
  fontWeight: 600,
  fontSize: '1rem',
  cursor: 'pointer',
};

const errorStyle: CSSProperties = {
  color: 'var(--signal-red)',
  marginBottom: '1rem',
  fontSize: '0.875rem',
};

// Derives a stable contestant id from an operator-entered display name.
// Falls back to a positional id if the name is empty or collides with an
// earlier contestant's id (e.g. two contestants both named "Alex").
function contestantId(name: string, index: number, taken: Set<string>): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  const fallback = `contestant-${index + 1}`;
  const candidate = slug || fallback;
  if (!taken.has(candidate)) return candidate;
  return fallback === candidate ? `${candidate}-${index + 1}` : fallback;
}

function CreateGameForm() {
  const router = useRouter();

  const [packId, setPackId] = useState('');
  const [mode, setMode] = useState<'live' | 'rehearsal'>('rehearsal');
  const [name1, setName1] = useState('');
  const [name2, setName2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Approved packs to populate the picker; null while loading. A fetch
  // failure (or non-OK response) falls back to manual entry rather than
  // leaving the operator stuck with an empty select.
  const [approvedPacks, setApprovedPacks] = useState<PackOption[] | null>(null);
  const [manualPackEntry, setManualPackEntry] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/packs');
        if (!res.ok) throw new Error(`GET /api/packs failed (${res.status})`);
        const data = await res.json();
        const packs = ((data.packs ?? []) as PackOption[]).filter((p) => p.approvedBy !== null);
        if (cancelled) return;
        setApprovedPacks(packs);
        if (packs.length > 0) setPackId(packs[0].id);
      } catch {
        if (cancelled) return;
        setManualPackEntry(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const taken = new Set<string>();
      const id1 = contestantId(name1, 0, taken);
      taken.add(id1);
      const id2 = contestantId(name2, 1, taken);

      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId,
          mode,
          contestants: [
            { id: id1, name: name1 },
            { id: id2, name: name2 },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create game');
        return;
      }
      router.push(`/console?game=${data.gameId}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={containerStyle}>
      <form style={cardStyle} onSubmit={handleSubmit}>
        <h1 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', color: 'var(--amber-bright)' }}>
          New game
        </h1>

        {error && (
          <p style={errorStyle} role="alert">
            {error}
          </p>
        )}

        <label style={labelStyle} htmlFor="packId">
          Pack
        </label>
        {!manualPackEntry && approvedPacks !== null ? (
          <select
            id="packId"
            name="packId"
            style={fieldStyle}
            value={packId}
            onChange={(e) => {
              if (e.target.value === '__other__') {
                setManualPackEntry(true);
                setPackId('');
                return;
              }
              setPackId(e.target.value);
            }}
            required
          >
            {approvedPacks.length === 0 && <option value="">No approved packs yet</option>}
            {approvedPacks.map((p) => (
              <option key={p.id} value={p.id}>{p.episodeId} — {p.id.slice(0, 8)}</option>
            ))}
            <option value="__other__">Other (enter pack ID manually)</option>
          </select>
        ) : (
          <input
            id="packId"
            name="packId"
            style={fieldStyle}
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
            placeholder="Pack ID"
            required
          />
        )}

        <label style={labelStyle} htmlFor="mode">
          Mode
        </label>
        <select
          id="mode"
          name="mode"
          style={fieldStyle}
          value={mode}
          onChange={(e) => setMode(e.target.value as 'live' | 'rehearsal')}
        >
          <option value="rehearsal">Rehearsal</option>
          <option value="live">Live</option>
        </select>

        <label style={labelStyle} htmlFor="name1">
          Contestant 1 name
        </label>
        <input
          id="name1"
          name="name1"
          style={fieldStyle}
          value={name1}
          onChange={(e) => setName1(e.target.value)}
          required
        />

        <label style={labelStyle} htmlFor="name2">
          Contestant 2 name
        </label>
        <input
          id="name2"
          name="name2"
          style={fieldStyle}
          value={name2}
          onChange={(e) => setName2(e.target.value)}
          required
        />

        <button type="submit" style={buttonStyle} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create game'}
        </button>
      </form>
    </div>
  );
}

function ConsoleRouter() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get('game');

  if (!gameId) return <CreateGameForm />;
  return <GameControls gameId={gameId} />;
}

export default function ConsolePage() {
  return (
    <Suspense fallback={null}>
      <ConsoleRouter />
    </Suspense>
  );
}
