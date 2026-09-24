import { describe, expect, it } from 'vitest';
import { nextCandidateRetryAt, retryDelayMinutes } from '@/features/discovery/candidate-scheduling';

describe('discovery candidate retry backoff', () => {
  it.each([[1, 15], [2, 60], [3, 360], [4, 1440], [5, 4320], [10, 4320]])('attempt %i waits %i minutes', (attempt, delay) => {
    expect(retryDelayMinutes(attempt)).toBe(delay);
  });
  it('calculates the next retry timestamp', () => {
    expect(nextCandidateRetryAt(new Date('2026-09-24T12:00:00.000Z'), 2)).toBe('2026-09-24T13:00:00.000Z');
  });
});
