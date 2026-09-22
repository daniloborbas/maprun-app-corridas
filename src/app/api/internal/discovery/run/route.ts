import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/supabase/admin';
import { DiscoveryAlreadyRunning, runDiscovery } from '@/features/discovery/service';
import type { DiscoverySource } from '@/features/discovery/types';
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  let client;
  try { client = adminDb(); } catch { return NextResponse.json({ error: 'Banco indisponível.' }, { status: 503 }); }
  const { data, error } = await client.from('discovery_sources').select('*').eq('active', true);
  if (error) return NextResponse.json({ error: 'Não foi possível carregar as fontes.' }, { status: 503 });
  try {
    console.info('[MapRun discovery cron:start]', { sourceCount: data?.length || 0 });
    const summary = await runDiscovery({ sources: (data || []) as DiscoverySource[], client });
    console.info('[MapRun discovery cron:end]', summary);
    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof DiscoveryAlreadyRunning) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('[MapRun discovery cron:error]', { message: error instanceof Error ? error.message : 'falha desconhecida' });
    return NextResponse.json({ error: 'Falha na descoberta.' }, { status: 500 });
  }
}
export const GET = run;
export const POST = run;
