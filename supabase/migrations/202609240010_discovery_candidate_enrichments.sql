create table if not exists public.discovery_candidate_enrichments (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.discovery_candidates(id) on delete cascade,
  base_event jsonb not null default '{}'::jsonb,
  enriched_event jsonb not null default '{}'::jsonb,
  research_sources jsonb not null default '[]'::jsonb,
  field_evidence jsonb not null default '{}'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  research_confidence integer not null check (research_confidence between 0 and 100),
  content_quality_score integer not null check (content_quality_score between 0 and 100),
  short_description text,
  long_description text,
  model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(candidate_id)
);
create index if not exists discovery_candidate_enrichments_candidate_idx on public.discovery_candidate_enrichments(candidate_id);
