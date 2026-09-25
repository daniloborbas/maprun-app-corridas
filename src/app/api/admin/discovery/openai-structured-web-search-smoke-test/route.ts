import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAdmin } from '@/lib/supabase/server';
import { getResearchModelConfiguration, raceResearchResponseSchema, normalizeResearchPayload, extractWebSearchSources, sanitizeOpenAIError, createRaceResearchRequest } from '@/features/discovery/openai-research-provider';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  let model: string;
  try { model = getResearchModelConfiguration(); } catch { return NextResponse.json({ success: false, error: { phase: 'configuration', code: 'missing_api_key', message: 'Configuração OpenAI indisponível.' } }, { status: 503 }); }
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ success: false, error: { phase: 'configuration', code: 'missing_api_key', message: 'Configuração OpenAI indisponível.' } }, { status: 503 });
  const started = Date.now();
  try {
    const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses.create(createRaceResearchRequest({ model, input: 'Pesquise o site oficial da OpenAI e preencha o schema solicitado apenas com informações encontradas nas fontes. Quando um campo não se aplicar, use null ou array vazio conforme o schema.' }) as never);
    const extracted = extractWebSearchSources(response);
    const rawText = (response as { output_text?: unknown }).output_text;
    let structuredOutputParsed = false;
    let schemaValidationSucceeded = false;
    let keys: string[] = [];
    if (typeof rawText !== 'string' || !rawText.trim()) throw Object.assign(new Error('Structured Output ausente.'), { phase: 'structured_output', code: 'structured_output_missing' });
    try { const parsed = JSON.parse(rawText); structuredOutputParsed = true; const normalized = normalizeResearchPayload(parsed); const checked = raceResearchResponseSchema.safeParse(normalized); schemaValidationSucceeded = checked.success; keys = Object.keys(normalized); if (!checked.success) throw Object.assign(new Error('Zod rejeitou Structured Output.'), { phase: 'local_zod', code: 'zod_validation_error' }); } catch (error) { if ((error as { phase?: string }).phase) throw error; throw Object.assign(new Error('Parsing local do Structured Output falhou.'), { phase: 'local_parsing', code: 'json_parse_error' }); }
    const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage;
    return NextResponse.json({ success: true, model, responseId: (response as { id?: string }).id || null, responseStatus: (response as { status?: string }).status || null, durationMs: Date.now() - started, webSearchCalls: extracted.webSearches, rawSourcesCount: extracted.rawSourcesCount, uniqueSourcesCount: extracted.sources.length, outputItemTypes: extracted.responseShape.outputItemTypes, structuredOutputParsed, schemaValidationSucceeded, receivedKeys: keys, sources: extracted.sources.map((source) => ({ url: source.url, domain: (() => { try { return new URL(source.url).hostname; } catch { return null; } })() })), inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null, totalTokens: usage?.total_tokens ?? null });
  } catch (error) {
    const local = error as { phase?: string; code?: string; message?: string };
    if (local.phase) return NextResponse.json({ success: false, durationMs: Date.now() - started, error: { phase: local.phase, code: local.code || 'local_error', message: local.message || 'Falha local no Structured Output.' } }, { status: 200 });
    const details = sanitizeOpenAIError(error, 'provider_error');
    return NextResponse.json({ success: false, durationMs: Date.now() - started, error: { phase: 'responses_api', constructor: details.constructorName, name: details.name, status: details.status ?? null, type: details.type ?? null, code: details.codeDetail ?? details.code, param: details.param ?? null, message: details.message, request_id: details.requestId ?? null, cause: details.cause ?? null } }, { status: 200 });
  }
}
