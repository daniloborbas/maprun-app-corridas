import 'server-only';
import { z } from 'zod';
import type { ExtractedRaceEvent } from '@/features/importer/url-import';
import { adminDb } from '@/lib/supabase/admin';

export interface ResearchInput { event: ExtractedRaceEvent; sourceUrl: string; sourceName?: string; }
export type ResearchSourceType = 'official_event'|'official_organizer'|'registration_platform'|'regulation'|'government'|'official_social'|'race_calendar'|'other';
export interface ResearchSource { url: string; title: string; sourceType: ResearchSourceType; trustLevel: 'A'|'B'|'C'; retrievedAt: string; }
export interface FieldEvidence { value: string; source: ResearchSource; confidence: number; }
export interface ResearchConflict { field: string; values: { value: string; source: ResearchSource }[]; severity: 'low'|'medium'|'high'; }
export interface RaceResearchResult { sources: ResearchSource[]; facts: Partial<ExtractedRaceEvent> & Record<string, unknown>; fieldEvidence: Record<string, FieldEvidence[]>; conflicts: ResearchConflict[]; missingFields: string[]; researchConfidence: number; durationMs: number; status: 'completed'|'no_sources'|'no_matching_sources'|'failed'; shortDescription: string; longDescription: string; model?: string; inputTokens?: number; outputTokens?: number; rawSourcesCount?: number; rejectedSources?: { url: string; reason: string; score?: number }[]; webSearches?: number; responseShape?: Record<string, unknown>; }
export interface RaceResearchProvider { research(input: { queries: string[]; known: ResearchInput; maxSources: number }): Promise<RaceResearchResult>; }
export type SourceMatchClass = 'strong_match'|'probable_match'|'weak_match'|'rejected';
export type FieldResolutionStatus = 'confirmed'|'conflicted'|'unresolved';
export interface SourceMatch { source: ResearchSource; score: number; classification: SourceMatchClass; independentKey: string; }
export interface FieldResolution { status: FieldResolutionStatus; chosenValue: unknown; confidence: number; supportingSources: ResearchSource[]; conflictingSources: ResearchSource[]; criticalConflict: boolean; }
export interface ResearchDecision { resolvedEvent: ExtractedRaceEvent; fieldResolutions: Record<string, FieldResolution>; replacements: { field: string; oldValue: unknown; newValue: unknown; resolutionReason: string; supportingSources: ResearchSource[] }[]; unresolvedConflicts: ResearchConflict[]; factualConfidence: number; contentQualityScore: number; autoPublishEligible: boolean; rejectionReasons: string[]; }

