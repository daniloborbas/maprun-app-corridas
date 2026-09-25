import 'server-only';
import type { ExtractedRaceEvent } from '@/features/importer/url-import';
import { contentQualityScore, researchAndEnrichCandidate, shouldResearchEvent, type RaceResearchProvider, type ResearchInput } from './research';
import { claimCandidateForAdminReprocess, listCandidatesForDryRun, markCandidateProcessing } from './candidate-repository';
import { processDiscoveryCandidate, type CandidateProcessorDependencies } from './candidate-processor';
import type { DiscoveryCandidate } from './candidate-types';

export type EligibilityRejectionReason = 'missing_name'|'missing_date'|'past_event'|'missing_city'|'missing_state'|'missing_distance'|'critical_conflict'|'low_research_confidence'|'low_content_quality'|'source_identity_uncertain'|'research_failed'|'research_skipped_budget';
export interface AutoPublishEligibility { eligible: boolean; rejectionReasons: EligibilityRejectionReason[]; }
export interface DiscoveryDryRunItem { candidateId: string; sourceId: string; url: string; dryRunExecutionId: string; evaluatedAt: string; persistenceStatus: 'persisted'|'not_persisted'|'stale_result'; persistedUpdatedAt: string|null; extractionStatus?: string; researchExecuted: boolean; researchStatus?: string; deterministicFields: ExtractedRaceEvent|null; enrichedFields: ExtractedRaceEvent|null; missingFields: string[]; conflicts: unknown[]; researchConfidence: number|null; contentQualityScore: number; shortDescription: string; longDescription: string; sourcesCount: number; sourceTypes: string[]; durationMs: number; estimatedAutoPublishEligibility: boolean; rejectionReasons: EligibilityRejectionReason[]; }
export interface DiscoveryDryRunOptions extends CandidateProcessorDependencies { sourceIds?: string[]; candidateIds?: string[]; limit?: number; enableResearch?: boolean; researchLimit?: number; concurrency?: number; researchProvider?: RaceResearchProvider; allowReprocessExtracted?: boolean; dryRunExecutionId?: string; executionStartedAt?: string; }
export const DRY_RUN_DEFAULTS = { limit: 10, researchLimit: 5, concurrency: 2, minResearchConfidence: 80, minContentQualityScore: 70 } as const;

export function evaluateAutoPublishEligibility(event: ExtractedRaceEvent, options: { now?: Date; researchConfidence?: number|null; contentQualityScore?: number; conflicts?: { severity?: string; field?: string }[]; researchRequired?: boolean; researchFailed?: boolean; unsupportedEditorialClaim?: boolean; criticalConflictInEditorial?: boolean } = {}): AutoPublishEligibility {
  const reasons: EligibilityRejectionReason[] = [];
  if (!event.name?.trim()) reasons.push('missing_name');
  if (!event.date) reasons.push('missing_date');
  else if (Date.parse(`${event.date.slice(0, 10)}T23:59:59Z`) < (options.now || new Date()).getTime()) reasons.push('past_event');
  if (!event.city) reasons.push('missing_city');
  if (!event.state) reasons.push('missing_state');
  if (!event.distances.length) reasons.push('missing_distance');
  if (options.conflicts?.some((conflict) => conflict.severity === 'high')) reasons.push('critical_conflict');
  if (options.unsupportedEditorialClaim || options.criticalConflictInEditorial) reasons.push('critical_conflict');
  if (options.researchFailed) reasons.push('research_failed');
  if (options.researchRequired && (options.researchConfidence ?? 0) < DRY_RUN_DEFAULTS.minResearchConfidence) reasons.push('low_research_confidence');
  if ((options.contentQualityScore ?? contentQualityScore(event)) < DRY_RUN_DEFAULTS.minContentQualityScore) reasons.push('low_content_quality');
  return { eligible: reasons.length === 0, rejectionReasons: reasons };
}

function emptyItem(candidate: DiscoveryCandidate, started: number, dryRunExecutionId: string): DiscoveryDryRunItem { return { candidateId: candidate.id, sourceId: candidate.source_id, url: candidate.url, dryRunExecutionId, evaluatedAt: new Date().toISOString(), persistenceStatus: 'not_persisted', persistedUpdatedAt: null, researchExecuted: false, deterministicFields: null, enrichedFields: null, missingFields: [], conflicts: [], researchConfidence: null, contentQualityScore: 0, shortDescription: '', longDescription: '', sourcesCount: 0, sourceTypes: [], durationMs: Date.now() - started, estimatedAutoPublishEligibility: false, rejectionReasons: ['research_failed'] }; }

