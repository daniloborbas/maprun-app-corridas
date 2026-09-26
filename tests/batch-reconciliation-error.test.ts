import { describe, expect, it } from 'vitest';
import { normalizeSupabaseError, reconciliationErrorResponse } from '@/features/discovery/normalize-supabase-error';

describe('batch reconciliation error transport', () => {
  it('preserves Supabase plain-object fields for the real route response', () => {
    const response = reconciliationErrorResponse({
      code: 'PGRST123',
      message: 'update failed',
      details: 'row rejected',
      hint: 'check constraint',
      status: 409,
      authorization: 'secret',
    });
    expect(response.status).toBe(409);
    expect(response.error).toBe('batch_reconciliation_failed');
    expect(response.reconciliationError).toEqual({
      code: 'PGRST123',
      message: 'update failed',
      details: 'row rejected',
      hint: 'check constraint',
      status: 409,
      statusCode: null,
    });
    expect(JSON.stringify(response)).not.toContain('secret');
  });

  it('preserves native Error messages', () => {
    expect(normalizeSupabaseError(new Error('native failure'))).toEqual({ message: 'native failure' });
  });

  it('keeps a structured fallback for unknown errors', () => {
    expect(reconciliationErrorResponse(null)).toEqual({
      error: 'batch_reconciliation_failed',
      reconciliationError: { message: 'unknown_reconciliation_error', code: null, details: null, hint: null, status: null, statusCode: null },
      status: 409,
    });
  });
});
