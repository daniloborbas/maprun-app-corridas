import { describe, expect, it } from 'vitest';
import { classifyDiscoveryCandidate, pathnamePattern } from '@/features/discovery/candidate-audit';

describe('discovery candidate audit', () => {
  it('classifies event paths', () => expect(classifyDiscoveryCandidate({ url: 'https://x.test/corrida/abc' }).classification).toBe('probable_event'));
  it('classifies institutional paths', () => expect(classifyDiscoveryCandidate({ url: 'https://x.test/contato' }).classification).toBe('probable_non_event'));
  it('returns uncertain without deterministic signal', () => expect(classifyDiscoveryCandidate({ url: 'https://x.test/foo/bar' }).classification).toBe('uncertain'));
  it('groups pathname patterns', () => expect(pathnamePattern('https://x.test/event-details/123')).toBe('/event-details/*'));
});
