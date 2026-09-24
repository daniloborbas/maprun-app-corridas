import { describe, expect, it } from 'vitest';
import { toDiscoveredEventInsert } from '@/features/discovery/persistence';

describe('discovered event persistence mapping', () => {
  it('persists only real table columns and drops execution metadata', () => {
    const payload = toDiscoveredEventInsert({
      source_id: 'source', source_url: 'https://example.com/race', external_id: 'race-1', name: 'Race',
      status: 'pending', order: 1, trust_level: 'B', distance_km: 57,
      city: 'Pouso Alegre', state: 'MG', event_date: '2026-10-01T00:00:00.000Z',
    } as never, 'incomplete');
    expect(payload).toMatchObject({ source_id: 'source', source_url: 'https://example.com/race', name: 'Race', quality_status: 'incomplete' });
    expect(payload).not.toHaveProperty('order');
    expect(payload).not.toHaveProperty('trust_level');
    expect(payload).not.toHaveProperty('distance_km');
  });
});
