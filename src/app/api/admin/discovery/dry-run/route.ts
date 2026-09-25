import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';
import { discoverAndPersistFromSource } from '@/features/discovery/candidate-repository';
import { runDiscoveryDryRun } from '@/features/discovery/dry-run';
import { listSourcesReadyForCrawl, recordDiscoverySourceFailure, recordDiscoverySourceSuccess } from '@/features/discovery/source-repository';
import { getResearchModelConfiguration } from '@/features/discovery/openai-research-provider';
import { createRaceResearchProvider, ResearchProviderError, sanitizeOpenAIError } from '@/features/discovery/openai-research-provider';
import { researchAndEnrichCandidate, ResearchPersistenceError, type ResearchInput } from '@/features/discovery/research';
import { markCandidateProcessing, recoverExpiredProcessingCandidatesByIds } from '@/features/discovery/candidate-repository';
import { processDiscoveryCandidate } from '@/features/discovery/candidate-processor';
import type { DiscoverySource } from '@/features/discovery/types';
import { createResearchDiagnostic, finishResearchDiagnostic, updateResearchDiagnostic } from '@/features/discovery/research-diagnostics';
import { runSelectiveDryRunBatch, validateBatchCandidateIds, SELECTIVE_BATCH_CHUNK_SIZE } from '@/features/discovery/dry-run-batch';
import { createPersistedBatch, getPersistedBatch, listPersistedBatchResults, persistBatchChunk } from '@/features/discovery/dry-run-batch-persistence';
import { resolveEvidenceFirstResearchFlag } from '@/features/discovery/evidence-first';

const requestSchema = z.object({
  action: z.enum(['discover', 'discover-source', 'list-sources', 'dry-run', 'discover-and-dry-run', 'dry-run-selected', 'dry-run-batch-selected', 'dry-run-batch-start', 'process-next-batch-chunk', 'batch-status', 'batch-cancel', 'research-diagnostic']),
  sourceIds: z.array(z.string().uuid()).max(50).optional(),
  candidateIds: z.array(z.string().uuid()).max(50).optional(),
  sourceLimit: z.number().int().min(1).max(50).optional(),
  sourceId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(10).optional(),
  enableResearch: z.boolean().optional(),
  researchLimit: z.number().int().min(0).max(30).optional(),
  concurrency: z.number().int().min(1).max(2).optional(),
  allowReprocessExtracted: z.boolean().optional(),
  dryRunExecutionId: z.string().uuid().optional(),
  batchExecutionId: z.string().uuid().optional(),
});

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const id = new URL(request.url).searchParams.get('batchExecutionId');
  if (!id) return NextResponse.json({ error: 'batchExecutionId é obrigatório.' }, { status: 400 });
  try {
    const client = adminDb();
    const batch = await getPersistedBatch(client, id);
    if (!batch) return NextResponse.json({ error: 'Batch não encontrado.' }, { status: 404 });
    return NextResponse.json({ batch, results: await listPersistedBatchResults(client, id) });
  } catch { return NextResponse.json({ error: 'Não foi possível consultar o batch.' }, { status: 503 }); }
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : 'Falha controlada na operação.';
}

