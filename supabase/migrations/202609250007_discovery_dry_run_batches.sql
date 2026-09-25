create table if not exists public.discovery_dry_run_batches (
  batch_execution_id uuid primary key,
  status text not null default 'pending' check (status in ('pending','running','completed','partially_completed','failed','cancelled')),
  candidate_ids jsonb not null,
  total_count integer not null,
  next_index integer not null default 0,
  processed_count integer not null default 0,
  succeeded_count integer not null default 0,
  failed_count integer not null default 0,
  configuration jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create table if not exists public.discovery_dry_run_batch_results (
  id uuid primary key default gen_random_uuid(),
  batch_execution_id uuid not null references public.discovery_dry_run_batches(batch_execution_id) on delete cascade,
  candidate_id uuid not null references public.discovery_candidates(id),
  position integer not null,
  dry_run_execution_id uuid,
  status text not null,
  persistence_status text,
  research_status text,
  total_tokens integer,
  fallback_used boolean not null default false,
  research_confidence numeric,
  factual_confidence numeric,
  content_quality integer,
  semantic_readiness text,
  shadow_90 boolean,
  shadow_80 boolean,
  shadow_75 boolean,
  shadow_72 boolean,
  error text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_execution_id, position),
  unique (batch_execution_id, candidate_id)
);
create index if not exists discovery_dry_run_batches_status_idx on public.discovery_dry_run_batches(status);
create index if not exists discovery_dry_run_batch_results_batch_idx on public.discovery_dry_run_batch_results(batch_execution_id, position);
