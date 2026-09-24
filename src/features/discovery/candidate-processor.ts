import 'server-only';
import { z } from 'zod';
import { assertSafeImportUrl, extractEventExtraction, type ExtractedRaceEvent, type ExtractionResult } from '@/features/importer/url-import';
import type { DiscoveryCandidate } from './candidate-types';
import { listCandidatesReadyForProcessing, markCandidateExtracted, markCandidateFailed, markCandidateIgnored, markCandidateProcessing, recoverExpiredProcessingCandidates } from './candidate-repository';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CandidateProcessingErrorCode = 'network_error'|'timeout'|'http_error'|'invalid_html'|'not_a_race'|'insufficient_data'|'schema_invalid'|'unknown';
export interface CandidateProcessingResult {
  candidateId: string; sourceId: string; url: string; success: boolean;
  extractionMethod: 'deterministic' | null; extractedEvent?: ExtractedRaceEvent;
  extractionStatus?: 'complete'|'partial'|'insufficient'; errorCode?: CandidateProcessingErrorCode;
  errorMessage?: string; durationMs: number;
}
export interface CandidateProcessorDependencies {
  client?: SupabaseClient;
  fetcher?: typeof fetch;
  extractor?: (html: string, url: string) => ExtractionResult;
  now?: () => Date;
  validateUrl?: (url: string) => Promise<string>;
}
const extractedEventSchema = z.object({
  name: z.string().nullable(), date: z.string().nullable(), startTime: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable(), venue: z.string().nullable(), address: z.string().nullable(), distances: z.array(z.string()), price: z.string().nullable(), organizerName: z.string().nullable(), registrationUrl: z.string().nullable(), coverImageUrl: z.string().nullable(),
}).strict();
const MAX_HTML_BYTES = 2_000_000;

class CandidateProcessingFailure extends Error { constructor(public readonly code: CandidateProcessingErrorCode, message: string, public readonly retryable: boolean) { super(message); } }
function isRaceLike(result: ExtractionResult) { return Boolean(result.event.name || result.event.date || /\b(corrida|maratona|run|race|trail|prova|5\s*km|10\s*km)\b/i.test(result.relevantPageText)); }

async function fetchCandidateHtml(url: string, deps: CandidateProcessorDependencies): Promise<string> {
  let safeUrl: string;
  try { safeUrl = await (deps.validateUrl || assertSafeImportUrl)(url); } catch { throw new CandidateProcessingFailure('network_error', 'URL não permitida ou indisponível.', false); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await (deps.fetcher || fetch)(safeUrl, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'MapRunDiscovery/2.0' } });
    if (response.status >= 300 && response.status < 400) throw new CandidateProcessingFailure('http_error', 'Redirect não seguido durante o processamento.', true);
    if (response.status >= 500) throw new CandidateProcessingFailure('http_error', `Fonte indisponível (HTTP ${response.status}).`, true);
    if (response.status === 404 || response.status === 410) throw new CandidateProcessingFailure('not_a_race', `Página não encontrada (HTTP ${response.status}).`, false);
    if (!response.ok) throw new CandidateProcessingFailure('http_error', `Resposta HTTP ${response.status}.`, false);
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.includes('html') && !contentType.includes('text/')) throw new CandidateProcessingFailure('invalid_html', 'A URL não retornou HTML.', false);
    const html = await response.text();
    if (!html.trim() || html.length > MAX_HTML_BYTES) throw new CandidateProcessingFailure('invalid_html', 'HTML vazio ou acima do limite permitido.', false);
    return html;
  } catch (error) {
    if (error instanceof CandidateProcessingFailure) throw error;
    if (controller.signal.aborted) throw new CandidateProcessingFailure('timeout', 'Tempo limite do processamento excedido.', true);
    throw new CandidateProcessingFailure('network_error', 'Falha de conexão ao acessar a página.', true);
  } finally { clearTimeout(timer); }
}

