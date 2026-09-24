import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { processDiscoveryCandidate } from '@/features/discovery/candidate-processor';
import type { DiscoveryCandidate } from '@/features/discovery/candidate-types';
import type { ExtractedRaceEvent, ExtractionResult } from '@/features/importer/url-import';

const candidate = (overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate => ({
  id: 'candidate-1', source_id: 'source-1', url: 'https://example.com/race', normalized_url: 'https://example.com/race', title_hint: 'Race', discovery_method: 'listing_page', status: 'processing', first_discovered_at: '', last_discovered_at: '', discovery_count: 1, last_processed_at: null, next_process_at: null, processing_attempts: 1, processing_started_at: null, processing_lease_expires_at: null, last_error: null, metadata: {}, created_at: '', updated_at: '', ...overrides,
});
const extraction = (event: ExtractedRaceEvent, quality: 'complete'|'partial'|'insufficient' = 'complete', relevantPageText = 'corrida de rua'): ExtractionResult => ({ event, draft: {} as never, fieldSources: {}, extractionQuality: { status: quality, missingEssentialFields: [], missingImportantFields: [], conflicts: [] }, shouldUseAiFallback: true, relevantPageText });
const validEvent: ExtractedRaceEvent = { name: 'Corrida Teste', date: '2026-10-10', startTime: '07:00', city: 'Itajubá', state: 'MG', venue: 'Centro', address: 'Rua A', distances: ['5 km'], price: null, organizerName: 'Org', registrationUrl: null, coverImageUrl: null };
function client() {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: candidate(), error: null }) }) }) });
  return { update, from: vi.fn(() => ({ update })) } as never;
}

describe('discovery candidate processor', () => {
  it('extracts deterministically without invoking AI and marks extracted', async () => {
    const db = client();
    const result = await processDiscoveryCandidate(candidate(), { client: db, validateUrl: async (url) => url, fetcher: async () => new Response('<html>race</html>', { headers: { 'content-type': 'text/html' } }), extractor: () => extraction(validEvent) });
    expect(result.success).toBe(true);
    expect(result.extractionMethod).toBe('deterministic');
    expect((db as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalled();
  });
  it('keeps an incomplete extraction distinguishable', async () => {
    const result = await processDiscoveryCandidate(candidate(), { client: client(), validateUrl: async (url) => url, fetcher: async () => new Response('<html>race</html>', { headers: { 'content-type': 'text/html' } }), extractor: () => extraction({ ...validEvent, city: null }, 'partial') });
    expect(result.success).toBe(true);
    expect(result.extractionStatus).toBe('partial');
  });
  it('marks a non-race page ignored', async () => {
    const db = client();
    const result = await processDiscoveryCandidate(candidate(), { client: db, validateUrl: async (url) => url, fetcher: async () => new Response('<html>institutional page</html>', { headers: { 'content-type': 'text/html' } }), extractor: () => extraction({ ...validEvent, name: null, date: null }, 'insufficient', 'institutional page') });
    expect(result.errorCode).toBe('not_a_race');
  });
  it('marks timeout as failed', async () => {
    const result = await processDiscoveryCandidate(candidate(), { client: client(), validateUrl: async (url) => url, fetcher: async () => { throw new Error('connection'); } });
    expect(result.errorCode).toBe('network_error');
    expect(result.success).toBe(false);
  });
});
