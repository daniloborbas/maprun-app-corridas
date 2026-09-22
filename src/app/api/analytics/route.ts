import { NextResponse } from 'next/server';
import { analyticsSchema } from '@/features/analytics/schema';
import { db } from '@/lib/supabase/server';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const text = await request.text();
  if (text.length > 4096) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = analyticsSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  const client = await db();
  if (!client) return new Response(null, { status: 204 });
  const { kind, eventId, sessionId, source, properties } = parsed.data;
  const { error } = await client.rpc('track_event', {
    kind,
    race_id: eventId || null,
    sid: sessionId,
    origin: source,
    props: properties || {},
  });
  return error
    ? NextResponse.json({ error: 'Não foi possível registrar.' }, { status: 503 })
    : new Response(null, { status: 204 });
}
