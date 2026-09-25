import { describe, expect, it } from 'vitest';
import { calculateEvidenceResearchConfidence } from '@/features/discovery/evidence-first';
import { hasStrongCandidateIdentity } from '@/features/discovery/identity';
import type { ResearchInput } from '@/features/discovery/research';
import type { ExtractedRaceEvent } from '@/features/importer/url-import';

describe('semantic confidence and identity guards', () => {
  const event = { name: 'Corrida', date: '2026-10-18', startTime: null, city: 'Itajuba', state: 'MG', venue: null, address: null, distances: ['5 km'], price: null, organizerName: null, registrationUrl: 'https://inscricao.corrida1.com.br/organizador', coverImageUrl: null } as const;
  it('does not count photo or organizer URLs as critical registration evidence', () => {
    const invalid = calculateEvidenceResearchConfidence({ event: event as unknown as ExtractedRaceEvent, sources: [] });
    const valid = calculateEvidenceResearchConfidence({ event: { ...event, registrationUrl: 'https://www.sympla.com.br/evento/corrida/123' } as unknown as ExtractedRaceEvent, sources: [] });
    expect(valid).toBeGreaterThan(invalid);
  });
  it('requires strong source identity and matching core facts', () => {
    const input = { event: { ...event, registrationUrl: 'https://www.sympla.com.br/evento/corrida/123' }, sourceUrl: 'https://source.test/corrida' } as unknown as ResearchInput;
    const source = { url: input.sourceUrl, title: 'Corrida', sourceType: 'official_event', trustLevel: 'A', retrievedAt: '', sourceMatchScore: 90, editionMatch: 'same_edition' } as never;
    expect(hasStrongCandidateIdentity(input, [source], { name: 'Corrida', date: '2026-10-18', city: 'Itajuba', state: 'MG' })).toBe(true);
    expect(hasStrongCandidateIdentity(input, [source], { name: 'Outra', date: '2026-10-18', city: 'Itajuba', state: 'MG' })).toBe(false);
  });
});




