create table if not exists public.geocoded_locations (
  id uuid primary key default gen_random_uuid(), city text not null, state text not null, country text not null default 'BR',
  latitude double precision not null, longitude double precision not null, provider text not null default 'nominatim',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(city, state, country)
);
alter table public.geocoded_locations enable row level security;
create policy geocoded_locations_admin on public.geocoded_locations for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.geocoded_locations to authenticated;
alter table public.discovered_events add column if not exists latitude double precision;
alter table public.discovered_events add column if not exists longitude double precision;
