alter table public.discovered_events
  add column if not exists confidence_score smallint
    check (confidence_score is null or confidence_score between 0 and 100),
  add column if not exists confidence_reasons jsonb;
