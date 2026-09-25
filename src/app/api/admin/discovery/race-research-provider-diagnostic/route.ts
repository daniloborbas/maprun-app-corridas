import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';
import { extractDiscoveryCandidate } from '@/features/discovery/candidate-processor';
import { createRaceResearchProvider, getResearchModelConfiguration, ResearchProviderError, sanitizeOpenAIError } from '@/features/discovery/openai-research-provider';
import type { ResearchInput } from '@/features/discovery/research';

export const runtime = 'nodejs';
export const maxDuration = 60;
const inputSchema = z.object({ candidateId: z.string().uuid() });

export async function POST(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'candidateId inválido.' }, { status: 400 });
  const client = adminDb();
  const { data: candidate, error } = await client.from('discovery_candidates').select('*').eq('id', parsed.data.candidateId).maybeSingle();
  if (error || !candidate) return NextResponse.json({ error: 'Candidato inexistente.' }, { status: 404 });
  const extraction = await extractDiscoveryCandidate(candidate);
  if (!extraction.success || !extraction.extractedEvent) return NextResponse.json({ candidateId: candidate.id, extractionStatus: extraction.errorCode || 'failed', error: extraction.errorMessage || 'Extração determinística falhou.' }, { status: 200 });
  const known: ResearchInput = { event: extraction.extractedEvent, sourceUrl: candidate.url };
  try {
    const provider = createRaceResearchProvider({ maxQueries: 2 });
    const result = await provider.diagnostic(known);
    return NextResponse.json({ success: true, candidateId: candidate.id, extractionStatus: extraction.extractionStatus, context: { name: known.event.name, date: known.event.date, city: known.event.city, state: known.event.state, organizer: known.event.organizerName, originalUrl: candidate.url, knownDistances: known.event.distances, missingFields: Object.entries(known.event).filter(([, value]) => value == null || (Array.isArray(value) && value.length === 0)).map(([key]) => key), queries: result.queries, promptCharacterCount: result.promptCharacterCount }, response: { responseId: result.responseId, responseStatus: result.responseStatus, durationMs: result.durationMs, model: result.model, outputItemTypes: result.outputItemTypes, webSearchCalls: result.webSearchCalls, rawSourcesCount: result.rawSourcesCount, uniqueSourcesCount: result.uniqueSourcesCount, inputTokens: result.inputTokens, outputTokens: result.outputTokens, totalTokens: result.totalTokens }, sources: result.sources, structuredOutput: result.parsed, evidenceWithRealSource: result.evidenceWithRealSource, evidenceWithoutRealSource: result.evidenceWithoutRealSource });
  } catch (error) {
    if (error instanceof ResearchProviderError) return NextResponse.json({ success: false, candidateId: candidate.id, error: { phase: error.details.phase || 'responses_api', constructor: error.details.constructorName, name: error.details.errorName, status: error.details.status, type: error.details.providerType, code: error.code, param: error.details.param, message: error.message, requestId: error.details.requestId, cause: error.details.cause } }, { status: 200 });
    const details = sanitizeOpenAIError(error, 'provider_error');
    return NextResponse.json({ success: false, candidateId: candidate.id, error: { phase: 'responses_api', constructor: details.constructorName || null, name: details.name || null, status: details.status || null, type: details.type || null, code: details.codeDetail || details.code, param: details.param || null, requestId: details.requestId || null, message: details.message, cause: details.cause || null } }, { status: 200 });
  }
}
