alter table if exists public.discovery_candidate_enrichments
  add column if not exists field_resolutions jsonb not null default '{}'::jsonb,
  add column if not exists replacements jsonb not null default '[]'::jsonb,
  add column if not exists unresolved_conflicts jsonb not null default '[]'::jsonb,
  add column if not exists factual_confidence integer,
  add column if not exists auto_publish_eligible boolean not null default false,
  add column if not exists rejection_reasons jsonb not null default '[]'::jsonb;
