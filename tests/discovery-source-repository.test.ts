import { describe, expect, it } from 'vitest';
import { buildSourceFailureUpdate, buildSourceSuccessUpdate, nextCrawlAt } from '@/features/discovery/source-scheduling';

const now = new Date('2026-09-24T12:00:00.000Z');

describe('discovery source crawl scheduling', () => {
  it('calculates the next crawl from the configured frequency', () => {
    expect(nextCrawlAt(now, 60)).toBe('2026-09-24T13:00:00.000Z');
  });

  it('records a successful crawl and resets failures', () => {
    expect(buildSourceSuccessUpdate(now, 1440)).toEqual({
      last_crawled_at: now.toISOString(),
      last_success_at: now.toISOString(),
      consecutive_failures: 0,
      next_crawl_at: '2026-09-25T12:00:00.000Z',
    });
  });

  it('records a failed crawl and increments failures', () => {
    expect(buildSourceFailureUpdate(now, 30, 2)).toEqual({
      last_crawled_at: now.toISOString(),
      consecutive_failures: 3,
      next_crawl_at: '2026-09-24T12:30:00.000Z',
    });
  });

  it('uses the safe default for an invalid frequency', () => {
    expect(nextCrawlAt(now, 0)).toBe('2026-09-25T12:00:00.000Z');
  });
});
