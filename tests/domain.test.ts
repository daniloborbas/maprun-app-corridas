import { describe, expect, it } from 'vitest';
import {
  distanceBetween,
  getDiscoveryFeed,
  isEnded,
  formatDate,
} from '@/features/events/discovery';
import { demoEvents } from '@/features/events/fixtures';
import { eventSchema, isPublicHttpsUrl } from '@/features/events/validation';
import { duplicateKey, normalizeImportedEvent } from '@/integrations/events/normalize';
import { analyticsSchema } from '@/features/analytics/schema';
import { summarizeMetrics } from '@/features/admin/metrics';
const now = new Date('2026-09-21T12:00:00Z');
describe('geographic discovery', () => {
  it('returns zero for equal coordinates and handles antipodes', () => {
    expect(distanceBetween({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 })).toBe(0);
    expect(
      distanceBetween({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }),
    ).toBeCloseTo(20015, 0);
  });
  it('estimates São Paulo to Rio within a meaningful margin', () => {
    const km = distanceBetween(
      { latitude: -23.551, longitude: -46.633 },
      { latitude: -22.907, longitude: -43.173 },
    );
    expect(km).toBeGreaterThan(350);
    expect(km).toBeLessThan(370);
  });
  it('does not treat coordinates at zero as missing', () => {
    expect(
      getDiscoveryFeed([{ ...demoEvents[0], latitude: 0, longitude: 0 }], {
        now,
        location: { latitude: 0, longitude: 0 },
        radius: 25,
      })[0].distance_km,
    ).toBe(0);
  });
  it('filters by radius and gracefully works without location', () => {
    const nearby = getDiscoveryFeed(demoEvents, {
      now,
      location: { latitude: -22.425, longitude: -45.452 },
      radius: 25,
    });
    expect(nearby.length).toBe(2);
    expect(nearby.every((e) => e.city === 'Itajubá')).toBe(true);
    expect(getDiscoveryFeed(demoEvents, { now, radius: 25 }).length).toBeGreaterThan(2);
  });
  it('sorts by proximity and balances date deterministically', () => {
    const filters = { now, location: { latitude: -23.551, longitude: -46.633 } };
    expect(getDiscoveryFeed(demoEvents, { ...filters, sort: 'nearby' })[0].city).toBe('São Paulo');
    expect(getDiscoveryFeed(demoEvents, { ...filters, sort: 'balanced' })).toEqual(
      getDiscoveryFeed(demoEvents, { ...filters, sort: 'balanced' }),
    );
  });
});
describe('dates, search and eligibility', () => {
  it('excludes cancelled, draft, archived and ended events', () => {
    const events = [
      ...demoEvents,
      { ...demoEvents[0], id: 'draft', status: 'draft' as const },
      { ...demoEvents[0], id: 'archived', status: 'archived' as const },
    ];
    const feed = getDiscoveryFeed(events, { now });
    expect(feed).toHaveLength(10);
    expect(feed.every((e) => e.status === 'published' && !isEnded(e, now))).toBe(true);
  });
  it('excludes an expired published event, preserves upcoming chronological order', () => {
    const events = [
      { ...demoEvents[0], start_date: '2020-01-01T07:00:00-03:00', end_date: null },
      ...demoEvents.slice(1),
    ];
    const feed = getDiscoveryFeed(events, { now });
    expect(feed.some((e) => e.id === demoEvents[0].id)).toBe(false);
    expect(feed.map((e) => Date.parse(e.start_date))).toEqual(
      feed.map((e) => Date.parse(e.start_date)).sort((a, b) => a - b),
    );
  });
  it('renders each event id at most once', () => {
    const duplicate = { ...demoEvents[0] };
    const feed = getDiscoveryFeed([duplicate, duplicate, ...demoEvents.slice(1)], { now });
    expect(feed.filter((event) => event.id === duplicate.id)).toHaveLength(1);
  });
  it('finds cities without accents and combines distance/category filters', () => {
    expect(getDiscoveryFeed(demoEvents, { now, query: 'itajuba' })).toHaveLength(2);
    const results = getDiscoveryFeed(demoEvents, { now, distance: 21, category: 'trail' });
    expect(results).toHaveLength(2);
  });
  it('displays the Brazilian day across UTC midnight', () => {
    expect(formatDate('2026-10-19T01:00:00Z')).toContain('18');
  });
  it('keeps an ongoing event until its explicit end', () => {
    expect(
      isEnded(
        { ...demoEvents[0], start_date: '2026-09-21T06:00:00Z', end_date: '2026-09-21T18:00:00Z' },
        now,
      ),
    ).toBe(false);
  });
});
describe('normalization and input boundaries', () => {
  it('accepts valid normalized events without inventing prices', () => {
    const event = normalizeImportedEvent({ ...demoEvents[0], price_from: null });
    expect(event.price_from).toBeNull();
    expect(event.event_distances).toHaveLength(3);
  });
  it('rejects invalid coordinates, intervals and unsafe external URLs', () => {
    expect(eventSchema.safeParse({ ...demoEvents[0], latitude: 91 }).success).toBe(false);
    expect(
      eventSchema.safeParse({ ...demoEvents[0], end_date: '2020-01-01T00:00:00Z' }).success,
    ).toBe(false);
    for (const registration_url of [
      'javascript:alert(1)',
      'http://example.com',
      'https://user:password@example.com',
      'https://localhost',
    ])
      expect(eventSchema.safeParse({ ...demoEvents[0], registration_url }).success).toBe(false);
    expect(isPublicHttpsUrl('https://ticketsports.com.br')).toBe(true);
  });
  it('requires paired coordinates and structured distances', () => {
    expect(eventSchema.safeParse({ ...demoEvents[0], longitude: null }).success).toBe(false);
    expect(eventSchema.safeParse({ ...demoEvents[0], event_distances: '5km,10km' }).success).toBe(
      false,
    );
  });
  it('normalizes duplicate keys across case and accents', () => {
    expect(duplicateKey({ ...demoEvents[0], name: 'CORRIDA', city: 'ITAJUBA' })).toBe(
      duplicateKey({ ...demoEvents[0], name: 'corrida', city: 'Itajubá' }),
    );
  });
});
describe('analytics', () => {
  it('rejects arbitrary event names and strips sensitive properties', () => {
    const base = { sessionId: demoEvents[0].id, source: '/', kind: 'search' };
    expect(analyticsSchema.safeParse({ ...base, kind: 'anything' }).success).toBe(false);
    expect(
      analyticsSchema.parse({ ...base, properties: { latitude: 12, email: 'private@example.com' } })
        .properties,
    ).toEqual({});
  });
  it('does not double count attributed and aggregate registration clicks', () => {
    const rows = [
      {
        event_name: 'registration_click',
        event_id: null,
        session_id: null,
        source: 'registration_redirect',
        created_at: now.toISOString(),
      },
      {
        event_name: 'registration_click',
        event_id: null,
        session_id: 'one',
        source: '/corrida/example',
        created_at: now.toISOString(),
      },
    ];
    expect(summarizeMetrics(rows, now).clicks).toBe(1);
    expect(summarizeMetrics(rows, now).online).toBe(1);
  });
});
