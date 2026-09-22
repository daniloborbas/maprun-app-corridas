import type { RaceEvent } from './types';
export const collections: Record<string, { title: string; matches: (e: RaceEvent) => boolean }> = {
  '5km': {
    title: 'Corridas de 5 km',
    matches: (e) => e.event_distances.some((d) => d.distance_km === 5),
  },
  '10km': {
    title: 'Corridas de 10 km',
    matches: (e) => e.event_distances.some((d) => d.distance_km === 10),
  },
  'meia-maratona': {
    title: 'Meias maratonas',
    matches: (e) =>
      e.event_distances.some(
        (d) => d.distance_km !== null && d.distance_km >= 21 && d.distance_km < 22,
      ),
  },
  maratona: {
    title: 'Maratonas',
    matches: (e) =>
      e.event_distances.some(
        (d) => d.distance_km !== null && d.distance_km >= 42 && d.distance_km < 43,
      ),
  },
  'itajuba-mg': {
    title: 'Corridas em Itajubá',
    matches: (e) => e.city === 'Itajubá' && e.state === 'MG',
  },
  'belo-horizonte-mg': {
    title: 'Corridas em Belo Horizonte',
    matches: (e) => e.city === 'Belo Horizonte' && e.state === 'MG',
  },
  'minas-gerais': { title: 'Corridas em Minas Gerais', matches: (e) => e.state === 'MG' },
};
export const indexableCollection = (events: RaceEvent[]) =>
  events.filter((e) => !e.demo && e.status === 'published' && Date.parse(e.start_date) > Date.now())
    .length >= 3;
