import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/server';
import { summarizeMetrics, type MetricRow } from '@/features/admin/metrics';
export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  let access;
  try {
    access = await requireAdmin();
  } catch {
    return null;
  }
  const raw = (await searchParams).period;
  const days = raw === '30' ? 30 : raw === '7' ? 7 : 1;
  const now = new Date();
  const dateBR = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const since =
    days === 1
      ? new Date(`${dateBR}T00:00:00-03:00`).toISOString()
      : new Date(now.getTime() - days * 86400000).toISOString();
  const [result, profiles, races] = await Promise.all([
    access.client
      .from('analytics_events')
      .select('event_name,event_id,session_id,user_id,source,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10000),
    access.client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since),
    access.client.from('events').select('id,name,city,state'),
  ]);
  if (result.error) return <p className="error-message">Não foi possível carregar as métricas.</p>;
  const rows = (result.data || []) as MetricRow[],
    metrics = summarizeMetrics(rows);
  const ranking = new Map<
    string,
    { views: number; saves: number; shares: number; going: number; clicks: number }
  >();
  rows.forEach((r) => {
    if (!r.event_id) return;
    const item = ranking.get(r.event_id) || { views: 0, saves: 0, shares: 0, going: 0, clicks: 0 };
    if (r.event_name === 'race_view') item.views++;
    if (r.event_name === 'race_save') item.saves++;
    if (r.event_name === 'race_share') item.shares++;
    if (r.event_name === 'going_add') item.going++;
    if (r.event_name === 'registration_click' && r.source === 'registration_redirect')
      item.clicks++;
    ranking.set(r.event_id, item);
  });
  return (
    <>
      <h1>O que move o MapRun</h1>
      <div className="admin-period">
        <Link href="/admin/analytics?period=1">Hoje</Link>
        <Link href="/admin/analytics?period=7">7 dias</Link>
        <Link href="/admin/analytics?period=30">30 dias</Link>
      </div>
      <p className="admin-note">
        Período: {days === 1 ? 'hoje, horário de Brasília' : `últimos ${days} dias`}. Métricas de
        uso dependem de consentimento. “Online” significa atividade nos últimos 5 minutos.
      </p>
      <div className="metric-grid">
        {Object.entries({
          'Online agora': metrics.online,
          Acessos: metrics.pageViews,
          'Novos usuários': profiles.count || 0,
          Sessões: metrics.sessions,
          'Corridas vistas': metrics.views,
          Salvamentos: metrics.saves,
          Compartilhamentos: metrics.shares,
          'Cliques em inscrição': metrics.clicks,
          'Contas que retornaram': metrics.returningUsers,
        }).map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="admin-note">
        Funil: {metrics.impressions} impressões → {metrics.views} detalhes →{' '}
        {metrics.saves + metrics.going + metrics.shares} interações → {metrics.clicks} cliques.
        Última atividade:{' '}
        {rows[0]
          ? new Date(rows[0].created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          : 'ainda sem dados'}
        .
      </p>
      {rows.length === 10000 && (
        <p className="error-message">
          Exibindo as 10 mil ações mais recentes. Reduza o período para uma leitura completa.
        </p>
      )}
      <h2>Interesse por corrida</h2>
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Corrida / região</th>
              <th>Detalhes</th>
              <th>Salvos</th>
              <th>Compartilhamentos</th>
              <th>Eu vou</th>
              <th>Inscrição</th>
            </tr>
          </thead>
          <tbody>
            {[...ranking.entries()]
              .sort((a, b) => b[1].views - a[1].views)
              .map(([id, m]) => {
                const race = races.data?.find((e) => e.id === id);
                return (
                  <tr key={id}>
                    <td>
                      {race?.name || 'Evento removido'}
                      <p>
                        {race?.city} · {race?.state}
                      </p>
                    </td>
                    <td>{m.views}</td>
                    <td>{m.saves}</td>
                    <td>{m.shares}</td>
                    <td>{m.going}</td>
                    <td>{m.clicks}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <h2 style={{ marginTop: 35 }}>Atividade recente</h2>
      <div className="table-scroll">
        <table className="admin-table">
          <tbody>
            {rows.slice(0, 15).map((r, i) => (
              <tr key={i}>
                <td>{r.event_name}</td>
                <td>{races.data?.find((e) => e.id === r.event_id)?.name || 'Navegação'}</td>
                <td>
                  {new Date(r.created_at).toLocaleTimeString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
