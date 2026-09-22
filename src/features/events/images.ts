import type { RaceEvent } from './types';

const FALLBACKS = ['/images/runners.jpg', '/images/road.jpg', '/images/mantiqueira-run.png'] as const;

function validUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  const text = value.trim().toLowerCase();
  return text.length > 0 && !['[object object]', 'undefined', 'null'].includes(text);
}

function stableIndex(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % FALLBACKS.length;
}

export function resolveEventImage(event: Pick<RaceEvent, 'id' | 'slug' | 'name' | 'event_category' | 'cover_image_url' | 'has_usable_official_image'>): string {
  if (validUrl(event.cover_image_url) && event.has_usable_official_image !== false) return event.cover_image_url;
  const text = `${event.name} ${event.event_category}`.toLowerCase();
  if (/trail|montanha/.test(text)) return FALLBACKS[2];
  if (/night|noturna/.test(text)) return FALLBACKS[1];
  return FALLBACKS[stableIndex(event.id || event.slug || event.name)];
}

export const eventFallbackImages = FALLBACKS;
