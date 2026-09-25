import 'server-only';
import { z } from 'zod';
import type { ExtractedRaceEvent } from '@/features/importer/url-import';
import { adminDb } from '@/lib/supabase/admin';

export interface ResearchInput { event: ExtractedRaceEvent; sourceUrl: string; sourceName?: string; }
export type ResearchSourceType = 'official_event'|'official_organizer'|'registration_platform'|'regulation'|'government'|'official_social'|'race_calendar'|'photo_platform'|'other';
export type EditionMatch = 'same_edition'|'probable_same_edition'|'different_edition'|'unknown';
export interface ResearchSource { url: string; title: string; sourceType: ResearchSourceType; trustLevel: 'A'|'B'|'C'; retrievedAt: string; domain?: string; sourceMatchScore?: number; matchClassification?: SourceMatchClass; accepted?: boolean; rejectionReason?: string; technicalOrigin?: string; sourceWeight?: number; editionMatch?: EditionMatch; excludedFromResolution?: boolean; exclusionReason?: string; }
export interface FieldEvidence { value: string; source: ResearchSource; confidence: number; }
export interface ResearchConflict { field: string; values: { value: string; source: ResearchSource }[]; severity: 'low'|'medium'|'high'; }
export interface RaceResearchResult { sources: ResearchSource[]; facts: Partial<ExtractedRaceEvent> & Record<string, unknown>; fieldEvidence: Record<string, FieldEvidence[]>; conflicts: ResearchConflict[]; missingFields: string[]; researchConfidence: number; durationMs: number; status: 'completed'|'no_sources'|'no_matching_sources'|'failed'; shortDescription: string; longDescription: string; model?: string; inputTokens?: number; outputTokens?: number; rawSourcesCount?: number; rejectedSources?: { url: string; reason: string; score?: number }[]; webSearches?: number; responseShape?: Record<string, unknown>; }
export interface RaceResearchProvider { research(input: { queries: string[]; known: ResearchInput; maxSources: number }): Promise<RaceResearchResult>; }
export type SourceMatchClass = 'strong_match'|'probable_match'|'weak_match'|'rejected';
export type FieldResolutionStatus = 'confirmed'|'conflicted'|'unresolved';
export interface SourceMatch { source: ResearchSource; score: number; classification: SourceMatchClass; independentKey: string; }
export interface FieldResolution { status: FieldResolutionStatus; chosenValue: unknown; confidence: number; supportingSources: ResearchSource[]; conflictingSources: ResearchSource[]; criticalConflict: boolean; }
export interface ResearchDecision { resolvedEvent: ExtractedRaceEvent; fieldResolutions: Record<string, FieldResolution>; replacements: { field: string; oldValue: unknown; newValue: unknown; resolutionReason: string; supportingSources: ResearchSource[] }[]; unresolvedConflicts: ResearchConflict[]; factualConfidence: number; contentQualityScore: number; autoPublishEligible: boolean; rejectionReasons: string[]; }

/** Normalizes provider confidence to the canonical internal 0–100 scale. */
export function normalizeConfidenceScore(value: unknown): number | null {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return value <= 1 ? value * 100 : value;
}

export type PersistenceErrorDetails = { code?: string; message: string; details?: string; hint?: string; status?: number; constraint?: string; column?: string; table?: string };
export class ResearchPersistenceError extends Error {
  constructor(message: string, public readonly details: PersistenceErrorDetails) {
    super(message);
    this.name = 'ResearchPersistenceError';
  }
}

