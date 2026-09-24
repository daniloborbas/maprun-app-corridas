export type DiscoveryCandidateStatus = 'discovered'|'processing'|'extracted'|'ignored'|'failed';
export interface DiscoveryCandidate {
  id: string;
  source_id: string;
  url: string;
  normalized_url: string;
  title_hint: string|null;
  discovery_method: string;
  status: DiscoveryCandidateStatus;
  first_discovered_at: string;
  last_discovered_at: string;
  discovery_count: number;
  last_processed_at: string|null;
  next_process_at: string|null;
  processing_attempts: number;
  processing_started_at: string|null;
  processing_lease_expires_at: string|null;
  last_error: string|null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
