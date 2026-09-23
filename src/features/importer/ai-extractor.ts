import OpenAI from 'openai';
import { z } from 'zod';
import type { ExtractedRaceEvent, ExtractionField, ExtractionFieldSources, ExtractionConflict } from './url-import';

const DEFAULT_MODEL = 'gpt-5.6-luna';
const TIMEOUT_MS = 15_000;

const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: ['string', 'null'] }, date: { type: ['string', 'null'] }, startTime: { type: ['string', 'null'] },
    city: { type: ['string', 'null'] }, state: { type: ['string', 'null'] }, venue: { type: ['string', 'null'] },
    address: { type: ['string', 'null'] }, distances: { type: 'array', items: { type: 'string' } },
    price: { type: ['string', 'null'] }, organizerName: { type: ['string', 'null'] },
    registrationUrl: { type: ['string', 'null'] }, coverImageUrl: { type: ['string', 'null'] },
    evidence: { type: 'object', additionalProperties: false, properties: {
      date: { type: ['string', 'null'] }, city: { type: ['string', 'null'] }, state: { type: ['string', 'null'] },
      distances: { type: ['string', 'null'] }, organizerName: { type: ['string', 'null'] }
    }, required: ['date','city','state','distances','organizerName'] }
  },
  required: ['name','date','startTime','city','state','venue','address','distances','price','organizerName','registrationUrl','coverImageUrl','evidence']
} as const;

const aiOutputSchema = z.object({
  name: z.string().nullable(), date: z.string().nullable(), startTime: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable(), venue: z.string().nullable(), address: z.string().nullable(), distances: z.array(z.string()), price: z.string().nullable(), organizerName: z.string().nullable(), registrationUrl: z.string().nullable(), coverImageUrl: z.string().nullable(),
  evidence: z.object({ date: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable(), distances: z.string().nullable(), organizerName: z.string().nullable() }).strict()
}).strict();

export type AiExtractionErrorCode = 'missing_api_key'|'timeout'|'provider_error'|'invalid_response'|'refusal'|'schema_validation_error';
export interface AiRaceExtractionInput { sourceUrl: string; pageText: string; deterministicEvent: ExtractedRaceEvent; deterministicFieldSources?: ExtractionFieldSources; timeoutMs?: number; }
export interface AiRaceExtraction { event: ExtractedRaceEvent; evidence: { date: string|null; city: string|null; state: string|null; distances: string|null; organizerName: string|null }; fieldSources: ExtractionFieldSources; conflicts: ExtractionConflict[]; usage?: { inputTokens?: number; outputTokens?: number }; }
export interface AiProviderErrorMetadata { status?: number; code?: string; providerType?: string; requestId?: string; safeMessage?: string; }
export interface AiExtractionFailure { ok: false; error: AiExtractionErrorCode; message: string; metadata?: AiProviderErrorMetadata; }
export interface AiExtractionSuccess { ok: true; result: AiRaceExtraction; }
export type AiExtractionResult = AiExtractionSuccess | AiExtractionFailure;
export interface AiExtractionProvider { extract(input: { model: string; instructions: string; content: string; schema: typeof extractionSchema; signal: AbortSignal }): Promise<{ outputText?: string; refusal?: string; usage?: { inputTokens?: number; outputTokens?: number } }>; }

const instructions = 'Você é um extrator de dados de corridas. Use SOMENTE fatos explicitamente presentes no conteúdo fornecido. Não use conhecimento geral, não faça suposições e não complete campos ausentes. Retorne null ou [] quando não houver evidência clara. Não escreva explicações. Datas devem ser ISO quando claramente identificadas. A UF brasileira deve usar sigla de duas letras quando estiver explícita. A evidência deve ser curta e factual.';
const empty = (value: string|null) => value === null || value.trim() === '' ? null : value.trim();

function conflictsFor(deterministic: ExtractedRaceEvent, ai: ExtractedRaceEvent): ExtractionConflict[] {
  const fields: Array<[ExtractionField, string|null, string|null]> = [['name', deterministic.name, ai.name], ['startDate', deterministic.date, ai.date], ['startTime', deterministic.startTime, ai.startTime], ['city', deterministic.city, ai.city], ['state', deterministic.state, ai.state], ['venue', deterministic.venue, ai.venue], ['address', deterministic.address, ai.address], ['priceFrom', deterministic.price, ai.price], ['organizerName', deterministic.organizerName, ai.organizerName], ['registrationUrl', deterministic.registrationUrl, ai.registrationUrl], ['coverImageUrl', deterministic.coverImageUrl, ai.coverImageUrl]];
  return fields.filter(([, a, b]) => Boolean(a && b && a !== b)).map(([field, a, b]) => ({ field, values: [{ value: a as string, source: 'derived' }, { value: b as string, source: 'ai' }] }));
}

