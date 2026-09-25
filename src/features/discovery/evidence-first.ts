import type { ExtractedRaceEvent } from '@/features/importer/url-import';
import type { ResearchInput, ResearchSourceType, RaceResearchResult } from './research';
import { fetchSafeDiscoveryText, normalizeDiscoveryUrl, type DiscoveryProviderContext } from './url-discovery';
import type { DiscoverySource } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
interface ResearchResponsesClient { responses: { create: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown> } }

export type EvidenceEditionMatch = 'same_edition' | 'probable_same_edition' | 'different_edition' | 'unknown';
export interface RaceEvidenceDocument {
  url: string;
  domain: string;
  title?: string;
  sourceType: ResearchSourceType;
  trustLevel: 'A' | 'B' | 'C';
  sourceMatchScore: number;
  sourceWeight: number;
  editionMatch: EvidenceEditionMatch;
  text: string;
  extractedAt: string;
  provenance: { discoveryMethod: 'known_url' | 'deterministic_query'; query?: string };
}

export interface DiscoveredEvidenceUrl { url: string; domain: string; title?: string; snippet?: string; discoveryMethod: 'known_url' | 'deterministic_query'; query?: string; }
export interface RaceSourceDiscoveryProvider { discover(input: ResearchInput & { knownUrls?: string[] }): Promise<DiscoveredEvidenceUrl[]>; }
export interface RaceEvidenceFetcher { fetch(url: DiscoveredEvidenceUrl): Promise<{ document?: RaceEvidenceDocument; error?: string }>; }
export function calculateEvidenceResearchConfidence(input: { event: ExtractedRaceEvent; sources: Array<{ sourceType: ResearchSourceType; trustLevel: 'A'|'B'|'C'; sourceMatchScore?: number; editionMatch?: EvidenceEditionMatch }>; missingFields?: string[]; conflicts?: Array<{ field?: string; severity?: string }>; resolverFields?: string[] }): number {
  const critical = ['name', 'date', 'city', 'state', 'registrationUrl'];
  const complete = critical.filter((field) => { const value = input.event[field as keyof ExtractedRaceEvent]; return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0); }).length;
  const completeness = (complete / critical.length) * 50;
  const typeRank: Record<string, number> = { official_event: 1, registration_platform: .95, regulation: .95, official_organizer: .9, government: .8, race_calendar: .7, official_social: .65, photo_platform: .4, other: .2 };
  const trustRank: Record<string, number> = { A: 1, B: .75, C: .5 };
  const quality = input.sources.length ? input.sources.reduce((sum, source) => sum + (typeRank[source.sourceType] ?? .2) * .4 + (trustRank[source.trustLevel] ?? .5) * .2 + Math.max(0, Math.min(100, source.sourceMatchScore ?? 0)) / 100 * .3 + (source.editionMatch === 'same_edition' ? .1 : source.editionMatch === 'probable_same_edition' ? .08 : 0), 0) / input.sources.length * 25 : 0;
  const corroboration = Math.min(10, input.sources.length * 5);
  const requested = input.resolverFields ?? [];
  const unresolved = new Set(input.missingFields ?? []);
  const resolver = requested.length ? Math.max(0, 10 - requested.filter((field) => unresolved.has(field)).length * 2.5) : 10;
  const penalty = (input.conflicts ?? []).reduce((sum, conflict) => sum + (critical.includes(conflict.field || '') && conflict.severity === 'high' ? 30 : conflict.severity === 'high' ? 10 : conflict.severity === 'medium' ? 4 : 1), 0);
  return Math.max(0, Math.min(100, Math.round(completeness + quality + corroboration + resolver - penalty)));
}
export interface EvidenceFirstTelemetry { discoveryUrlsFound: number; evidenceDocsFetched: number; evidenceDocsUsed: number; evidenceCacheHits: number; evidenceCacheMisses: number; deterministicFieldsResolved: number; llmFieldsRequested: string[]; evidenceResolverCalled: boolean; fallbackWebSearchUsed: boolean; fallbackReasons: string[]; evidenceChars: number; evidenceResolverInputTokens: number | null; evidenceResolverOutputTokens: number | null; fallbackInputTokens: number | null; fallbackOutputTokens: number | null; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; }