export async function runDiscoveryDryRun(options: DiscoveryDryRunOptions = {}) {
  const dryRunExecutionId = options.dryRunExecutionId || crypto.randomUUID();
  const executionStartedAt = options.executionStartedAt || new Date().toISOString();
  const started = Date.now();
  const limit = options.limit ?? DRY_RUN_DEFAULTS.limit;
  const researchLimit = options.researchLimit ?? DRY_RUN_DEFAULTS.researchLimit;
  const concurrency = Math.max(1, options.concurrency ?? DRY_RUN_DEFAULTS.concurrency);
  const candidates = await listCandidatesForDryRun({ candidateIds: options.candidateIds, sourceIds: options.sourceIds, limit, allowReprocessExtracted: options.allowReprocessExtracted }, options.client);
  const claimed: DiscoveryCandidate[] = [];
  for (const candidate of candidates) { const result = candidate.status === 'extracted' && options.allowReprocessExtracted ? await claimCandidateForAdminReprocess(candidate.id, options.client) : await markCandidateProcessing(candidate.id, options.client); if (result) claimed.push(result); }
  const items: DiscoveryDryRunItem[] = [];
  let cursor = 0;
  let researchUsed = 0;
  let researchRequired = 0;
  let researchSucceeded = 0;
  let researchFailed = 0;
  async function worker() {
    while (cursor < claimed.length) {
      const candidate = claimed[cursor++];
      const itemStarted = Date.now();
      const extraction = await processDiscoveryCandidate(candidate, options);
      if (!extraction.success || !extraction.extractedEvent) { items.push({ ...emptyItem(candidate, itemStarted, dryRunExecutionId), extractionStatus: extraction.errorCode || 'failed', durationMs: Date.now() - itemStarted }); continue; }
      let enriched = extraction.extractedEvent;
      let researchResult: Awaited<ReturnType<typeof researchAndEnrichCandidate>> | null = null;
      const needsResearch = shouldResearchEvent(enriched);
      if (needsResearch) researchRequired += 1;
      if (options.enableResearch && needsResearch && researchUsed < researchLimit) {
        researchUsed += 1;
        try {
          const input: ResearchInput = { event: enriched, sourceUrl: candidate.url };
          researchResult = await researchAndEnrichCandidate(candidate.id, input, options.researchProvider, { client: options.client as never, dryRunExecutionId, executionStartedAt });
          if (researchResult.status !== 'skipped') { researchSucceeded += 1; enriched = researchResult.enrichedEvent || enriched; }
        } catch { researchFailed += 1; }
      }
      const completedResearch = researchResult && researchResult.status !== 'skipped' && 'research' in researchResult ? researchResult : null;
      const researchConfidence = completedResearch?.research.researchConfidence ?? null;
      const quality = completedResearch ? contentQualityScore(enriched, completedResearch.research.facts) : contentQualityScore(enriched);
      const eligibility = evaluateAutoPublishEligibility(enriched, { researchConfidence, contentQualityScore: quality, researchRequired: needsResearch && Boolean(options.enableResearch), researchFailed: needsResearch && Boolean(options.enableResearch) && !completedResearch });
      const rejectionReasons = [...eligibility.rejectionReasons];
      if (needsResearch && options.enableResearch && !completedResearch && researchUsed >= researchLimit && !rejectionReasons.includes('research_failed')) rejectionReasons.push('research_skipped_budget');
      const persistenceStatus = completedResearch?.persistenceStatus || 'not_persisted';
      items.push({ candidateId: candidate.id, sourceId: candidate.source_id, url: candidate.url, dryRunExecutionId, evaluatedAt: new Date().toISOString(), persistenceStatus, persistedUpdatedAt: completedResearch?.persistedUpdatedAt || null, extractionStatus: extraction.extractionStatus, researchExecuted: Boolean(completedResearch), researchStatus: researchResult?.status, deterministicFields: extraction.extractedEvent, enrichedFields: enriched, missingFields: completedResearch?.research.missingFields || [], conflicts: completedResearch?.research.conflicts || [], researchConfidence, contentQualityScore: quality, shortDescription: completedResearch?.research.shortDescription || '', longDescription: completedResearch?.research.longDescription || '', sourcesCount: completedResearch?.research.sources.length || 0, sourceTypes: completedResearch?.research.sources.map((source) => source.sourceType) || [], durationMs: Date.now() - itemStarted, estimatedAutoPublishEligibility: completedResearch?.decision ? completedResearch.decision.autoPublishEligible : eligibility.eligible && !rejectionReasons.includes('research_skipped_budget'), rejectionReasons });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, claimed.length) }, () => worker()));
  const valid = items.filter((item) => item.extractionStatus && item.extractionStatus !== 'failed' && item.extractionStatus !== 'not_a_race');
  const ignored = items.filter((item) => item.extractionStatus === 'not_a_race').length;
  const failed = items.filter((item) => item.extractionStatus === 'failed' || item.rejectionReasons.includes('research_failed')).length;
  return { dryRunExecutionId, executionStartedAt, executionFinishedAt: new Date().toISOString(), candidatesEvaluated: items.length, deterministicSuccess: items.filter((item) => Boolean(item.deterministicFields)).length, researchRequired, researchExecuted: researchUsed, researchSucceeded, researchFailed, eligibleForAutoPublish: items.filter((item) => item.estimatedAutoPublishEligibility).length, requiresReview: valid.filter((item) => !item.estimatedAutoPublishEligibility).length, ignored, failed, averageResearchConfidence: researchSucceeded ? items.filter((item) => item.researchConfidence !== null).reduce((sum, item) => sum + (item.researchConfidence || 0), 0) / researchSucceeded : 0, averageContentQualityScore: valid.length ? valid.reduce((sum, item) => sum + item.contentQualityScore, 0) / valid.length : 0, conflictsCount: items.reduce((sum, item) => sum + item.conflicts.length, 0), missingFieldsFrequency: items.flatMap((item) => item.missingFields).reduce<Record<string, number>>((counts, field) => ({ ...counts, [field]: (counts[field] || 0) + 1 }), {}), automationRateEstimate: valid.length ? items.filter((item) => item.estimatedAutoPublishEligibility).length / valid.length : 0, durationMs: Date.now() - started, items };
}
