alter table if exists public.discovery_candidate_enrichments
  add column if not exists description_audit jsonb not null default '{"supportedClaims":[],"unsupportedClaims":[]}'::jsonb;

