export type DeduplicationType = 'exact' | 'probable' | 'none';

export interface EventIdentityInput {
  name?: unknown;
  eventDate?: unknown;
  city?: unknown;
  state?: unknown;
}

export interface EventIdentity {
  name: string;
  comparisonName: string;
  eventDate: string;
  city: string;
  state: string;
  key: string;
}

export interface EventDedupRecord extends EventIdentityInput {
  id?: string | null;
  distances?: unknown;
  organizer?: unknown;
}

export interface DeduplicationResult {
  type: DeduplicationType;
  matchedEventId?: string;
  similarity?: number;
  reasons: string[];
}

const BRAZILIAN_STATES: Record<string, string> = Object.fromEntries([
  ['acre', 'AC'], ['alagoas', 'AL'], ['amapa', 'AP'], ['amazonas', 'AM'], ['bahia', 'BA'], ['ceara', 'CE'],
  ['distrito federal', 'DF'], ['espirito santo', 'ES'], ['goias', 'GO'], ['maranhao', 'MA'], ['mato grosso', 'MT'],
  ['mato grosso do sul', 'MS'], ['minas gerais', 'MG'], ['para', 'PA'], ['paraiba', 'PB'], ['parana', 'PR'],
  ['pernambuco', 'PE'], ['piaui', 'PI'], ['rio de janeiro', 'RJ'], ['rio grande do norte', 'RN'],
  ['rio grande do sul', 'RS'], ['rondonia', 'RO'], ['roraima', 'RR'], ['santa catarina', 'SC'], ['sao paulo', 'SP'],
  ['sergipe', 'SE'], ['tocantins', 'TO'],
]);

function fold(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function normalizeEventName(name: unknown): string {
  return fold(name).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function withoutTitleYear(name: string): string {
  return name.replace(/\s+(?:19|20)\d{2}\s*$/u, '').trim();
}

export function normalizeEventCity(city: unknown): string {
  return fold(city).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeEventState(state: unknown): string {
  const value = fold(state).trim();
  if (/^[a-z]{2}$/u.test(value)) return value.toUpperCase();
  return BRAZILIAN_STATES[value] ?? value.toUpperCase();
}

function normalizeDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

export function buildEventIdentity(input: EventIdentityInput): EventIdentity {
  const name = normalizeEventName(input.name);
  const comparisonName = withoutTitleYear(name);
  const eventDate = normalizeDate(input.eventDate);
  const city = normalizeEventCity(input.city);
  const state = normalizeEventState(input.state);
  return { name, comparisonName, eventDate, city, state, key: `${comparisonName}|${eventDate}|${city}|${state}` };
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = a[i - 1] === b[j - 1] ? diagonal : Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + 1);
      diagonal = above;
    }
  }
  return previous[b.length];
}

export function nameSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function sameContext(left: EventIdentity, right: EventIdentity): boolean {
  return Boolean(left.eventDate && right.eventDate && left.eventDate === right.eventDate && left.city && right.city && left.city === right.city && left.state && right.state && left.state === right.state);
}

// 0.88 keeps approximate matches conservative while allowing harmless connector-word differences.
export function classifyEventDeduplication(candidate: EventDedupRecord, existing: EventDedupRecord, threshold = 0.88): DeduplicationResult {
  const left = buildEventIdentity(candidate);
  const right = buildEventIdentity(existing);
  if (!sameContext(left, right)) return { type: 'none', reasons: [] };
  const reasons = ['same_date', 'same_city', 'same_state'];
  if (left.name === right.name || left.comparisonName === right.comparisonName) {
    return { type: 'exact', matchedEventId: existing.id ?? undefined, similarity: 1, reasons: [...reasons, 'same_normalized_name'] };
  }
  const similarity = nameSimilarity(left.comparisonName, right.comparisonName);
  if (similarity >= threshold) return { type: 'probable', matchedEventId: existing.id ?? undefined, similarity, reasons: [...reasons, 'similar_name'] };
  return { type: 'none', similarity, reasons: [] };
}

export function findBestEventDeduplication(candidate: EventDedupRecord, existing: EventDedupRecord[], threshold = 0.88): DeduplicationResult {
  let best: DeduplicationResult = { type: 'none', reasons: [] };
  for (const item of existing) {
    const result = classifyEventDeduplication(candidate, item, threshold);
    if (result.type === 'exact') return result;
    if (result.type === 'probable' && (best.type === 'none' || (result.similarity ?? 0) > (best.similarity ?? 0))) best = result;
  }
  return best;
}
