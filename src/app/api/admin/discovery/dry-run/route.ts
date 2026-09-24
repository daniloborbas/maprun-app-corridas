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
  for (const source of sources) {
    try {
      const result = await discoverAndPersistFromSource(source, {}, client);
      urlsFound += result.urlsFound;
      candidatesNew += result.newCandidates;
      candidatesExisting += result.existingCandidates;
      await recordDiscoverySourceSuccess(source, new Date(), client);
    } catch (error) {
      errors.push({ sourceId: source.id, source: source.name, error: safeError(error) });
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
  };
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
    if (input.action === 'discover' || input.action === 'discover-and-dry-run') {
      let sources = await listSourcesReadyForCrawl(new Date(), client);
      if (input.sourceIds?.length) sources = sources.filter((source) => input.sourceIds!.includes(source.id));
      sources = sources.slice(0, input.sourceLimit ?? 5);
      discovery = await discover(sources, client);
    }
    if (input.action === 'discover') return NextResponse.json({ discovery });
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
