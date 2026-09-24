export const RETRY_DELAYS_MINUTES = [15, 60, 360, 1440, 4320] as const;
export function retryDelayMinutes(attempt: number) { return RETRY_DELAYS_MINUTES[Math.min(Math.max(attempt, 1) - 1, RETRY_DELAYS_MINUTES.length - 1)]; }
export function nextCandidateRetryAt(now: Date, attempt: number) { return new Date(now.getTime() + retryDelayMinutes(attempt) * 60_000).toISOString(); }
