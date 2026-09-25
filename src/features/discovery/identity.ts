import type { ExtractedRaceEvent } from '@/features/importer/url-import';
import { normalizeBrazilianState, normalizeCity } from './research-normalizers';
export function hasStrongCandidateIdentity(input: { event: ExtractedRaceEvent }, sources: Array<{ sourceMatchScore?: number; editionMatch?: string }>, facts: Record<string, unknown>, conflicts: Array<{ field: string; severity: string }> = []) {
  const matches = Boolean(input.event.name && input.event.date && input.event.city && input.event.state && facts.name && facts.date && facts.city && facts.state && String(facts.name).toLowerCase().includes(String(input.event.name).toLowerCase().split(' ')[0]) && String(facts.date).slice(0, 10) === String(input.event.date).slice(0, 10) && normalizeCity(String(facts.city)) === normalizeCity(input.event.city) && normalizeBrazilianState(facts.state) === normalizeBrazilianState(input.event.state));
  return matches && sources.some((source) => (source.sourceMatchScore ?? 0) >= 80 && source.editionMatch !== 'different_edition') && !conflicts.some((conflict) => ['name', 'date', 'city', 'state'].includes(conflict.field) && conflict.severity === 'high');
}
