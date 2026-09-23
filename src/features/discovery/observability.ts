export interface DiscoveryAiMetrics {
  aiFallbackNeeded: number;
  aiCalls: number;
  aiSuccesses: number;
  aiFailures: number;
  aiInputTokens: number;
  aiOutputTokens: number;
}

export interface AiObservation { attempted: boolean; success: boolean; errorType?: string; usage?: { inputTokens?: number; outputTokens?: number } }

export function observeAiFallback(metrics: DiscoveryAiMetrics, observation: AiObservation) {
  if (!observation.attempted) return;
  metrics.aiFallbackNeeded += 1;
  metrics.aiCalls += 1;
  if (observation.success) metrics.aiSuccesses += 1;
  else metrics.aiFailures += 1;
  metrics.aiInputTokens += observation.usage?.inputTokens ?? 0;
  metrics.aiOutputTokens += observation.usage?.outputTokens ?? 0;
}

export function sanitizeDiscoveryError(stage: string, type: string) {
  return { stage: stage.slice(0, 32), type: type.slice(0, 64).replace(/[^a-zA-Z0-9_.-]/g, '_') };
}
