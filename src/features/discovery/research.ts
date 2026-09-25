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
export function mergeRaceEvidence(base: ExtractedRaceEvent, research: RaceResearchResult): ExtractedRaceEvent {
  const result = { ...base };
  for (const field of Object.keys(research.facts) as (keyof ExtractedRaceEvent)[]) {
    const value = research.facts[field];
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    const evidence = research.fieldEvidence[field] || [];
    const best = [...evidence].sort((a, b) => b.confidence - a.confidence || trustRank(b.source.trustLevel) - trustRank(a.source.trustLevel))[0];
    if (!result[field] && best) (result[field] as never) = value as never;
  }
  return result;
}
export function researchConfidence(result: RaceResearchResult) { return Math.max(0, Math.min(100, Math.round((result.sources.length ? result.sources.reduce((sum, source) => sum + trustRank(source.trustLevel), 0) / result.sources.length / 3 : 0) * 100))); }
export function contentQualityScore(event: ExtractedRaceEvent, metadata: Record<string, unknown> = {}) {
  const weights: Record<string, number> = { name: 15, date: 15, city: 12, state: 8, startTime: 8, venue: 6, address: 6, distances: 10, price: 4, registrationUrl: 6, organizerName: 5, kit: 2, packetPickup: 2, course: 1 };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const present = Object.entries(weights).reduce((sum, [field, weight]) => { const value = event[field as keyof ExtractedRaceEvent] ?? metadata[field]; return sum + (value && (!Array.isArray(value) || value.length) ? weight : 0); }, 0);
  return Math.round((present / total) * 100);
}
export function generateResearchEditorial(event: ExtractedRaceEvent, metadata: Record<string, unknown> = {}) {
  const location = [event.city, event.state].filter(Boolean).join(' / ');
  const shortDescription = [event.name, location, event.date].filter(Boolean).join(' · ');
  const sections = [location && `A prova acontece em ${location}.`, event.startTime && `A largada está prevista para ${event.startTime}.`, event.distances.length && `Distâncias: ${event.distances.join(', ')}.`, event.registrationUrl && `Inscrições: ${event.registrationUrl}.`, metadata.kit && `Kit: ${metadata.kit}.`, metadata.packetPickup && `Retirada do kit: ${metadata.packetPickup}.`, metadata.course && `Percurso: ${metadata.course}.`].filter(Boolean);
  return { shortDescription, longDescription: sections.join('\n\n') };
}
export const researchOutputSchema = z.object({ facts: z.record(z.string(), z.unknown()), sources: z.array(z.object({ url: z.string(), title: z.string(), sourceType: z.string(), trustLevel: z.enum(['A','B','C']), retrievedAt: z.string() })), fieldEvidence: z.record(z.string(), z.array(z.object({ value: z.string(), confidence: z.number().min(0).max(100), source: z.object({ url: z.string(), title: z.string(), sourceType: z.string(), trustLevel: z.enum(['A','B','C']), retrievedAt: z.string() }) }))), conflicts: z.array(z.object({ field: z.string(), values: z.array(z.object({ value: z.string(), source: z.any() })), severity: z.enum(['low','medium','high']) })), missingFields: z.array(z.string()), shortDescription: z.string(), longDescription: z.string(), confidence: z.number().min(0).max(100) }).strict();

export async function researchAndEnrichCandidate(candidateId: string, input: ResearchInput, provider: RaceResearchProvider | undefined = undefined, options: { maxQueries?: number; maxSources?: number; client?: ReturnType<typeof adminDb> } = {}) {
  const started = Date.now();
  if (!shouldResearchEvent(input.event)) return { status: 'skipped' as const, reason: 'research_not_needed', durationMs: Date.now() - started };
  const activeProvider = provider || (await import('./openai-research-provider')).createRaceResearchProvider({ maxQueries: options.maxQueries, maxSources: options.maxSources });
  const result = await activeProvider.research({ queries: buildResearchQueries(input, options.maxQueries ?? 4), known: input, maxSources: options.maxSources ?? 8 });
  const merged = mergeRaceEvidence(input.event, result);
  const editorial = generateResearchEditorial(merged, result.facts);
  const enriched = { ...result, researchConfidence: result.researchConfidence || researchConfidence(result), shortDescription: editorial.shortDescription, longDescription: editorial.longDescription };
  const client = options.client || adminDb();
  const { error } = await client.from('discovery_candidate_enrichments').upsert({ candidate_id: candidateId, base_event: input.event, enriched_event: merged, research_sources: result.sources, field_evidence: result.fieldEvidence, conflicts: result.conflicts, missing_fields: result.missingFields, research_confidence: enriched.researchConfidence, content_quality_score: contentQualityScore(merged, result.facts), short_description: enriched.shortDescription, long_description: enriched.longDescription, model: result.model || null, input_tokens: result.inputTokens || null, output_tokens: result.outputTokens || null, total_tokens: (result.inputTokens || 0) + (result.outputTokens || 0) || null }, { onConflict: 'candidate_id' });
  if (error) throw new Error('Não foi possível persistir o enrichment de pesquisa.');
  return { status: result.status, candidateId, enrichedEvent: merged, research: enriched, durationMs: Date.now() - started };
}
