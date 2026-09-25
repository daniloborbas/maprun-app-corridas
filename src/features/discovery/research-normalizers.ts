export const plain = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function normalizeBrazilianState(value: unknown) { const raw = plain(String(value ?? '').trim().toLowerCase()).replace(/\s+/g, ' '); return raw.length === 2 ? raw.toUpperCase() : raw.toUpperCase(); }
export function normalizeCity(value: unknown) { return plain(String(value ?? '').trim().toLowerCase()).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
