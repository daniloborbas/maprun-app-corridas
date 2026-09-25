import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  const candidateId = params.get('candidateId');
  if (id && !z.uuid().safeParse(id).success) return NextResponse.json({ error: 'id inválido.' }, { status: 400 });
  if (candidateId && !z.uuid().safeParse(candidateId).success) return NextResponse.json({ error: 'candidateId inválido.' }, { status: 400 });
  const client = adminDb();
  let query = client.from('discovery_research_diagnostics').select('*').order('started_at', { ascending: false }).limit(20);
  if (id) query = query.eq('id', id);
  else if (candidateId) query = query.eq('candidate_id', candidateId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Não foi possível consultar diagnósticos.' }, { status: 503 });
  return NextResponse.json({ diagnostics: data || [] });
}
