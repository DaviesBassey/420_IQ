'use client';

import { Suspense, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Kept independent from src/server/auth.ts (Role, PIN defaults, secret) on
// purpose: this is a client component, and importing the server module would
// bundle its dev-secret constant into client JS.
type Role = 'producer' | 'host' | 'contestant' | 'stage' | 'editor';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'producer', label: 'Producer' },
  { value: 'host', label: 'Host' },
  { value: 'contestant', label: 'Contestant' },
  { value: 'stage', label: 'Stage' },
  { value: 'editor', label: 'Editor' },
];

const DEFAULT_ROUTE: Record<Role, string> = {
  producer: '/console',
  editor: '/editor',
  host: '/host',
  stage: '/stage',
  contestant: '/contestant/1',
};

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
  maxWidth: '360px',
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

function ClaimForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');

  const [role, setRole] = useState<Role>('producer');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Claim failed');
        return;
      }
      router.push(next || DEFAULT_ROUTE[role]);
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
          Claim this device
        </h1>

        {error && (
          <p style={errorStyle} role="alert">
            {error}
          </p>
        )}

        <label style={labelStyle} htmlFor="role">
          Role
        </label>
        <select
          id="role"
          name="role"
          style={fieldStyle}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <label style={labelStyle} htmlFor="pin">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          style={fieldStyle}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
        />

        <button type="submit" style={buttonStyle} disabled={submitting}>
          {submitting ? 'Claiming…' : 'Claim device'}
        </button>
      </form>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimForm />
    </Suspense>
  );
}
