import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/server';
import { normalizeDiscoveryUrl, discoverUrlsFromSource, type DiscoveredUrl, type DiscoveryProviderContext } from './url-discovery';
import type { DiscoverySource } from './types';
import type { DiscoveryCandidate } from './candidate-types';
import { nextCandidateRetryAt } from './candidate-scheduling';

function connectionOrThrow(client?: SupabaseClient) { return client ? Promise.resolve(client) : db().then((value) => { if (!value) throw new Error('Supabase não configurado.'); return value; }); }

export async function upsertDiscoveredCandidates(source: DiscoverySource, urls: DiscoveredUrl[], client?: SupabaseClient) {
  const connection = await connectionOrThrow(client);
  let newCandidates = 0;
  let existingCandidates = 0;
  for (const item of urls) {
    const normalizedUrl = normalizeDiscoveryUrl(item.url, source.base_url);
    if (!normalizedUrl) continue;
    const { data, error } = await connection.rpc('upsert_discovery_candidate', {
      p_source_id: source.id, p_url: item.url, p_normalized_url: normalizedUrl,
      p_title_hint: item.titleHint || null, p_discovery_method: item.discoveryMethod,
      p_discovered_at: item.discoveredAt, p_metadata: {},
    });
    if (error) throw new Error('Não foi possível persistir candidatos descobertos.');
    const inserted = data && typeof data === 'object' && !Array.isArray(data)
      ? (data as { inserted?: unknown }).inserted
      : undefined;
    if (inserted === true || inserted === 'true') newCandidates += 1; else existingCandidates += 1;
  }
  return { urlsFound: urls.length, newCandidates, existingCandidates, candidatesPersisted: newCandidates + existingCandidates };
}

export async function listCandidatesReadyForProcessing(limit: number, now = new Date(), client?: SupabaseClient): Promise<DiscoveryCandidate[]> {
  const connection = await connectionOrThrow(client);
  const safeLimit = Math.max(0, Math.floor(limit));
  if (!safeLimit) return [];
  const { data, error } = await connection.from('discovery_candidates').select('*').or(`status.eq.discovered,and(status.eq.failed,next_process_at.lte.${now.toISOString()})`).order('first_discovered_at').order('id').limit(safeLimit);
  if (error) throw new Error('Não foi possível carregar candidatos prontos.');
  return (data || []) as DiscoveryCandidate[];
}
export async function listCandidatesForDryRun(options: { candidateIds?: string[]; sourceIds?: string[]; limit: number; allowReprocessExtracted?: boolean }, client?: SupabaseClient): Promise<DiscoveryCandidate[]> {
  const connection = await connectionOrThrow(client);
  let query = connection.from('discovery_candidates').select('*').in('status', options.allowReprocessExtracted ? ['discovered', 'failed', 'extracted'] : ['discovered', 'failed']).order('first_discovered_at').order('id').limit(Math.max(0, Math.floor(options.limit)));
  if (options.candidateIds?.length) query = query.in('id', options.candidateIds);
  if (options.sourceIds?.length) query = query.in('source_id', options.sourceIds);
  const { data, error } = await query;
  if (error) throw new Error('Não foi possível carregar candidatos para o dry run.');
  return (data || []) as DiscoveryCandidate[];
}
export async function claimCandidateForAdminReprocess(id: string, client?: SupabaseClient): Promise<DiscoveryCandidate | null> {
  const connection = await connectionOrThrow(client);
  const now = new Date();
  const { data, error } = await connection.from('discovery_candidates').update({ status: 'processing', last_processed_at: now.toISOString(), processing_started_at: now.toISOString(), processing_lease_expires_at: new Date(now.getTime() + 5 * 60_000).toISOString() }).eq('id', id).eq('status', 'extracted').select('*').maybeSingle();
  if (error) throw new Error('Não foi possível reservar candidato extraído.');
  return (data || null) as DiscoveryCandidate | null;
}

export async function markCandidateProcessing(id: string, client?: SupabaseClient): Promise<DiscoveryCandidate | null> {
  const connection = await connectionOrThrow(client);
  const { data, error } = await connection.rpc('claim_discovery_candidate', { p_candidate_id: id });
  if (error) throw new Error('Não foi possível reservar o candidato.');
  return (data?.[0] || null) as DiscoveryCandidate | null;
}

