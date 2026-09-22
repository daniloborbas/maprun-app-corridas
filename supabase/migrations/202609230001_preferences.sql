alter table public.profiles add column if not exists alerts_enabled boolean not null default false;
alter table public.profiles add column if not exists nearby_events_enabled boolean not null default false;
alter table public.profiles add column if not exists city_events_enabled boolean not null default false;
alter table public.profiles add column if not exists saved_event_reminders_enabled boolean not null default false;
alter table public.profiles add column if not exists preferred_radius_km int not null default 50 check(preferred_radius_km in (25,50,100,200));
grant update(alerts_enabled,nearby_events_enabled,city_events_enabled,saved_event_reminders_enabled,preferred_radius_km) on public.profiles to authenticated;
