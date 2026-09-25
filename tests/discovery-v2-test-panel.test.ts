import { describe, expect, it } from 'vitest';
import { DISCOVERY_V2_DISCOVER_REQUEST, parseBatchCandidateIds } from '@/features/discovery/discovery-v2-test-panel';

describe('Discovery V2 admin control', () => {
  it('uses only the controlled discover action and source limit', () => {
    expect(DISCOVERY_V2_DISCOVER_REQUEST).toEqual({ action: 'list-sources', sourceLimit: 3 });
  });
  it('parses batch IDs without silently removing duplicates', () => {
    expect(parseBatchCandidateIds(' A,\nB\nA ')).toEqual(['A', 'B', 'A']);
  });
});
