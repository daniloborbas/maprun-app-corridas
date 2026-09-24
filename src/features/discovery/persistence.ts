import type { DiscoveredEventCandidate } from './types';

/** Maps the in-memory candidate to the public.discovered_events whitelist. */
export function toDiscoveredEventInsert(candidate: DiscoveredEventCandidate, qualityStatus: 'ready' | 'incomplete' | 'conflict') {
  return {
    ...(candidate.id ? { id: candidate.id } : {}),
    source_id: candidate.source_id,
    source_url: candidate.source_url,
    external_id: candidate.external_id ?? null,
    name: candidate.name,
    raw_title: candidate.raw_title ?? null,
    event_date: candidate.event_date ?? null,
    city: candidate.city ?? null,
    state: candidate.state ?? null,
    latitude: candidate.latitude ?? null,
    longitude: candidate.longitude ?? null,
    organizer_name: candidate.organizer_name ?? null,
    registration_url: candidate.registration_url ?? null,
    cover_image_url: candidate.cover_image_url ?? null,
    status: candidate.status,
    duplicate_event_id: candidate.duplicate_event_id ?? null,
    discovered_at: candidate.discovered_at ?? undefined,
    enriched_at: candidate.enriched_at ?? null,
    quality_status: qualityStatus,
    confidence_score: candidate.confidence_score ?? null,
    confidence_reasons: candidate.confidence_reasons ?? null,
  };
}
