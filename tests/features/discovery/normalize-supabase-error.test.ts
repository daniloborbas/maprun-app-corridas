import { describe, expect, it } from 'vitest';
import { normalizeSupabaseError } from '../../../src/features/discovery/normalize-supabase-error';

describe('normalizeSupabaseError', () => {
  it('preserves safe Supabase fields from a plain object', () => {
    expect(normalizeSupabaseError({ code: '23505', message: 'duplicate', details: 'details', hint: 'hint', status: 409 }))
      .toEqual({ code: '23505', message: 'duplicate', details: 'details', hint: 'hint', status: 409 });
  });
  it('preserves native Error messages', () => {
    expect(normalizeSupabaseError(new Error('failed'))).toEqual({ message: 'failed' });
  });
  it('uses a safe fallback for unknown objects', () => {
    expect(normalizeSupabaseError({ secret: 'hidden', authorization: 'hidden' })).toEqual({ message: 'Erro desconhecido de persistência.' });
  });
  it('does not serialize sensitive extras', () => {
    expect(JSON.stringify(normalizeSupabaseError({ message: 'failed', service_role_key: 'secret', headers: { authorization: 'secret' } }))).not.toContain('secret');
  });
});
