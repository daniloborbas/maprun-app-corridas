alter table public.discovered_events
  add column if not exists quality_status text not null default 'incomplete'
    check (quality_status in ('ready','incomplete','conflict')),
  add column if not exists enriched_at timestamptz;

create index if not exists discovered_events_quality_date_idx
  on public.discovered_events (quality_status, event_date);
