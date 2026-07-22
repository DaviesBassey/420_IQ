'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import type { Domain, Difficulty, SensitivityTier } from '@/domain/types';

// Mirrors the enum values in domain/types.ts. These are plain string-literal
// unions (not server code), so hardcoding the option lists here is just
// populating <select> UI — it does not duplicate any workflow logic.
const DOMAINS: Domain[] = [
  'SCIENCE', 'HISTORY', 'AFRICA_INDIGENOUS', 'LAW_POLICY',
  'HEALTH_SAFETY', 'CULTURE_MEDIA', 'BUSINESS_ETHICS', 'FUTURE_INNOVATION',
];
const DIFFICULTIES: Difficulty[] = ['SPARK', 'FLAME', 'INFERNO', 'WILD_420'];
const TIERS: SensitivityTier[] = [1, 2, 3];

const MIN_CHOICES = 2;
const MAX_CHOICES = 5;

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '0.3rem',
  fontSize: '0.8rem',
  color: 'var(--offwhite)',
};

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  marginBottom: '0.75rem',
  borderRadius: '6px',
  border: '1px solid var(--graphite-500)',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  fontSize: '0.9rem',
};

const errorStripStyle: CSSProperties = {
  background: 'var(--signal-red)',
  color: 'var(--offwhite)',
  padding: '0.6rem 1rem',
  borderRadius: '6px',
  marginBottom: '0.75rem',
  fontSize: '0.875rem',
};

const choiceRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginBottom: '0.5rem',
};

const buttonStyle: CSSProperties = {
  padding: '0.5rem 0.9rem',
  borderRadius: '6px',
  border: '1px solid var(--graphite-500)',
  background: 'var(--amber-deep)',
  color: 'var(--graphite-900)',
  fontWeight: 600,
  cursor: 'pointer',
};