export function sanitizePersistenceError(error: unknown): PersistenceErrorDetails {
  const value = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>;
  const text = (input: unknown) => typeof input === 'string' ? input.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').replace(/Bearer\s+\S+/ig, 'Bearer [redacted]').slice(0, 500) : undefined;
  const message = text(value.message) || 'Falha ao persistir o enrichment.';
  return {
    message,
    code: typeof value.code === 'string' ? value.code : undefined,
    details: text(value.details),
    hint: text(value.hint),
    status: typeof value.status === 'number' ? value.status : undefined,
    constraint: typeof value.constraint === 'string' ? value.constraint : undefined,
    column: typeof value.column === 'string' ? value.column : undefined,
    table: typeof value.table === 'string' ? value.table : undefined,
  };
}

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
const sourceTypeRank: Record<ResearchSourceType, number> = { official_event: 8, registration_platform: 7, official_organizer: 6, government: 5, official_social: 4, race_calendar: 3, photo_platform: 2, other: 1, regulation: 8 };
export function sourceEvidenceWeight(source: ResearchSource) { return (sourceTypeRank[source.sourceType] || 1) * trustRank(source.trustLevel) * (Math.max(0, source.sourceMatchScore ?? 0) / 100 || 0.25); }
const editionNumber = (value: string) => { const match = value.match(/(?:^|\s)(\d{1,2})\s*[ªaºo]?\s*(?:edi[cç][aã]o|corrida|volta)/i); return match ? Number(match[1]) : null; };
export function classifyEditionMatch(input: ResearchInput, source: ResearchSource, facts: Record<string, unknown> = {}): EditionMatch {
  const text = `${source.title} ${source.url}`.toLowerCase(); const candidate = `${input.event.name || ''}`;
  const candidateYear = input.event.date?.match(/\b(20\d{2})\b/)?.[1]; const sourceYear = text.match(/\b(20\d{2})\b/)?.[1];
  if (candidateYear && sourceYear && candidateYear !== sourceYear) return 'different_edition';
  const cEdition = editionNumber(candidate); const sEdition = editionNumber(text); if (cEdition !== null && sEdition !== null && cEdition !== sEdition) return 'different_edition';
  const sourceDate = typeof facts.date === 'string' ? facts.date : text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/)?.[0];
  if (sourceDate && candidateYear && !sourceDate.includes(candidateYear)) return 'different_edition';
  if (source.title || source.url) return 'probable_same_edition';
  return 'unknown';
}
export function classifyResearchSource(url: string, title = ''): { sourceType: ResearchSourceType; trustLevel: 'A'|'B'|'C'; domain: string } {
  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* invalid URLs are rejected upstream */ }
  const text = `${domain} ${url} ${title}`.toLowerCase();
  if (/fotop\.com|fotop\.net/.test(domain)) return { sourceType: 'photo_platform', trustLevel: 'C', domain };
  if (/regulamento/.test(text)) return { sourceType: 'regulation', trustLevel: 'A', domain };
  if (/inscri|ticket|sympla|portaldascorridas/.test(text)) return { sourceType: 'registration_platform', trustLevel: 'A', domain };
  if (/prefeitura|\.gov\.br|federacao|confederacao/.test(text)) return { sourceType: 'government', trustLevel: 'B', domain };
  if (/instagram|facebook|youtube/.test(domain)) return { sourceType: 'official_social', trustLevel: 'B', domain };
  if (/corridabrasil|corrida1|vamucorrer|corridanarua/.test(domain)) return { sourceType: 'race_calendar', trustLevel: 'C', domain };
  return { sourceType: 'other', trustLevel: 'C', domain };
}
export function sourceMatchScore(input: ResearchInput, source: ResearchSource, facts: Partial<ExtractedRaceEvent> & Record<string, unknown>) {
  if (facts.date && input.event.date && String(facts.date).slice(0, 4) !== input.event.date.slice(0, 4)) return 0;
  let score = 0;
  if (facts.name && input.event.name && String(facts.name).toLowerCase().includes(input.event.name.toLowerCase().split(' ')[0])) score += 35;
  if (facts.city && input.event.city && String(facts.city).toLowerCase() === input.event.city.toLowerCase()) score += 25;
  if (facts.state && input.event.state && String(facts.state).toUpperCase() === input.event.state.toUpperCase()) score += 20;
  if (facts.date && input.event.date && String(facts.date).slice(0, 10) === input.event.date.slice(0, 10)) score += 20;
  return Math.min(100, score + trustRank(source.trustLevel) - 1);
}
const sourcePriority = (source: ResearchSource) => ({ regulation: 8, official_event: 7, registration_platform: 6, official_organizer: 5, government: 4, official_social: 4, race_calendar: 3, photo_platform: 2, other: 1 }[source.sourceType] || 1) * trustRank(source.trustLevel);
export function classifySourceMatch(score: number): SourceMatchClass { return score >= 80 ? 'strong_match' : score >= 55 ? 'probable_match' : score >= 25 ? 'weak_match' : 'rejected'; }
export function matchResearchSources(input: ResearchInput, sources: ResearchSource[], facts: Partial<ExtractedRaceEvent> & Record<string, unknown>): SourceMatch[] {
  return sources.map((source) => { const score = sourceMatchScore(input, source, facts); const editionMatch = classifyEditionMatch(input, source, facts); const weighted = sourceEvidenceWeight({ ...source, sourceMatchScore: score }); return { source: { ...source, sourceMatchScore: score, sourceWeight: weighted, editionMatch, excludedFromResolution: editionMatch === 'different_edition', exclusionReason: editionMatch === 'different_edition' ? 'different_edition' : undefined }, score, classification: classifySourceMatch(score), independentKey: new URL(source.url).hostname.replace(/^www\./, '') }; });
}
const stateMap: Record<string, string> = { 'sao paulo': 'SP', 'minas gerais': 'MG', 'rio de janeiro': 'RJ', 'espirito santo': 'ES', parana: 'PR', bahia: 'BA', goias: 'GO', ceara: 'CE', paraiba: 'PB', pernambuco: 'PE', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'rio grande do sul': 'RS', 'rio grande do norte': 'RN', 'santa catarina': 'SC', sergipe: 'SE', alagoas: 'AL', amazonas: 'AM', maranhao: 'MA', para: 'PA', piaui: 'PI', 'distrito federal': 'DF', acre: 'AC', amapa: 'AP', rondonia: 'RO', roraima: 'RR', tocantins: 'TO' };
const plain = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function normalizeBrazilianState(value: unknown) { const raw = plain(String(value ?? '').trim().toLowerCase()).replace(/\s+/g, ' '); return raw.length === 2 ? raw.toUpperCase() : stateMap[raw] || raw.toUpperCase(); }
export function normalizeCity(value: unknown) { return plain(String(value ?? '').trim().toLowerCase()).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
const normalizeDate = (value: unknown) => { const raw = String(value ?? '').trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; const d = new Date(raw); if (Number.isNaN(d.getTime())) return raw.toLowerCase(); const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d); return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}-${p.find(x => x.type === 'day')?.value}`; };
const normalizeDistance = (value: unknown) => { const raw = plain(String(value ?? '').toLowerCase()); if (/meia\s*maratona/.test(raw)) return '21.0975'; const m = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : raw.trim(); };
const normalizeValue = (value: unknown, field?: string): string => Array.isArray(value) ? value.map(v => normalizeValue(v, field)).sort().join('|') : field === 'state' ? normalizeBrazilianState(value) : field === 'city' ? normalizeCity(value) : field === 'date' ? normalizeDate(value) : field === 'distances' ? normalizeDistance(value) : String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const emptyValue = (value: unknown) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
const criticalFields = new Set(['name', 'date', 'city', 'state']);
export function resolveRaceFieldEvidence(base: ExtractedRaceEvent, research: RaceResearchResult): ResearchDecision {
  const resolvedEvent = { ...base };
  const fieldResolutions: Record<string, FieldResolution> = {};
  const replacements: ResearchDecision['replacements'] = [];
  const sourceMatches = matchResearchSources({ event: base, sourceUrl: '' }, research.sources, research.facts);
  const sourceMeta = new Map(sourceMatches.map((match) => [match.source.url, match.source]));
  const sourceScores = new Map(sourceMatches.map((match) => [match.source.url, match.score]));
  for (const field of Object.keys(research.facts)) {
    const value = research.facts[field]; if (emptyValue(value)) continue;
    const evidence = (research.fieldEvidence[field] || []).filter((item) => !emptyValue(item.value) && sourceMeta.get(item.source.url)?.editionMatch !== 'different_edition');
    const grouped = new Map<string, { value: unknown; sources: ResearchSource[]; confidence: number }>();
    for (const item of evidence) { const key = normalizeValue(item.value, field); const group = grouped.get(key) || { value: item.value, sources: [], confidence: 0 }; group.sources.push(item.source); group.confidence = Math.max(group.confidence, item.confidence); grouped.set(key, group); }
    const independentCount = (sources: ResearchSource[]) => new Set(sources.map((source) => { try { return new URL(source.url).hostname.replace(/^www\./, '') } catch { return source.url; } })).size;
    const matchScore = (sources: ResearchSource[]) => Math.max(...sources.map((source) => sourceScores.get(source.url) || 0));
    const rank = (group: { sources: ResearchSource[]; confidence: number }) => group.confidence + Math.max(...group.sources.map((source) => sourceMeta.get(source.url)?.sourceWeight || sourceEvidenceWeight(source))) * 6 + independentCount(group.sources) * 2 + sourcePriority(group.sources[0]);
    const ranked = [...grouped.values()].sort((a, b) => rank(b) - rank(a));
    const best = ranked[0]; const conflict = ranked.length > 1;
    const current = base[field as keyof ExtractedRaceEvent];
    const currentMatches = !emptyValue(current) && best && normalizeValue(current, field) === normalizeValue(best.value, field);
    const clearlySuperior = Boolean(best && (!current || (!conflict && best.confidence >= 90 && best.sources.length >= 1)));
    const status: FieldResolutionStatus = currentMatches || (best && !conflict) ? 'confirmed' : conflict ? 'conflicted' : 'unresolved';
    const criticalConflict = criticalFields.has(field) && conflict && !clearlySuperior;
    const chosenValue = currentMatches ? current : (clearlySuperior ? best.value : (!emptyValue(current) ? current : undefined));
    fieldResolutions[field] = { status: criticalConflict ? 'conflicted' : status, chosenValue, confidence: best?.confidence || 0, supportingSources: best?.sources || [], conflictingSources: ranked.slice(1).flatMap((group) => group.sources), criticalConflict };
    if (!emptyValue(current) && clearlySuperior && normalizeValue(current, field) !== normalizeValue(best.value, field)) { (resolvedEvent[field as keyof ExtractedRaceEvent] as never) = best.value as never; replacements.push({ field, oldValue: current, newValue: best.value, resolutionReason: 'evidência superior sem conflito relevante', supportingSources: best.sources }); }
    else if (emptyValue(current) && !emptyValue(chosenValue)) (resolvedEvent[field as keyof ExtractedRaceEvent] as never) = chosenValue as never;
  }
  const unresolvedConflicts = research.conflicts.filter((conflict) => fieldResolutions[conflict.field]?.criticalConflict || criticalFields.has(conflict.field));
  const criticalConflict = Object.values(fieldResolutions).some((resolution) => resolution.criticalConflict);
  const factualConfidence = Math.round(Math.min(100, research.researchConfidence * (criticalConflict ? 0.7 : 1)));
  const quality = contentQualityScore(resolvedEvent, research.facts);
  const criticalReasons = [...new Set(Object.entries(fieldResolutions).filter(([, resolution]) => resolution.criticalConflict).map(([field]) => `critical_conflict_${field}`))];
  const rejectionReasons = [...criticalReasons, ...(factualConfidence < 90 ? ['low_factual_confidence'] : []), ...(quality < 70 ? ['low_content_quality'] : [])];
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
export function generateResearchEditorial(event: ExtractedRaceEvent, metadata: Record<string, unknown> = {}, resolutions: Record<string, FieldResolution> = {}) {
  const location = [event.city, event.state].filter(Boolean).join(' / ');
  const dateSafe = event.date && resolutions.date?.status !== 'conflicted' && resolutions.date?.status !== 'unresolved';
  const civilDate = dateSafe && event.date ? (() => { const d = new Date(event.date); if (Number.isNaN(d.getTime())) return event.date; return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d); })() : null;
  const shortDescription = [event.name, location, civilDate].filter(Boolean).join(' · ');
  const sections = [location && `A prova acontece em ${location}.`, dateSafe ? null : resolutions.date ? 'A data da prova apresenta informações divergentes entre as fontes consultadas e ainda precisa ser confirmada.' : null, event.startTime && `A largada está prevista para ${event.startTime}.`, event.distances.length && `Distâncias: ${event.distances.join(', ')}.`, event.registrationUrl && `Inscrições: ${event.registrationUrl}.`, metadata.kit && `Kit: ${metadata.kit}.`, metadata.packetPickup && `Retirada do kit: ${metadata.packetPickup}.`, metadata.course && `Percurso: ${metadata.course}.`].filter(Boolean);
  return { shortDescription, longDescription: sections.join('\n\n') };
}
export function auditGeneratedDescription(description: string, event: ExtractedRaceEvent, resolvedEvidence: Record<string, FieldResolution> = {}) {
  const referencedUrls = [...description.matchAll(/(?:https?:\/\/|www\.)[^\s)]+/gi)].map((match) => match[0].replace(/[.,;]+$/, ''));
  const text = description.replace(/\[[^\]]*\]\((?:https?:\/\/|www\.)[^)]+\)/gi, (match) => match.match(/^\[([^\]]*)\]/)?.[1] || '').replace(/(?:https?:\/\/|www\.)[^\s)]+/gi, '');
  const candidates = [event.name, event.date?.slice(0, 10), event.city, event.state, event.startTime, ...event.distances].filter(Boolean).map(String);
  const supportedClaims = candidates.filter((claim) => description.includes(claim));
  const unsupportedClaims = text.split(/[.!?\n]+/).map((claim) => claim.trim()).filter(Boolean).filter((claim) => !candidates.some((value) => claim.includes(value)) && !/^(A prova acontece|A data da prova apresenta|A largada está prevista|Distâncias:|Inscrições:|Kit:|Retirada do kit:|Percurso:)/i.test(claim));
  return { supportedClaims, unsupportedClaims, referencedUrls, autoPublishEligible: unsupportedClaims.length === 0 && !Object.values(resolvedEvidence).some((resolution) => resolution.criticalConflict) };
}
export const researchOutputSchema = z.object({ facts: z.record(z.string(), z.unknown()), sources: z.array(z.object({ url: z.string(), title: z.string(), sourceType: z.string(), trustLevel: z.enum(['A','B','C']), retrievedAt: z.string() })), fieldEvidence: z.record(z.string(), z.array(z.object({ value: z.string(), confidence: z.number().min(0).max(100), source: z.object({ url: z.string(), title: z.string(), sourceType: z.string(), trustLevel: z.enum(['A','B','C']), retrievedAt: z.string() }) }))), conflicts: z.array(z.object({ field: z.string(), values: z.array(z.object({ value: z.string(), source: z.any() })), severity: z.enum(['low','medium','high']) })), missingFields: z.array(z.string()), shortDescription: z.string(), longDescription: z.string(), confidence: z.number().min(0).max(100) }).strict();

export async function researchAndEnrichCandidate(candidateId: string, input: ResearchInput, provider: RaceResearchProvider | undefined = undefined, options: { maxQueries?: number; maxSources?: number; client?: ReturnType<typeof adminDb>; onPersistenceStart?: () => Promise<void> } = {}) {
  const started = Date.now();
  if (!shouldResearchEvent(input.event)) return { status: 'skipped' as const, reason: 'research_not_needed', durationMs: Date.now() - started };
  const activeProvider = provider || (await import('./openai-research-provider')).createRaceResearchProvider({ maxQueries: options.maxQueries, maxSources: options.maxSources });
  const result = await activeProvider.research({ queries: buildResearchQueries(input, options.maxQueries ?? 4), known: input, maxSources: options.maxSources ?? 8 });
  const normalizedResearchConfidence = normalizeConfidenceScore(result.researchConfidence) ?? researchConfidence(result);
  const normalizedResult = { ...result, researchConfidence: normalizedResearchConfidence };
  const decision = resolveRaceFieldEvidence(input.event, normalizedResult);
  const merged = decision.resolvedEvent;
  const editorial = generateResearchEditorial(merged, normalizedResult.facts, decision.fieldResolutions);
  const enriched = { ...normalizedResult, shortDescription: editorial.shortDescription, longDescription: editorial.longDescription };
  const client = options.client || adminDb();
  const metrics = researchSourceMetrics(normalizedResult);
  const rejectedSources = normalizedResult.rejectedSources ?? [];
  const scoredSources = matchResearchSources(input, normalizedResult.sources, normalizedResult.facts).map(({ source, score, classification }) => ({ ...source, sourceMatchScore: score, matchClassification: classification, accepted: classification !== 'rejected', rejectionReason: classification === 'rejected' ? 'source_match_below_threshold' : undefined }));
  const audit = auditGeneratedDescription(enriched.longDescription, merged, decision.fieldResolutions);
  const rejectionReasons = [...new Set([...decision.rejectionReasons, ...(audit.unsupportedClaims.length ? ['unsupported_editorial_claim'] : [])])];
  const autoPublishEligible = decision.autoPublishEligible && audit.unsupportedClaims.length === 0;
  const payload = { candidate_id: candidateId, base_event: input.event, enriched_event: merged, research_sources: { accepted: scoredSources.filter((source) => source.accepted), rejected: [...rejectedSources, ...scoredSources.filter((source) => !source.accepted)] }, field_evidence: result.fieldEvidence, conflicts: result.conflicts, missing_fields: result.missingFields, research_confidence: enriched.researchConfidence, content_quality_score: decision.contentQualityScore, short_description: enriched.shortDescription, long_description: enriched.longDescription, model: result.model || null, input_tokens: result.inputTokens ?? null, output_tokens: result.outputTokens ?? null, total_tokens: (result.inputTokens || 0) + (result.outputTokens || 0) || null, field_resolutions: decision.fieldResolutions, replacements: decision.replacements, unresolved_conflicts: decision.unresolvedConflicts, factual_confidence: decision.factualConfidence, auto_publish_eligible: autoPublishEligible, rejection_reasons: rejectionReasons, description_audit: { supportedClaims: audit.supportedClaims, unsupportedClaims: audit.unsupportedClaims, referencedUrls: audit.referencedUrls }, research_metadata: { ...metrics, webSearches: result.webSearches ?? 0, responseShape: result.responseShape ?? {}, sourceMatchScores: scoredSources.map(({ url, sourceMatchScore, matchClassification, accepted, rejectionReason, domain, technicalOrigin, sourceWeight, editionMatch, excludedFromResolution, exclusionReason }) => ({ url, domain, sourceMatchScore, matchClassification, accepted, rejectionReason, technicalOrigin, sourceWeight, editionMatch, excludedFromResolution, exclusionReason })) } };
  if (result.status === 'completed') {
    await options.onPersistenceStart?.();
    const { error } = await client.from('discovery_candidate_enrichments').upsert(payload, { onConflict: 'candidate_id' });
    if (error) {
      const details = sanitizePersistenceError(error);
      throw new ResearchPersistenceError('Não foi possível persistir o enrichment de pesquisa.', details);
    }
  }
  return { status: result.status, candidateId, enrichedEvent: merged, research: enriched, durationMs: Date.now() - started };
}