async function discover(sources: DiscoverySource[], client: ReturnType<typeof adminDb>) {
  const started = Date.now();
  let urlsFound = 0;
  let candidatesNew = 0;
  let candidatesExisting = 0;
  const errors: { sourceId: string; source: string; error: string }[] = [];
  const sourceResults: {
    sourceId: string;
    sourceName: string;
    urlsFound: number;
    candidatesNew: number;
    candidatesExisting: number;
    candidatesPersisted: number;
    durationMs: number;
    success: boolean;
    error?: string;
    truncated: boolean;
    discoveryLimit: number;
  }[] = [];
  for (const source of sources) {
    const sourceStarted = Date.now();
    try {
      const result = await discoverAndPersistFromSource(source, { maxDiscoveredUrls: 200 }, client);
      urlsFound += result.urlsFound;
      candidatesNew += result.newCandidates;
      candidatesExisting += result.existingCandidates;
      await recordDiscoverySourceSuccess(source, new Date(), client);
      sourceResults.push({ sourceId: source.id, sourceName: source.name, urlsFound: result.urlsFound, candidatesNew: result.newCandidates, candidatesExisting: result.existingCandidates, candidatesPersisted: result.candidatesPersisted, durationMs: Date.now() - sourceStarted, success: true, truncated: result.truncated, discoveryLimit: result.discoveryLimit });
    } catch (error) {
      const message = safeError(error);
      errors.push({ sourceId: source.id, source: source.name, error: message });
      sourceResults.push({ sourceId: source.id, sourceName: source.name, urlsFound: 0, candidatesNew: 0, candidatesExisting: 0, candidatesPersisted: 0, durationMs: Date.now() - sourceStarted, success: false, error: message, truncated: false, discoveryLimit: 200 });
      try { await recordDiscoverySourceFailure(source, new Date(), client); } catch { /* preserve the original source error */ }
    }
  }
  return {
    sourcesProcessed: sources.length,
    sourcesSucceeded: sources.length - errors.length,
    sourcesFailed: errors.length,
    urlsFound,
    candidatesNew,
    candidatesExisting,
    candidatesPersisted: candidatesNew + candidatesExisting,
    durationMs: Date.now() - started,
    errors,
    sourceResults,
  };
}

async function recentCandidateSample(client: ReturnType<typeof adminDb>, since: Date) {
  const { data } = await client
    .from('discovery_candidates')
    .select('url,title_hint,discovery_method,source_id,discovery_sources(name)')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  return (data || []).map((candidate) => ({
    url: candidate.url,
    source: (candidate.discovery_sources as { name?: string } | null)?.name || candidate.source_id,
    titleHint: candidate.title_hint || null,
    discoveryMethod: candidate.discovery_method,
  }));
}

