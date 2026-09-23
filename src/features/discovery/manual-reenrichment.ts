import type { DiscoveredEventCandidate } from './types';

export function canManuallyReenrich(candidate: Pick<DiscoveredEventCandidate, 'status'|'quality_status'>) {
  return candidate.status === 'pending' && (candidate.quality_status === 'incomplete' || candidate.quality_status === 'conflict');
}
