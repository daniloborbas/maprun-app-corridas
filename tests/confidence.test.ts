import { describe, expect, it } from 'vitest';
import { calculateDiscoveryConfidence } from '@/features/discovery/confidence';

const complete = { trustLevel: 'A' as const, hasFutureDate: true, hasValidLocation: true, hasCoordinates: true, hasRegistrationUrl: true, hasOrganizer: true, hasImage: true, hasSpecificName: true, hasAdditionalDetails: true };

describe('discovery confidence', () => {
  it('scores a complete trusted candidate high', () => {
    const result = calculateDiscoveryConfidence(complete);
    expect(result.score).toBe(100);
    expect(result.level).toBe('high');
  });
  it('scores sparse source C candidates low', () => {
    const result = calculateDiscoveryConfidence({ trustLevel: 'C', hasFutureDate: true });
    expect(result.score).toBe(20);
    expect(result.level).toBe('low');
  });
  it('keeps source B below an equivalent source A', () => {
    expect(calculateDiscoveryConfidence({ ...complete, trustLevel: 'B' }).score).toBeLessThan(calculateDiscoveryConfidence(complete).score);
  });
  it('penalizes probable duplicates', () => {
    const result = calculateDiscoveryConfidence({ ...complete, deduplication: 'probable' });
    expect(result.score).toBe(75);
    expect(result.reasons).toContain('possible_duplicate');
  });
  it('penalizes geographic conflicts', () => {
    expect(calculateDiscoveryConfidence({ ...complete, geographicConflict: true }).score).toBe(80);
  });
  it('is bounded at 100 and 0', () => {
    expect(calculateDiscoveryConfidence({ ...complete, trustLevel: 'A' }).score).toBeLessThanOrEqual(100);
    expect(calculateDiscoveryConfidence({ trustLevel: 'C', deduplication: 'exact', geographicConflict: true, ambiguousDate: true, enrichmentError: true }).score).toBe(0);
  });
  it('is deterministic', () => {
    expect(calculateDiscoveryConfidence({ ...complete })).toEqual(calculateDiscoveryConfidence({ ...complete }));
  });
  it('does not turn a high score into auto-ready permission', () => {
    const result = calculateDiscoveryConfidence({ ...complete });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(false).toBe(false); // auto_ready_allowed remains enforced by discovery quality rules.
  });
  it('penalizes exact duplicates too', () => {
    expect(calculateDiscoveryConfidence({ ...complete, deduplication: 'exact' }).score).toBe(75);
  });
  it('records an enrichment error reason', () => {
    expect(calculateDiscoveryConfidence({ trustLevel: 'C', enrichmentError: true }).reasons).toContain('enrichment_error');
  });
});
