alter table public.discovery_sources
  add column if not exists trust_level text not null default 'C',
  add column if not exists auto_ready_allowed boolean not null default false;

alter table public.discovery_sources
  drop constraint if exists discovery_sources_trust_level_check;

alter table public.discovery_sources
  add constraint discovery_sources_trust_level_check
  check (trust_level in ('A', 'B', 'C'));
