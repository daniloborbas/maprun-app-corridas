import { eventSchema } from '@/features/events/validation';
import type { RaceEvent } from '@/features/events/types';
export const normalizeImportedEvent = (input: unknown) => eventSchema.parse(input);
export interface EventProvider {
  name: string;
  fetchEvents(): Promise<unknown[]>;
  normalize(input: unknown): ReturnType<typeof normalizeImportedEvent>;
}
export function duplicateKey(event: Pick<RaceEvent, 'name' | 'city' | 'start_date'>) {
  return `${event.name}|${event.city}|${event.start_date.slice(0, 10)}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