const KEYWORDS = /data|hor[aá]rio|largada|local|endere[cç]o|dist[aâ]ncia|inscri[cç][aã]o|valor|regulamento|kit|retirada|categoria|premia[cç][aã]o|organiza[cç][aã]o/i;
const MAX_DOCS = 3;
const MAX_DOC_CHARS = 2000;
const MAX_TOTAL_CHARS = 6000;
const domainOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
export function classifyEvidenceUrl(url: string, title = ''): { sourceType: ResearchSourceType; trustLevel: 'A' | 'B' | 'C'; domain: string } {
  const domain = domainOf(url); const text = `${domain} ${url} ${title}`.toLowerCase();
  if (/fotop\.com|fotop\.net/.test(domain)) return { sourceType: 'photo_platform', trustLevel: 'C', domain };
  if (/regulamento/.test(text)) return { sourceType: 'regulation', trustLevel: 'A', domain };
  if (/inscri|ticket|sympla|portaldascorridas/.test(text)) return { sourceType: 'registration_platform', trustLevel: 'A', domain };
  if (/prefeitura|\.gov\.br|federacao|confederacao/.test(text)) return { sourceType: 'government', trustLevel: 'B', domain };
  if (/instagram|facebook|youtube/.test(domain)) return { sourceType: 'official_social', trustLevel: 'B', domain };
  if (/corridabrasil|corrida1|vamucorrer|corridanarua/.test(domain)) return { sourceType: 'race_calendar', trustLevel: 'C', domain };
  return { sourceType: 'other', trustLevel: 'C', domain };
}
const cleanText = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
export function extractUsefulEvidenceText(html: string): string {
  const text = cleanText(html); const sentences = text.split(/(?<=[.!?])\s+/).filter((part) => KEYWORDS.test(part));
  return (sentences.length ? sentences.join(' ') : text).slice(0, MAX_DOC_CHARS);
}
export function buildDeterministicResearchQueries(input: ResearchInput, max = 2): string[] {
  const year = input.event.date?.match(/20\d{2}/)?.[0] || '';
  const identity = [`"${input.event.name || ''}"`, input.event.city, input.event.state, year].filter(Boolean).join(' ');
  const authority = [`"${input.event.name || ''}"`, input.event.city, input.event.state, year, 'inscrição regulamento'].filter(Boolean).join(' ');
  return [identity, authority].slice(0, Math.max(0, Math.min(2, max)));
}
export function createKnownUrlDiscoveryProvider(): RaceSourceDiscoveryProvider {
  return { async discover(input) {
    const urls = [input.sourceUrl, input.event.registrationUrl, ...(input.knownUrls || [])].filter((value): value is string => Boolean(value));
    return [...new Map(urls.map((url) => { const normalized = normalizeDiscoveryUrl(url, input.sourceUrl, domainOf(input.sourceUrl)); return [normalized || url, { url: normalized || url, domain: domainOf(normalized || url), discoveryMethod: 'known_url' as const }]; })).values()];
  } };
}
export function createSafeEvidenceFetcher(input: ResearchInput, source: DiscoverySource, context: DiscoveryProviderContext = {}): RaceEvidenceFetcher {
  return { async fetch(url) {
    try {
      const html = await fetchSafeDiscoveryText(url.url, source, context);
      const classified = classifyEvidenceUrl(url.url, url.title || '');
      const sourceMatchScore = url.url === input.sourceUrl ? 100 : 40;
      return { document: { url: url.url, domain: classified.domain, title: url.title, sourceType: classified.sourceType, trustLevel: classified.trustLevel, sourceMatchScore, sourceWeight: sourceMatchScore * (classified.trustLevel === 'A' ? 3 : classified.trustLevel === 'B' ? 2 : 1), editionMatch: 'unknown', text: extractUsefulEvidenceText(html), extractedAt: new Date().toISOString(), provenance: { discoveryMethod: url.discoveryMethod, query: url.query } } };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Falha ao buscar evidência.' }; }
  } };
}
export function rankEvidenceUrls(input: ResearchInput, urls: DiscoveredEvidenceUrl[]): DiscoveredEvidenceUrl[] {
  return [...urls].sort((a, b) => {
    const score = (item: DiscoveredEvidenceUrl) => (item.url === input.sourceUrl ? 100 : /inscri|regulamento/i.test(item.url) ? 80 : /\.gov\.br|organiza/i.test(item.domain) ? 60 : 30);
    return score(b) - score(a) || a.domain.localeCompare(b.domain);
  });
}
export function selectEvidenceDocuments(documents: RaceEvidenceDocument[], max = MAX_DOCS): RaceEvidenceDocument[] {
  const unique = new Map<string, RaceEvidenceDocument>();
  for (const doc of documents) { const current = unique.get(doc.domain); if (!current || doc.sourceWeight > current.sourceWeight) unique.set(doc.domain, doc); }
  return [...unique.values()].sort((a, b) => b.sourceWeight - a.sourceWeight).slice(0, Math.min(MAX_DOCS, max));
}
export function compactEvidenceContext(documents: RaceEvidenceDocument[]): string { return documents.slice(0, MAX_DOCS).reduce((text, doc) => text.length >= MAX_TOTAL_CHARS ? text : `${text}\n[${doc.domain}] ${doc.text}`.slice(0, MAX_TOTAL_CHARS), ''); }
export function deterministicResolvedFields(event: ExtractedRaceEvent): string[] { return Object.entries(event).filter(([, value]) => value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)).map(([field]) => field); }
export interface EvidenceResolverClient { create(request: { model: string; input: string; text: { format: { type: 'json_schema'; name: string; strict: true; schema: unknown } } }): Promise<{ output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } }>; }
export async function resolveRaceEvidence(client: EvidenceResolverClient, request: { model: string; input: string; schema: unknown }): Promise<{ value: unknown; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null }> {
  const response = await client.create({ model: request.model, input: request.input, text: { format: { type: 'json_schema', name: 'maprun_race_evidence_resolution', strict: true, schema: request.schema } } });
  const inputTokens = response.usage?.input_tokens ?? null; const outputTokens = response.usage?.output_tokens ?? null;
  return { value: response.output_text ? JSON.parse(response.output_text) : null, inputTokens, outputTokens, totalTokens: inputTokens === null || outputTokens === null ? null : inputTokens + outputTokens };
}
export function isEvidenceFirstResearchEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean { return env.EVIDENCE_FIRST_RESEARCH_ENABLED === 'true'; }
export function aggregateResearchTokens(rows: Array<{ inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null }>) { const inputTokens = rows.reduce((sum, row) => sum + (row.inputTokens || 0), 0); const outputTokens = rows.reduce((sum, row) => sum + (row.outputTokens || 0), 0); return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }; }

