import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { buildResearchQueries, researchSearchTelemetry, classifyResearchSource, classifyEditionMatch, sourceEvidenceWeight, contentQualityScore, generateResearchEditorial, formatCivilEventDate, mergeRaceEvidence, normalizeConfidenceScore, normalizeBrazilianState, normalizeCity, researchConfidence, researchSourceMetrics, shouldResearchEvent, sourceMatchScore, resolveRaceFieldEvidence, matchResearchSources, researchAndEnrichCandidate, ResearchPersistenceError, sanitizePersistenceError, auditGeneratedDescription, resolveResearchMode, type RaceResearchResult, type ResearchInput, type ResearchSource } from '@/features/discovery/research';
import { selectResearchSources } from '@/features/discovery/openai-research-provider';
import type { ExtractedRaceEvent } from '@/features/importer/url-import';

const event: ExtractedRaceEvent = { name: 'Corrida Teste', date: '2026-10-10', startTime: null, city: 'Itajubá', state: 'MG', venue: null, address: null, distances: [], price: null, organizerName: null, registrationUrl: null, coverImageUrl: null };
const source: ResearchSource = { url: 'https://official.example/race', title: 'Official', sourceType: 'official_event', trustLevel: 'A', retrievedAt: '2026-09-24T00:00:00Z' };
const input: ResearchInput = { event, sourceUrl: 'https://example.com/race' };
const result: RaceResearchResult = { sources: [source], facts: { startTime: '07:00', city: 'Itajubá' }, fieldEvidence: { startTime: [{ value: '07:00', source, confidence: 95 }] }, conflicts: [], missingFields: [], researchConfidence: 0, durationMs: 10, status: 'completed', shortDescription: '', longDescription: '' };