export async function POST(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
  const input = parsed.data;
  if (input.action === 'batch-status' || input.action === 'process-next-batch-chunk' || input.action === 'batch-cancel') {
    if (!input.batchExecutionId) return NextResponse.json({ error: 'batchExecutionId é obrigatório.' }, { status: 400 });
    const batch = await getPersistedBatch(adminDb(), input.batchExecutionId);
    if (!batch) return NextResponse.json({ error: 'Batch não encontrado.' }, { status: 404 });
    if (input.action === 'batch-status') return NextResponse.json({ batch, results: await listPersistedBatchResults(adminDb(), input.batchExecutionId) });
    if (input.action === 'batch-cancel') { if (['completed','failed','cancelled'].includes(batch.status)) return NextResponse.json({ batch }); await adminDb().from('discovery_dry_run_batches').update({ status: 'cancelled', updated_at: new Date().toISOString(), finished_at: new Date().toISOString() }).eq('batch_execution_id', input.batchExecutionId); return NextResponse.json({ batch: { ...batch, status: 'cancelled' } }); }
    if (batch.status === 'completed' || batch.status === 'cancelled') return NextResponse.json({ batch, results: await listPersistedBatchResults(adminDb(), input.batchExecutionId) });
    const ids = Array.isArray(batch.candidate_ids) ? batch.candidate_ids as string[] : [];
    const start = Number(batch.next_index); const chunk = ids.slice(start, start + Number((batch.configuration as Record<string, unknown>)?.chunkSize || SELECTIVE_BATCH_CHUNK_SIZE));
    if (!chunk.length) return NextResponse.json({ batch, results: await listPersistedBatchResults(adminDb(), input.batchExecutionId) });
    const config = (batch.configuration || {}) as Record<string, unknown>;
    const existing = await adminDb().from('discovery_dry_run_batch_results').select('position').eq('batch_execution_id', input.batchExecutionId).in('position', chunk.map((_, i) => start + i));
    if (existing.error) return NextResponse.json({ error: 'Não foi possível verificar o estado do chunk.' }, { status: 500 });
    if ((existing.data || []).length === chunk.length) {
      const updated = await getPersistedBatch(adminDb(), input.batchExecutionId);
      return NextResponse.json({ batch: updated, results: await listPersistedBatchResults(adminDb(), input.batchExecutionId), chunk: { status: 'already_persisted', candidatesCompleted: chunk.length } });
    }
    const report = await runDiscoveryDryRun({ client: adminDb(), candidateIds: chunk, limit: chunk.length, enableResearch: config.enableResearch !== false, researchLimit: chunk.length, concurrency: 1, allowReprocessExtracted: config.allowReprocessExtracted === true, dryRunExecutionId: crypto.randomUUID() });
    if (report.items.length !== chunk.length) {
      await adminDb().from('discovery_dry_run_batches').update({ status: 'partially_completed', error: 'chunk_cardinality_mismatch', updated_at: new Date().toISOString() }).eq('batch_execution_id', input.batchExecutionId);
      return NextResponse.json({ error: 'chunk_cardinality_mismatch', expectedCount: chunk.length, returnedCount: report.items.length, batch: await getPersistedBatch(adminDb(), input.batchExecutionId) }, { status: 409 });
    }
    await persistBatchChunk(adminDb(), batch, report.items as unknown as Array<Record<string, unknown>>, chunk.map((_, i) => start + i));
    const updated = await getPersistedBatch(adminDb(), input.batchExecutionId); return NextResponse.json({ batch: updated, results: await listPersistedBatchResults(adminDb(), input.batchExecutionId), chunk: report });
  }
  if (input.action !== 'dry-run-batch-selected' && input.researchLimit !== undefined && input.researchLimit > 10) {
    return NextResponse.json({ error: 'research_limit_exceeded_for_action' }, { status: 400 });
  }
  if ((input.action === 'dry-run' || input.action === 'discover-and-dry-run' || input.action === 'dry-run-batch-selected' || input.action === 'research-diagnostic') && input.enableResearch !== false) {
    try { getResearchModelConfiguration(); } catch (error) { return NextResponse.json({ error: safeError(error) }, { status: 503 }); }
  }
  let client;
  try { client = adminDb(); } catch { return NextResponse.json({ error: 'Banco indisponível.' }, { status: 503 }); }
  try {
    if (input.action === 'dry-run-batch-selected') {
      const rawCandidateIds = input.candidateIds || [];
      const { data: existing, error } = await client.from('discovery_candidates').select('id').in('id', rawCandidateIds);
      if (error) return NextResponse.json({ error: 'Não foi possível validar candidatos.' }, { status: 500 });
      try {
        const validated = validateBatchCandidateIds(rawCandidateIds, (existing || []).map((row) => String(row.id)));
        const report = await runSelectiveDryRunBatch({ client, candidateIds: validated.candidateIds, enableResearch: input.enableResearch !== false, researchLimit: validated.validatedCount, concurrency: 1, allowReprocessExtracted: input.allowReprocessExtracted === true });
        return NextResponse.json({ requestedCount: validated.requestedCount, validatedCount: validated.validatedCount, candidateIds: validated.candidateIds, report });
      } catch (validationError) { return NextResponse.json({ error: safeError(validationError) }, { status: 400 }); }
    }
    if (input.action === 'dry-run-batch-start') {
      const startRequestAt = new Date().toISOString();
      const ids = input.candidateIds || [];
      const { data: existing, error } = await client.from('discovery_candidates').select('id').in('id', ids);
      if (error) return NextResponse.json({ error: 'Não foi possível validar candidatos.' }, { status: 500 });
      const validated = validateBatchCandidateIds(ids, (existing || []).map(row => String(row.id)));
      const evidenceFirst = await resolveEvidenceFirstResearchFlag({ client });
      const validationFinishedAt = new Date().toISOString();
      try {
        const batch = await createPersistedBatch(client, validated.candidateIds, { chunkSize: 2, concurrency: 1, enableResearch: input.enableResearch !== false, researchLimit: validated.validatedCount, allowReprocessExtracted: input.allowReprocessExtracted === true, evidenceFirstEnabled: evidenceFirst.enabled, evidenceFirstSource: evidenceFirst.source, validationFinishedAt });
        const insertFinishedAt = new Date().toISOString();
        return NextResponse.json({ batchExecutionId: batch.batch_execution_id, status: batch.status, totalCount: batch.total_count, processedCount: 0, telemetry: { startRequestAt, validationFinishedAt, insertFinishedAt, responseAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(startRequestAt) } }, { status: 201 });
      } catch (error) {
        const details = error && typeof error === 'object' ? error as Record<string, unknown> : {};
        console.error('[discovery-batch-start] persistence failed', { code: details.code, message: details.message, details: details.details, hint: details.hint });
        return NextResponse.json({ error: 'batch_persistence_failed', message: 'Não foi possível criar o batch.', details: { code: details.code || null, message: details.message || null, details: details.details || null, hint: details.hint || null } }, { status: 503 });
      }
    }
    if (input.action === 'research-diagnostic') {
      if (!input.candidateIds || input.candidateIds.length !== 1) return NextResponse.json({ error: 'research-diagnostic exige exatamente um candidateId.' }, { status: 400 });
      const { data: candidate, error } = await client.from('discovery_candidates').select('*').eq('id', input.candidateIds[0]).maybeSingle();
      if (error || !candidate) return NextResponse.json({ error: 'Candidato inexistente.' }, { status: 404 });
      const model = getResearchModelConfiguration();
      const diagnostic = await createResearchDiagnostic(client, candidate.id, model);
      if (diagnostic.duplicate) return NextResponse.json({ error: 'diagnostic_already_running', diagnosticRunId: diagnostic.id }, { status: 409 });
      const diagnosticStarted = Date.now();
      const persistFailure = async (values: Record<string, unknown>) => { try { await finishResearchDiagnostic(client, diagnostic.id, diagnosticStarted, { status: 'failed', research_attempted: values.research_attempted ?? false, research_succeeded: false, ...values }); } catch { /* preserve original diagnostic error */ } };
      const claimed = await markCandidateProcessing(candidate.id, client) || { ...candidate, status: 'processing' as const };
      await updateResearchDiagnostic(client, diagnostic.id, { phase: 'request_build' });
      const extraction = await processDiscoveryCandidate(claimed, { client });
      if (!extraction.success || !extraction.extractedEvent) { await persistFailure({ phase: 'request_build', error_type: 'extraction_error', error_message: safeError(extraction.errorMessage || 'Extração determinística falhou.') }); return NextResponse.json({ diagnosticRunId: diagnostic.id, candidateId: candidate.id, extractionStatus: extraction.errorCode || 'failed', error: extraction.errorMessage || 'Extração determinística falhou.' }, { status: 200 }); }
      const known: ResearchInput = { event: extraction.extractedEvent, sourceUrl: candidate.url };
      const started = Date.now();
      try {
        await updateResearchDiagnostic(client, diagnostic.id, { phase: 'responses_api', research_attempted: true });
        const provider = createRaceResearchProvider({ model, maxQueries: 2 });
        const persisted = await researchAndEnrichCandidate(candidate.id, known, provider, { maxQueries: 2, maxSources: 8, client, onPersistenceStart: () => updateResearchDiagnostic(client, diagnostic.id, { phase: 'persistence' }) });
        if (persisted.status === 'skipped') throw new Error('Pesquisa não necessária para este candidato.');
        if (!persisted.research) throw new Error('Resultado de pesquisa indisponível.');
        const result = persisted.research;
        await updateResearchDiagnostic(client, diagnostic.id, { phase: 'structured_output' });
        await updateResearchDiagnostic(client, diagnostic.id, { phase: 'citation_parsing' });
        await updateResearchDiagnostic(client, diagnostic.id, { phase: 'source_validation' });
        await finishResearchDiagnostic(client, diagnostic.id, diagnosticStarted, { status: result.status === 'completed' ? 'succeeded' : 'failed', research_attempted: true, research_succeeded: result.status === 'completed', web_searches: result.webSearches ?? 0, sources_count: result.sources.length, input_tokens: result.inputTokens ?? null, output_tokens: result.outputTokens ?? null, total_tokens: (result.inputTokens || 0) + (result.outputTokens || 0) || null, metadata: { extractionStatus: extraction.extractionStatus, rawSourcesCount: result.rawSourcesCount ?? result.sources.length, acceptedSourcesCount: result.sources.length, rejectedSourcesCount: result.rejectedSources?.length ?? 0, rejectedSources: result.rejectedSources ?? [], responseShape: result.responseShape ?? {} } });
        return NextResponse.json({ diagnosticRunId: diagnostic.id, candidateId: candidate.id, url: candidate.url, model: result.model || model, extractionStatus: extraction.extractionStatus, researchAttempted: true, researchSucceeded: result.status === 'completed', durationMs: Date.now() - started, result: { status: result.status, sources: result.sources.map((source) => ({ title: source.title, url: source.url, sourceType: source.sourceType })), facts: result.facts, researchConfidence: result.researchConfidence, inputTokens: result.inputTokens, outputTokens: result.outputTokens, webSearches: result.webSearches, rawSourcesCount: result.rawSourcesCount, acceptedSourcesCount: result.sources.length, rejectedSourcesCount: result.rejectedSources?.length ?? 0, rejectedSources: result.rejectedSources ?? [], responseShape: result.responseShape } });
      } catch (error) {
        if (error instanceof ResearchPersistenceError) { await persistFailure({ phase: 'persistence', research_attempted: true, error_type: 'database_error', error_code: error.details.code || null, error_param: null, error_message: error.details.message, http_status: error.details.status || null, metadata: { details: error.details.details || null, hint: error.details.hint || null, constraint: error.details.constraint || null, column: error.details.column || null, table: error.details.table || null } }); return NextResponse.json({ diagnosticRunId: diagnostic.id, candidateId: candidate.id, url: candidate.url, researchAttempted: true, researchSucceeded: false, error: { type: 'database_error', status: error.details.status || null, code: error.details.code || null, message: error.message, phase: 'persistence', details: error.details } }, { status: 200 }); }
        if (error instanceof ResearchProviderError) { await persistFailure({ phase: error.details.phase || 'responses_api', research_attempted: true, error_type: error.details.providerType || error.code, error_code: error.code, error_param: error.details.param || null, error_message: error.message.slice(0, 240), http_status: error.details.status || null }); return NextResponse.json({ diagnosticRunId: diagnostic.id, candidateId: candidate.id, url: candidate.url, researchAttempted: true, researchSucceeded: false, error: { type: error.code, status: error.details.status || null, code: error.code, param: error.details.param || null, providerType: error.details.providerType || null, message: error.message.slice(0, 240), phase: error.details.phase || 'responses_api' } }, { status: 200 }); }
        const details = sanitizeOpenAIError(error, 'provider_error');
        await persistFailure({ phase: 'responses_api', research_attempted: true, error_type: details.code, error_code: details.codeDetail || details.code, error_param: details.param || null, error_message: details.message, http_status: details.status || null });
        return NextResponse.json({ diagnosticRunId: diagnostic.id, candidateId: candidate.id, url: candidate.url, researchAttempted: true, researchSucceeded: false, error: { type: details.code, status: details.status || null, code: details.codeDetail || details.code, param: details.param || null, providerType: details.type || null, message: details.message, requestId: details.requestId || null, constructor: details.constructorName || null, name: details.name || null, cause: details.cause || null, phase: 'responses_api' } }, { status: 200 });
      }
    }
    if (input.action === 'dry-run-selected') {
      const rawCandidateIds = input.candidateIds || [];
      const candidateIds = [...new Set(rawCandidateIds)];
      if (!candidateIds.length) return NextResponse.json({ error: 'candidateIds é obrigatório.' }, { status: 400 });
      if (rawCandidateIds.length !== candidateIds.length) return NextResponse.json({ error: 'candidateIds duplicados.' }, { status: 400 });
      if (candidateIds.length > 10) return NextResponse.json({ error: 'Máximo de 10 candidatos.' }, { status: 400 });
      const { data: existing, error } = await client.from('discovery_candidates').select('id').in('id', candidateIds);
      if (error) return NextResponse.json({ error: 'Não foi possível validar candidatos.' }, { status: 500 });
      const found = new Set((existing || []).map((row) => String(row.id)));
      const missing = candidateIds.filter((id) => !found.has(id));
      if (missing.length) return NextResponse.json({ error: `Candidatos inexistentes: ${missing.join(', ')}` }, { status: 400 });
      await recoverExpiredProcessingCandidatesByIds(candidateIds, client);
      const report = await runDiscoveryDryRun({ client, candidateIds, limit: candidateIds.length, enableResearch: input.enableResearch !== false, researchLimit: input.researchLimit ?? 10, concurrency: input.concurrency ?? 2, allowReprocessExtracted: input.allowReprocessExtracted === true, dryRunExecutionId: input.dryRunExecutionId });
      return NextResponse.json({ report });
    }
    if (input.action === 'list-sources') {
      const sources = await listSourcesReadyForCrawl(new Date(), client);
      return NextResponse.json({ sources: sources.slice(0, input.sourceLimit ?? 3).map((source) => ({ id: source.id, name: source.name })) });
    }
    if (input.action === 'discover-source') {
      if (!input.sourceId) return NextResponse.json({ error: 'sourceId é obrigatório.' }, { status: 400 });
      const sources = await listSourcesReadyForCrawl(new Date(), client);
      const source = sources.find((item) => item.id === input.sourceId);
      if (!source) return NextResponse.json({ error: 'Fonte inexistente, inativa ou não pronta para crawl.' }, { status: 404 });
      const started = Date.now();
      try {
        const result = await Promise.race([
          discoverAndPersistFromSource(source, { maxDiscoveredUrls: 200 }, client),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Tempo limite da fonte excedido.')), 45_000)),
        ]);
        await recordDiscoverySourceSuccess(source, new Date(), client);
        return NextResponse.json({ sourceId: source.id, sourceName: source.name, urlsFound: result.urlsFound, candidatesNew: result.newCandidates, candidatesExisting: result.existingCandidates, candidatesPersisted: result.candidatesPersisted, truncated: result.truncated, discoveryLimit: result.discoveryLimit, durationMs: Date.now() - started, success: true });
      } catch (error) {
        const message = safeError(error);
        try { await recordDiscoverySourceFailure(source, new Date(), client); } catch { /* preserve source error */ }
        return NextResponse.json({ sourceId: source.id, sourceName: source.name, urlsFound: 0, candidatesNew: 0, candidatesExisting: 0, candidatesPersisted: 0, truncated: false, discoveryLimit: 200, durationMs: Date.now() - started, success: false, error: message }, { status: 200 });
      }
    }
    let discovery;
    let discoveryStartedAt: Date | null = null;
    if (input.action === 'discover' || input.action === 'discover-and-dry-run') {
      discoveryStartedAt = new Date();
      let sources = await listSourcesReadyForCrawl(new Date(), client);
      if (input.sourceIds?.length) sources = sources.filter((source) => input.sourceIds!.includes(source.id));
      sources = sources.slice(0, input.sourceLimit ?? 5);
      discovery = await discover(sources, client);
    }
    if (input.action === 'discover') return NextResponse.json({ discovery, candidates: await recentCandidateSample(client, discoveryStartedAt || new Date()) });
    const report = await runDiscoveryDryRun({
      client,
      candidateIds: input.candidateIds,
      sourceIds: input.sourceIds,
      limit: input.limit ?? 10,
      enableResearch: input.enableResearch !== false,
      researchLimit: input.researchLimit ?? 10,
      concurrency: input.concurrency ?? 2,
    });
    return NextResponse.json({ discovery, report });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