const importantFields = ['startTime', 'venue', 'address', 'distances', 'price', 'registrationUrl', 'organizerName'];
const editorialFields = ['kit', 'packetPickup', 'course', 'categories', 'awards', 'regulation', 'notes'];
export function shouldResearchEvent(event: ExtractedRaceEvent, metadata: Record<string, unknown> = {}) {
  if (!event.name || !event.date || !event.city || !event.state) return true;
  const missing = [...importantFields, ...editorialFields].filter((field) => {
    const value = event[field as keyof ExtractedRaceEvent] ?? metadata[field];
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  });
  return missing.length > 0;
}
export function buildResearchQueries(input: ResearchInput, max = 4) {
  const base = [input.event.name, input.event.city, input.event.state, input.event.date?.slice(0, 4)].filter(Boolean).join(' ');
  return [`"${base}"`, `"${base}" inscrições`, `"${base}" regulamento`, `"${base}" kit`].slice(0, Math.max(0, max));
}
const trustRank = (value: 'A'|'B'|'C') => value === 'A' ? 3 : value === 'B' ? 2 : 1;
export function sourceMatchScore(input: ResearchInput, source: ResearchSource, facts: Partial<ExtractedRaceEvent> & Record<string, unknown>) {
  if (facts.date && input.event.date && String(facts.date).slice(0, 4) !== input.event.date.slice(0, 4)) return 0;
  let score = 0;
  if (facts.name && input.event.name && String(facts.name).toLowerCase().includes(input.event.name.toLowerCase().split(' ')[0])) score += 35;
  if (facts.city && input.event.city && String(facts.city).toLowerCase() === input.event.city.toLowerCase()) score += 25;
  if (facts.state && input.event.state && String(facts.state).toUpperCase() === input.event.state.toUpperCase()) score += 20;
  if (facts.date && input.event.date && String(facts.date).slice(0, 10) === input.event.date.slice(0, 10)) score += 20;
  return Math.min(100, score + trustRank(source.trustLevel) - 1);
}
const sourcePriority = (source: ResearchSource) => ({ regulation: 8, official_event: 7, registration_platform: 6, official_organizer: 5, government: 4, official_social: 4, race_calendar: 3, other: 1 }[source.sourceType] || 1) * trustRank(source.trustLevel);
export function classifySourceMatch(score: number): SourceMatchClass { return score >= 80 ? 'strong_match' : score >= 55 ? 'probable_match' : score >= 25 ? 'weak_match' : 'rejected'; }
export function matchResearchSources(input: ResearchInput, sources: ResearchSource[], facts: Partial<ExtractedRaceEvent> & Record<string, unknown>): SourceMatch[] {
  return sources.map((source) => { const score = sourceMatchScore(input, source, facts); return { source, score, classification: classifySourceMatch(score), independentKey: new URL(source.url).hostname.replace(/^www\./, '') }; });
}
const normalizeValue = (value: unknown) => Array.isArray(value) ? value.map((v) => String(v).trim().toLowerCase()).sort().join('|') : String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const emptyValue = (value: unknown) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
const criticalFields = new Set(['name', 'date', 'city', 'state']);
export function resolveRaceFieldEvidence(base: ExtractedRaceEvent, research: RaceResearchResult): ResearchDecision {
  const resolvedEvent = { ...base };
  const fieldResolutions: Record<string, FieldResolution> = {};
  const replacements: ResearchDecision['replacements'] = [];
  const sourceScores = new Map(research.sources.map((source) => [source.url, sourceMatchScore({ event: base, sourceUrl: '' }, source, research.facts)]));
  for (const field of Object.keys(research.facts)) {
    const value = research.facts[field]; if (emptyValue(value)) continue;
    const evidence = (research.fieldEvidence[field] || []).filter((item) => !emptyValue(item.value));
    const grouped = new Map<string, { value: unknown; sources: ResearchSource[]; confidence: number }>();
    for (const item of evidence) { const key = normalizeValue(item.value); const group = grouped.get(key) || { value: item.value, sources: [], confidence: 0 }; group.sources.push(item.source); group.confidence = Math.max(group.confidence, item.confidence); grouped.set(key, group); }
    const independentCount = (sources: ResearchSource[]) => new Set(sources.map((source) => { try { return new URL(source.url).hostname.replace(/^www\./, '') } catch { return source.url; } })).size;
    const matchScore = (sources: ResearchSource[]) => Math.max(...sources.map((source) => sourceScores.get(source.url) || 0));
    const ranked = [...grouped.values()].sort((a, b) => b.confidence + matchScore(b.sources) * 0.25 + independentCount(b.sources) * 4 + sourcePriority(b.sources[0]) - (a.confidence + matchScore(a.sources) * 0.25 + independentCount(a.sources) * 4 + sourcePriority(a.sources[0])));
    const best = ranked[0]; const conflict = ranked.length > 1;
    const current = base[field as keyof ExtractedRaceEvent];
    const currentMatches = !emptyValue(current) && best && normalizeValue(current) === normalizeValue(best.value);
    const clearlySuperior = Boolean(best && (!current || (!conflict && best.confidence >= 90 && best.sources.length >= 1)));
    const status: FieldResolutionStatus = currentMatches || (best && !conflict) ? 'confirmed' : conflict ? 'conflicted' : 'unresolved';
    const criticalConflict = criticalFields.has(field) && conflict && !clearlySuperior;
    const chosenValue = currentMatches ? current : (clearlySuperior ? best.value : (!emptyValue(current) ? current : undefined));
    fieldResolutions[field] = { status: criticalConflict ? 'conflicted' : status, chosenValue, confidence: best?.confidence || 0, supportingSources: best?.sources || [], conflictingSources: ranked.slice(1).flatMap((group) => group.sources), criticalConflict };
    if (!emptyValue(current) && clearlySuperior && normalizeValue(current) !== normalizeValue(best.value)) { (resolvedEvent[field as keyof ExtractedRaceEvent] as never) = best.value as never; replacements.push({ field, oldValue: current, newValue: best.value, resolutionReason: 'evidência superior sem conflito relevante', supportingSources: best.sources }); }
    else if (emptyValue(current) && !emptyValue(chosenValue)) (resolvedEvent[field as keyof ExtractedRaceEvent] as never) = chosenValue as never;
  }
  const unresolvedConflicts = research.conflicts.filter((conflict) => fieldResolutions[conflict.field]?.criticalConflict || criticalFields.has(conflict.field));
  const criticalConflict = Object.values(fieldResolutions).some((resolution) => resolution.criticalConflict);
  const factualConfidence = Math.round(Math.min(100, research.researchConfidence * (criticalConflict ? 0.7 : 1)));
  const quality = contentQualityScore(resolvedEvent, research.facts);
  const rejectionReasons = [...(criticalConflict ? ['critical_conflict'] : []), ...(factualConfidence < 90 ? ['low_factual_confidence'] : []), ...(quality < 70 ? ['low_content_quality'] : [])];
  return { resolvedEvent, fieldResolutions, replacements, unresolvedConflicts, factualConfidence, contentQualityScore: quality, autoPublishEligible: !criticalConflict && factualConfidence >= 90 && quality >= 70 && Boolean(resolvedEvent.name && resolvedEvent.date && resolvedEvent.city && resolvedEvent.state && resolvedEvent.distances.length), rejectionReasons };
}
export function mergeRaceEvidence(base: ExtractedRaceEvent, research: RaceResearchResult): ExtractedRaceEvent {
  return resolveRaceFieldEvidence(base, research).resolvedEvent;
}
export function researchConfidence(result: RaceResearchResult) { return Math.max(0, Math.min(100, Math.round((result.sources.length ? result.sources.reduce((sum, source) => sum + trustRank(source.trustLevel), 0) / result.sources.length / 3 : 0) * 100))); }
export function contentQualityScore(event: ExtractedRaceEvent, metadata: Record<string, unknown> = {}) {
  const weights: Record<string, number> = { name: 15, date: 15, city: 12, state: 8, startTime: 8, venue: 6, address: 6, distances: 10, price: 4, registrationUrl: 6, organizerName: 5, kit: 2, packetPickup: 2, course: 1 };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const present = Object.entries(weights).reduce((sum, [field, weight]) => { const value = event[field as keyof ExtractedRaceEvent] ?? metadata[field]; return sum + (value && (!Array.isArray(value) || value.length) ? weight : 0); }, 0);
  return Math.round((present / total) * 100);
}
export function researchSourceMetrics(result: Pick<RaceResearchResult, 'sources'|'rawSourcesCount'|'rejectedSources'>) {
  const uniqueSourcesCount = result.sources.length;
  const rawSourcesCount = result.rawSourcesCount ?? uniqueSourcesCount;
  const rejectedSourcesCount = result.rejectedSources?.length ?? 0;
  return { rawSourcesCount, uniqueSourcesCount, acceptedSourcesCount: uniqueSourcesCount, rejectedSourcesCount, duplicateSourcesCount: Math.max(0, rawSourcesCount - uniqueSourcesCount - rejectedSourcesCount) };
}
export function generateResearchEditorial(event: ExtractedRaceEvent, metadata: Record<string, unknown> = {}) {
  const location = [event.city, event.state].filter(Boolean).join(' / ');
  const shortDescription = [event.name, location, event.date].filter(Boolean).join(' · ');
  const sections = [location && `A prova acontece em ${location}.`, event.startTime && `A largada está prevista para ${event.startTime}.`, event.distances.length && `Distâncias: ${event.distances.join(', ')}.`, event.registrationUrl && `Inscrições: ${event.registrationUrl}.`, metadata.kit && `Kit: ${metadata.kit}.`, metadata.packetPickup && `Retirada do kit: ${metadata.packetPickup}.`, metadata.course && `Percurso: ${metadata.course}.`].filter(Boolean);
  return { shortDescription, longDescription: sections.join('\n\n') };
}
export function auditGeneratedDescription(description: string, event: ExtractedRaceEvent, resolvedEvidence: Record<string, FieldResolution> = {}) {
  const candidates = [event.name, event.date?.slice(0, 10), event.city, event.state, event.startTime, ...event.distances].filter(Boolean).map(String);
  const supportedClaims = candidates.filter((claim) => description.includes(claim));
  const unsupportedClaims = description.split(/[.!?\n]+/).map((claim) => claim.trim()).filter(Boolean).filter((claim) => !candidates.some((value) => claim.includes(value)) && !/^(A prova acontece|A largada está prevista|Distâncias:|Inscrições:|Kit:|Retirada do kit:|Percurso:)/i.test(claim));
  return { supportedClaims, unsupportedClaims, autoPublishEligible: unsupportedClaims.length === 0 && !Object.values(resolvedEvidence).some((resolution) => resolution.criticalConflict) };
}
export const researchOutputSchema = z.object({ facts: z.record(z.string(), z.unknown()), sources: z.array(z.object({ url: z.string(), title: z.string(), sourceType: z.string(), trustLevel: z.enum(['A','B','C']), retrievedAt: z.string() })), fieldEvidence: z.record(z.string(), z.array(z.object({ value: z.string(), confidence: z.number().min(0).max(100), source: z.object({ url: z.string(), title: z.string(), sourceType: z.string(), trustLevel: z.enum(['A','B','C']), retrievedAt: z.string() }) }))), conflicts: z.array(z.object({ field: z.string(), values: z.array(z.object({ value: z.string(), source: z.any() })), severity: z.enum(['low','medium','high']) })), missingFields: z.array(z.string()), shortDescription: z.string(), longDescription: z.string(), confidence: z.number().min(0).max(100) }).strict();

