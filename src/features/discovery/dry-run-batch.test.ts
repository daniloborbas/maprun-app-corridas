import { describe, expect, it } from 'vitest';
import { MAX_BATCH_SELECTED, checkChunkCardinality, chunkCandidateIds, validateBatchCandidateIds } from './dry-run-batch';

describe('selective dry-run batch orchestration', () => {
  it('chunks four and five IDs in pairs', () => {
    expect(chunkCandidateIds(['A', 'B', 'C', 'D'])).toEqual([['A', 'B'], ['C', 'D']]);
    expect(chunkCandidateIds(['A', 'B', 'C', 'D', 'E'])).toEqual([['A', 'B'], ['C', 'D'], ['E']]);
  });
  it('freezes and validates the exact ordered list', () => {
    expect(validateBatchCandidateIds(['A', 'B'], ['B', 'A'])).toEqual({ candidateIds: ['A', 'B'], requestedCount: 2, validatedCount: 2 });
    expect(() => validateBatchCandidateIds([], [])).toThrow();
    expect(() => validateBatchCandidateIds(['A', 'A'], ['A'])).toThrow(/duplicados/);
    expect(() => validateBatchCandidateIds(['A', 'B'], ['A'])).toThrow(/inexistentes/);
  });
  it('stops on a chunk cardinality mismatch', () => {
    expect(checkChunkCardinality(['A', 'B'], ['A'])).toMatchObject({ valid: false, expectedCount: 2, returnedCount: 1 });
    expect(checkChunkCardinality(['A', 'B'], ['B', 'A']).valid).toBe(true);
  });
  it('accepts at most 30 explicit IDs and rejects 31', () => {
    const ids = Array.from({ length: MAX_BATCH_SELECTED }, (_, i) => `id-${i}`);
    expect(validateBatchCandidateIds(ids, ids).validatedCount).toBe(30);
    const tooMany = [...ids, 'id-30'];
    expect(() => validateBatchCandidateIds(tooMany, tooMany)).toThrow(/Máximo de 30/);
  });
});