export async function collectEvidenceFirstDocuments(input: ResearchInput & { knownUrls?: string[] }, source: DiscoverySource, options: { fetcher?: RaceEvidenceFetcher; context?: DiscoveryProviderContext } = {}) {
  const urls = await createKnownUrlDiscoveryProvider().discover(input);
  const fetcher = options.fetcher || createSafeEvidenceFetcher(input, source, options.context);
  const fetched = await Promise.all(urls.map((url) => fetcher.fetch(url)));
  const documents = selectEvidenceDocuments(fetched.flatMap((item) => item.document ? [item.document] : []));
  return { urls, documents, errors: fetched.flatMap((item) => item.error ? [item.error] : []) };
}

export interface EvidenceFirstResearchOptions { client: SupabaseClient; fallback?: RaceResearchProviderLike; resolve?: (input: string, fields: string[]) => Promise<{ facts: Record<string, unknown>; inputTokens: number; outputTokens: number }>; }
export interface RaceResearchProviderLike { research(args: { queries: string[]; known: ResearchInput; maxSources: number }): Promise<RaceResearchResult>; }
export async function researchCandidateEvidenceFirst(input: ResearchInput, options: EvidenceFirstResearchOptions): Promise<RaceResearchResult & { evidenceTelemetry: EvidenceFirstTelemetry }> {
  const source: DiscoverySource = { id: 'candidate', name: input.sourceName || 'candidate', base_url: input.sourceUrl, source_type: 'other', active: true, region: input.event.state || '', config: {} };
  const started = Date.now(); const found = await createKnownUrlDiscoveryProvider().discover(input);
  const documents: RaceEvidenceDocument[] = []; let cacheHits = 0; let cacheMisses = 0; let fetched = 0;
  for (const url of rankEvidenceUrls(input, found).slice(0, MAX_DOCS)) {
    type CachedEvidence = { url: string; domain: string; title?: string | null; extracted_text: string; fetched_at: string };
    let cached: CachedEvidence | null = null;
    try { const result = await options.client.from('discovery_evidence_cache').select('url,domain,title,extracted_text,fetched_at').eq('normalized_url', url.url).gt('expires_at', new Date().toISOString()).maybeSingle(); cached = result.data as CachedEvidence | null; } catch { /* cache is best effort */ }
    if (cached?.extracted_text) { cacheHits++; documents.push({ url: cached.url, domain: cached.domain, title: cached.title || undefined, sourceType: classifyEvidenceUrl(cached.url, cached.title || undefined).sourceType, trustLevel: classifyEvidenceUrl(cached.url, cached.title || undefined).trustLevel, sourceMatchScore: cached.url === input.sourceUrl ? 100 : 40, sourceWeight: (cached.url === input.sourceUrl ? 100 : 40) * (classifyEvidenceUrl(cached.url, cached.title || undefined).trustLevel === 'A' ? 3 : classifyEvidenceUrl(cached.url, cached.title || undefined).trustLevel === 'B' ? 2 : 1), editionMatch: 'unknown', text: cached.extracted_text.slice(0, MAX_DOC_CHARS), extractedAt: cached.fetched_at, provenance: { discoveryMethod: url.discoveryMethod, query: url.query } }); continue; }
    cacheMisses++; const result = await createSafeEvidenceFetcher(input, source).fetch(url); if (!result.document) continue; fetched++; documents.push(result.document);
    try { await options.client.from('discovery_evidence_cache').upsert({ url: result.document.url, normalized_url: result.document.url, domain: result.document.domain, title: result.document.title || null, extracted_text: result.document.text, expires_at: new Date(Date.now() + 48 * 3600000).toISOString(), status: 'ok', metadata: { sourceType: result.document.sourceType } }, { onConflict: 'normalized_url' }); } catch { /* cache is best effort */ }
  }
  const selected = selectEvidenceDocuments(documents); const context = compactEvidenceContext(selected); const deterministic = deterministicResolvedFields(input.event);
  const critical = ['name', 'date', 'city', 'state', 'registrationUrl'];
  const contextHasDateConflict = Boolean(input.event.date && [...context.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/g)].some((match) => {
    const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    return iso !== String(input.event.date).slice(0, 10);
  }));
  const requested = [...new Set(Object.keys(input.event).filter((field) => !deterministic.includes(field)).concat(contextHasDateConflict ? ['date'] : []))];
  let facts: Record<string, unknown> = {}; let resolverInputTokens: number | null = null; let resolverOutputTokens: number | null = null;
  if (options.resolve && selected.length) { const resolved = await options.resolve(context, requested); facts = resolved.facts; resolverInputTokens = resolved.inputTokens; resolverOutputTokens = resolved.outputTokens; }
  const criticalRequested = requested.filter((field) => critical.includes(field));
  const identityInsufficient = !input.event.name || !input.event.date || !input.event.city || !input.event.state;
  const needsFallback = identityInsufficient || criticalRequested.length > 0 || (selected.length === 0);
  let fallback: RaceResearchResult | null = null; if (needsFallback && options.fallback) fallback = await options.fallback.research({ queries: buildDeterministicResearchQueries(input), known: input, maxSources: 5 });
  const result = fallback || { sources: selected.map((doc) => ({ url: doc.url, title: doc.title || doc.domain, sourceType: doc.sourceType, trustLevel: doc.trustLevel, retrievedAt: doc.extractedAt, domain: doc.domain, sourceWeight: doc.sourceWeight, sourceMatchScore: doc.sourceMatchScore, editionMatch: doc.editionMatch })), facts, fieldEvidence: {}, conflicts: [], missingFields: requested, researchConfidence: calculateEvidenceResearchConfidence({ event: input.event, sources: selected, missingFields: requested, resolverFields: requested, conflicts: [] }), durationMs: Date.now() - started, status: selected.length ? 'completed' : 'no_sources', shortDescription: '', longDescription: '', rawSourcesCount: selected.length, webSearches: 0 };
  const fallbackReasons = [...(identityInsufficient ? ['identity_insufficient'] : []), ...criticalRequested.map((field) => `critical_${field}_unresolved_or_conflicted`), ...(!selected.length ? ['evidence_insufficient'] : [])];
  return { ...result, evidenceTelemetry: { discoveryUrlsFound: found.length, evidenceDocsFetched: fetched, evidenceDocsUsed: selected.length, evidenceCacheHits: cacheHits, evidenceCacheMisses: cacheMisses, evidenceChars: context.length, deterministicFieldsResolved: deterministic.length, llmFieldsRequested: requested, evidenceResolverCalled: Boolean(options.resolve && selected.length), fallbackWebSearchUsed: Boolean(fallback), fallbackReasons, evidenceResolverInputTokens: resolverInputTokens, evidenceResolverOutputTokens: resolverOutputTokens, fallbackInputTokens: fallback?.inputTokens ?? null, fallbackOutputTokens: fallback?.outputTokens ?? null, inputTokens: resolverInputTokens === null && fallback?.inputTokens == null ? null : (resolverInputTokens ?? 0) + (fallback?.inputTokens ?? 0), outputTokens: resolverOutputTokens === null && fallback?.outputTokens == null ? null : (resolverOutputTokens === null && fallback?.outputTokens == null ? null : (resolverOutputTokens ?? 0) + (fallback?.outputTokens ?? 0)), totalTokens: resolverInputTokens === null && resolverOutputTokens === null && fallback?.inputTokens == null && fallback?.outputTokens == null ? null : (resolverInputTokens ?? 0) + (resolverOutputTokens ?? 0) + (fallback?.inputTokens ?? 0) + (fallback?.outputTokens ?? 0) } };
}

