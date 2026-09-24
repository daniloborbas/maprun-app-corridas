export interface DiscoveryAiMetrics {
  aiFallbackNeeded: number;
  aiCalls: number;
  aiSuccesses: number;
  aiFailures: number;
  aiInputTokens: number;
  aiOutputTokens: number;
}

export interface AiObservation { attempted: boolean; success: boolean; errorType?: string; usage?: { inputTokens?: number; outputTokens?: number } }

export interface DiscoveryErrorDetail {
  stage: string;
  type: string;
  operation?: string;
  source_id?: string;
  source_name?: string;
  external_id?: string | null;
  source_url?: string;
  db_code?: string;
  message?: string;
  details?: string;
  hint?: string;
  occurrences?: number;
}

export function observeAiFallback(metrics: DiscoveryAiMetrics, observation: AiObservation) {
  if (!observation.attempted) return;
  metrics.aiFallbackNeeded += 1;
  metrics.aiCalls += 1;
  if (observation.success) metrics.aiSuccesses += 1;
  else metrics.aiFailures += 1;
  metrics.aiInputTokens += observation.usage?.inputTokens ?? 0;
  metrics.aiOutputTokens += observation.usage?.outputTokens ?? 0;
}

function safeText(value: unknown, max = 240) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/(?:Bearer|Basic)\s+[^\s]+/gi, '[redacted]').slice(0, max);
}

function safeUrl(value: unknown) {
  try { const url = new URL(String(value)); url.search = ''; url.hash = ''; return url.toString().slice(0, 500); } catch { return ''; }
}

export function sanitizeDiscoveryError(stage: string, type: string, extra: Partial<DiscoveryErrorDetail> = {}): DiscoveryErrorDetail {
  return {
    stage: stage.slice(0, 40),
    type: type.slice(0, 80).replace(/[^a-zA-Z0-9_.-]/g, '_'),
    ...(extra.operation ? { operation: safeText(extra.operation, 80) } : {}),
    ...(extra.source_id ? { source_id: safeText(extra.source_id, 80) } : {}),
    ...(extra.source_name ? { source_name: safeText(extra.source_name, 120) } : {}),
    ...(extra.external_id ? { external_id: safeText(extra.external_id, 160) } : {}),
    ...(extra.source_url ? { source_url: safeUrl(extra.source_url) } : {}),
    ...(extra.db_code ? { db_code: safeText(extra.db_code, 40) } : {}),
    ...(extra.message ? { message: safeText(extra.message) } : {}),
    ...(extra.details ? { details: safeText(extra.details) } : {}),
    ...(extra.hint ? { hint: safeText(extra.hint) } : {}),
  };
}

export function recordDiscoveryError(errors: DiscoveryErrorDetail[], detail: DiscoveryErrorDetail, maxPerKey = 3) {
  const key = [detail.stage, detail.type, detail.operation, detail.source_id, detail.db_code].join('|');
  const existing = errors.find((item) => [item.stage, item.type, item.operation, item.source_id, item.db_code].join('|') === key);
  if (existing) { existing.occurrences = Math.min((existing.occurrences ?? 1) + 1, 9999); return; }
  if (errors.filter((item) => [item.stage, item.type, item.operation, item.source_id, item.db_code].join('|') === key).length < maxPerKey) errors.push({ ...detail, occurrences: 1 });
}
