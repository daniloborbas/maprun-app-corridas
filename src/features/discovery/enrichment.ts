import { fetchEventPage, type ImportedEventDraft, type ExtractionResult } from '@/features/importer/url-import';
import type { DiscoveryQualityStatus, DiscoveredEventCandidate } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { geocodeEventLocation } from '@/features/geocoding/service';
import { calculateDiscoveryConfidence } from './confidence';

export interface EnrichmentResult {
  candidate: Partial<DiscoveredEventCandidate>;
  qualityStatus: DiscoveryQualityStatus;
  past: boolean;
  extraction: Pick<ExtractionResult, 'event'|'fieldSources'|'extractionQuality'|'shouldUseAiFallback'>;
}

export function qualityForDraft(draft: ImportedEventDraft, autoReadyAllowed = true): DiscoveryQualityStatus {
  if (!draft.name || !draft.startDate || !draft.city || !draft.state) return 'incomplete';
  return autoReadyAllowed ? 'ready' : 'incomplete';
}

export async function enrichDiscoveredEvent(candidate: DiscoveredEventCandidate, autoReadyAllowed = true, client?: SupabaseClient, trustLevel: 'A'|'B'|'C' = 'C'): Promise<EnrichmentResult> {
  const draft = await fetchEventPage(candidate.source_url);
  // The fetch result remains the source of truth; this metadata is exposed to the
  // pipeline so a future AI fallback can be gated without changing persistence.
  const extraction = draft.extraction ?? extractEventExtractionFromDraft(draft);
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
    extraction,
  };
}

function extractEventExtractionFromDraft(draft: ImportedEventDraft): Pick<ExtractionResult, 'event'|'fieldSources'|'extractionQuality'|'shouldUseAiFallback'> {
  const event = { name: draft.name || null, date: draft.startDate, startTime: draft.startTime || null, city: draft.city || null, state: draft.state || null, venue: draft.venue || null, address: draft.address || null, distances: draft.distances.map(item => item.label), price: draft.priceFrom === null ? null : String(draft.priceFrom), organizerName: draft.organizerName || null, registrationUrl: draft.registrationUrl || null, coverImageUrl: draft.coverImageUrl || null };
  const missingEssentialFields = (['name','date','city','state'] as const).filter(field => !event[field]);
  const missingImportantFields = (['distances','registrationUrl','organizerName','venue','coverImageUrl'] as const).filter(field => { const value=event[field]; return !value || (Array.isArray(value) && value.length===0); });
  const extractionQuality = { status: missingEssentialFields.length ? 'insufficient' as const : missingImportantFields.length >= 3 ? 'partial' as const : 'complete' as const, missingEssentialFields: missingEssentialFields.map(field => field === 'date' ? 'startDate' as const : field), missingImportantFields, conflicts: [] };
  return { event, fieldSources: {}, extractionQuality, shouldUseAiFallback: extractionQuality.status === 'insufficient' };
}
