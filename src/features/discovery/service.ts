import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { htmlCalendarProvider } from './providers/html-calendar';
import type { DiscoverySource, DiscoveryRunSummary } from './types';
import { classifyDiscoveryCandidate } from './classifier';
export const providers = [htmlCalendarProvider];
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
  let discovered=0, newCandidates=0, known=0, duplicates=0, failed=0, ignored=0, pastIgnored=0;
  const finish = async () => {
    const status = failed===0 ? 'completed' : (newCandidates || discovered ? 'partial' : 'failed');
    const { error } = await client.from('discovery_runs').update({ status, finished_at:new Date().toISOString(), discovered_count:discovered, new_count:newCandidates, duplicate_count:duplicates, error_count:failed, error_details:errors }).eq('id',runId);
    if (error) console.error('[MapRun discovery cron:error]', { runId, code:error.code, message:error.message });
  };
  try {
    for (const source of sources.filter((item) => item.active)) {
      if (Date.now() - started > MAX_RUN_MS) { failed++; errors.push('Execução interrompida por limite de tempo.'); break; }
      const provider = providers.find((item) => item.supports(source));
      if (!provider) { failed++; errors.push(`${source.name}: provider não suportado`); continue; }
      try {
        const candidates = await provider.discoverEvents(source);
        discovered += candidates.length;
        for (const candidate of candidates) {
          if (candidate.event_date && Date.parse(candidate.event_date) < Date.now()) { pastIgnored++; continue; }
          if (classifyDiscoveryCandidate(candidate) !== 'EVENT') { ignored++; continue; }
          const { data: knownRows, error: knownError } = await client.from('discovered_events').select('id').or(`source_url.eq.${candidate.source_url},external_id.eq.${candidate.external_id}`).limit(1);
          if (knownError) throw knownError;
          if (knownRows?.length) { known++; continue; }
          const { data: possible, error: eventError } = await client.from('events').select('id').ilike('name', `%${candidate.name.slice(0,40)}%`).limit(1);
          if (eventError) throw eventError;
          if (possible?.[0]) { candidate.status='duplicate'; candidate.duplicate_event_id=possible[0].id; duplicates++; }
          const { error: insertError } = await client.from('discovered_events').insert(candidate);
          if (insertError) throw insertError;
          newCandidates++;
        }
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : 'falha desconhecida';
        errors.push(`${source.name}: ${message}`);
        console.error('[MapRun discovery cron:error]', { runId, sourceId:source.id, message });
      }
      const { error: sourceError } = await client.from('discovery_sources').update({ last_checked_at:new Date().toISOString() }).eq('id',source.id);
      if (sourceError) { failed++; errors.push(`${source.name}: falha ao atualizar a fonte`); }
    }
  } catch (error) {
    failed++;
    errors.push(error instanceof Error ? error.message : 'falha desconhecida');
  } finally {
    await finish();
  }
  const summary = { discovered, newCandidates, known, duplicates, errors:failed, sources:sources.length, ignored, pastIgnored };
  console.info('[MapRun discovery classification]', summary);
  return summary;
}
