import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { geocodeEventLocation } from '@/features/geocoding/service';
export async function POST(request: Request) {
  let access; try { access = await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const body = await request.json().catch(() => null);
  const result = await geocodeEventLocation({ address: body?.address, venue: body?.venue, city: body?.city, state: body?.state }, { client: access.client });
  if (!result) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: [{ displayName: 'Localização encontrada', latitude: result.latitude, longitude: result.longitude }], approximate: result.precision === 'city', precision: result.precision, provider: result.provider });
}
