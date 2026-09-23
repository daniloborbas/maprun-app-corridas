import { fetchEventPage, type ImportedEventDraft } from '@/features/importer/url-import';
import type { DiscoveryQualityStatus, DiscoveredEventCandidate } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { geocodeEventLocation } from '@/features/geocoding/service';
import { calculateDiscoveryConfidence } from './confidence';

export interface EnrichmentResult {
  candidate: Partial<DiscoveredEventCandidate>;
  qualityStatus: DiscoveryQualityStatus;
  past: boolean;
}

export function qualityForDraft(draft: ImportedEventDraft, autoReadyAllowed = true): DiscoveryQualityStatus {
  if (!draft.name || !draft.startDate || !draft.city || !draft.state) return 'incomplete';
  return autoReadyAllowed ? 'ready' : 'incomplete';
}

export async function enrichDiscoveredEvent(candidate: DiscoveredEventCandidate, autoReadyAllowed = true, client?: SupabaseClient, trustLevel: 'A'|'B'|'C' = 'C'): Promise<EnrichmentResult> {
  const draft = await fetchEventPage(candidate.source_url);
  const past = Boolean(draft.startDate && Date.parse(draft.startDate) < Date.now());
  const coordinates = !candidate.latitude && !candidate.longitude && draft.city && draft.state ? await geocodeEventLocation({ address: draft.address, venue: draft.venue, city: draft.city, state: draft.state }, { client }) : null;
  const enriched = {
    name: draft.name || candidate.name,
    event_date: draft.startDate,
    city: draft.city || null,
    state: draft.state || null,
    latitude: coordinates?.latitude ?? candidate.latitude ?? null,
    longitude: coordinates?.longitude ?? candidate.longitude ?? null,
    organizer_name: draft.organizerName || null,
    registration_url: draft.registrationUrl || null,
    cover_image_url: draft.coverImageUrl || null,
    raw_title: draft.name || candidate.raw_title || null,
    enriched_at: new Date().toISOString(),
  };
  const confidence = calculateDiscoveryConfidence({
    trustLevel,
    hasFutureDate: Boolean(draft.startDate && !past),
    hasValidLocation: Boolean(draft.city && draft.state),
    hasCoordinates: Boolean(enriched.latitude && enriched.longitude),
    hasRegistrationUrl: Boolean(draft.registrationUrl),
    hasOrganizer: Boolean(draft.organizerName),
    hasImage: Boolean(draft.coverImageUrl),
    hasSpecificName: Boolean(draft.name && draft.name.trim().length >= 8),
    hasAdditionalDetails: Boolean(draft.distances.length || draft.venue),
  });
  return {
    candidate: { ...enriched, confidence_score: confidence.score, confidence_reasons: confidence.reasons },
    qualityStatus: qualityForDraft(draft, autoReadyAllowed),
    past,
  };
}