describe('discovery research', () => {
  it('uses an explicit batch snapshot over the runtime flag', () => {
    expect(resolveResearchMode(true, false)).toBe('evidence_first');
    expect(resolveResearchMode(false, true)).toBe('legacy_web_search');
    expect(resolveResearchMode(undefined, false)).toBe('legacy_web_search');
  });
  it('preserves civil dates while converting zoned datetimes once', () => {
    expect(formatCivilEventDate('2026-10-18')).toBe('18/10/2026');
    expect(formatCivilEventDate('2026-10-18T10:00:00Z')).toBe('18/10/2026');
    expect(formatCivilEventDate('2026-10-18T02:00:00Z')).toBe('17/10/2026');
    expect(generateResearchEditorial({ ...event, date: '2026-10-18' }, {}, {}).shortDescription).toContain('18/10/2026');
  });
  it('requests research only when relevant data is missing', () => {
    expect(shouldResearchEvent(event)).toBe(true);
    expect(shouldResearchEvent({ ...event, startTime: '07:00', venue: 'Centro', address: 'Rua A', distances: ['5 km'], price: '20', registrationUrl: 'https://example.com/i', organizerName: 'Org' }, { kit: 'Camiseta', packetPickup: 'Local', course: 'Rua', categories: 'Adulto', awards: 'Medalha', regulation: 'https://example.com/reg', notes: 'Info' })).toBe(false);
  });
  it('builds two normal phased queries and reserves a third for conflicts', () => { expect(buildResearchQueries(input)).toHaveLength(2); expect(buildResearchQueries(input, 3)).toHaveLength(3); });
  it('prioritizes one source per domain and records search phase telemetry', () => {
    const weak = { ...source, sourceType: 'race_calendar' as const, trustLevel: 'C' as const, url: 'https://official.example/calendar' };
    expect(selectResearchSources([weak, source], 5)).toEqual([source]);
    expect(researchSearchTelemetry(input, buildResearchQueries(input, 2)).map(item => item.phase)).toEqual(['identity', 'authority']);
  });
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
    expect(decision.rejectionReasons).toContain('critical_conflict_date');
    const editorial = generateResearchEditorial(raceInput.event, diagnosticResult.facts, decision.fieldResolutions);
    expect(editorial.shortDescription).not.toContain('2026-10-24');
    expect(editorial.longDescription).not.toContain('25 de outubro de 2026');
    expect(editorial.longDescription).toContain('data da prova apresenta informações divergentes');
  });
  it('never includes either conflicting critical date in editorial output', () => {
    const raceEvent = { ...event, name: '2ª Corrida das Águas', date: '2026-10-18', city: 'Cambuquira', state: 'MG' };
    const conflict = { ...result, facts: { date: '2026-10-25' }, fieldEvidence: { date: [{ value: '2026-10-25', source, confidence: 80 }, { value: '2026-10-18', source: { ...source, url: 'https://other.example/race' }, confidence: 70 }] }, conflicts: [{ field: 'date', values: [{ value: '2026-10-25', source }, { value: '2026-10-18', source: { ...source, url: 'https://other.example/race' } }], severity: 'high' as const }] };
    const decision = resolveRaceFieldEvidence(raceEvent, conflict);
    const editorial = generateResearchEditorial(raceEvent, conflict.facts, decision.fieldResolutions);
    expect(editorial.shortDescription).not.toContain('18/10/2026');
    expect(editorial.shortDescription).not.toContain('25/10/2026');
    expect(editorial.longDescription).not.toContain('18/10/2026');
    expect(editorial.longDescription).not.toContain('25/10/2026');
    expect(decision.autoPublishEligible).toBe(false);
  });
  it('classifies source type and trust deterministically', () => {
    expect(classifyResearchSource('https://www.portaldascorridas.com.br/event-details/x').sourceType).toBe('registration_platform');
    expect(classifyResearchSource('https://corridabrasil.com/corrida/x').sourceType).toBe('race_calendar');
    expect(classifyResearchSource('https://nogueiraafotografia.fotop.com.br/?lang=pt').sourceType).toBe('photo_platform');
    expect(classifyResearchSource('https://corridabrasil.com/corrida/x').trustLevel).toBe('C');
  });
  it('blocks publication for unsupported editorial claims and audits claims', () => {
    const audited = auditGeneratedDescription('A prova acontece em Itajubá / MG. Uma informação inventada.', event, {});
    expect(audited.unsupportedClaims).toContain('Uma informação inventada');
    expect(audited.autoPublishEligible).toBe(false);
  });
  it('ignores URLs while auditing claims and returns referencedUrls', () => {
    const audited = auditGeneratedDescription('Inscrições: https://www.sympla.com.br/evento/corrida-x/123', event, {});
    expect(audited.unsupportedClaims).toEqual([]);
    expect(audited.referencedUrls).toEqual(['https://www.sympla.com.br/evento/corrida-x/123']);
  });
  it('normalizes equivalent states and cities', () => {
    expect(normalizeBrazilianState('São Paulo')).toBe('SP');
    expect(normalizeBrazilianState('SP')).toBe('SP');
    expect(normalizeCity('São José dos Campos')).toBe(normalizeCity('SAO JOSE DOS CAMPOS'));
  });
  it('marks sources from another year or edition as different editions', () => {
    const raceInput = { ...input, event: { ...event, name: '2ª Corrida das Águas', date: '2026-10-18' } };
    expect(classifyEditionMatch(raceInput, { ...source, title: '1ª Corrida das Águas 2026' })).toBe('different_edition');
    expect(classifyEditionMatch(raceInput, { ...source, title: 'Corrida das Águas 2025' })).toBe('different_edition');
  });
  it('weights an authoritative source above weak calendar sources', () => {
    expect(sourceEvidenceWeight({ ...source, sourceType: 'official_event', trustLevel: 'A', sourceMatchScore: 90 })).toBeGreaterThan(sourceEvidenceWeight({ ...source, sourceType: 'race_calendar', trustLevel: 'C', sourceMatchScore: 100 }));
  });
  it('does not let a different-edition source create a critical conflict', () => {
    const raceInput = { ...input, event: { ...event, name: 'Corrida 2026', date: '2026-10-18' } };
    const old = { ...source, title: 'Corrida 2025', url: 'https://old.example/race' };
    const decision = resolveRaceFieldEvidence(raceInput.event, { ...result, facts: { date: '2026-10-18' }, sources: [source, old], fieldEvidence: { date: [{ value: '2026-10-18', source, confidence: 95 }, { value: '2025-10-18', source: old, confidence: 95 }] } });
    expect(decision.fieldResolutions.date.criticalConflict).toBe(false);
  });
  it('formats civil dates instead of exposing ISO timestamps', () => {
    const editorial = generateResearchEditorial({ ...event, date: '2026-09-26T10:00:00.000Z' });
    expect(editorial.shortDescription).toContain('26/09/2026');
    expect(editorial.shortDescription).not.toContain('T10:00:00');
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
  it('preserves sanitized database metadata and reports persistence failures', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { code: '42703', message: 'column missing', details: 'schema mismatch', hint: 'check migration', column: 'field_resolutions', table: 'discovery_candidate_enrichments' } });
    const client = { from: vi.fn(() => ({ upsert })) } as never;
    const provider = { research: vi.fn().mockResolvedValue(result) };
    await expect(researchAndEnrichCandidate('00000000-0000-0000-0000-000000000001', input, provider, { client })).rejects.toMatchObject({ name: 'ResearchPersistenceError', details: { code: '42703', column: 'field_resolutions', table: 'discovery_candidate_enrichments' } });
    expect(upsert).toHaveBeenCalledWith(expect.not.objectContaining({ field_resolutions: undefined }), { onConflict: 'candidate_id' });
    expect(sanitizePersistenceError({ code: '23505', message: 'duplicate', details: 'unique violation', hint: 'candidate_id' })).toMatchObject({ code: '23505', details: 'unique violation', hint: 'candidate_id' });
    expect(new ResearchPersistenceError('x', { message: 'x', code: '23505' }).details.code).toBe('23505');
  });
  it('preserves decimal research confidence and integer quality scores in the persistence payload', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) } as never;
    const provider = { research: vi.fn().mockResolvedValue({ ...result, researchConfidence: 0.78 }) };
    await researchAndEnrichCandidate('00000000-0000-0000-0000-000000000001', input, provider, { client });
    const payload = upsert.mock.calls[0][0];
    expect(payload.research_confidence).toBe(78);
    expect(payload.factual_confidence).toBe(78);
    expect(payload.content_quality_score).toBe(58);
    expect(typeof payload.research_confidence).toBe('number');
    expect(typeof payload.factual_confidence).toBe('number');
    expect(typeof payload.content_quality_score).toBe('number');
  });
  it.each([[0, 0], [0.78, 78], [0.82, 82], [1, 100], [78, 78], [82.5, 82.5], [100, 100]])('normalizes confidence %s to %s on the canonical 0-100 scale', (input, expected) => {
    expect(normalizeConfidenceScore(input)).toBe(expected);
  });
  it.each([-0.01, 100.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid confidence %s', (input) => {
    expect(normalizeConfidenceScore(input)).toBeNull();
  });
});
