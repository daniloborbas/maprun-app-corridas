import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { buildResearchQueries, contentQualityScore, generateResearchEditorial, mergeRaceEvidence, researchConfidence, researchSourceMetrics, shouldResearchEvent, sourceMatchScore, resolveRaceFieldEvidence, matchResearchSources, type RaceResearchResult, type ResearchInput, type ResearchSource } from '@/features/discovery/research';
import type { ExtractedRaceEvent } from '@/features/importer/url-import';

const event: ExtractedRaceEvent = { name: 'Corrida Teste', date: '2026-10-10', startTime: null, city: 'Itajubá', state: 'MG', venue: null, address: null, distances: [], price: null, organizerName: null, registrationUrl: null, coverImageUrl: null };
const source: ResearchSource = { url: 'https://official.example/race', title: 'Official', sourceType: 'official_event', trustLevel: 'A', retrievedAt: '2026-09-24T00:00:00Z' };
const input: ResearchInput = { event, sourceUrl: 'https://example.com/race' };
const result: RaceResearchResult = { sources: [source], facts: { startTime: '07:00', city: 'Itajubá' }, fieldEvidence: { startTime: [{ value: '07:00', source, confidence: 95 }] }, conflicts: [], missingFields: [], researchConfidence: 0, durationMs: 10, status: 'completed', shortDescription: '', longDescription: '' };

describe('discovery research', () => {
  it('requests research only when relevant data is missing', () => {
    expect(shouldResearchEvent(event)).toBe(true);
    expect(shouldResearchEvent({ ...event, startTime: '07:00', venue: 'Centro', address: 'Rua A', distances: ['5 km'], price: '20', registrationUrl: 'https://example.com/i', organizerName: 'Org' }, { kit: 'Camiseta', packetPickup: 'Local', course: 'Rua', categories: 'Adulto', awards: 'Medalha', regulation: 'https://example.com/reg', notes: 'Info' })).toBe(false);
  });
  it('builds at most four focused queries', () => expect(buildResearchQueries(input, 4)).toHaveLength(4));
  it('rejects a source from a previous edition', () => expect(sourceMatchScore(input, source, { date: '2025-10-10', city: 'Itajubá' })).toBe(0));
  it('accepts matching identity and scores trustworthy evidence', () => expect(sourceMatchScore(input, source, { name: 'Corrida Teste', date: '2026-10-10', city: 'Itajubá', state: 'MG' })).toBeGreaterThanOrEqual(95));
  it('classifies and resolves the Aterradinho critical date conflict without silent replacement', () => {
    const sources = [source, { ...source, url: 'https://other.example/race', sourceType: 'registration_platform' as const }];
    const raceInput = { ...input, event: { ...event, name: '1º VOLTA DO ATERRADINHO', date: '2026-10-24T11:00:00.000Z', city: 'Borda da Mata', state: 'MG' } };
    const diagnosticResult: RaceResearchResult = { ...result, researchConfidence: 82, sources, facts: { date: '2026-10-25', city: 'Borda da Mata' }, fieldEvidence: { date: [{ value: '2026-10-25', source, confidence: 98 }, { value: '2026-10-18', source: sources[1], confidence: 45 }] }, conflicts: [{ field: 'date', values: [{ value: '2026-10-25', source }, { value: '2026-10-18', source: sources[1] }], severity: 'high' }] };
    const decision = resolveRaceFieldEvidence(raceInput.event, diagnosticResult);
    expect(decision.fieldResolutions.date.status).toBe('conflicted');
    expect(decision.autoPublishEligible).toBe(false);
    expect(decision.replacements).toHaveLength(0);
    expect(matchResearchSources(raceInput, sources, diagnosticResult.facts).every((item) => item.classification)).toBe(true);
  });
  it('does not count repeated URLs from one domain as independent evidence', () => {
    const repeated = { ...source, url: 'https://example.test/another' };
    const decision = resolveRaceFieldEvidence(event, { ...result, researchConfidence: 95, facts: { startTime: '07:00' }, fieldEvidence: { startTime: [{ value: '07:00', source, confidence: 95 }, { value: '07:00', source: repeated, confidence: 95 }] } });
    expect(decision.fieldResolutions.startTime.supportingSources).toHaveLength(2);
  });
  it('fills empty fields without overwriting deterministic values', () => {
    const merged = mergeRaceEvidence({ ...event, city: 'Itajubá' }, result);
    expect(merged.startTime).toBe('07:00');
    expect(merged.city).toBe('Itajubá');
  });
  it('calculates separate research and content scores', () => {
    expect(researchConfidence(result)).toBe(100);
    expect(contentQualityScore({ ...event, startTime: '07:00', distances: ['5 km'] })).toBeGreaterThan(contentQualityScore(event));
  });
  it('calculates accepted, rejected, and duplicate source counts', () => {
    expect(researchSourceMetrics({ sources: [source, { ...source, url: 'https://official.example/other' }], rawSourcesCount: 5, rejectedSources: [{ url: 'https://other.example', reason: 'mismatch' }] })).toEqual({ rawSourcesCount: 5, uniqueSourcesCount: 2, acceptedSourcesCount: 2, rejectedSourcesCount: 1, duplicateSourcesCount: 2 });
  });
  it('writes editorial text only from confirmed facts', () => {
    const editorial = generateResearchEditorial({ ...event, startTime: '07:00', distances: ['5 km'] });
    expect(editorial.shortDescription).toContain('Corrida Teste');
    expect(editorial.longDescription).toContain('07:00');
    expect(editorial.longDescription).not.toContain('kit');
  });
});
