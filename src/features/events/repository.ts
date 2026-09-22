import 'server-only';
import { db } from '@/lib/supabase/server';
import { demoMode } from '@/lib/config';
import { demoEvents } from './fixtures';
import type { RaceEvent } from './types';
const selection = '*, event_distances(*), event_sources(source_name,source_url,import_method,last_verified_at)';
function normalizeRecord(row: RaceEvent & { is_demo?: boolean }): RaceEvent {
  return {
    ...row,
    demo: row.is_demo === true,
    event_distances: [...row.event_distances].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
  };
}
export async function listEvents(): Promise<RaceEvent[]> {
  const client = await db();
  if (!client) return demoMode ? demoEvents : [];
  const { data, error } = await client
    .from('events')
    .select(selection)
    .in('status', ['published', 'cancelled', 'finished'])
    .is('deleted_at', null)
    .order('start_date');
  if (error) throw new Error('Não foi possível carregar as corridas. Tente novamente.');
  return (data as (RaceEvent & { is_demo?: boolean })[]).map(normalizeRecord);
}
export async function getEventBySlug(slug: string): Promise<RaceEvent | null> {
  const client = await db();
  if (!client) return demoMode ? demoEvents.find((e) => e.slug === slug) || null : null;
  const { data, error } = await client
    .from('events')
    .select(selection)
    .eq('slug', slug)
    .in('status', ['published', 'cancelled', 'finished'])
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error('Não foi possível carregar a corrida.');
  return data ? normalizeRecord(data as RaceEvent & { is_demo?: boolean }) : null;
}
