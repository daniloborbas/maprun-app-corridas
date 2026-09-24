export type DiscoveryCandidateStatus = 'pending'|'imported'|'ignored'|'duplicate'|'error';
export type DiscoveryQualityStatus = 'ready'|'incomplete'|'conflict';
export type DiscoverySourceType = 'registration_platform'|'organizer'|'race_calendar'|'federation'|'government'|'other'|'html_calendar'|'organizer_page';
export type DiscoveryStrategy = 'generic'|'sitemap'|'listing_page'|'custom';
export interface DiscoverySource {
  id: string;
  name: string;
  base_url: string;
  source_type: DiscoverySourceType;
  active: boolean;
  is_active?: boolean;
  region: string;
  trust_level?: 'A'|'B'|'C';
  auto_ready_allowed?: boolean;
  crawl_frequency_minutes?: number;
  last_crawled_at?: string|null;
  next_crawl_at?: string|null;
  last_success_at?: string|null;
  consecutive_failures?: number;
  discovery_strategy?: DiscoveryStrategy;
  config?: Record<string, unknown>;
  last_checked_at?: string|null;
}
export interface DiscoveredEventCandidate { id?: string; source_id: string; source_url: string; external_id?: string|null; name: string; event_date?: string|null; city?: string|null; state?: string|null; latitude?: number|null; longitude?: number|null; organizer_name?: string|null; registration_url?: string|null; cover_image_url?: string|null; raw_title?: string|null; status: DiscoveryCandidateStatus; quality_status?: DiscoveryQualityStatus; confidence_score?: number|null; confidence_reasons?: string[]|null; enriched_at?: string|null; duplicate_event_id?: string|null; discovered_at?: string; }
export interface DiscoveryRunSummary { discovered: number; newCandidates: number; known: number; duplicates: number; errors: number; sources: number; ignored: number; pastIgnored: number; enriched: number; ready: number; incomplete: number; conflicts: number; enrichmentErrors: number; aiFallbackNeeded: number; aiCalls: number; aiSuccesses: number; aiFailures: number; aiInputTokens: number; aiOutputTokens: number; }
