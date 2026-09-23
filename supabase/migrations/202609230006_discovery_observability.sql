-- Additive discovery observability fields. Existing rows are preserved with conservative defaults.
alter table public.discovery_runs
  add column if not exists sources_processed integer not null default 0,
  add column if not exists candidates_found integer not null default 0,
  add column if not exists candidates_new integer not null default 0,
  add column if not exists candidates_enriched integer not null default 0,
  add column if not exists candidates_ignored integer not null default 0,
  add column if not exists errors_count integer not null default 0,
  add column if not exists ai_fallback_needed integer not null default 0,
  add column if not exists ai_calls integer not null default 0,
  add column if not exists ai_successes integer not null default 0,
  add column if not exists ai_failures integer not null default 0,
  add column if not exists ai_input_tokens bigint not null default 0,
  add column if not exists ai_output_tokens bigint not null default 0,
  add column if not exists error_details jsonb not null default '[]'::jsonb;

comment on column public.discovery_runs.error_details is 'Sanitized stage/type entries only; never secrets, page content, headers, or raw provider responses.';
