import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { fetchEventPage, importUrlSchema } from '@/features/importer/url-import';
export async function POST(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito à equipe MapRun.' }, { status: 403 }); }
  let body: unknown; try { body=await request.json(); } catch { return NextResponse.json({error:'JSON inválido.'},{status:400}); }
  const parsed=importUrlSchema.safeParse((body as {url?:unknown})?.url); if(!parsed.success) return NextResponse.json({error:'Informe uma URL pública http:// ou https://.'},{status:400});
  try { const draft=await fetchEventPage(parsed.data); const access=await requireAdmin(); const {data: duplicates}=await access.client.from('events').select('id,name,slug,city,state,start_date').or(`official_url.eq.${draft.sourceUrl},registration_url.eq.${draft.sourceUrl}`).limit(5); return NextResponse.json({draft,duplicates:duplicates||[]}); } catch(e) { return NextResponse.json({error:e instanceof Error ? e.message : 'Não foi possível importar a página.'},{status:422}); }
}
