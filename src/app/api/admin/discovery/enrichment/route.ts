import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const candidateId = new URL(request.url).searchParams.get('candidateId');
  if (!candidateId) return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
  const { data, error } = await adminDb().from('discovery_candidate_enrichments').select('*').eq('candidate_id', candidateId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Não foi possível consultar o enrichment.' }, { status: 500 });
  return NextResponse.json({ enrichment: data });
}
