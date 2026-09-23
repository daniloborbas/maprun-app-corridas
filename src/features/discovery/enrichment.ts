import { fetchEventPage, type ImportedEventDraft } from '@/features/importer/url-import';
import type { DiscoveryQualityStatus, DiscoveredEventCandidate } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { geocodeEventLocation } from '@/features/geocoding/service';

export interface EnrichmentResult {
  candidate: Partial<DiscoveredEventCandidate>;
  qualityStatus: DiscoveryQualityStatus;
  past: boolean;
}

export function qualityForDraft(draft: ImportedEventDraft, autoReadyAllowed = true): DiscoveryQualityStatus {
  if (!draft.name || !draft.startDate || !draft.city || !draft.state) return 'incomplete';
  return autoReadyAllowed ? 'ready' : 'incomplete';
}

export async function enrichDiscoveredEvent(candidate: DiscoveredEventCandidate, autoReadyAllowed = true, client?: SupabaseClient): Promise<EnrichmentResult> {
  const draft = await fetchEventPage(candidate.source_url);
  const past = Boolean(draft.startDate && Date.parse(draft.startDate) < Date.now());
  const coordinates = !candidate.latitude && !candidate.longitude && draft.city && draft.state ? await geocodeEventLocation({ address: draft.address, venue: draft.venue, city: draft.city, state: draft.state }, { client }) : null;
  return {
    candidate: {
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
    },
    qualityStatus: qualityForDraft(draft, autoReadyAllowed),
    past,
  };
}
