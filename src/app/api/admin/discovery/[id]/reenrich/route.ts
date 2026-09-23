import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { enrichDiscoveredEvent } from '@/features/discovery/enrichment';
import { canManuallyReenrich } from '@/features/discovery/manual-reenrichment';
import type { DiscoveredEventCandidate } from '@/features/discovery/types';
import { z } from 'zod';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let access;
  try { access = await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Candidato inválido.' }, { status: 400 });
  const { data: candidate, error: candidateError } = await access.client.from('discovered_events').select('*').eq('id', id).single();
  if (candidateError || !candidate) return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 });
  if (!canManuallyReenrich(candidate as DiscoveredEventCandidate)) return NextResponse.json({ error: 'Somente candidatos pendentes incompletos ou em conflito podem ser re-enriquecidos.' }, { status: 409 });
  const { data: source, error: sourceError } = await access.client.from('discovery_sources').select('*').eq('id', candidate.source_id).single();
  if (sourceError || !source) return NextResponse.json({ error: 'Fonte do candidato não encontrada.' }, { status: 422 });
  try {
    const result = await enrichDiscoveredEvent(candidate as DiscoveredEventCandidate, source.auto_ready_allowed === true, access.client, source.trust_level ?? 'C', { enabled: false, allowCall: false });
    if (result.past) return NextResponse.json({ error: 'A corrida já passou.' }, { status: 409 });
    const { error } = await access.client.from('discovered_events').update({ ...result.candidate, quality_status: result.qualityStatus }).eq('id', id).eq('status', 'pending');
    if (error) return NextResponse.json({ error: 'Não foi possível salvar o enrichment.' }, { status: 503 });
    return NextResponse.json({ candidate: { ...result.candidate, quality_status: result.qualityStatus } });
  } catch (error) {
    console.error('[MapRun discovery manual enrichment:error]', { candidateId: id, stage: 'enrichment', type: error instanceof Error ? error.name || 'error' : 'error' });
    return NextResponse.json({ error: 'Não foi possível enriquecer o candidato.' }, { status: 422 });
  }
}
