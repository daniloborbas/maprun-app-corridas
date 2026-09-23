import { describe, expect, it } from 'vitest';
import { observeAiFallback, sanitizeDiscoveryError, type DiscoveryAiMetrics } from '@/features/discovery/observability';

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
});
