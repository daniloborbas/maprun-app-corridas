import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { htmlCalendarProvider } from './providers/html-calendar';
import { tfsportsProvider } from './providers/tfsports';
import type { DiscoverySource, DiscoveryRunSummary } from './types';
import { classifyDiscoveryCandidate } from './classifier';
import { enrichDiscoveredEvent } from './enrichment';
import { findBestEventDeduplication } from './deduplication';
import { calculateDiscoveryConfidence } from './confidence';
import { observeAiFallback, sanitizeDiscoveryError, type DiscoveryAiMetrics } from './observability';
import { buildDiscoveryRunUpdate } from './run-update';
import { sortByGeographicPriority } from './enrichment-priority';
export const providers = [tfsportsProvider, htmlCalendarProvider];
export class DiscoveryAlreadyRunning extends Error {}
const STALE_MS = 10 * 60_000;
const MAX_RUN_MS = 4 * 60_000;
export async function runDiscovery({ sources, client }: { sources: DiscoverySource[]; client: SupabaseClient }): Promise<DiscoveryRunSummary> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data: running, error: runningError } = await client.from('discovery_runs').select('id,started_at').eq('status','running').limit(20);
  if (runningError) throw new Error(`Não foi possível verificar execuções: ${runningError.message}`);
  for (const item of running || []) {
    if (item.started_at && item.started_at < cutoff) {
      await client.from('discovery_runs').update({ status:'failed', finished_at:new Date().toISOString(), error_count:1, error_details:['Execução interrompida ou expirada.'] }).eq('id', item.id).eq('status','running');
    } else {
      throw new DiscoveryAlreadyRunning('Uma busca já está em andamento.');
    }
  }
  const { data: userData } = await client.auth.getUser();
  const { data: run, error: runError } = await client.from('discovery_runs').insert({ status:'running', source_count:sources.length, triggered_by:userData.user?.id || null }).select('id').single();
  if (runError || !run) throw new Error(`Não foi possível iniciar a descoberta: ${runError?.message || 'run inválida'}`);
  const runId = run.id;
  const started = Date.now();
  const errors: string[] = [];
  const errorDetails: Array<{ stage: string; type: string }> = [];
  let discovered=0, newCandidates=0, known=0, duplicates=0, failed=0, ignored=0, pastIgnored=0, enriched=0, ready=0, incomplete=0, conflicts=0, enrichmentErrors=0;
  let enrichmentBudget = 25;
  const aiMetrics: DiscoveryAiMetrics = { aiFallbackNeeded: 0, aiCalls: 0, aiSuccesses: 0, aiFailures: 0, aiInputTokens: 0, aiOutputTokens: 0 };
  const aiEnabled = process.env.AI_EXTRACTION_ENABLED === 'true';
  let aiBudget = Math.max(0, Number.parseInt(process.env.AI_EXTRACTION_MAX_PER_RUN || '5', 10) || 5);
  const aiOptions = () => ({ enabled: aiEnabled, allowCall: aiEnabled && aiBudget > 0 });
  let finished = false;
  const { data: cachedLocations } = await client.from('geocoded_locations').select('city,state,latitude,longitude');
  const locationCache = new Map((cachedLocations ?? []).map((item) => [`${String(item.city).toLowerCase()}|${String(item.state).toUpperCase()}`, item]));
  const withCachedLocation = <T extends { city?: string|null; state?: string|null; latitude?: number|null; longitude?: number|null }>(candidate: T): T => {
    if (candidate.latitude && candidate.longitude) return candidate;
    const cached = candidate.city && candidate.state ? locationCache.get(`${candidate.city.toLowerCase()}|${candidate.state.toUpperCase()}`) : undefined;
    return cached ? { ...candidate, latitude: Number(cached.latitude), longitude: Number(cached.longitude) } : candidate;
  };
  const finish = async (fatal = false) => {
    if (finished) return;
    const status = failed===0 ? 'completed' : (newCandidates || discovered ? 'partial' : 'failed');
    const payload = buildDiscoveryRunUpdate({ status: fatal ? 'failed' : status, finishedAt: new Date().toISOString(), discoveredCount: discovered, newCount: newCandidates, duplicateCount: duplicates, errorCount: failed, errorDetails, sourcesProcessed: sources.length, candidatesFound: discovered, candidatesNew: newCandidates, candidatesEnriched: enriched, candidatesIgnored: ignored + pastIgnored, errorsCount: failed + enrichmentErrors + aiMetrics.aiFailures, aiMetrics });
    const { error } = await client.from('discovery_runs').update(payload).eq('id',runId);
    if (error) {
      console.error('[MapRun discovery observability:error]', { runId, stage:'finalize', type:'update_failed', code:error.code, message:error.message });
      return;
    }
    finished = true;
  };
  const recordAi = (result: { attempted: boolean; success: boolean; errorType?: string; usage?: { inputTokens?: number; outputTokens?: number } }) => {
    if (!result.attempted) return;
    observeAiFallback(aiMetrics, result);
    if (!result.success) errorDetails.push(sanitizeDiscoveryError('ai', result.errorType ?? 'provider_error'));
  };
  try {
    for (const source of sources.filter((item) => item.active)) {
      if (Date.now() - started > MAX_RUN_MS) { failed++; errors.push('Execução interrompida por limite de tempo.'); errorDetails.push(sanitizeDiscoveryError('discovery', 'timeout')); break; }
      const provider = providers.find((item) => item.supports(source));
      if (!provider) { failed++; errors.push(`${source.name}: provider não suportado`); errorDetails.push(sanitizeDiscoveryError('source', 'provider_not_supported')); continue; }
      try {
        const candidates = sortByGeographicPriority((await provider.discoverEvents(source)).map((candidate, order) => ({ ...withCachedLocation(candidate), trust_level: source.trust_level ?? 'C', order })));
        discovered += candidates.length;
        for (const candidate of candidates) {
          if (candidate.event_date && Date.parse(candidate.event_date) < Date.now()) { pastIgnored++; continue; }
          if (classifyDiscoveryCandidate(candidate) !== 'EVENT') { ignored++; continue; }
          const { data: knownRows, error: knownError } = await client.from('discovered_events').select('id').or(`source_url.eq.${candidate.source_url},external_id.eq.${candidate.external_id}`).limit(1);
          if (knownError) throw knownError;
          if (knownRows?.length) { known++; continue; }
          let enrichedCandidate = candidate;
          let quality_status: 'ready'|'incomplete'|'conflict' = 'incomplete';
          if (enrichmentBudget > 0) {
            enrichmentBudget--;
            try {
                const result = await enrichDiscoveredEvent(candidate, source.auto_ready_allowed === true, client, source.trust_level ?? 'C', aiOptions());
              recordAi(result.aiFallback);
              if (result.aiFallback.attempted) console.info('[MapRun discovery] AI fallback used', { candidateId:candidate.id, success:result.aiFallback.success, errorType:result.aiFallback.errorType, ...result.aiFallback.errorMetadata });
              if (result.aiFallback.attempted) aiBudget--;
              if (result.past) { pastIgnored++; continue; }
              enrichedCandidate = { ...candidate, ...result.candidate };
              quality_status = result.qualityStatus;
              enriched++;
              if (quality_status === 'ready') ready++;
              else if (quality_status === 'conflict') conflicts++;
              else incomplete++;
            } catch {
              enrichmentErrors++;
              errorDetails.push(sanitizeDiscoveryError('enrichment', 'error'));
              errors.push(`${source.name}: enriquecimento indisponível`);
            }
          }
          const identityDate = enrichedCandidate.event_date ? new Date(enrichedCandidate.event_date) : null;
          const dateStart = identityDate && !Number.isNaN(identityDate.getTime()) ? identityDate.toISOString().slice(0, 10) : null;
          const dateEnd = dateStart ? new Date(`${dateStart}T00:00:00.000Z`) : null;
          if (dateEnd) dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);
          let discoveredQuery = client.from('discovered_events').select('id,name,event_date,city,state').neq('id', enrichedCandidate.id ?? '00000000-0000-0000-0000-000000000000');
          let eventsQuery = client.from('events').select('id,name,start_date,city,state');
          if (dateStart && dateEnd) {
            discoveredQuery = discoveredQuery.gte('event_date', `${dateStart}T00:00:00.000Z`).lt('event_date', dateEnd.toISOString());
            eventsQuery = eventsQuery.gte('start_date', `${dateStart}T00:00:00.000Z`).lt('start_date', dateEnd.toISOString());
          }
          const [{ data: matchingCandidates, error: candidateMatchError }, { data: matchingEvents, error: eventMatchError }] = await Promise.all([discoveredQuery.limit(100), eventsQuery.limit(100)]);
          if (candidateMatchError) throw candidateMatchError;
          if (eventMatchError) throw eventMatchError;
          const discoveredMatch = dateStart && enrichedCandidate.city && enrichedCandidate.state ? findBestEventDeduplication(enrichedCandidate, matchingCandidates ?? []) : { type: 'none' as const, reasons: [] };
          if (discoveredMatch.type === 'exact') { known++; continue; }
          const eventMatch = dateStart && enrichedCandidate.city && enrichedCandidate.state ? findBestEventDeduplication(enrichedCandidate, matchingEvents ?? []) : { type: 'none' as const, reasons: [] };
          if (eventMatch.type === 'exact') { enrichedCandidate.status = 'duplicate'; enrichedCandidate.duplicate_event_id = eventMatch.matchedEventId ?? null; duplicates++; }
          if (eventMatch.type === 'probable' || discoveredMatch.type === 'probable') {
            quality_status = 'conflict';
            if (eventMatch.matchedEventId) enrichedCandidate.duplicate_event_id = eventMatch.matchedEventId;
          }
          const finalConfidence = calculateDiscoveryConfidence({
            trustLevel: source.trust_level ?? 'C',
            hasFutureDate: Boolean(enrichedCandidate.event_date && Date.parse(enrichedCandidate.event_date) >= Date.now()),
            hasValidLocation: Boolean(enrichedCandidate.city && enrichedCandidate.state),
            hasCoordinates: Boolean(enrichedCandidate.latitude && enrichedCandidate.longitude),
            hasRegistrationUrl: Boolean(enrichedCandidate.registration_url),
            hasOrganizer: Boolean(enrichedCandidate.organizer_name),
            hasImage: Boolean(enrichedCandidate.cover_image_url),
            hasSpecificName: Boolean(enrichedCandidate.name && enrichedCandidate.name.trim().length >= 8),
            hasAdditionalDetails: Boolean(enrichedCandidate.confidence_reasons?.includes('additional_race_details')),
            deduplication: eventMatch.type !== 'none' ? eventMatch.type : discoveredMatch.type,
          });
          enrichedCandidate.confidence_score = finalConfidence.score;
          enrichedCandidate.confidence_reasons = finalConfidence.reasons;
          const { error: insertError } = await client.from('discovered_events').insert({ ...enrichedCandidate, quality_status });
          if (insertError) throw insertError;
          newCandidates++;
        }
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : 'falha desconhecida';
        errorDetails.push(sanitizeDiscoveryError('source', error instanceof Error ? error.name || 'provider_error' : 'provider_error'));
        errors.push(`${source.name}: ${message}`);
        console.error('[MapRun discovery cron:error]', { runId, sourceId:source.id, message });
      }
      const { error: sourceError } = await client.from('discovery_sources').update({ last_checked_at:new Date().toISOString() }).eq('id',source.id);
      if (sourceError) { failed++; errors.push(`${source.name}: falha ao atualizar a fonte`); errorDetails.push(sanitizeDiscoveryError('source', 'update_failed')); }
    }

    const { data: pendingRows, error: pendingError } = await client.from('discovered_events').select('id,source_id,source_url,name,raw_title,event_date,registration_url,status,quality_status,enriched_at,city,state,latitude,longitude').eq('status','pending').limit(5000);
    if (pendingError) throw pendingError;
      const sourceById = new Map(sources.map((source) => [source.id, source]));
      for (const row of sortByGeographicPriority((pendingRows || []).map((row, order) => ({ ...withCachedLocation(row), trust_level: sourceById.get(row.source_id)?.trust_level ?? 'C', order })))) {
        const candidate = { ...row, status: 'pending' as const };
      if (candidate.event_date && Date.parse(candidate.event_date) < Date.now()) { pastIgnored++; await client.from('discovered_events').update({ status:'ignored' }).eq('id', candidate.id); continue; }
      if (classifyDiscoveryCandidate(candidate) !== 'EVENT') { ignored++; await client.from('discovered_events').update({ status:'ignored' }).eq('id', candidate.id); }
      else if (enrichmentBudget > 0 && (!candidate.enriched_at || Date.now() - Date.parse(candidate.enriched_at) > 24 * 60 * 60_000)) {
        enrichmentBudget--;
        try {
            const source = sourceById.get(candidate.source_id);
            const result = await enrichDiscoveredEvent(candidate, source?.auto_ready_allowed === true, client, source?.trust_level ?? 'C', aiOptions());
            recordAi(result.aiFallback);
            if (result.aiFallback.attempted) console.info('[MapRun discovery] AI fallback used', { candidateId:candidate.id, success:result.aiFallback.success, errorType:result.aiFallback.errorType, ...result.aiFallback.errorMetadata });
            if (result.aiFallback.attempted) aiBudget--;
          if (result.past) { pastIgnored++; await client.from('discovered_events').update({ status:'ignored', enriched_at:new Date().toISOString() }).eq('id', candidate.id); continue; }
          await client.from('discovered_events').update({ ...result.candidate, quality_status:result.qualityStatus }).eq('id', candidate.id);
          enriched++;
          if (result.qualityStatus === 'ready') ready++; else if (result.qualityStatus === 'conflict') conflicts++; else incomplete++;
        } catch (error) {
          enrichmentErrors++;
          errorDetails.push(sanitizeDiscoveryError('enrichment', error instanceof Error ? error.name || 'error' : 'error'));
        }
      }
    }
  } catch (error) {
    failed++;
    const type = error instanceof Error ? error.name || 'fatal_error' : 'fatal_error';
    errors.push(error instanceof Error ? error.message : 'falha desconhecida');
    errorDetails.push(sanitizeDiscoveryError('discovery', type));
    await finish(true);
    return { discovered, newCandidates, known, duplicates, errors:failed, sources:sources.length, ignored, pastIgnored, enriched, ready, incomplete, conflicts, enrichmentErrors, ...aiMetrics };
  } finally {
    await finish();
  }
  const summary = { discovered, newCandidates, known, duplicates, errors:failed, sources:sources.length, ignored, pastIgnored, enriched, ready, incomplete, conflicts, enrichmentErrors, ...aiMetrics };
  console.info('[MapRun discovery classification]', summary);
  return summary;
}







