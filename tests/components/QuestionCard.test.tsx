/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionCard } from '@/components/QuestionCard';

const q = { questionId: 'q', domain: 'HISTORY', difficulty: 'HIDDEN', stem: 'When?', choices: ['1900', '1961'], knowledgeDropAvailable: false } as any;

describe('QuestionCard', () => {
  it('shows choices with no correctness marks before reveal', () => {
    render(<QuestionCard q={q} reveal={null} lockedChoice={null} />);
    expect(screen.getByText('When?')).toBeDefined();
    expect(screen.queryByText(/CORRECT/)).toBeNull();
  });
  it('marks the verified answer with text label on reveal', () => {
    render(<QuestionCard q={q} reveal={{ ...q, correctIndex: 1, explanation: 'x', knowledgeDrop: null, sourceTitle: 's', correctAsOf: '2026-01-01' }} lockedChoice={0} />);
    expect(screen.getByText(/CORRECT/)).toBeDefined();
  });
});
