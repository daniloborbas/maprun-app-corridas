import type { DiscoveryAiMetrics } from './observability';

export function buildDiscoveryRunUpdate({
  status, finishedAt, sourcesProcessed, candidatesFound, candidatesNew, candidatesEnriched, candidatesIgnored,
  errorsCount, discoveredCount, newCount, duplicateCount, errorCount, errorDetails, aiMetrics,
}: {
  status: string; finishedAt: string; sourcesProcessed: number; candidatesFound: number; candidatesNew: number;
  candidatesEnriched: number; candidatesIgnored: number; errorsCount: number; discoveredCount: number; newCount: number;
  duplicateCount: number; errorCount: number; errorDetails: Array<{ stage: string; type: string }>;
  aiMetrics: DiscoveryAiMetrics;
}) {
  return {
    status, finished_at: finishedAt, sources_processed: sourcesProcessed, candidates_found: candidatesFound,
    candidates_new: candidatesNew, candidates_enriched: candidatesEnriched, candidates_ignored: candidatesIgnored,
    errors_count: errorsCount, discovered_count: discoveredCount, new_count: newCount, duplicate_count: duplicateCount,
    error_count: errorCount, error_details: errorDetails, ai_fallback_needed: aiMetrics.aiFallbackNeeded,
    ai_calls: aiMetrics.aiCalls, ai_successes: aiMetrics.aiSuccesses, ai_failures: aiMetrics.aiFailures,
    ai_input_tokens: aiMetrics.aiInputTokens, ai_output_tokens: aiMetrics.aiOutputTokens,
  };
}