const smallButtonStyle: CSSProperties = {
  padding: '0.35rem 0.6rem',
  borderRadius: '6px',
  border: '1px solid var(--graphite-500)',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const rowStyle: CSSProperties = { display: 'flex', gap: '0.75rem' };
const colStyle: CSSProperties = { flex: 1 };

function blank(n: number): string[] {
  return Array.from({ length: n }, () => '');
}

// null-if-empty: schema fields like jurisdiction/knowledgeDrop/expiresAt/
// demoFlag are `string | null`, not optional — an empty text input must be
// sent as null, not "".
function nullIfEmpty(s: string): string | null {
  const trimmed = s.trim();
  return trimmed === '' ? null : trimmed;
}

export function QuestionForm({ onCreated }: { onCreated: () => void }) {
  const [domain, setDomain] = useState<Domain>(DOMAINS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  const [stem, setStem] = useState('');
  const [choices, setChoices] = useState<string[]>(blank(4));
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [knowledgeDrop, setKnowledgeDrop] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [correctAsOf, setCorrectAsOf] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [sensitivityTier, setSensitivityTier] = useState<SensitivityTier>(1);
  const [expiresAt, setExpiresAt] = useState('');
  const [readTimeSec, setReadTimeSec] = useState('10');
  const [factKey, setFactKey] = useState('');
  const [demoFlag, setDemoFlag] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateChoice(idx: number, value: string) {
    setChoices((cs) => cs.map((c, i) => (i === idx ? value : c)));
  }

  function addChoice() {
    setChoices((cs) => (cs.length >= MAX_CHOICES ? cs : [...cs, '']));
  }

  function removeChoice(idx: number) {
    setChoices((cs) => {
      if (cs.length <= MIN_CHOICES) return cs;
      const next = cs.filter((_, i) => i !== idx);
      return next;
    });
    setCorrectIndex((ci) => (ci >= idx && ci > 0 ? ci - 1 : ci === idx ? 0 : ci));
  }

  function reset() {
    setDomain(DOMAINS[0]);
    setDifficulty(DIFFICULTIES[0]);
    setStem('');
    setChoices(blank(4));
    setCorrectIndex(0);
    setExplanation('');
    setKnowledgeDrop('');
    setSourceTitle('');
    setSourceUrl('');
    setCorrectAsOf('');
    setJurisdiction('');
    setSensitivityTier(1);
    setExpiresAt('');
    setReadTimeSec('10');
    setFactKey('');
    setDemoFlag('');
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        domain,
        difficulty,
        stem,
        choices,
        correctIndex,
        explanation,
        knowledgeDrop: nullIfEmpty(knowledgeDrop),
        sourceTitle,
        sourceUrl,
        correctAsOf,
        jurisdiction: nullIfEmpty(jurisdiction),
        sensitivityTier,
        expiresAt: nullIfEmpty(expiresAt),
        readTimeSec: Number(readTimeSec),
        factKey,
        demoFlag: nullIfEmpty(demoFlag),
      };
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to create question');
        return;
      }
      reset();
      onCreated();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={errorStripStyle} role="alert">
          {error}
        </div>
      )}

      <div style={rowStyle}>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-domain">Domain</label>
          <select id="qf-domain" style={fieldStyle} value={domain} onChange={(e) => setDomain(e.target.value as Domain)}>
            {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-difficulty">Difficulty</label>
          <select id="qf-difficulty" style={fieldStyle} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-tier">Sensitivity tier</label>
          <select
            id="qf-tier"
            style={fieldStyle}
            value={sensitivityTier}
            onChange={(e) => setSensitivityTier(Number(e.target.value) as SensitivityTier)}
          >
            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <label style={labelStyle} htmlFor="qf-stem">Stem</label>
      <textarea id="qf-stem" style={{ ...fieldStyle, minHeight: '4rem' }} value={stem} onChange={(e) => setStem(e.target.value)} required />

      <label style={labelStyle}>Choices (select the correct one)</label>
      {choices.map((choice, idx) => (
        <div key={idx} style={choiceRowStyle}>
          <input
            type="radio"
            name="qf-correct"
            checked={correctIndex === idx}
            onChange={() => setCorrectIndex(idx)}
            aria-label={`Choice ${idx + 1} is correct`}
          />
          <input
            style={{ ...fieldStyle, marginBottom: 0, flex: 1 }}
            value={choice}
            onChange={(e) => updateChoice(idx, e.target.value)}
            placeholder={`Choice ${idx + 1}`}
            required
          />
          {choices.length > MIN_CHOICES && (
            <button type="button" style={smallButtonStyle} onClick={() => removeChoice(idx)}>Remove</button>
          )}
        </div>
      ))}
      {choices.length < MAX_CHOICES && (
        <button type="button" style={{ ...smallButtonStyle, marginBottom: '0.75rem' }} onClick={addChoice}>
          Add choice
        </button>
      )}

      <label style={labelStyle} htmlFor="qf-explanation">Explanation</label>
      <textarea id="qf-explanation" style={{ ...fieldStyle, minHeight: '3rem' }} value={explanation} onChange={(e) => setExplanation(e.target.value)} required />

      <label style={labelStyle} htmlFor="qf-knowledgeDrop">Knowledge drop (optional)</label>
      <textarea id="qf-knowledgeDrop" style={{ ...fieldStyle, minHeight: '3rem' }} value={knowledgeDrop} onChange={(e) => setKnowledgeDrop(e.target.value)} />

      <div style={rowStyle}>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-sourceTitle">Source title</label>
          <input id="qf-sourceTitle" style={fieldStyle} value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} required />
        </div>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-sourceUrl">Source URL</label>
          <input id="qf-sourceUrl" style={fieldStyle} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} required />
        </div>
      </div>

      <div style={rowStyle}>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-correctAsOf">Correct as of</label>
          <input id="qf-correctAsOf" type="date" style={fieldStyle} value={correctAsOf} onChange={(e) => setCorrectAsOf(e.target.value)} required />
        </div>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-expiresAt">Expires at (required for tier 3)</label>
          <input id="qf-expiresAt" type="date" style={fieldStyle} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-jurisdiction">Jurisdiction (required for tier 3)</label>
          <input id="qf-jurisdiction" style={fieldStyle} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
        </div>
      </div>

      <div style={rowStyle}>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-readTimeSec">Read time (sec)</label>
          <input id="qf-readTimeSec" type="number" min={1} style={fieldStyle} value={readTimeSec} onChange={(e) => setReadTimeSec(e.target.value)} required />
        </div>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-factKey">Fact key</label>
          <input id="qf-factKey" style={fieldStyle} value={factKey} onChange={(e) => setFactKey(e.target.value)} required />
        </div>
        <div style={colStyle}>
          <label style={labelStyle} htmlFor="qf-demoFlag">Demo flag (optional)</label>
          <input id="qf-demoFlag" style={fieldStyle} value={demoFlag} onChange={(e) => setDemoFlag(e.target.value)} />
        </div>
      </div>

      <button type="submit" style={buttonStyle} disabled={submitting}>
        {submitting ? 'Creating…' : 'Create question'}
      </button>
    </form>
  );
}
