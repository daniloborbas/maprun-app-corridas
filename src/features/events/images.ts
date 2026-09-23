import type { RaceEvent } from './types';

const FALLBACKS = ['/images/runners.jpg', '/images/road.jpg', '/images/mountains.jpg', '/images/mantiqueira-run.png'] as const;

function validUrl(value: unknown): value is string {
  if (typeof value !== 'string' || (!/^https?:\/\//i.test(value) && !value.startsWith('/api/events/cover'))) return false;
  const text = value.trim().toLowerCase();
  return text.length > 0 && !['[object object]', 'undefined', 'null'].includes(text);
}

function stableIndex(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % FALLBACKS.length;
}

export function resolveEventImage(event: Pick<RaceEvent, 'id' | 'slug' | 'name' | 'event_category' | 'cover_image_url' | 'cover_image_source' | 'has_usable_official_image'>): string {
  if (validUrl(event.cover_image_url) && (event.cover_image_source === 'official' || event.cover_image_source === 'generated' || (!event.cover_image_source && event.has_usable_official_image !== false))) return event.cover_image_url;
  return resolveEventFallbackImage(event);
}

export function resolveEventFallbackImage(event: Pick<RaceEvent, 'id' | 'slug' | 'name' | 'event_category'>): string {
  const text = `${event.name} ${event.event_category}`.toLowerCase();
  if (/trail|montanha/.test(text)) return FALLBACKS[2];
  if (/night|noturna/.test(text)) return FALLBACKS[1];
  return FALLBACKS[stableIndex(event.id || event.slug || event.name)];
}

export function buildGeneratedCoverUrl(input: { slug: string; name: string; city?: string; state?: string; category?: string; distances?: string[] }): string {
  const query = new URLSearchParams({ slug: input.slug, name: input.name, city: input.city || '', state: input.state || '', category: input.category || 'rua', distances: (input.distances || []).join(', ') });
  return `/api/events/cover?${query.toString()}`;
}

export const eventFallbackImages = FALLBACKS;
