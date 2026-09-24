-- Discovery Engine V2 source metadata. The legacy discovery columns remain
-- available so existing providers and admin screens keep working unchanged.
alter table public.discovery_sources
  add column if not exists is_active boolean not null default true,
  add column if not exists crawl_frequency_minutes integer not null default 1440,
  add column if not exists last_crawled_at timestamptz,
  add column if not exists next_crawl_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists discovery_strategy text not null default 'generic',
  add column if not exists config jsonb not null default '{}'::jsonb;

update public.discovery_sources
set is_active = active
where is_active is distinct from active;

alter table public.discovery_sources
  drop constraint if exists discovery_sources_source_type_check,
  drop constraint if exists discovery_sources_discovery_strategy_check,
  drop constraint if exists discovery_sources_crawl_frequency_check,
  drop constraint if exists discovery_sources_consecutive_failures_check;

alter table public.discovery_sources
  add constraint discovery_sources_source_type_check
    check (source_type in (
      'registration_platform', 'organizer', 'race_calendar', 'federation',
      'government', 'other', 'html_calendar', 'organizer_page'
    )),
  add constraint discovery_sources_discovery_strategy_check
    check (discovery_strategy in ('generic', 'sitemap', 'listing_page', 'custom')),
  add constraint discovery_sources_crawl_frequency_check
    check (crawl_frequency_minutes > 0),
  add constraint discovery_sources_consecutive_failures_check
    check (consecutive_failures >= 0);

create index if not exists discovery_sources_is_active_idx
  on public.discovery_sources (is_active);
create index if not exists discovery_sources_next_crawl_at_idx
  on public.discovery_sources (next_crawl_at);
create index if not exists discovery_sources_trust_level_idx
  on public.discovery_sources (trust_level);
create index if not exists discovery_sources_active_next_crawl_idx
  on public.discovery_sources (is_active, next_crawl_at);

create or replace function public.set_discovery_source_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Keep the legacy `active` flag and the V2 `is_active` flag coherent while
  -- existing admin/provider code continues to write the legacy column.
  if new.active is distinct from old.active then
    new.is_active = new.active;
  elsif new.is_active is distinct from old.is_active then
    new.active = new.is_active;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists discovery_sources_set_updated_at on public.discovery_sources;
create trigger discovery_sources_set_updated_at
before update on public.discovery_sources
for each row execute function public.set_discovery_source_updated_at();
