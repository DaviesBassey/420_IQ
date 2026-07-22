/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { KnowledgeRing } from '@/components/KnowledgeRing';

describe('KnowledgeRing', () => {
  it('renders one segment per question with state attributes', () => {
    const segs = Array(17).fill('pending' as const);
    segs[3] = 'active';
    const { getByTestId, container } = render(
      <KnowledgeRing segments={segs} ringState="live" difficulty="FLAME" />);
    expect(container.querySelectorAll('[data-testid^="ring-seg-"]')).toHaveLength(17);
    expect(getByTestId('ring-seg-3').getAttribute('data-state')).toBe('active');
  });
  it('applies victory class in victory state', () => {
    const { container } = render(
      <KnowledgeRing segments={Array(17).fill('correct')} ringState="victory" />);
    expect(container.querySelector('.ring-victory')).not.toBeNull();
  });
});
