export type PersistedBatchResult = { position: number; persistence_status?: string | null };

export function reconcileDryRunBatchCounters(batch: { total_count: number; status: string }, results: PersistedBatchResult[]) {
  const ordered = [...results].sort((a, b) => Number(a.position) - Number(b.position));
  const positions = ordered.map((row) => Number(row.position));
  if (!positions.every((position, index) => Number.isInteger(position) && position === index)) throw new Error('batch_results_position_gap');
  const processedCount = ordered.length;
  const succeededCount = ordered.filter((row) => row.persistence_status === 'persisted').length;
  const failedCount = processedCount - succeededCount;
  const totalCount = Number(batch.total_count);
  if (processedCount > totalCount || succeededCount + failedCount !== processedCount) throw new Error('batch_results_counter_invariant');
  return { processedCount, succeededCount, failedCount, nextIndex: processedCount, status: processedCount === totalCount ? (failedCount > 0 ? 'partially_completed' : 'completed') : 'running' };
}
