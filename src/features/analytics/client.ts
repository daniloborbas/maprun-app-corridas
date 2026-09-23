import type { AnalyticsKind } from './schema';
export function trackAnalyticsEvent(
  kind: AnalyticsKind,
  eventId?: string,
  properties?: Record<string, string | number>,
) {
  if (typeof window === 'undefined' || localStorage.getItem('maprun.analytics') !== 'yes') return;
  let sessionId = sessionStorage.getItem('maprun.session');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('maprun.session', sessionId);
  }
  let visitorId = localStorage.getItem('maprun.visitor');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('maprun.visitor', visitorId);
  }
  const params = new URLSearchParams(location.search);
  const acquisition: Record<string, string> = { visitor_id: visitorId };
  ['utm_source', 'utm_medium', 'utm_campaign', 'ref'].forEach((k) => {
    const v = params.get(k);
    if (v) acquisition[k] = v.slice(0, 150);
  });
  if (Object.keys(acquisition).length)
    sessionStorage.setItem('maprun.acquisition', JSON.stringify(acquisition));
  let stored = {};
  try {
    stored = JSON.parse(sessionStorage.getItem('maprun.acquisition') || '{}');
  } catch {
    /* Ignore corrupt attribution. */
  }
  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      eventId,
      sessionId,
      source: location.pathname.slice(0, 200),
      properties: { ...stored, referrer: document.referrer.slice(0, 500), ...properties },
    }),
    keepalive: true,
  }).catch(() => {});
}
