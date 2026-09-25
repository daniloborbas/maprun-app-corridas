import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { evaluateAutoPublishEligibility } from '@/features/discovery/dry-run';
import type { ExtractedRaceEvent } from '@/features/importer/url-import';

const event: ExtractedRaceEvent = { name: 'Corrida Teste', date: '2099-10-10', startTime: '07:00', city: 'Itajubá', state: 'MG', venue: 'Centro', address: 'Rua A', distances: ['5 km'], price: '20', organizerName: 'Org', registrationUrl: 'https://example.com/i', coverImageUrl: null };
describe('dry run eligibility', () => {
  it('marks a complete high-quality future event eligible', () => expect(evaluateAutoPublishEligibility(event, { contentQualityScore: 90 }).eligible).toBe(true));
  it('reports missing required fields and past dates', () => {
    const result = evaluateAutoPublishEligibility({ ...event, name: null, date: '2020-01-01', city: '', state: '', distances: [] }, { contentQualityScore: 90, now: new Date('2026-01-01T00:00:00Z') });
    expect(result.rejectionReasons).toEqual(expect.arrayContaining(['missing_name', 'past_event', 'missing_city', 'missing_state', 'missing_distance']));
  });
  it('rejects low research confidence and critical conflicts', () => {
    const result = evaluateAutoPublishEligibility(event, { researchRequired: true, researchConfidence: 50, contentQualityScore: 80, conflicts: [{ severity: 'high' }] });
    expect(result.rejectionReasons).toEqual(expect.arrayContaining(['low_research_confidence', 'critical_conflict']));
  });
  it('evaluates normalized model confidence as a percentage', () => {
    expect(evaluateAutoPublishEligibility({ ...event, distances: ['5 km'] }, { researchRequired: true, researchConfidence: 78, contentQualityScore: 80 }).rejectionReasons).toContain('low_research_confidence');
    expect(evaluateAutoPublishEligibility({ ...event, distances: ['5 km'] }, { researchRequired: true, researchConfidence: 82, contentQualityScore: 80 }).rejectionReasons).not.toContain('low_research_confidence');
  });
  it('rejects low content quality', () => expect(evaluateAutoPublishEligibility(event, { contentQualityScore: 69 }).rejectionReasons).toContain('low_content_quality'));
});
