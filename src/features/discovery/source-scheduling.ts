export const DEFAULT_CRAWL_FREQUENCY_MINUTES = 1440;

export function nextCrawlAt(now: Date, frequencyMinutes: number): string {
  const safeFrequency = Number.isFinite(frequencyMinutes) && frequencyMinutes > 0
    ? frequencyMinutes
    : DEFAULT_CRAWL_FREQUENCY_MINUTES;
  return new Date(now.getTime() + safeFrequency * 60_000).toISOString();
}

export function buildSourceSuccessUpdate(now: Date, frequencyMinutes: number) {
  const timestamp = now.toISOString();
  return {
    last_crawled_at: timestamp,
    last_success_at: timestamp,
    consecutive_failures: 0,
    next_crawl_at: nextCrawlAt(now, frequencyMinutes),
  };
}

export function buildSourceFailureUpdate(now: Date, frequencyMinutes: number, consecutiveFailures: number) {
  return {
    last_crawled_at: now.toISOString(),
    consecutive_failures: Math.max(0, consecutiveFailures) + 1,
    next_crawl_at: nextCrawlAt(now, frequencyMinutes),
  };
}
