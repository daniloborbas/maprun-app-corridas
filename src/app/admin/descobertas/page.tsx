import { requireAdmin } from '@/lib/supabase/server';
import { DiscoveryQueue } from '@/features/discovery/queue';
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export default async function DiscoveriesPage({ searchParams }: { searchParams: SearchParams }) {
  let access; try { access = await requireAdmin(); } catch { return null; }
  const params = await searchParams;
  const value = (key: string) => { const raw = params[key]; return Array.isArray(raw) ? raw[0] : raw || ''; };
  const status = value('status') || 'pending'; const quality = value('quality'); const source = value('source'); const priority = value('priority'); const q = value('q').trim();
  let query = access.client.from('discovered_events').select('*,discovery_sources(name,trust_level,auto_ready_allowed)', { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  if (quality && quality !== 'all') query = query.eq('quality_status', quality);
  if (source) query = query.eq('source_id', source);
  if (priority === 'high') query = query.gte('confidence_score', 90);
  if (priority === 'medium') query = query.gte('confidence_score', 70).lte('confidence_score', 89);
  if (priority === 'low') query = query.lt('confidence_score', 70);
  if (priority === 'none') query = query.is('confidence_score', null);
  if (q) { const safe = q.replace(/[(),]/g, ' ').replace(/[*]/g, ''); query = query.or(`name.ilike.%${safe}%,city.ilike.%${safe}%,source_url.ilike.%${safe}%`); }
  const [{ data, count }, { data: runs }, { data: sources }] = await Promise.all([
    query.order('quality_status', { ascending: true }).order('event_date', { ascending: true, nullsFirst: false }).limit(200),
    access.client.from('discovery_runs').select('*').neq('status', 'running').order('finished_at', { ascending: false }).limit(1),
    access.client.from('discovery_sources').select('id,name').order('name'),
  ]);
  const last = runs?.[0];
  return <><div className="admin-note">Última busca automática: {last?.finished_at ? new Date(last.finished_at).toLocaleString('pt-BR') : 'ainda não executada'} · Status: {last?.status ?? '—'} · Próxima execução: diariamente às 05:00 (Brasília) · Último resultado: {last?.new_count ?? 0} novas corridas · {last?.error_count ?? 0} erros</div><DiscoveryQueue initial={(data || []) as Record<string, unknown>[]} sources={(sources || []) as Record<string, unknown>[]} count={count ?? 0} filters={{ status, quality, source, priority, q }} /></>;
}


