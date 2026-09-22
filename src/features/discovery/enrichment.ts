import { fetchEventPage, type ImportedEventDraft } from '@/features/importer/url-import';
import type { DiscoveryQualityStatus, DiscoveredEventCandidate } from './types';

export interface EnrichmentResult {
  candidate: Partial<DiscoveredEventCandidate>;
  qualityStatus: DiscoveryQualityStatus;
  past: boolean;
}

export function qualityForDraft(draft: ImportedEventDraft): DiscoveryQualityStatus {
  if (!draft.name || !draft.startDate || !draft.city || !draft.state) return 'incomplete';
  return 'ready';
}

export async function enrichDiscoveredEvent(candidate: DiscoveredEventCandidate): Promise<EnrichmentResult> {
  const draft = await fetchEventPage(candidate.source_url);
  const past = Boolean(draft.startDate && Date.parse(draft.startDate) < Date.now());
  return {
    candidate: {
      name: draft.name || candidate.name,
      event_date: draft.startDate,
      city: draft.city || null,
      state: draft.state || null,
      organizer_name: draft.organizerName || null,
      registration_url: draft.registrationUrl || null,
      cover_image_url: draft.coverImageUrl || null,
      raw_title: draft.name || candidate.raw_title || null,
      enriched_at: new Date().toISOString(),
    },
    qualityStatus: qualityForDraft(draft),
    past,
  };
}