export function createOpenAIEvidenceResolver(options: { client?: ResearchResponsesClient; model?: string } = {}) {
  const client = options.client || (new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ResearchResponsesClient);
  const model = options.model || process.env.OPENAI_RESEARCH_MODEL?.trim();
  if (!model) throw new Error('evidence_resolver_unavailable');
  return async (evidenceText: string, fields: string[]) => {
    if (!fields.length) return { facts: {}, inputTokens: 0, outputTokens: 0 };
    const properties = Object.fromEntries(fields.map((field) => [field, { type: ['string', 'null'] }]));
    const schema = { type: 'object', additionalProperties: false, properties, required: fields };
    const request = { model, reasoning: { effort: 'low' }, input: `Resolva somente os campos solicitados usando exclusivamente as evidências abaixo. Sem inferências e sem novas URLs. Retorne null quando não houver suporte.\nCampos: ${JSON.stringify(fields)}\nEvidências:\n${evidenceText}`, text: { format: { type: 'json_schema', name: 'maprun_evidence_resolution', strict: true, schema } } };
    try {
      const response = await client.responses.create(request);
      const raw = (response as { output_text?: unknown }).output_text;
      const parsed = raw && typeof raw === 'string' ? JSON.parse(raw) as Record<string, unknown> : {};
      return { facts: Object.fromEntries(fields.map((field) => [field, parsed[field] ?? null])), inputTokens: (response as { usage?: { input_tokens?: number } }).usage?.input_tokens || 0, outputTokens: (response as { usage?: { output_tokens?: number } }).usage?.output_tokens || 0 };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Evidence resolver failed');
    }
  };
}
