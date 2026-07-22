/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TimerChip } from '@/components/TimerChip';

describe('TimerChip', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down live and labels the timer kind', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const deadline = new Date(now + 10_000).toISOString();

    render(<TimerChip deadline={deadline} kind="question" />);
    expect(screen.getByText('Question')).toBeDefined();
    expect(screen.getByText('10s')).toBeDefined();

    act(() => {
      vi.setSystemTime(now + 4_000);
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText('6s')).toBeDefined();
  });

  it('shows 0 once the deadline has passed rather than going negative', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const deadline = new Date(now - 5_000).toISOString(); // already elapsed

    render(<TimerChip deadline={deadline} kind="steal" />);
    expect(screen.getByText('Steal')).toBeDefined();
    expect(screen.getByText('0s')).toBeDefined();
  });
});
