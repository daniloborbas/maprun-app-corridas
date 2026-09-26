import 'server-only';
import type { DiscoveryDryRunOptions } from './dry-run';
import { runDiscoveryDryRun } from './dry-run';

export const SELECTIVE_BATCH_CHUNK_SIZE = 2;
export const MAX_BATCH_SELECTED = 30;
export type BatchStatus = 'pending' | 'running' | 'completed' | 'partially_completed' | 'failed';
export type PersistedBatchState = { status: string; processed_count: number; next_index: number; total_count: number };
/** A partially completed label is terminal only after every position was accounted for. */
export function isResumableBatch(batch: PersistedBatchState) {
  return !['completed', 'cancelled', 'failed'].includes(batch.status)
    || (batch.status === 'partially_completed' && Number(batch.processed_count) < Number(batch.total_count));
}
export function normalizeResumableBatchStatus(batch: PersistedBatchState) {
  if (batch.status === 'partially_completed' && Number(batch.processed_count) < Number(batch.total_count)) return 'running';
  return batch.status;
}
export type SelectiveBatchChunk = { index: number; expectedCandidateIds: string[]; expectedCount: number; returnedCandidateIds: string[]; returnedCount: number; status: 'completed'|'failed'|'cardinality_mismatch'; report?: Record<string, unknown>; error?: string };
export type SelectiveBatchReport = { batchExecutionId: string; requestedCandidateIds: string[]; startedAt: string; finishedAt: string; status: BatchStatus; chunks: SelectiveBatchChunk[]; results: unknown[]; candidatesRequested: number; candidatesClaimed: number; candidatesCompleted: number; successes: number; failures: number; error?: string };
export function chunkCandidateIds(ids: string[], size = SELECTIVE_BATCH_CHUNK_SIZE): string[][] { if (!Number.isInteger(size)||size<1) throw new Error('chunkSize inválido.'); return Array.from({length:Math.ceil(ids.length/size)},(_,i)=>ids.slice(i*size,i*size+size)); }
export function validateBatchCandidateIds(ids: string[], existingIds: string[]) { const frozen=[...ids]; if(!frozen.length) throw new Error('candidateIds é obrigatório.'); if(frozen.length>MAX_BATCH_SELECTED) throw new Error(`Máximo de ${MAX_BATCH_SELECTED} candidatos.`); if(new Set(frozen).size!==frozen.length) throw new Error('candidateIds duplicados.'); const existing=new Set(existingIds); const missing=frozen.filter(id=>!existing.has(id)); if(missing.length) throw new Error(`Candidatos inexistentes: ${missing.join(', ')}`); return {candidateIds:frozen,requestedCount:frozen.length,validatedCount:frozen.length}; }
export function checkChunkCardinality(expected: string[], returned: string[]) { const valid=expected.length===returned.length&&expected.every(id=>returned.includes(id)); return {valid,expectedCandidateIds:[...expected],expectedCount:expected.length,returnedCandidateIds:[...returned],returnedCount:returned.length}; }
export async function runSelectiveDryRunBatch(options: Omit<DiscoveryDryRunOptions,'candidateIds'|'limit'> & {candidateIds:string[]; batchExecutionId?:string; chunkSize?:number}): Promise<SelectiveBatchReport> {
 const requestedCandidateIds=[...options.candidateIds], batchExecutionId=options.batchExecutionId||crypto.randomUUID(), startedAt=new Date().toISOString(); const chunks=chunkCandidateIds(requestedCandidateIds,options.chunkSize??2); const report:SelectiveBatchReport={batchExecutionId,requestedCandidateIds,startedAt,finishedAt:startedAt,status:'running',chunks:[],results:[],candidatesRequested:requestedCandidateIds.length,candidatesClaimed:0,candidatesCompleted:0,successes:0,failures:0};
 for(const [index,expected] of chunks.entries()){try{const chunk=await runDiscoveryDryRun({...options,candidateIds:[...expected],limit:expected.length,concurrency:1,dryRunExecutionId:crypto.randomUUID()}); const ids=chunk.items.map(item=>item.candidateId), card=checkChunkCardinality(expected,ids); if(!card.valid){report.chunks.push({index,...card,status:'cardinality_mismatch',report:chunk as unknown as Record<string,unknown>,error:'chunk_cardinality_mismatch'}); report.status='running'; report.error='chunk_cardinality_mismatch'; break;} report.chunks.push({index,...card,status:'completed',report:chunk as unknown as Record<string,unknown>}); report.results.push(...chunk.items); report.candidatesClaimed+=ids.length; report.candidatesCompleted+=ids.length; report.successes+=chunk.items.filter(item=>item.persistenceStatus==='persisted').length; report.failures=report.candidatesCompleted-report.successes;}catch(error){const message=error instanceof Error?error.message:'Falha no chunk.'; report.chunks.push({index,expectedCandidateIds:[...expected],expectedCount:expected.length,returnedCandidateIds:[],returnedCount:0,status:'failed',error:message}); report.status='running'; report.error=message; break;}}
  if(report.status==='running' && report.candidatesCompleted===report.candidatesRequested) report.status=report.failures>0?'partially_completed':'completed'; report.finishedAt=new Date().toISOString(); return report;
}
