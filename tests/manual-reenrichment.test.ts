import { describe, expect, it } from 'vitest';
import { canManuallyReenrich } from '@/features/discovery/manual-reenrichment';

describe('manual discovery re-enrichment', () => {
  it('allows only pending incomplete or conflict candidates', () => {
    expect(canManuallyReenrich({ status: 'pending', quality_status: 'incomplete' })).toBe(true);
    expect(canManuallyReenrich({ status: 'pending', quality_status: 'conflict' })).toBe(true);
    expect(canManuallyReenrich({ status: 'pending', quality_status: 'ready' })).toBe(false);
    expect(canManuallyReenrich({ status: 'duplicate', quality_status: 'incomplete' })).toBe(false);
  });
});
