import 'server-only';
import type { adminDb } from '@/lib/supabase/admin';
type Client = ReturnType<typeof adminDb>;
export async function createPersistedBatch(client: Client, candidateIds: string[], configuration: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const { data, error } = await client.from('discovery_dry_run_batches').insert({ batch_execution_id: id, status: 'pending', candidate_ids: candidateIds, total_count: candidateIds.length, configuration: { ...configuration, startRequestAt: startedAt }, started_at: null }).select().single();
  if (error) throw error; return data;
}
export async function getPersistedBatch(client: Client, id: string) { const { data, error } = await client.from('discovery_dry_run_batches').select('*').eq('batch_execution_id', id).maybeSingle(); if (error) throw error; return data; }
export async function listPersistedBatchResults(client: Client, id: string) { const { data, error } = await client.from('discovery_dry_run_batch_results').select('*').eq('batch_execution_id', id).order('position'); if (error) throw error; return data || []; }
export async function persistBatchChunk(client: Client, batch: Record<string, unknown>, items: Array<Record<string, unknown>>, positions: number[]) {
  if (items.length) {
    const rows = items.map((item, i) => ({ batch_execution_id: batch.batch_execution_id, candidate_id: item.candidateId, position: positions[i], dry_run_execution_id: item.dryRunExecutionId, status: item.extractionStatus || 'completed', persistence_status: item.persistenceStatus, research_status: item.researchStatus, total_tokens: (item.researchTelemetry as Record<string, unknown> | null)?.totalTokens || null, fallback_used: Boolean((item.researchTelemetry as Record<string, unknown> | null)?.fallbackWebSearchUsed), research_confidence: item.researchConfidence, factual_confidence: null, content_quality: item.contentQualityScore, result: item }));
    const { error } = await client.from('discovery_dry_run_batch_results').upsert(rows, { onConflict: 'batch_execution_id,position' }); if (error) throw error;
  }
  const next = Number(batch.next_index) + items.length; const total = Number(batch.total_count); const status = next >= total ? 'completed' : 'running';
  const { error } = await client.from('discovery_dry_run_batches').update({ next_index: next, processed_count: next, succeeded_count: items.filter(i=>i.persistenceStatus==='persisted').length, failed_count: items.filter(i=>i.persistenceStatus!=='persisted').length, status, finished_at: status==='completed'?new Date().toISOString():null, updated_at: new Date().toISOString() }).eq('batch_execution_id', batch.batch_execution_id); if (error) throw error;
}
