import { describe, expect, it } from 'vitest';
import { prioritizeEnrichmentCandidates } from '@/features/discovery/enrichment-priority';

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

describe('enrichment budget priority', () => {
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
