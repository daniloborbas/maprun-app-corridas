import { describe, expect, it } from 'vitest';
import { checkChunkCardinality, chunkCandidateIds, validateBatchCandidateIds } from './dry-run-batch';

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
});
