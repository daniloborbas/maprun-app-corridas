import { describe, expect, it } from 'vitest';
import { extractCandidateLinks } from '@/features/discovery/providers/html-calendar';

const source = { id: 'source-1', name: 'Calendário local', base_url: 'https://corridas.example/calendario', source_type: 'html_calendar' as const, active: true, region: 'Sul de Minas' };

describe('discovery provider fixtures', () => {
  it('extracts race links and resolves relative URLs', () => {
    const candidates = extractCandidateLinks('<a href="/meia">Meia Maratona de Itajubá</a><a href="/other">Festival de música</a>', source, source.base_url);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source_url).toBe('https://corridas.example/meia');
    expect(candidates[0].status).toBe('pending');
  });

  it('keeps deterministic external ids for duplicate links', () => {
    const candidates = extractCandidateLinks('<a href="/race">Trail Run 10 km</a>', source, source.base_url);
    expect(candidates[0].external_id).toBe('source-1:0:https://corridas.example/race');
  });
});
