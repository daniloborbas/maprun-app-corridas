import type { SupabaseClient } from '@supabase/supabase-js';

export type DiagnosticPhase = 'configuration'|'request_build'|'responses_api'|'web_search'|'structured_output'|'citation_parsing'|'source_validation'|'persistence'|'finished';
export type DiagnosticStatus = 'running'|'succeeded'|'failed';
type Db = SupabaseClient<any, any, any>;

export async function createResearchDiagnostic(client: Db, candidateId: string, model: string) {
  const { data: active } = await client.from('discovery_research_diagnostics').select('id,started_at').eq('candidate_id', candidateId).eq('status', 'running').gte('started_at', new Date(Date.now() - 120_000).toISOString()).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (active) return { duplicate: true as const, id: active.id as string };
  const { data, error } = await client.from('discovery_research_diagnostics').insert({ candidate_id: candidateId, status: 'running', phase: 'configuration', model, research_attempted: false }).select('id').single();
  if (error || !data) throw new Error('Não foi possível criar o diagnóstico persistido.');
  return { duplicate: false as const, id: data.id as string };
}

export async function updateResearchDiagnostic(client: Db, id: string, values: Record<string, unknown>) {
  const { error } = await client.from('discovery_research_diagnostics').update(values).eq('id', id);
  if (error) throw error;
}

export async function finishResearchDiagnostic(client: Db, id: string, startedAt: number, values: Record<string, unknown>) {
  await updateResearchDiagnostic(client, id, { ...values, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt, phase: 'finished' });
}
