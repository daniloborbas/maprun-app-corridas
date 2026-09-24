import { describe, expect, it } from 'vitest';
import { recordDiscoveryError, sanitizeDiscoveryError } from '@/features/discovery/observability';

describe('discovery persistence diagnostics', () => {
  it('keeps database metadata while sanitizing secrets and URLs', () => {
    const detail = sanitizeDiscoveryError('candidate_persistence', 'database_error', {
      operation: 'insert_discovered_event', source_name: 'Fonte', source_url: 'https://example.com/event?token=secret',
      db_code: '23505', message: 'Authorization Bearer super-secret', details: 'duplicate', hint: 'use another id',
    });
    expect(detail.db_code).toBe('23505');
    expect(detail.source_url).toBe('https://example.com/event');
    expect(detail.message).not.toContain('super-secret');
    expect(detail.hint).toBe('use another id');
  });

  it('groups repeated errors and tracks occurrences', () => {
    const errors: ReturnType<typeof sanitizeDiscoveryError>[] = [];
    const detail = sanitizeDiscoveryError('candidate_persistence', 'database_error', { source_id: 's', db_code: '23505' });
    recordDiscoveryError(errors, detail);
    recordDiscoveryError(errors, detail);
    expect(errors).toHaveLength(1);
    expect(errors[0].occurrences).toBe(2);
  });
});
