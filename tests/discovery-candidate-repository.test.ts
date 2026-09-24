import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { markCandidateExtracted, markCandidateFailed, markCandidateIgnored, markCandidateProcessing, upsertDiscoveredCandidates } from '@/features/discovery/candidate-repository';
import type { DiscoverySource } from '@/features/discovery/types';

const source: DiscoverySource = { id: 'source-1', name: 'Fonte', base_url: 'https://example.com', source_type: 'other', active: true, region: 'MG' };
const url = { url: 'https://example.com/race', sourceId: source.id, discoveredAt: '2026-09-24T12:00:00.000Z', discoveryMethod: 'listing_page' as const, titleHint: 'Race' };

describe('discovery candidate repository', () => {
  it('returns coherent metrics for new and existing upserts', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { inserted: true }, error: null })
      .mockResolvedValueOnce({ data: { inserted: false }, error: null });
    const result = await upsertDiscoveredCandidates(source, [url, url], { rpc } as never);
    expect(result).toEqual({ urlsFound: 2, newCandidates: 1, existingCandidates: 1, candidatesPersisted: 2 });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('counts stringified inserted flags as new candidates', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { inserted: 'true' }, error: null });
    const result = await upsertDiscoveredCandidates(source, [url], { rpc } as never);
    expect(result.newCandidates).toBe(1);
    expect(result.existingCandidates).toBe(0);
  });

  it('uses the atomic claim and exposes state transitions', async () => {
    const row = { id: 'candidate-1', status: 'processing' };
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) }) }) });
    const client = { rpc, from: vi.fn(() => ({ update })) } as never;
    expect(await markCandidateProcessing('candidate-1', client)).toEqual(row);
    expect(await markCandidateExtracted('candidate-1', {}, client)).toEqual(row);
    expect(await markCandidateIgnored('candidate-1', {}, client)).toEqual(row);
    expect(await markCandidateFailed('candidate-1', 'timeout', 1, new Date('2026-09-24T12:00:00.000Z'), client)).toEqual(row);
    expect(rpc).toHaveBeenCalledWith('claim_discovery_candidate', { p_candidate_id: 'candidate-1' });
    expect(update).toHaveBeenCalledTimes(3);
  });
});
