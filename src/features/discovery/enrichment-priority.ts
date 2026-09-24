export type EnrichmentPriorityCandidate = { id?: string; discoveredInRun?: boolean; order?: number };

/** Allocates the fixed run budget to current-run candidates before older pending work. */
export function prioritizeEnrichmentCandidates<T extends EnrichmentPriorityCandidate>(newCandidates: T[], pendingCandidates: T[], budget: number): T[] {
  if (budget <= 0) return [];
  return [...newCandidates, ...pendingCandidates].slice(0, budget);
}
