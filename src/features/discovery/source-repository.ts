import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/server';
import type { DiscoverySource } from './types';
import { buildSourceFailureUpdate, buildSourceSuccessUpdate, DEFAULT_CRAWL_FREQUENCY_MINUTES } from './source-scheduling';

function sourceIsActive(source: DiscoverySource) {
  return source.is_active ?? source.active;
}

export async function listActiveDiscoverySources(client?: SupabaseClient): Promise<DiscoverySource[]> {
  const connection = client ?? await db();
  if (!connection) return [];
  const { data, error } = await connection.from('discovery_sources').select('*').eq('is_active', true).order('name');
  if (error) throw new Error('Não foi possível carregar as fontes monitoradas.');
  return (data || []).filter((source) => sourceIsActive(source as DiscoverySource)) as DiscoverySource[];
}

export async function listSourcesReadyForCrawl(now = new Date(), client?: SupabaseClient): Promise<DiscoverySource[]> {
  const connection = client ?? await db();
  if (!connection) return [];
  const { data, error } = await connection
    .from('discovery_sources')
    .select('*')
    .eq('is_active', true)
    .or(`next_crawl_at.is.null,next_crawl_at.lte.${now.toISOString()}`)
    .order('next_crawl_at', { nullsFirst: true });
  if (error) throw new Error('Não foi possível carregar as fontes prontas para coleta.');
  return (data || []).filter((source) => sourceIsActive(source as DiscoverySource)) as DiscoverySource[];
}

export async function recordDiscoverySourceSuccess(source: DiscoverySource, now = new Date(), client?: SupabaseClient) {
  const connection = client ?? await db();
  if (!connection) return;
  const { error } = await connection.from('discovery_sources').update(
    buildSourceSuccessUpdate(now, source.crawl_frequency_minutes ?? DEFAULT_CRAWL_FREQUENCY_MINUTES),
  ).eq('id', source.id);
  if (error) throw new Error('Não foi possível registrar o sucesso da fonte.');
}

export async function recordDiscoverySourceFailure(source: DiscoverySource, now = new Date(), client?: SupabaseClient) {
  const connection = client ?? await db();
  if (!connection) return;
  const { error } = await connection.from('discovery_sources').update(
    buildSourceFailureUpdate(now, source.crawl_frequency_minutes ?? DEFAULT_CRAWL_FREQUENCY_MINUTES, source.consecutive_failures ?? 0),
  ).eq('id', source.id);
  if (error) throw new Error('Não foi possível registrar a falha da fonte.');
}
