import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { getResearchModelConfiguration, sanitizeOpenAIError } from '@/features/discovery/openai-research-provider';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const model = (() => { try { return getResearchModelConfiguration(); } catch { return null; } })();
  if (!model || !process.env.OPENAI_API_KEY) return NextResponse.json({ success: false, error: { code: 'missing_api_key', message: 'Configuração OpenAI indisponível.' } }, { status: 503 });
  const started = Date.now();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await client.responses.create({ model, reasoning: { effort: 'low' }, tools: [{ type: 'web_search', search_context_size: 'low' }], tool_choice: 'required', include: ['web_search_call.action.sources'], input: 'Encontre a página oficial da OpenAI e retorne o título da página.' });
    const output = (response as { output?: unknown[] }).output || [];
    const webSearchCalls = output.filter((item) => (item as { type?: string }).type === 'web_search_call');
    const sources = webSearchCalls.flatMap((item) => ((item as { action?: { sources?: unknown[] } }).action?.sources || [])).map((source) => source as { url?: unknown; title?: unknown }).filter((source) => typeof source.url === 'string').map((source) => ({ url: source.url as string, title: typeof source.title === 'string' ? source.title : null, domain: (() => { try { return new URL(source.url as string).hostname; } catch { return null; } })() }));
    const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage;
    return NextResponse.json({ success: true, model, responseId: (response as { id?: string }).id || null, responseStatus: (response as { status?: string }).status || null, durationMs: Date.now() - started, outputItemTypes: output.map((item) => (item as { type?: string }).type).filter(Boolean), webSearchCalls: webSearchCalls.length, rawSourcesCount: sources.length, sources, inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null, totalTokens: usage?.total_tokens ?? null });
  } catch (error) {
    const details = sanitizeOpenAIError(error, 'provider_error');
    return NextResponse.json({ success: false, model, durationMs: Date.now() - started, error: { name: details.name, constructor: details.constructorName, status: details.status ?? null, type: details.type ?? null, code: details.codeDetail ?? details.code, param: details.param ?? null, message: details.message, request_id: details.requestId ?? null, cause: details.cause ?? null } }, { status: 200 });
  }
}
