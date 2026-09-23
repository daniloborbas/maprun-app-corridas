import type { DeduplicationType } from './deduplication';

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ConfidenceReason =
  | 'trusted_source_A' | 'trusted_source_B' | 'trusted_source_C'
  | 'valid_future_date' | 'valid_location' | 'coordinates_found'
  | 'registration_url_found' | 'organizer_found' | 'image_found'
  | 'specific_name' | 'additional_race_details' | 'possible_duplicate'
  | 'exact_duplicate' | 'geographic_conflict' | 'ambiguous_date' | 'enrichment_error';

export interface DiscoveryConfidenceInput {
  trustLevel?: 'A' | 'B' | 'C';
  hasFutureDate?: boolean;
  hasValidLocation?: boolean;
  hasCoordinates?: boolean;
  hasRegistrationUrl?: boolean;
  hasOrganizer?: boolean;
  hasImage?: boolean;
  hasSpecificName?: boolean;
  hasAdditionalDetails?: boolean;
  deduplication?: DeduplicationType;
  geographicConflict?: boolean;
  ambiguousDate?: boolean;
  enrichmentError?: boolean;
}

export interface DiscoveryConfidenceResult {
  score: number;
  level: ConfidenceLevel;
  reasons: ConfidenceReason[];
}

export function calculateDiscoveryConfidence(input: DiscoveryConfidenceInput): DiscoveryConfidenceResult {
  let score = 0;
  const reasons: ConfidenceReason[] = [];
  const add = (points: number, reason: ConfidenceReason) => { score += points; reasons.push(reason); };
  const trust = input.trustLevel ?? 'C';
  add(trust === 'A' ? 25 : trust === 'B' ? 15 : 5, `trusted_source_${trust}` as ConfidenceReason);
  if (input.hasFutureDate) add(15, 'valid_future_date');
  if (input.hasValidLocation) add(10, 'valid_location');
  if (input.hasCoordinates) add(10, 'coordinates_found');
  if (input.hasRegistrationUrl) add(10, 'registration_url_found');
  if (input.hasOrganizer) add(10, 'organizer_found');
  if (input.hasImage) add(5, 'image_found');
  if (input.hasSpecificName) add(5, 'specific_name');
  if (input.hasAdditionalDetails) add(10, 'additional_race_details');
  if (input.deduplication === 'probable') { score -= 25; reasons.push('possible_duplicate'); }
  if (input.deduplication === 'exact') { score -= 25; reasons.push('exact_duplicate'); }
  if (input.geographicConflict) { score -= 20; reasons.push('geographic_conflict'); }
  if (input.ambiguousDate) { score -= 20; reasons.push('ambiguous_date'); }
  if (input.enrichmentError) { score -= 20; reasons.push('enrichment_error'); }
  score = Math.max(0, Math.min(100, score));
  return { score, level: score >= 90 ? 'high' : score >= 70 ? 'medium' : 'low', reasons };
}