export async function researchAndEnrichCandidate(candidateId: string, input: ResearchInput, provider: RaceResearchProvider | undefined = undefined, options: { maxQueries?: number; maxSources?: number; client?: ReturnType<typeof adminDb> } = {}) {
  const started = Date.now();
  if (!shouldResearchEvent(input.event)) return { status: 'skipped' as const, reason: 'research_not_needed', durationMs: Date.now() - started };
  const activeProvider = provider || (await import('./openai-research-provider')).createRaceResearchProvider({ maxQueries: options.maxQueries, maxSources: options.maxSources });
  const result = await activeProvider.research({ queries: buildResearchQueries(input, options.maxQueries ?? 4), known: input, maxSources: options.maxSources ?? 8 });
  const decision = resolveRaceFieldEvidence(input.event, result);
  const merged = decision.resolvedEvent;
  const editorial = generateResearchEditorial(merged, result.facts);
  const enriched = { ...result, researchConfidence: result.researchConfidence || researchConfidence(result), shortDescription: editorial.shortDescription, longDescription: editorial.longDescription };
  const client = options.client || adminDb();
  const metrics = researchSourceMetrics(result);
  const rejectedSources = result.rejectedSources ?? [];
  const { error } = result.status === 'completed' ? await client.from('discovery_candidate_enrichments').upsert({ candidate_id: candidateId, base_event: input.event, enriched_event: merged, research_sources: { accepted: result.sources, rejected: rejectedSources }, field_evidence: result.fieldEvidence, conflicts: result.conflicts, missing_fields: result.missingFields, research_confidence: enriched.researchConfidence, content_quality_score: decision.contentQualityScore, short_description: enriched.shortDescription, long_description: enriched.longDescription, model: result.model || null, input_tokens: result.inputTokens || null, output_tokens: result.outputTokens || null, total_tokens: (result.inputTokens || 0) + (result.outputTokens || 0) || null, field_resolutions: decision.fieldResolutions, replacements: decision.replacements, unresolved_conflicts: decision.unresolvedConflicts, factual_confidence: decision.factualConfidence, auto_publish_eligible: decision.autoPublishEligible, rejection_reasons: decision.rejectionReasons, research_metadata: { ...metrics, webSearches: result.webSearches ?? 0, responseShape: result.responseShape ?? {} } }, { onConflict: 'candidate_id' }) : { error: null };
  if (error) throw new Error('Não foi possível persistir o enrichment de pesquisa.');
  return { status: result.status, candidateId, enrichedEvent: merged, research: enriched, durationMs: Date.now() - started };
}
