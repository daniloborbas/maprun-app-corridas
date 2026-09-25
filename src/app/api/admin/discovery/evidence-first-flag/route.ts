import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';
import { resolveEvidenceFirstResearchFlag } from '@/features/discovery/evidence-first';
export async function GET() { try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); } return NextResponse.json(await resolveEvidenceFirstResearchFlag()); }
export async function PATCH(request: Request) {
  let access; try { access = await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled deve ser boolean.' }, { status: 400 });
  const { error } = await adminDb().from('system_feature_flags').upsert({ key: 'evidence_first_research', enabled: body.enabled, updated_by: access.user.id }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: 'Não foi possível atualizar a flag.' }, { status: 503 });
  return NextResponse.json(await resolveEvidenceFirstResearchFlag());
}