async function updateCandidate(id: string, values: Record<string, unknown>, client?: SupabaseClient) {
  const connection = await connectionOrThrow(client);
  const { data, error } = await connection.from('discovery_candidates').update(values).eq('id', id).select('*').maybeSingle();
  if (error) throw new Error('Não foi possível atualizar o candidato.');
  return (data || null) as DiscoveryCandidate | null;
}
export const markCandidateExtracted = (id: string, metadata: Record<string, unknown> = {}, client?: SupabaseClient) => updateCandidate(id, { status: 'extracted', last_error: null, next_process_at: null, processing_lease_expires_at: null, metadata }, client);
export const markCandidateIgnored = (id: string, metadata: Record<string, unknown> = {}, client?: SupabaseClient) => updateCandidate(id, { status: 'ignored', next_process_at: null, processing_lease_expires_at: null, metadata }, client);
export function markCandidateFailed(id: string, errorMessage: string, attempt: number, now = new Date(), client?: SupabaseClient) {
  return updateCandidate(id, { status: 'failed', last_error: errorMessage.slice(0, 1000), next_process_at: nextCandidateRetryAt(now, attempt), processing_lease_expires_at: null }, client);
}
export async function recoverExpiredProcessingCandidates(limit = 50, client?: SupabaseClient): Promise<DiscoveryCandidate[]> {
  const connection = await connectionOrThrow(client);
  const { data, error } = await connection.rpc('recover_expired_discovery_candidates', { p_limit: limit });
  if (error) throw new Error('Não foi possível recuperar candidatos travados.');
  return (data || []) as DiscoveryCandidate[];
}
export async function recoverExpiredProcessingCandidatesByIds(ids: string[], client?: SupabaseClient): Promise<DiscoveryCandidate[]> {
  if (!ids.length) return [];
  const connection = await connectionOrThrow(client);
  const { data, error } = await connection.from('discovery_candidates').update({ status: 'discovered', processing_started_at: null, processing_lease_expires_at: null, next_process_at: null, updated_at: new Date().toISOString(), last_error: 'Lease expirado recuperado antes do dry-run seletivo.' }).in('id', ids).eq('status', 'processing').lt('processing_lease_expires_at', new Date().toISOString()).select('*');
  if (error) throw new Error('Não foi possível recuperar leases expirados dos candidatos selecionados.');
  return (data || []) as DiscoveryCandidate[];
}

export type DryRunSelectionDiagnostic = { candidateId: string; currentStatus: string | null; leaseExpired: boolean | null; reason: 'not_found'|'expired_processing_not_recovered'|'active_lease'|'status_not_eligible' };
export async function diagnoseDryRunCandidateSelection(ids: string[], allowReprocessExtracted: boolean, client?: SupabaseClient): Promise<DryRunSelectionDiagnostic[]> {
  if (!ids.length) return [];
  const connection = await connectionOrThrow(client);
  const { data, error } = await connection.from('discovery_candidates').select('id,status,processing_lease_expires_at').in('id', ids);
  if (error) throw new Error('Não foi possível diagnosticar candidatos filtrados.');
  const byId = new Map((data || []).map((row) => [String(row.id), row as { id: string; status: string; processing_lease_expires_at: string | null }]));
  const now = Date.now();
  return ids.reduce<DryRunSelectionDiagnostic[]>((diagnostics, id) => {
    const candidate = byId.get(id);
    if (!candidate) { diagnostics.push({ candidateId: id, currentStatus: null, leaseExpired: null, reason: 'not_found' }); return diagnostics; }
    const leaseExpired = !candidate.processing_lease_expires_at || Date.parse(candidate.processing_lease_expires_at) <= now;
    if (candidate.status === 'processing') { diagnostics.push({ candidateId: id, currentStatus: candidate.status, leaseExpired, reason: leaseExpired ? 'expired_processing_not_recovered' : 'active_lease' }); return diagnostics; }
    if (candidate.status === 'extracted' && allowReprocessExtracted) return diagnostics;
    if (candidate.status === 'discovered' || candidate.status === 'failed') return diagnostics;
    diagnostics.push({ candidateId: id, currentStatus: candidate.status, leaseExpired, reason: 'status_not_eligible' }); return diagnostics;
  }, []);
}

export async function discoverAndPersistFromSource(source: DiscoverySource, context: DiscoveryProviderContext = {}, client?: SupabaseClient) {
  const urls = await discoverUrlsFromSource(source, context);
  const result = await upsertDiscoveredCandidates(source, urls, client);
  const discoveryLimit = Math.max(1, Math.min(500, context.maxDiscoveredUrls ?? 500));
  return { ...result, discoveryLimit, truncated: urls.length >= discoveryLimit };
}
