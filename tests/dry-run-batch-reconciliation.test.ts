import { describe, expect, it } from 'vitest';
import { reconcileDryRunBatchCounters } from '@/features/discovery/dry-run-batch-reconciliation';

describe('persisted dry-run batch reconciliation', () => {
  it('derives 14/14/0 and nextIndex 14 from stale parent counters', () => {
    const results = Array.from({ length: 14 }, (_, position) => ({ position, persistence_status: 'persisted' }));
    expect(reconcileDryRunBatchCounters({ status: 'running', total_count: 25 }, results)).toMatchObject({ processedCount: 14, succeededCount: 14, failedCount: 0, nextIndex: 14, status: 'running' });
  });
  it('rejects a position gap', () => {
    expect(() => reconcileDryRunBatchCounters({ status: 'running', total_count: 3 }, [{ position: 0, persistence_status: 'persisted' }, { position: 2, persistence_status: 'persisted' }])).toThrow('batch_results_position_gap');
  });
  it('does not count partial editorial results as operational failures', () => {
    expect(reconcileDryRunBatchCounters({ status: 'running', total_count: 1 }, [{ position: 0, persistence_status: 'persisted' }])).toMatchObject({ succeededCount: 1, failedCount: 0 });
  });
  it('sets completed or partially_completed only when all positions exist', () => {
    const complete = [{ position: 0, persistence_status: 'persisted' }, { position: 1, persistence_status: 'persisted' }];
    const withFailure = [{ position: 0, persistence_status: 'persisted' }, { position: 1, persistence_status: 'failed' }];
    expect(reconcileDryRunBatchCounters({ status: 'running', total_count: 2 }, complete).status).toBe('completed');
    expect(reconcileDryRunBatchCounters({ status: 'running', total_count: 2 }, withFailure).status).toBe('partially_completed');
  });
  it('is idempotent', () => {
    const results = [{ position: 0, persistence_status: 'persisted' }, { position: 1, persistence_status: 'failed' }];
    expect(reconcileDryRunBatchCounters({ status: 'running', total_count: 2 }, results)).toEqual(reconcileDryRunBatchCounters({ status: 'running', total_count: 2 }, results));
  });
});
