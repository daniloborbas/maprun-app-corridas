import type { Coordinates, DiscoveryQuery, RaceEvent } from './types';
export const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export function distanceBetween(a: Coordinates, b: Coordinates): number {
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude),
    dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function isEnded(event: RaceEvent, now = new Date()) {
  return (
    event.status === 'finished' ||
    new Date(event.end_date || event.start_date).getTime() < now.getTime()
  );
}
export function isPastStart(startDate: string | null | undefined, now = new Date()) {
  return Boolean(startDate) && Date.parse(startDate!) < now.getTime();
}
export function getDiscoveryFeed(events: RaceEvent[], filters: DiscoveryQuery = {}): RaceEvent[] {
  const now = filters.now || new Date();
  const query = normalizeText(filters.query || '');
  const unique = new Map<string, RaceEvent>();
  for (const event of events) if (!unique.has(event.id)) unique.set(event.id, event);
  return [...unique.values()]
    .filter((e) => e.status === 'published' && (filters.includePast || !isEnded(e, now)))
    .map((e) => ({
      ...e,
      distance_km:
        filters.location && e.latitude !== null && e.longitude !== null
          ? distanceBetween(filters.location, { latitude: e.latitude, longitude: e.longitude })
          : undefined,
    }))
    .filter(
      (e) =>
        !query ||
        normalizeText(
          `${e.name} ${e.city} ${e.state} ${e.organizer_name} ${e.event_category} ${e.event_distances.map((d) => `${d.label} ${d.category}`).join(' ')}`,
        ).includes(query),
    )
    .filter((e) => !filters.city || normalizeText(e.city) === normalizeText(filters.city))
    .filter((e) => !filters.state || e.state === filters.state)
    .filter((e) => !filters.category || e.event_category === filters.category)
    .filter(
      (e) =>
        !filters.distance ||
        e.event_distances.some(
          (d) => d.distance_km !== null && Math.abs(d.distance_km - filters.distance!) < 0.2,
        ),
    )
    .filter(
      (e) =>
        !filters.radius ||
        !filters.location ||
        (e.distance_km !== undefined && e.distance_km <= filters.radius),
    )
    .sort((a, b) => {
      const days = (e: RaceEvent) => (Date.parse(e.start_date) - now.getTime()) / 86400000;
      if (filters.location && filters.sort === 'nearby')
        return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) || days(a) - days(b);
      if (filters.location && filters.sort === 'balanced')
        return (
          (a.distance_km ?? 10000) / 25 +
          days(a) / 7 -
          ((b.distance_km ?? 10000) / 25 + days(b) / 7)
        );
      return days(a) - days(b);
    });
}
export const searchEvents = getDiscoveryFeed;
export const getUpcomingEvents = (events: RaceEvent[]) => getDiscoveryFeed(events);
export const getNearbyEvents = (events: RaceEvent[], location: Coordinates, radius = 100) =>
  getDiscoveryFeed(events, { location, radius, sort: 'nearby' });
export const formatDate = (date: string) => {
  const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (civil) return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(date));
};
export const formatWeekday = (date: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: /^(\d{4})-(\d{2})-(\d{2})$/.test(date) ? 'UTC' : 'America/Sao_Paulo' }).format(new Date(/^(\d{4})-(\d{2})-(\d{2})$/.test(date) ? `${date}T00:00:00Z` : date));
export const formatMoney = (price: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(price);
