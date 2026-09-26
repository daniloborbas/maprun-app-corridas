import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { diagnoseDryRunCandidateSelection } from '@/features/discovery/candidate-repository';

function clientFor(rows: Array<Record<string, unknown>>) {
  return { from: () => ({ select: () => ({ in: async () => ({ data: rows, error: null }) }) }) } as never;
}

describe('persisted chunk lease diagnostics', () => {
  it('distinguishes expired and active processing leases without touching other IDs', async () => {
    const expired = '2020-01-01T00:00:00.000Z';
    const active = new Date(Date.now() + 60_000).toISOString();
    const result = await diagnoseDryRunCandidateSelection(
      ['expired', 'active', 'outside'],
      true,
      clientFor([
        { id: 'expired', status: 'processing', processing_lease_expires_at: expired },
        { id: 'active', status: 'processing', processing_lease_expires_at: active },
      ]),
    );
    expect(result).toEqual([
      { candidateId: 'expired', currentStatus: 'processing', leaseExpired: true, reason: 'expired_processing_not_recovered' },
      { candidateId: 'active', currentStatus: 'processing', leaseExpired: false, reason: 'active_lease' },
      { candidateId: 'outside', currentStatus: null, leaseExpired: null, reason: 'not_found' },
    ]);
  });

  it('does not block explicitly reprocessable extracted candidates', async () => {
    const result = await diagnoseDryRunCandidateSelection(
      ['extracted'], true,
      clientFor([{ id: 'extracted', status: 'extracted', processing_lease_expires_at: null }]),
    );
    expect(result).toEqual([]);
  });
});
