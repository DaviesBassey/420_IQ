'use client';

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { QuestionStatus, QuestionVersionData } from '@/domain/types';
import type { FairnessReport } from '@/domain/fairness';
import { QuestionForm } from './QuestionForm';

// The full QuestionStatus enum, for the filter dropdown only — this is just
// the set of possible values, not the workflow graph. Legal *transitions*
// (the "advance to X" buttons) come from the API's per-row `nextStatuses`,
// derived server-side from QUESTION_WORKFLOW, so the UI never hardcodes them.
const QUESTION_STATUSES: QuestionStatus[] = [
  'DRAFT', 'EDITORIAL_REVIEW', 'COUNCIL_REVIEW', 'APPROVED', 'LOCKED', 'USED', 'RETIRED', 'EXPIRED',
];

type QuestionRow = QuestionVersionData & { status: QuestionStatus; nextStatuses: QuestionStatus[] };
type PackRow = { id: string; episodeId: string; seed: string; approvedBy: string | null; checksum: string | null; createdAt: string };
type GenerateResult = { packId: string; seed: string; report: FairnessReport; lanes: string[][] };

// --- styles (design tokens only) ------------------------------------------

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  fontFamily: 'system-ui, sans-serif',
  padding: '1.5rem',
};

const tabRowStyle: CSSProperties = { display: 'flex', gap: '0.5rem', marginBottom: '1rem' };

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    padding: '0.6rem 1.2rem',
    borderRadius: '6px',
    border: '1px solid var(--graphite-500)',
    background: active ? 'var(--amber-deep)' : 'var(--graphite-700)',
    color: active ? 'var(--graphite-900)' : 'var(--offwhite)',
    fontWeight: 600,
    cursor: 'pointer',
  };
}

const panelStyle: CSSProperties = {
  background: 'var(--graphite-700)',
  border: '1px solid var(--graphite-500)',
  borderRadius: '8px',
  padding: '1.25rem',
};

const sectionTitleStyle: CSSProperties = {
  fontSize: '1rem',
  color: 'var(--amber-bright)',
  margin: '0 0 0.75rem',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '0.3rem',
  fontSize: '0.8rem',
  color: 'var(--offwhite)',
};

const fieldStyle: CSSProperties = {
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

const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const thStyle: CSSProperties = { textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid var(--graphite-500)', color: 'var(--amber-bright)' };
const tdStyle: CSSProperties = { padding: '0.5rem', borderBottom: '1px solid var(--graphite-500)', verticalAlign: 'top' };

const smallButtonStyle: CSSProperties = {
  padding: '0.3rem 0.6rem',
  borderRadius: '6px',
  border: '1px solid var(--graphite-500)',
  background: 'var(--graphite-900)',
  color: 'var(--offwhite)',
  cursor: 'pointer',
  fontSize: '0.75rem',
  marginRight: '0.35rem',
  marginBottom: '0.25rem',
};

const buttonStyle: CSSProperties = {
  padding: '0.6rem 1.1rem',
  borderRadius: '6px',
  border: 'none',
  background: 'var(--amber-deep)',
  color: 'var(--graphite-900)',
  fontWeight: 600,
  cursor: 'pointer',
};

const violationStyle: CSSProperties = { color: 'var(--signal-red)', marginBottom: '0.25rem' };
const badgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '0.15rem 0.5rem',
  borderRadius: '999px',
  background: 'var(--signal-green)',
  color: 'var(--graphite-900)',
  fontSize: '0.7rem',
  fontWeight: 700,
  marginLeft: '0.5rem',
};

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return res.json().catch(() => ({}));
}

// --- Questions tab ---------------------------------------------------------

