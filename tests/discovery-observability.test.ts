import { describe, expect, it } from 'vitest';
import { observeAiFallback, sanitizeDiscoveryError, type DiscoveryAiMetrics } from '@/features/discovery/observability';
import { buildDiscoveryRunUpdate } from '@/features/discovery/run-update';

describe('discovery observability', () => {
  const metrics = (): DiscoveryAiMetrics => ({ aiFallbackNeeded: 0, aiCalls: 0, aiSuccesses: 0, aiFailures: 0, aiInputTokens: 0, aiOutputTokens: 0 });

  it('keeps a normal run and non-fallback at zero', () => {
    const value = metrics();
    observeAiFallback(value, { attempted: false, success: false });
    expect(value).toEqual(metrics());
  });

  it('counts successful fallback and usage', () => {
    const value = metrics();
    observeAiFallback(value, { attempted: true, success: true, usage: { inputTokens: 12, outputTokens: 7 } });
    expect(value).toEqual({ aiFallbackNeeded: 1, aiCalls: 1, aiSuccesses: 1, aiFailures: 0, aiInputTokens: 12, aiOutputTokens: 7 });
  });

  it('counts timeout/provider failures and sums two calls', () => {
    const value = metrics();
    observeAiFallback(value, { attempted: true, success: false, errorType: 'timeout', usage: { inputTokens: 4, outputTokens: 1 } });
    observeAiFallback(value, { attempted: true, success: true, usage: { inputTokens: 9, outputTokens: 3 } });
    expect(value.aiCalls).toBe(2);
    expect(value.aiFailures).toBe(1);
    expect(value.aiSuccesses).toBe(1);
    expect(value.aiInputTokens).toBe(13);
    expect(value.aiOutputTokens).toBe(4);
  });

  it('sanitizes error details and never retains secret-like text', () => {
    const detail = sanitizeDiscoveryError('ai', 'provider error sk-secret CRON_SECRET');
    expect(detail).toEqual({ stage: 'ai', type: 'provider_error_sk-secret_CRON_SECRET' });
    expect(JSON.stringify(detail)).not.toContain('OPENAI_API_KEY');
  });

  it('maps the final run payload to the persisted snake_case columns', () => {
    const payload = buildDiscoveryRunUpdate({
      status: 'completed',
      finishedAt: '2026-09-23T22:00:00.000Z',
      sourcesProcessed: 6,
      candidatesFound: 10,
      candidatesNew: 4,
      candidatesEnriched: 3,
      candidatesIgnored: 2,
      errorsCount: 1,
      discoveredCount: 10,
      newCount: 4,
      duplicateCount: 2,
      errorCount: 1,
      errorDetails: [{ stage: 'source', type: 'timeout' }],
      aiMetrics: { aiFallbackNeeded: 2, aiCalls: 2, aiSuccesses: 1, aiFailures: 1, aiInputTokens: 20, aiOutputTokens: 8 },
    });

    expect(payload).toMatchObject({
      status: 'completed',
      finished_at: '2026-09-23T22:00:00.000Z',
      sources_processed: 6,
      candidates_found: 10,
      candidates_new: 4,
      candidates_enriched: 3,
      candidates_ignored: 2,
      errors_count: 1,
      ai_fallback_needed: 2,
      ai_calls: 2,
      ai_successes: 1,
      ai_failures: 1,
      ai_input_tokens: 20,
      ai_output_tokens: 8,
    });
    expect(payload).not.toHaveProperty('aiCalls');
    expect(payload).not.toHaveProperty('aiFallbackNeeded');
    expect(payload).not.toHaveProperty('sourcesProcessed');
  });
});
