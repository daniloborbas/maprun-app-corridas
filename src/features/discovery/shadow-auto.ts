import { classifyRegistrationUrlSemantic } from '@/features/events/registration';
export type SemanticReadiness = 'SAFE_READY' | 'NEEDS_DATA_FIX' | 'REAL_CONFLICT' | 'OPERATIONAL_FAILURE';
export interface ShadowCandidate { researchConfidence: number | null; factualConfidence?: number | null; contentQualityScore: number | null; event: { name?: string|null; date?: string|null; city?: string|null; state?: string|null; distances?: string[]; registrationUrl?: string|null }; conflicts?: Array<{ severity?: string; field?: string }>; unsupportedClaims?: string[]; editorialMismatch?: boolean; persistenceStatus?: string; researchFailed?: boolean; }
export interface ShadowEvaluation { actualAutoEligible: boolean; shadow90: boolean; shadow80: boolean; shadow75: boolean; shadow72: boolean; semanticReadiness: SemanticReadiness; blockingReasons: string[]; }
export const SHADOW_THRESHOLDS = [90, 80, 75, 72] as const;
export function evaluateShadowAutoPublishEligibility(candidate: ShadowCandidate, threshold: number): boolean {
  const reasons = shadowBlockingReasons(candidate);
  return reasons.length === 0 && (candidate.researchConfidence ?? 0) >= threshold;
}
export function shadowBlockingReasons(candidate: ShadowCandidate): string[] {
  const event = candidate.event || {}; const reasons: string[] = [];
  if (!event.name?.trim()) reasons.push('missing_name');
  if (!event.date) reasons.push('missing_date');
  if (!event.city) reasons.push('missing_city');
  if (!event.state) reasons.push('missing_state');
  if (!event.distances?.length) reasons.push('missing_distance');
  const registration = classifyRegistrationUrlSemantic(event.registrationUrl || '');
  if (!['valid_registration', 'probable_registration'].includes(registration)) reasons.push('invalid_registration_url');
  if (candidate.conflicts?.some((item) => item.severity === 'high')) reasons.push('critical_conflict');
  if (candidate.unsupportedClaims?.length) reasons.push('unsupported_factual_claim');
  if (candidate.editorialMismatch) reasons.push('editorial_mismatch');
  if (candidate.persistenceStatus === 'stale_result' || candidate.persistenceStatus === 'persistence_mismatch') reasons.push('stale_result');
  if (candidate.researchFailed) reasons.push('research_failed');
  if ((candidate.contentQualityScore ?? 0) < 70) reasons.push('low_content_quality');
  return [...new Set(reasons)];
}
export function classifySemanticReadiness(candidate: ShadowCandidate): SemanticReadiness {
  if (candidate.researchFailed || candidate.persistenceStatus === 'not_persisted' || candidate.persistenceStatus === 'stale_result') return 'OPERATIONAL_FAILURE';
  const reasons = shadowBlockingReasons(candidate);
  if (reasons.includes('critical_conflict')) return 'REAL_CONFLICT';
  return reasons.length ? 'NEEDS_DATA_FIX' : 'SAFE_READY';
}
export function evaluateShadowCandidate(candidate: ShadowCandidate): ShadowEvaluation {
  const semanticReadiness = classifySemanticReadiness(candidate); const blockingReasons = shadowBlockingReasons(candidate);
  return { actualAutoEligible: evaluateShadowAutoPublishEligibility(candidate, 90), shadow90: evaluateShadowAutoPublishEligibility(candidate, 90), shadow80: evaluateShadowAutoPublishEligibility(candidate, 80), shadow75: evaluateShadowAutoPublishEligibility(candidate, 75), shadow72: evaluateShadowAutoPublishEligibility(candidate, 72), semanticReadiness, blockingReasons };
}
