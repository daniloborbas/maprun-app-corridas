export interface MetricRow {
  event_name: string;
  event_id: string | null;
  session_id: string | null;
  user_id?: string | null;
  source: string | null;
  created_at: string;
  properties?: { utm_source?: string; utm_medium?: string; utm_campaign?: string; referrer?: string } | null;
}
export function summarizeMetrics(rows: MetricRow[], now = new Date()) {
  const count = (kind: string) => rows.filter((r) => r.event_name === kind).length;
  const online = new Set(
    rows
      .filter((r) => r.session_id && Date.parse(r.created_at) > now.getTime() - 300000)
      .map((r) => r.session_id),
  ).size;
  const returning = new Map<string, Set<string>>();
  rows.forEach((r) => {
    if (r.user_id) {
      if (!returning.has(r.user_id)) returning.set(r.user_id, new Set());
      returning
        .get(r.user_id)!
        .add(
          new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
            new Date(r.created_at),
          ),
        );
    }
  });
  return {
    pageViews: count('page_view'),
    views: count('race_view'),
    saves: count('race_save'),
    shares: count('race_share'),
    going: count('going_add'),
    clicks: rows.filter(
      (r) => r.event_name === 'registration_click' && r.source === 'registration_redirect',
    ).length,
    online,
    sessions: new Set(rows.flatMap((r) => (r.session_id ? [r.session_id] : []))).size,
    impressions: count('race_impression'),
    returningUsers: [...returning.values()].filter((days) => days.size > 1).length,
  };
}
