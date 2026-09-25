create table if not exists public.discovery_research_diagnostics (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.discovery_candidates(id) on delete cascade,
  status text not null check (status in ('running','succeeded','failed')),
  phase text not null check (phase in ('configuration','request_build','responses_api','web_search','structured_output','citation_parsing','source_validation','persistence','finished')),
  model text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  research_attempted boolean not null default false,
  research_succeeded boolean not null default false,
  web_searches integer,
  sources_count integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  error_type text,
  error_code text,
  error_param text,
  error_message text,
  http_status integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discovery_research_diagnostics_candidate_idx on public.discovery_research_diagnostics(candidate_id, started_at desc);
create index if not exists discovery_research_diagnostics_running_idx on public.discovery_research_diagnostics(candidate_id, status, started_at desc);
create or replace function public.update_discovery_research_diagnostics_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists set_discovery_research_diagnostics_updated_at on public.discovery_research_diagnostics;
create trigger set_discovery_research_diagnostics_updated_at before update on public.discovery_research_diagnostics for each row execute function public.update_discovery_research_diagnostics_updated_at();
