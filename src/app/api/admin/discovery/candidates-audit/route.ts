import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';
import { classifyDiscoveryCandidate, pathnamePattern } from '@/features/discovery/candidate-audit';

export const runtime = 'nodejs';

function numberParam(value: string | null, fallback: number, max: number) {
  const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

export async function GET(request: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const url = new URL(request.url);
  const sourceId = url.searchParams.get('sourceId');
  const status = url.searchParams.get('status');
  const summary = url.searchParams.get('summary') === 'true';
  const limit = numberParam(url.searchParams.get('limit'), 1000, 1000);
  const offset = numberParam(url.searchParams.get('offset'), 0, 100000);
  try {
    const client = adminDb();
    const { data: sources, error: sourceError } = await client.from('discovery_sources').select('*').order('name');
    if (sourceError) throw sourceError;
    const sourceMap = new Map((sources || []).map((source) => [String(source.id), source]));
    let query = client.from('discovery_candidates').select('*', { count: 'exact' }).order('first_discovered_at').range(offset, offset + limit - 1);
    if (sourceId) query = query.eq('source_id', sourceId);
    if (status) query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) throw error;
    const candidates = (data || []).map((candidate) => {
      const source = sourceMap.get(String(candidate.source_id));
      const classification = classifyDiscoveryCandidate(candidate, source || null);
      return { candidateId: candidate.id, sourceId: candidate.source_id, sourceName: source?.name || null, url: candidate.url, normalizedUrl: candidate.normalized_url, titleHint: candidate.title_hint, discoveryMethod: candidate.discovery_method, status: candidate.status, firstDiscoveredAt: candidate.first_discovered_at, lastDiscoveredAt: candidate.last_discovered_at, discoveryCount: candidate.discovery_count, lastProcessedAt: candidate.last_processed_at, processingAttempts: candidate.processing_attempts, nextProcessAt: candidate.next_process_at, lastError: candidate.last_error, metadata: candidate.metadata, classification: classification.classification, reasons: classification.reasons, pathnamePattern: pathnamePattern(candidate.url) };
    });
    if (!summary) return NextResponse.json({ total: count || 0, offset, limit, candidates });
    const all = sourceId || status ? (await client.from('discovery_candidates').select('*')).data || [] : data || [];
    const rows = all.map((candidate) => ({ candidate, source: sourceMap.get(String(candidate.source_id)) }));
    const totalByStatus: Record<string, number> = {}; const totalByDiscoveryMethod: Record<string, number> = {};
    type SourceSummary = { sourceId: string; sourceName: string | null; total: number; discovered: number; processing: number; extracted: number; ignored: number; failed: number; discoveryMethods: Record<string, number>; probableEvent: number; probableNonEvent: number; uncertain: number; pathnamePatterns: Record<string, number> };
    const bySource = new Map<string, SourceSummary>();
    let probableEvent = 0; let probableNonEvent = 0; let uncertain = 0; let earliest: string | null = null; let latest: string | null = null; let latestDiscovered: string | null = null;
    for (const { candidate, source } of rows) {
      totalByStatus[candidate.status] = (totalByStatus[candidate.status] || 0) + 1;
      totalByDiscoveryMethod[candidate.discovery_method] = (totalByDiscoveryMethod[candidate.discovery_method] || 0) + 1;
      const result = classifyDiscoveryCandidate(candidate, source || null); if (result.classification === 'probable_event') probableEvent++; else if (result.classification === 'probable_non_event') probableNonEvent++; else uncertain++;
      const key = String(candidate.source_id); const item: SourceSummary = bySource.get(key) || { sourceId: key, sourceName: source?.name || null, total: 0, discovered: 0, processing: 0, extracted: 0, ignored: 0, failed: 0, discoveryMethods: {}, probableEvent: 0, probableNonEvent: 0, uncertain: 0, pathnamePatterns: {} };
      item.total++; const candidateStatus = String(candidate.status); if (candidateStatus === 'discovered' || candidateStatus === 'processing' || candidateStatus === 'extracted' || candidateStatus === 'ignored' || candidateStatus === 'failed') item[candidateStatus]++;
      item.discoveryMethods[candidate.discovery_method] = (item.discoveryMethods[candidate.discovery_method] || 0) + 1;
      if (result.classification === 'probable_event') item.probableEvent++; else if (result.classification === 'probable_non_event') item.probableNonEvent++; else item.uncertain++;
      const pattern = pathnamePattern(candidate.url); item.pathnamePatterns[pattern] = (item.pathnamePatterns[pattern] || 0) + 1; bySource.set(key, item);
      const created = candidate.created_at || candidate.first_discovered_at; if (!earliest || created < earliest) earliest = created; if (!latest || created > latest) latest = created; if (!latestDiscovered || candidate.last_discovered_at > latestDiscovered) latestDiscovered = candidate.last_discovered_at;
    }
    return NextResponse.json({ totalCandidates: rows.length, totalByStatus, totalByDiscoveryMethod, probableEvent, probableNonEvent, uncertain, estimatedCandidateQualityRate: rows.length ? probableEvent / rows.length : 0, earliestCreatedAt: earliest, latestCreatedAt: latest, latestLastDiscoveredAt: latestDiscovered, sources: [...bySource.values()] });
  } catch { return NextResponse.json({ error: 'Não foi possível gerar a auditoria.' }, { status: 500 }); }
}
