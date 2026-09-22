import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const stateToUf: Record<string, string> = { 'minas gerais': 'MG', 'são paulo': 'SP', 'rio de janeiro': 'RJ', 'paraná': 'PR', 'santa catarina': 'SC', 'rio grande do sul': 'RS' };
function clean(value: unknown) { return typeof value === 'string' ? value.trim().replace(/[\[\]{}]/g, '') : ''; }

export async function POST(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const body = await request.json().catch(() => null);
  const address = clean(body?.address), venue = clean(body?.venue), city = clean(body?.city), rawState = clean(body?.state);
  const state = stateToUf[rawState.toLowerCase()] || rawState.toUpperCase();
  const queries = [[address, venue, city, state, 'Brasil'], [venue, city, state, 'Brasil'], [city, state, 'Brasil']]
    .map((parts) => parts.filter(Boolean).join(', ')).filter(Boolean);
  if (!queries.length) return NextResponse.json({ error: 'Informe endereço ou cidade.' }, { status: 400 });
  for (const query of queries) {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=br&q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'MapRun/1.0 (admin geocoding)' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return NextResponse.json({ error: 'Serviço de localização indisponível.' }, { status: 502 });
    const results: unknown = await response.json();
    const valid = Array.isArray(results) ? results.slice(0, 3).filter(isRecord).map((item) => ({ displayName: typeof item.display_name === 'string' ? item.display_name : '', latitude: Number(item.lat), longitude: Number(item.lon) })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && !(item.latitude === 0 && item.longitude === 0)) : [];
    if (valid.length) return NextResponse.json({ results: valid, approximate: query === queries.at(-1) });
  }
  return NextResponse.json({ results: [] });
}
