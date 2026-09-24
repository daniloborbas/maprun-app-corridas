import { describe, expect, it } from 'vitest';
import { classifyGeographicPriority, prioritizeEnrichmentCandidates } from '@/features/discovery/enrichment-priority';

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

describe('enrichment budget priority', () => {
  it('classifies the geographic bands around Itajubá', () => {
    expect(classifyGeographicPriority({ latitude: -22.4256, longitude: -45.4528 })).toBe('high');
    expect(classifyGeographicPriority({ latitude: -23.8, longitude: -45.4 })).toBe('medium');
    expect(classifyGeographicPriority({ latitude: -25.0, longitude: -49.0 })).toBe('low');
    expect(classifyGeographicPriority({})).toBe('unknown');
  });
  it('orders geographic priority before trust and date tie-breakers', () => {
    const result = prioritizeEnrichmentCandidates([
      { id: 'low', latitude: -25, longitude: -49, trust_level: 'B' },
      { id: 'unknown', trust_level: 'C' },
      { id: 'high-c', latitude: -22.4256, longitude: -45.4528, trust_level: 'C' },
      { id: 'high-b', latitude: -22.4256, longitude: -45.4528, trust_level: 'B' },
    ], [], 4);
    expect(ids(result)).toEqual(['high-b', 'high-c', 'unknown', 'low']);
  });
  it('uses unknown candidates before low candidates without exceeding budget', () => {
    const result = prioritizeEnrichmentCandidates([
      { id: 'unknown' },
      { id: 'low', latitude: -25, longitude: -49 },
    ], [], 1);
    expect(ids(result)).toEqual(['unknown']);
  });
  it('uses remaining budget for old candidates after all new candidates', () => {
    expect(ids(prioritizeEnrichmentCandidates([{ id: 'n1' }, { id: 'n2' }], Array.from({ length: 20 }, (_, i) => ({ id: `o${i}` })), 25))).toEqual(['n1', 'n2', ...Array.from({ length: 20 }, (_, i) => `o${i}`)]);
  });
  it('does not process old candidates when new candidates exceed the budget', () => {
    expect(ids(prioritizeEnrichmentCandidates(Array.from({ length: 30 }, (_, i) => ({ id: `n${i}` })), [{ id: 'old' }], 25))).toHaveLength(25);
    expect(ids(prioritizeEnrichmentCandidates(Array.from({ length: 30 }, (_, i) => ({ id: `n${i}` })), [{ id: 'old' }], 25))).not.toContain('old');
  });
  it('keeps the old-only flow when there are no new candidates', () => {
    expect(ids(prioritizeEnrichmentCandidates([], [{ id: 'old1' }, { id: 'old2' }], 25))).toEqual(['old1', 'old2']);
  });
  it('does not exceed the fixed budget, including failed candidates', () => {
    expect(prioritizeEnrichmentCandidates([{ id: 'n1' }, { id: 'n2' }], [{ id: 'old' }], 25)).toHaveLength(3);
    expect(prioritizeEnrichmentCandidates(Array.from({ length: 40 }, (_, i) => ({ id: `n${i}` })), [], 25)).toHaveLength(25);
  });
  it('does not treat known candidates as new', () => {
    expect(ids(prioritizeEnrichmentCandidates([{ id: 'new' }], [{ id: 'known' }], 1))).toEqual(['new']);
  });
});