export async function processDiscoveryCandidate(candidate: DiscoveryCandidate, deps: CandidateProcessorDependencies = {}): Promise<CandidateProcessingResult> {
  const started = Date.now();
  const base = { candidateId: candidate.id, sourceId: candidate.source_id, url: candidate.url };
  if (candidate.status !== 'processing') return { ...base, success: false, extractionMethod: null, errorCode: 'unknown', errorMessage: 'Candidato não está em processing.', durationMs: Date.now() - started };
  try {
    const html = await fetchCandidateHtml(candidate.url, deps);
    const extraction = (deps.extractor || extractEventExtraction)(html, candidate.url);
    const parsed = extractedEventSchema.safeParse(extraction.event);
    if (!parsed.success) throw new CandidateProcessingFailure('schema_invalid', 'Resultado determinístico fora do contrato.', false);
    if (!isRaceLike(extraction)) {
      await markCandidateIgnored(candidate.id, { processing: { extractionStatus: 'not_a_race', extractionMethod: 'deterministic', processedAt: new Date().toISOString() } }, deps.client);
      return { ...base, success: false, extractionMethod: 'deterministic', extractionStatus: 'insufficient', errorCode: 'not_a_race', errorMessage: 'Página não representa uma corrida processável.', durationMs: Date.now() - started };
    }
    const status = extraction.extractionQuality.status;
    const metadata = { processing: { extractionStatus: status, missingFields: [...extraction.extractionQuality.missingEssentialFields, ...extraction.extractionQuality.missingImportantFields], extractionMethod: 'deterministic', processedAt: new Date().toISOString() } };
    await markCandidateExtracted(candidate.id, metadata, deps.client);
    return { ...base, success: true, extractionMethod: 'deterministic', extractedEvent: parsed.data, extractionStatus: status, durationMs: Date.now() - started };
  } catch (error) {
    const failure = error instanceof CandidateProcessingFailure ? error : new CandidateProcessingFailure('unknown', 'Falha inesperada no processamento.', true);
    if (failure.code === 'not_a_race') await markCandidateIgnored(candidate.id, { processing: { extractionStatus: 'not_a_race', extractionMethod: 'deterministic', processedAt: new Date().toISOString() } }, deps.client);
    else await markCandidateFailed(candidate.id, failure.message, candidate.processing_attempts || 1, deps.now?.() || new Date(), deps.client);
    return { ...base, success: false, extractionMethod: failure.code === 'schema_invalid' ? 'deterministic' : null, errorCode: failure.code, errorMessage: failure.message, durationMs: Date.now() - started };
  }
}

export interface CandidateBatchOptions extends CandidateProcessorDependencies { limit?: number; concurrency?: number; recoverExpired?: boolean; }
export async function processDiscoveryCandidateBatch(options: CandidateBatchOptions = {}) {
  const started = Date.now();
  if (options.recoverExpired !== false) await recoverExpiredProcessingCandidates(options.limit || 25, options.client);
  const limit = Math.max(0, Math.floor(options.limit ?? 25));
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 3));
  const ready = await listCandidatesReadyForProcessing(limit, options.now?.() || new Date(), options.client);
  const claimed: DiscoveryCandidate[] = [];
  for (const candidate of ready) {
    const result = await markCandidateProcessing(candidate.id, options.client);
    if (result) claimed.push(result);
  }
  const results: CandidateProcessingResult[] = [];
  let cursor = 0;
  async function worker() { while (cursor < claimed.length) { const candidate = claimed[cursor++]; results.push(await processDiscoveryCandidate(candidate, options)); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, claimed.length) }, () => worker()));
  return { claimed: claimed.length, processed: results.length, extracted: results.filter((r) => r.success && r.extractionStatus === 'complete').length, incomplete: results.filter((r) => r.success && r.extractionStatus !== 'complete').length, ignored: results.filter((r) => r.errorCode === 'not_a_race').length, failed: results.filter((r) => !r.success && r.errorCode !== 'not_a_race').length, durationMs: Date.now() - started, results };
}
