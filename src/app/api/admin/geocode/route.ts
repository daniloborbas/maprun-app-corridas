import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export async function POST(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const body = await request.json().catch(() => null);
  const parts = [body?.address, body?.venue, body?.city, body?.state, 'Brasil']
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  if (!parts.length) return NextResponse.json({ error: 'Informe endereço ou cidade.' }, { status: 400 });
  const query = encodeURIComponent(parts.join(', '));
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=br&q=${query}`, {
    headers: { 'User-Agent': 'MapRun/1.0 (admin geocoding)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return NextResponse.json({ error: 'Serviço de localização indisponível.' }, { status: 502 });
  const results: unknown = await response.json();
  if (!Array.isArray(results) || !results.length) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: results.slice(0, 3).filter(isRecord).map((item) => ({
    displayName: typeof item.display_name === 'string' ? item.display_name : '',
    latitude: Number(item.lat), longitude: Number(item.lon),
  })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) });
}