function QuestionsTab() {
  const [statusFilter, setStatusFilter] = useState<QuestionStatus>('DRAFT');
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [actor, setActor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadQuestions = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/questions?status=${statusFilter}`);
      const data = await readJson(res);
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to load questions');
        return;
      }
      setQuestions((data.questions as QuestionRow[]) ?? []);
    } catch {
      setError('Network error loading questions.');
    }
  }, [statusFilter]);

  useEffect(() => {
    // Guarded async IIFE (not a direct effect-body call) so a stale
    // in-flight fetch from a previous statusFilter can't clobber state
    // after the component has moved on to a new filter.
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadQuestions();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadQuestions]);

  async function handleAdvance(id: string, to: QuestionStatus) {
    if (!actor.trim()) {
      setError('Enter your name in "Acting as" before advancing a question.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/questions/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, actor }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to advance question');
        return;
      }
      await loadQuestions();
    } catch {
      setError('Network error advancing question.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={panelStyle}>
      {error && (
        <div style={errorStripStyle} role="alert">
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <label style={labelStyle} htmlFor="statusFilter">Status filter</label>
          <select
            id="statusFilter"
            style={fieldStyle}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as QuestionStatus)}
          >
            {QUESTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="actor">Acting as</label>
          <input id="actor" style={fieldStyle} value={actor} onChange={(e) => setActor(e.target.value)} placeholder="your name" />
        </div>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Stem</th>
            <th style={thStyle}>Domain</th>
            <th style={thStyle}>Difficulty</th>
            <th style={thStyle}>Tier</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Expiry</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {questions.length === 0 && (
            <tr><td style={tdStyle} colSpan={7}>No questions in {statusFilter}.</td></tr>
          )}
          {questions.map((q) => (
            <tr key={q.questionId}>
              <td style={tdStyle} title={q.stem}>{truncate(q.stem, 60)}</td>
              <td style={tdStyle}>{q.domain}</td>
              <td style={tdStyle}>{q.difficulty}</td>
              <td style={tdStyle}>{q.sensitivityTier}</td>
              <td style={tdStyle}>{q.status}</td>
              <td style={tdStyle}>{q.expiresAt ?? '—'}</td>
              <td style={tdStyle}>
                {q.nextStatuses.length === 0 && <span style={{ opacity: 0.6 }}>—</span>}
                {q.nextStatuses.map((to) => (
                  <button
                    key={to}
                    type="button"
                    style={smallButtonStyle}
                    disabled={busy}
                    onClick={() => void handleAdvance(q.questionId, to)}
                  >
                    Advance to {to}
                  </button>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <details style={{ marginTop: '1.25rem' }} open={showForm} onToggle={(e) => setShowForm((e.target as HTMLDetailsElement).open)}>
        <summary style={{ cursor: 'pointer', color: 'var(--amber-bright)', fontWeight: 600 }}>New question</summary>
        <div style={{ marginTop: '0.75rem' }}>
          <QuestionForm onCreated={() => void loadQuestions()} />
        </div>
      </details>
    </div>
  );
}

// --- Packs tab ---------------------------------------------------------

function FairnessReportView({ report }: { report: FairnessReport }) {
  const domains = Object.keys(report.diagnostics.domainExposure);
  const laneCount = report.diagnostics.weightPerLane.length;
  const laneLabels = Array.from({ length: laneCount }, (_, i) => `Lane ${i + 1}`);

  return (
    <div>
      <p><strong>Balance score:</strong> {report.balanceScore}</p>

      <h3 style={sectionTitleStyle}>Violations</h3>
      {report.violations.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {report.violations.map((v, i) => (
            <li key={i} style={violationStyle}>⚠ {v}</li>
          ))}
        </ul>
      )}

      <h3 style={sectionTitleStyle}>Per-lane weight</h3>
      <table style={tableStyle}>
        <thead><tr>{laneLabels.map((l) => <th key={l} style={thStyle}>{l}</th>)}</tr></thead>
        <tbody><tr>{report.diagnostics.weightPerLane.map((w, i) => <td key={i} style={tdStyle}>{w}</td>)}</tr></tbody>
      </table>

      <h3 style={sectionTitleStyle}>Domain exposure</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Domain</th>
            {laneLabels.map((l) => <th key={l} style={thStyle}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {domains.map((d) => (
            <tr key={d}>
              <td style={tdStyle}>{d}</td>
              {report.diagnostics.domainExposure[d].map((c, i) => <td key={i} style={tdStyle}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={sectionTitleStyle}>Mean read time per lane (sec)</h3>
      <table style={tableStyle}>
        <thead><tr>{laneLabels.map((l) => <th key={l} style={thStyle}>{l}</th>)}</tr></thead>
        <tbody><tr>{report.diagnostics.meanReadTimePerLane.map((t, i) => <td key={i} style={tdStyle}>{t.toFixed(1)}</td>)}</tr></tbody>
      </table>

      <h3 style={sectionTitleStyle}>Sensitive (tier 3) questions per lane</h3>
      <table style={tableStyle}>
        <thead><tr>{laneLabels.map((l) => <th key={l} style={thStyle}>{l}</th>)}</tr></thead>
        <tbody><tr>{report.diagnostics.sensitivePerLane.map((c, i) => <td key={i} style={tdStyle}>{c}</td>)}</tr></tbody>
      </table>
    </div>
  );
}

function PacksTab() {
  const [episodeId, setEpisodeId] = useState('');
  const [laneCount, setLaneCount] = useState('2');
  const [questionsPerLane, setQuestionsPerLane] = useState('6');
  const [seed, setSeed] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [approver, setApprover] = useState('');
  const [checksum, setChecksum] = useState<string | null>(null);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const loadPacks = useCallback(async () => {
    try {
      const res = await fetch('/api/packs');
      const data = await readJson(res);
      if (!res.ok) return;
      setPacks((data.packs as PackRow[]) ?? []);
    } catch {
      // Non-fatal: pack list is a convenience view, generate/approve errors
      // surface separately.
    }
  }, []);

  useEffect(() => {
    // Guarded async IIFE, matching the QuestionsTab load effect above.
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadPacks();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPacks]);

  async function handleGenerate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setChecksum(null);
    setBusy(true);
    try {
      const res = await fetch('/api/packs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          laneCount: Number(laneCount),
          questionsPerLane: Number(questionsPerLane),
          seed: seed.trim() === '' ? undefined : seed.trim(),
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to generate pack');
        return;
      }
      setResult(data as unknown as GenerateResult);
      await loadPacks();
    } catch {
      setError('Network error generating pack.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!result) return;
    if (!approver.trim()) {
      setError('Enter an approver name before approving.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/packs/${result.packId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to approve pack');
        return;
      }
      setChecksum(data.checksum as string);
      await loadPacks();
    } catch {
      setError('Network error approving pack.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      setError(`Could not copy — pack id: ${id}`);
    }
  }

  return (
    <div style={panelStyle}>
      {error && (
        <div style={errorStripStyle} role="alert">
          {error}
        </div>
      )}

      <h2 style={sectionTitleStyle}>Generate pack</h2>
      <form onSubmit={handleGenerate} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <label style={labelStyle} htmlFor="episodeId">Episode ID</label>
          <input id="episodeId" style={fieldStyle} value={episodeId} onChange={(e) => setEpisodeId(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle} htmlFor="laneCount">Lane count (2–4)</label>
          <input id="laneCount" type="number" min={2} max={4} style={fieldStyle} value={laneCount} onChange={(e) => setLaneCount(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle} htmlFor="questionsPerLane">Questions per lane</label>
          <input id="questionsPerLane" type="number" min={1} style={fieldStyle} value={questionsPerLane} onChange={(e) => setQuestionsPerLane(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle} htmlFor="seed">Seed (optional)</label>
          <input id="seed" style={fieldStyle} value={seed} onChange={(e) => setSeed(e.target.value)} />
        </div>
        <button type="submit" style={buttonStyle} disabled={busy}>
          {busy ? 'Working…' : 'Generate'}
        </button>
      </form>

      {result && (
        <div style={{ marginBottom: '1.25rem' }}>
          <p><strong>Pack ID:</strong> {result.packId} <strong>Seed:</strong> {result.seed}</p>
          <FairnessReportView report={result.report} />

          {checksum ? (
            <p style={{ marginTop: '0.75rem' }}>
              <strong>Approved.</strong> Checksum: <code>{checksum}</code>
            </p>
          ) : (
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div>
                <label style={labelStyle} htmlFor="approver">Approved by</label>
                <input id="approver" style={fieldStyle} value={approver} onChange={(e) => setApprover(e.target.value)} />
              </div>
              <button type="button" style={buttonStyle} disabled={busy} onClick={() => void handleApprove()}>
                Approve pack
              </button>
            </div>
          )}
        </div>
      )}

      <h2 style={sectionTitleStyle}>Existing packs</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Pack ID</th>
            <th style={thStyle}>Episode</th>
            <th style={thStyle}>Seed</th>
            <th style={thStyle}>Created</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {packs.length === 0 && (
            <tr><td style={tdStyle} colSpan={5}>No packs yet.</td></tr>
          )}
          {packs.map((p) => (
            <tr key={p.id}>
              <td style={tdStyle}>
                <code>{p.id}</code>
                {p.approvedBy && <span style={badgeStyle}>Approved</span>}
              </td>
              <td style={tdStyle}>{p.episodeId}</td>
              <td style={tdStyle}>{p.seed}</td>
              <td style={tdStyle}>{p.createdAt}</td>
              <td style={tdStyle}>
                <button type="button" style={smallButtonStyle} onClick={() => void handleCopy(p.id)}>
                  {copied === p.id ? 'Copied!' : 'Copy ID'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- page -------------------------------------------------------------

export default function EditorPage() {
  const [tab, setTab] = useState<'questions' | 'packs'>('questions');

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: '1.2rem', color: 'var(--amber-bright)', marginBottom: '1rem' }}>Question &amp; Pack Editor</h1>
      <div style={tabRowStyle}>
        <button type="button" style={tabButtonStyle(tab === 'questions')} onClick={() => setTab('questions')}>Questions</button>
        <button type="button" style={tabButtonStyle(tab === 'packs')} onClick={() => setTab('packs')}>Packs</button>
      </div>
      {tab === 'questions' ? <QuestionsTab /> : <PacksTab />}
    </div>
  );
}
