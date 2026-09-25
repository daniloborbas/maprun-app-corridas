import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';
import { evaluateShadowCandidate, type ShadowCandidate } from '@/features/discovery/shadow-auto';
export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }); }
  const { data, error } = await adminDb().from('discovery_candidate_enrichments').select('candidate_id,base_event,research_confidence,factual_confidence,content_quality_score,conflicts,description_audit,auto_publish_eligible,rejection_reasons,research_metadata');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = (data || []).map((row) => { const audit = row.description_audit as Record<string, unknown> | null; const candidate: ShadowCandidate = { event: (row.base_event || {}) as ShadowCandidate['event'], researchConfidence: row.research_confidence, factualConfidence: row.factual_confidence, contentQualityScore: row.content_quality_score, conflicts: Array.isArray(row.conflicts) ? row.conflicts : [], unsupportedClaims: Array.isArray(audit?.unsupportedClaims) ? audit.unsupportedClaims as string[] : [], persistenceStatus: 'persisted' }; return { candidateId: row.candidate_id, ...evaluateShadowCandidate(candidate), researchConfidence: row.research_confidence, factualConfidence: row.factual_confidence, contentQualityScore: row.content_quality_score }; });
  return NextResponse.json({ officialThreshold: 90, thresholds: [90,80,75,72], results, counts: { SAFE_READY: results.filter((r) => r.semanticReadiness === 'SAFE_READY').length, NEEDS_DATA_FIX: results.filter((r) => r.semanticReadiness === 'NEEDS_DATA_FIX').length, REAL_CONFLICT: results.filter((r) => r.semanticReadiness === 'REAL_CONFLICT').length, OPERATIONAL_FAILURE: results.filter((r) => r.semanticReadiness === 'OPERATIONAL_FAILURE').length }, shadowCounts: Object.fromEntries([90,80,75,72].map((threshold) => [threshold, results.filter((r) => r.semanticReadiness === 'SAFE_READY' && r[`shadow${threshold}` as keyof typeof r] === true).length])) });
}

