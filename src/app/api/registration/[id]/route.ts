import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/server';
import { isPublicHttpsUrl } from '@/features/events/validation';
import { z } from 'zod';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response('Corrida inválida.', { status: 400 });
  const client = await db();
  if (!client) return new Response('Inscrição indisponível nesta demonstração.', { status: 404 });
  const { data: event } = await client
    .from('events')
    .select('registration_url,status,start_date,end_date,is_demo')
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  if (
    !event ||
    event.is_demo ||
    event.status !== 'published' ||
    Date.parse(event.end_date || event.start_date) < Date.now() ||
    !isPublicHttpsUrl(event.registration_url)
  )
    return new Response('Inscrições indisponíveis.', { status: 410 });
  // Aggregate click is recorded server-side without user/session identifiers.
  // Consented client events carry attribution; dashboards use the server marker for totals.
  await client.rpc('track_event', {
    kind: 'registration_click',
    race_id: id,
    sid: null,
    origin: 'registration_redirect',
    props: {},
  });
  return NextResponse.redirect(event.registration_url, {
    status: 302,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}
