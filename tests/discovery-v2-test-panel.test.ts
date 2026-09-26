import { describe, expect, it } from 'vitest';
import { DISCOVERY_V2_DISCOVER_REQUEST, parseBatchCandidateIds, canProcessPersistedBatch } from '@/features/discovery/discovery-v2-test-panel';

describe('Discovery V2 admin control', () => {
  it('uses only the controlled discover action and source limit', () => {
    expect(DISCOVERY_V2_DISCOVER_REQUEST).toEqual({ action: 'list-sources', sourceLimit: 3 });
  });
  it('parses batch IDs without silently removing duplicates', () => {
    expect(parseBatchCandidateIds(' A,\nB\nA ')).toEqual(['A', 'B', 'A']);
  });
});

describe('persisted batch controls', () => {
  it('allows one chunk for pending batch', () => expect(canProcessPersistedBatch({ status: 'pending', processed_count: 0, total_count: 25 })).toBe(true));
  it('blocks terminal batches', () => expect(canProcessPersistedBatch({ status: 'completed', processed_count: 25, total_count: 25 })).toBe(false));
  it('blocks fully processed batches', () => expect(canProcessPersistedBatch({ status: 'running', processed_count: 25, total_count: 25 })).toBe(false));
});