function buildResult(parsed: z.infer<typeof aiOutputSchema>, input: AiRaceExtractionInput, usage?: { inputTokens?: number; outputTokens?: number }): AiExtractionSuccess {
  const event: ExtractedRaceEvent = { name: empty(parsed.name), date: empty(parsed.date), startTime: empty(parsed.startTime), city: empty(parsed.city), state: empty(parsed.state), venue: empty(parsed.venue), address: empty(parsed.address), distances: parsed.distances.map(value => value.trim()).filter(Boolean), price: empty(parsed.price), organizerName: empty(parsed.organizerName), registrationUrl: empty(parsed.registrationUrl), coverImageUrl: empty(parsed.coverImageUrl) };
  const fieldSources: ExtractionFieldSources = {};
  (Object.keys(event) as (keyof ExtractedRaceEvent)[]).forEach(key => { const value=event[key]; if ((typeof value === 'string' && value) || (Array.isArray(value) && value.length)) fieldSources[key === 'date' ? 'startDate' : key as ExtractionField] = 'ai'; });
  return { ok: true, result: { event, evidence: parsed.evidence, fieldSources, conflicts: conflictsFor(input.deterministicEvent, event), usage } };
}

export async function extractRaceEventWithAi(input: AiRaceExtractionInput, provider?: AiExtractionProvider): Promise<AiExtractionResult> {
  if (!input.pageText.trim()) return { ok: false, error: 'invalid_response', message: 'Texto da página vazio.' };
  if (!provider && !process.env.OPENAI_API_KEY) return { ok: false, error: 'missing_api_key', message: 'OPENAI_API_KEY não configurada.' };
  const model = process.env.OPENAI_EXTRACTION_MODEL || DEFAULT_MODEL;
  const content = JSON.stringify({ sourceUrl: input.sourceUrl, pageText: input.pageText, deterministicEvent: input.deterministicEvent }, null, 2);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? TIMEOUT_MS);
  try {
    const activeProvider = provider || createOpenAiProvider();
    const response = await activeProvider.extract({ model, instructions, content, schema: extractionSchema, signal: controller.signal });
    if (response.refusal) return { ok: false, error: 'refusal', message: response.refusal };
    if (!response.outputText) return { ok: false, error: 'invalid_response', message: 'O provider não retornou dados estruturados.' };
    let raw: unknown; try { raw = JSON.parse(response.outputText); } catch { return { ok: false, error: 'invalid_response', message: 'Resposta não é JSON válido.' }; }
    const parsed = aiOutputSchema.safeParse(raw); if (!parsed.success) return { ok: false, error: 'schema_validation_error', message: 'Resposta fora do schema de extração.' };
    return buildResult(parsed.data, input, response.usage);
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, error: 'timeout', message: 'Tempo limite da extração de IA excedido.' };
    if (error instanceof AiProviderError) return { ok: false, error: 'provider_error', message: error.metadata.safeMessage ?? error.message, metadata: error.metadata };
    const metadata = providerMetadata(error);
    return { ok: false, error: 'provider_error', message: metadata.safeMessage ?? 'Falha controlada no provider de extração.', metadata };
  } finally { clearTimeout(timer); }
}

class AiProviderError extends Error { constructor(public readonly metadata: AiProviderErrorMetadata) { super(metadata.safeMessage ?? 'Provider indisponível.'); } }
type OpenAiErrorLike = { status?: unknown; code?: unknown; type?: unknown; request_id?: unknown; requestId?: unknown; message?: unknown };
function safeString(value: unknown, max: number) { return typeof value === 'string' ? value.slice(0, max).replace(/(?:sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+)/gi, '[redacted]') : undefined; }
function providerMetadata(error: unknown): AiProviderErrorMetadata {
  const candidate = typeof error === 'object' && error !== null ? error as OpenAiErrorLike : {};
  const status = typeof candidate.status === 'number' ? candidate.status : undefined;
  const code = safeString(candidate.code, 96);
  const providerType = safeString(candidate.type, 96);
  const requestId = safeString(candidate.request_id ?? candidate.requestId, 128);
  const safeMessage = safeString(candidate.message, 512);
  return { status, code, providerType, requestId, safeMessage };
}
function createOpenAiProvider(): AiExtractionProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  const client = new OpenAI({ apiKey });
  return { async extract({ model, instructions: system, content, schema, signal }) {
    try {
      const response = await client.responses.create({ model, instructions: system, input: content, text: { format: { type: 'json_schema', name: 'maprun_race_extraction', strict: true, schema } }, temperature: 0 }, { signal });
      const refused = response.output.some(item => item.type === 'message' && item.content.some(part => part.type === 'refusal'));
      return { outputText: response.output_text, refusal: refused ? 'refusal' : undefined, usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } : undefined };
    } catch (error) { throw new AiProviderError(providerMetadata(error)); }
  } };
}
class MissingApiKeyError extends Error {}
