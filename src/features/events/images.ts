import type { RaceEvent } from './types';
import { EVENT_FALLBACK_IMAGES, FALLBACK_EMERGENCY_IMAGE } from './fallback-images';

const FALLBACKS = EVENT_FALLBACK_IMAGES.map((item) => item.src) as readonly string[];

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

export function resolveEventImage(event: Pick<RaceEvent, 'id' | 'slug' | 'name' | 'event_category' | 'cover_image_url' | 'cover_image_source' | 'has_usable_official_image' | 'fallback_image_key'>): string {
  if (validUrl(event.cover_image_url) && (event.cover_image_source === 'official' || event.cover_image_source === 'generated' || (!event.cover_image_source && event.has_usable_official_image !== false))) return event.cover_image_url;
  if (event.cover_image_source === 'fallback' && event.fallback_image_key) {
    const manual = EVENT_FALLBACK_IMAGES.find((item) => item.key === event.fallback_image_key);
    if (manual) return manual.src;
  }
  return resolveEventFallbackImage(event);
}

export function resolveEventFallbackImage(event: Pick<RaceEvent, 'id' | 'slug' | 'name' | 'event_category'> & Partial<Pick<RaceEvent, 'city' | 'state' | 'venue' | 'description' | 'start_date'>>): string {
  const text = `${event.name} ${event.event_category} ${event.city || ''} ${event.state || ''} ${event.venue || ''} ${event.description || ''}`.toLowerCase();
  const terrain = /trail|montanha|serra|trilha|mata/.test(text) ? 'trail' : /night|noturna/.test(text) ? 'night' : /parque|lago|bosque/.test(text) ? 'park' : /praia|orla|litoral/.test(text) ? 'coastal' : /rural|fazenda|estrada/.test(text) ? 'rural' : 'general';
  const candidates = EVENT_FALLBACK_IMAGES.filter((item) => item.terrains.includes(terrain) || terrain === 'general' && item.terrains.includes('general'));
  const pool = candidates.length ? candidates : EVENT_FALLBACK_IMAGES;
  return pool[stableIndex(event.id || event.slug || event.name) % pool.length]?.src || FALLBACK_EMERGENCY_IMAGE;
}

export function buildGeneratedCoverUrl(input: { slug: string; name: string; city?: string; state?: string; category?: string; distances?: string[] }): string {
  const query = new URLSearchParams({ slug: input.slug, name: input.name, city: input.city || '', state: input.state || '', category: input.category || 'rua', distances: (input.distances || []).join(', ') });
  return `/api/events/cover?${query.toString()}`;
}

export const eventFallbackImages = FALLBACKS;
