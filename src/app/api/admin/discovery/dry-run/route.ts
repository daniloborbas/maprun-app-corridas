import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';
import { discoverAndPersistFromSource } from '@/features/discovery/candidate-repository';
import { runDiscoveryDryRun } from '@/features/discovery/dry-run';
import { listSourcesReadyForCrawl, recordDiscoverySourceFailure, recordDiscoverySourceSuccess } from '@/features/discovery/source-repository';
import { getResearchModelConfiguration } from '@/features/discovery/openai-research-provider';
import type { DiscoverySource } from '@/features/discovery/types';

const requestSchema = z.object({
  action: z.enum(['discover', 'dry-run', 'discover-and-dry-run']),
  sourceIds: z.array(z.string().uuid()).max(50).optional(),
  candidateIds: z.array(z.string().uuid()).max(10).optional(),
  sourceLimit: z.number().int().min(1).max(50).optional(),
  limit: z.number().int().min(1).max(10).optional(),
  enableResearch: z.boolean().optional(),
  researchLimit: z.number().int().min(0).max(10).optional(),
  concurrency: z.number().int().min(1).max(2).optional(),
});

export const runtime = 'nodejs';
export const maxDuration = 60;

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : 'Falha controlada na operação.';
}

async function discover(sources: DiscoverySource[], client: ReturnType<typeof adminDb>) {
  const started = Date.now();
  let urlsFound = 0;
  let candidatesNew = 0;
  let candidatesExisting = 0;
  const errors: { sourceId: string; source: string; error: string }[] = [];
  const sourceResults: {
    sourceId: string;
    sourceName: string;
    urlsFound: number;
    candidatesNew: number;
    candidatesExisting: number;
    candidatesPersisted: number;
    durationMs: number;
    success: boolean;
    error?: string;
  }[] = [];
  for (const source of sources) {
    const sourceStarted = Date.now();
    try {
      const result = await discoverAndPersistFromSource(source, {}, client);
      urlsFound += result.urlsFound;
      candidatesNew += result.newCandidates;
      candidatesExisting += result.existingCandidates;
      await recordDiscoverySourceSuccess(source, new Date(), client);
      sourceResults.push({ sourceId: source.id, sourceName: source.name, urlsFound: result.urlsFound, candidatesNew: result.newCandidates, candidatesExisting: result.existingCandidates, candidatesPersisted: result.candidatesPersisted, durationMs: Date.now() - sourceStarted, success: true });
    } catch (error) {
      const message = safeError(error);
      errors.push({ sourceId: source.id, source: source.name, error: message });
      sourceResults.push({ sourceId: source.id, sourceName: source.name, urlsFound: 0, candidatesNew: 0, candidatesExisting: 0, candidatesPersisted: 0, durationMs: Date.now() - sourceStarted, success: false, error: message });
      try { await recordDiscoverySourceFailure(source, new Date(), client); } catch { /* preserve the original source error */ }
    }
  }
  return {
    sourcesProcessed: sources.length,
    sourcesSucceeded: sources.length - errors.length,
    sourcesFailed: errors.length,
    urlsFound,
    candidatesNew,
    candidatesExisting,
    candidatesPersisted: candidatesNew + candidatesExisting,
    durationMs: Date.now() - started,
    errors,
    sourceResults,
  };
}

async function recentCandidateSample(client: ReturnType<typeof adminDb>, since: Date) {
  const { data } = await client
    .from('discovery_candidates')
    .select('url,title_hint,discovery_method,source_id,discovery_sources(name)')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  return (data || []).map((candidate) => ({
    url: candidate.url,
    source: (candidate.discovery_sources as { name?: string } | null)?.name || candidate.source_id,
    titleHint: candidate.title_hint || null,
    discoveryMethod: candidate.discovery_method,
  }));
}

export async function POST(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
  const input = parsed.data;
  if ((input.action === 'dry-run' || input.action === 'discover-and-dry-run') && input.enableResearch !== false) {
    try { getResearchModelConfiguration(); } catch (error) { return NextResponse.json({ error: safeError(error) }, { status: 503 }); }
  }
  let client;
  try { client = adminDb(); } catch { return NextResponse.json({ error: 'Banco indisponível.' }, { status: 503 }); }
  try {
    let discovery;
    let discoveryStartedAt: Date | null = null;
    if (input.action === 'discover' || input.action === 'discover-and-dry-run') {
      discoveryStartedAt = new Date();
      let sources = await listSourcesReadyForCrawl(new Date(), client);
      if (input.sourceIds?.length) sources = sources.filter((source) => input.sourceIds!.includes(source.id));
      sources = sources.slice(0, input.sourceLimit ?? 5);
      discovery = await discover(sources, client);
    }
    if (input.action === 'discover') return NextResponse.json({ discovery, candidates: await recentCandidateSample(client, discoveryStartedAt || new Date()) });
    const report = await runDiscoveryDryRun({
      client,
      candidateIds: input.candidateIds,
      sourceIds: input.sourceIds,
      limit: input.limit ?? 10,
      enableResearch: input.enableResearch !== false,
      researchLimit: input.researchLimit ?? 10,
      concurrency: input.concurrency ?? 2,
    });
    return NextResponse.json({ discovery, report });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
