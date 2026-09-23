import { fetchEventPage, evaluateExtractionCompleteness, type ImportedEventDraft, type ExtractionResult, type ExtractedRaceEvent, type ExtractionConflict } from '@/features/importer/url-import';
import { extractRaceEventWithAi, type AiProviderErrorMetadata } from '@/features/importer/ai-extractor';
import type { DiscoveryQualityStatus, DiscoveredEventCandidate } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { geocodeEventLocation } from '@/features/geocoding/service';
import { calculateDiscoveryConfidence } from './confidence';

export interface EnrichmentResult {
  candidate: Partial<DiscoveredEventCandidate>;
  qualityStatus: DiscoveryQualityStatus;
  past: boolean;
  extraction: Pick<ExtractionResult, 'event'|'fieldSources'|'extractionQuality'|'shouldUseAiFallback'>;
  aiFallback: { attempted: boolean; success: boolean; errorType?: string; errorMetadata?: AiProviderErrorMetadata; usage?: { inputTokens?: number; outputTokens?: number } };
}
export interface AiFallbackOptions { enabled?: boolean; allowCall?: boolean; }

export function qualityForDraft(draft: ImportedEventDraft, autoReadyAllowed = true): DiscoveryQualityStatus {
  if (!draft.name || !draft.startDate || !draft.city || !draft.state) return 'incomplete';
  return autoReadyAllowed ? 'ready' : 'incomplete';
}

export async function enrichDiscoveredEvent(candidate: DiscoveredEventCandidate, autoReadyAllowed = true, client?: SupabaseClient, trustLevel: 'A'|'B'|'C' = 'C', aiOptions: AiFallbackOptions = {}): Promise<EnrichmentResult> {
  const draft = await fetchEventPage(candidate.source_url);
  // The fetch result remains the source of truth; this metadata is exposed to the
  // pipeline so a future AI fallback can be gated without changing persistence.
  let extraction = draft.extraction ?? extractEventExtractionFromDraft(draft);
  let aiFallback: EnrichmentResult['aiFallback'] = { attempted: false, success: false };
  if (aiOptions.enabled === true && aiOptions.allowCall !== false && extraction.shouldUseAiFallback && draft.extraction?.relevantPageText) {
    aiFallback = { attempted: true, success: false };
    const aiResult = await extractRaceEventWithAi({ sourceUrl: candidate.source_url, pageText: draft.extraction.relevantPageText, deterministicEvent: extraction.event, deterministicFieldSources: extraction.fieldSources });
    if (aiResult.ok) {
      aiFallback = { attempted: true, success: true, usage: aiResult.result.usage };
      const merged = mergeAiExtraction(draft, extraction, aiResult.result.event, aiResult.result.conflicts);
      draft.name=merged.draft.name; draft.startDate=merged.draft.startDate; draft.startTime=merged.draft.startTime; draft.city=merged.draft.city; draft.state=merged.draft.state; draft.venue=merged.draft.venue; draft.address=merged.draft.address; draft.distances=merged.draft.distances; draft.priceFrom=merged.draft.priceFrom; draft.organizerName=merged.draft.organizerName; draft.registrationUrl=merged.draft.registrationUrl; draft.coverImageUrl=merged.draft.coverImageUrl;
      extraction = merged.extraction;
    } else { aiFallback.errorType = aiResult.error; aiFallback.errorMetadata = aiResult.metadata; }
  }
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
    aiFallback,
  };
}

export function mergeAiExtraction(draft: ImportedEventDraft, deterministic: Pick<ExtractionResult, 'event'|'fieldSources'|'extractionQuality'|'shouldUseAiFallback'>, ai: ExtractedRaceEvent, conflicts: ExtractionConflict[] = []) {
  const value = <T>(current: T|null|undefined, next: T|null|undefined): T|null|undefined => current === null || current === undefined || current === '' ? next : current;
  const mergedDraft: ImportedEventDraft = { ...draft, name: value(draft.name, ai.name) || '', startDate: value(draft.startDate, ai.date) ?? null, startTime: value(draft.startTime, ai.startTime) || '', city: value(draft.city, ai.city) || '', state: value(draft.state, ai.state) || '', venue: value(draft.venue, ai.venue) || '', address: value(draft.address, ai.address) || '', distances: draft.distances.length ? draft.distances : ai.distances.map(label => ({label,distance_km: Number.parseFloat(label.replace(',','.')) || null,category:'rua'})), priceFrom: value(draft.priceFrom, ai.price ? Number.parseFloat(ai.price.replace(',','.')) : null) ?? null, organizerName: value(draft.organizerName, ai.organizerName) || '', registrationUrl: value(draft.registrationUrl, ai.registrationUrl) || '', coverImageUrl: value(draft.coverImageUrl, ai.coverImageUrl) || '' };
  const event: ExtractedRaceEvent = { name:mergedDraft.name||null,date:mergedDraft.startDate,startTime:mergedDraft.startTime||null,city:mergedDraft.city||null,state:mergedDraft.state||null,venue:mergedDraft.venue||null,address:mergedDraft.address||null,distances:mergedDraft.distances.map(item=>item.label),price:mergedDraft.priceFrom===null?null:String(mergedDraft.priceFrom),organizerName:mergedDraft.organizerName||null,registrationUrl:mergedDraft.registrationUrl||null,coverImageUrl:mergedDraft.coverImageUrl||null };
  const quality=evaluateExtractionCompleteness(event, conflicts);
  return { draft:mergedDraft, extraction: { event, fieldSources: { ...deterministic.fieldSources, ...Object.fromEntries(Object.keys(ai).filter(key => !deterministic.event[key as keyof ExtractedRaceEvent]).map(key => [key === 'date' ? 'startDate' : key, 'ai'])) }, extractionQuality:quality, shouldUseAiFallback:quality.status === 'insufficient' || quality.conflicts.length > 0 } };
}

function extractEventExtractionFromDraft(draft: ImportedEventDraft): Pick<ExtractionResult, 'event'|'fieldSources'|'extractionQuality'|'shouldUseAiFallback'> {
  const event = { name: draft.name || null, date: draft.startDate, startTime: draft.startTime || null, city: draft.city || null, state: draft.state || null, venue: draft.venue || null, address: draft.address || null, distances: draft.distances.map(item => item.label), price: draft.priceFrom === null ? null : String(draft.priceFrom), organizerName: draft.organizerName || null, registrationUrl: draft.registrationUrl || null, coverImageUrl: draft.coverImageUrl || null };
  const missingEssentialFields = (['name','date','city','state'] as const).filter(field => !event[field]);
  const missingImportantFields = (['distances','registrationUrl','organizerName','venue','coverImageUrl'] as const).filter(field => { const value=event[field]; return !value || (Array.isArray(value) && value.length===0); });
  const extractionQuality = { status: missingEssentialFields.length ? 'insufficient' as const : missingImportantFields.length >= 3 ? 'partial' as const : 'complete' as const, missingEssentialFields: missingEssentialFields.map(field => field === 'date' ? 'startDate' as const : field), missingImportantFields, conflicts: [] };
  return { event, fieldSources: {}, extractionQuality, shouldUseAiFallback: extractionQuality.status === 'insufficient' };
}
