create extension if not exists postgis with schema public;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
 id uuid primary key references auth.users on delete cascade, name text not null default '', avatar_url text,
 city text not null default '', state text not null default '', favorite_distances numeric[] not null default '{}', preferred_categories text[] not null default '{}',
 role text not null default 'user' check (role in ('user','organizer','admin')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name','')); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create table public.organizer_profiles (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete set null, name text not null, website text, verified boolean not null default false);
create table public.event_categories (id text primary key, label text not null);
insert into public.event_categories values ('rua','Corrida de rua'),('trail','Trilha e montanha'),('night','Night run'),('kids','Infantil');
create table public.events (
 id uuid primary key default gen_random_uuid(), slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), name text not null,
 short_description text not null default '', description text not null default '', start_date timestamptz not null, end_date timestamptz,
 city text not null, state text not null check (length(state)=2), country text not null default 'BR', venue text not null default '', address text not null default '',
 latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 location geography(Point,4326) generated always as (case when latitude is not null and longitude is not null then ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography end) stored,
 organizer_id uuid references public.organizer_profiles, organizer_name text not null default '', event_category text references public.event_categories not null,
 official_url text not null default '' check (official_url = '' or official_url ~ '^https://'), registration_url text not null default '' check (registration_url = '' or registration_url ~ '^https://'), regulation_url text not null default '' check (regulation_url = '' or regulation_url ~ '^https://'),
 price_from numeric(10,2) check(price_from >= 0), cover_image_url text not null default '/images/runners.jpg', cover_image_source text not null default 'fallback' check(cover_image_source in ('official','generated','fallback')),
 has_usable_official_image boolean not null default false, generated_cover_template text, short_tagline text not null default '',
 status text not null default 'draft' check(status in ('draft','published','cancelled','finished','archived')), organizer_verified boolean not null default false,
 is_demo boolean not null default false, previous_edition_id uuid references public.events, published_at timestamptz, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_date is null or end_date >= start_date), check((latitude is null) = (longitude is null))
);
create index events_location_idx on public.events using gist(location);
create index events_feed_idx on public.events(status,start_date) where deleted_at is null;
create index events_city_idx on public.events(city,state);
create table public.event_distances (id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade, label text not null, distance_km numeric check(distance_km >= 0), category text not null default 'rua', start_time text, price_from numeric check(price_from >= 0), order_index int not null default 0);
create index distances_event_idx on public.event_distances(event_id);
create table public.event_sources (id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade, source_name text not null, source_url text not null default '', source_event_id text, import_method text not null default 'manual', last_synced_at timestamptz, last_verified_at timestamptz, unique(source_name,source_event_id));
create table public.favorites (user_id uuid references auth.users on delete cascade, event_id uuid references public.events on delete cascade, created_at timestamptz not null default now(), primary key(user_id,event_id));
create table public.event_attendance (user_id uuid references auth.users on delete cascade, event_id uuid references public.events on delete cascade, created_at timestamptz not null default now(), primary key(user_id,event_id));
create index favorites_event_idx on public.favorites(event_id);
create index attendance_event_idx on public.event_attendance(event_id);
create table public.alerts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, event_id uuid references public.events on delete cascade, kind text not null, enabled boolean not null default false, created_at timestamptz not null default now());
create table public.sponsored_campaigns (id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade, campaign_start timestamptz not null, campaign_end timestamptz not null, priority int not null default 0, weight int not null default 1, impressions_limit int, impressions_delivered int not null default 0, impulses_purchased int not null default 0, status text not null default 'draft' check(status in ('draft','active','paused','finished')), check(campaign_end > campaign_start));
create table public.analytics_events (id bigint generated always as identity primary key, event_name text not null, event_id uuid references public.events on delete set null, user_id uuid references auth.users on delete set null, session_id uuid, source text, properties jsonb not null default '{}', created_at timestamptz not null default now());
create index analytics_date_idx on public.analytics_events(created_at desc);
create index analytics_session_idx on public.analytics_events(session_id,created_at);

alter table public.profiles enable row level security;
create policy profile_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profile_update on public.profiles for update using (id = auth.uid()) with check(id=auth.uid());
-- Column grants prevent self-promotion even with a direct REST request.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(name,avatar_url,city,state,favorite_distances,preferred_categories,alerts_enabled,nearby_events_enabled,city_events_enabled,saved_event_reminders_enabled,preferred_radius_km,updated_at) on public.profiles to authenticated;

alter table public.events enable row level security;
create policy public_events on public.events for select using ((status in ('published','finished','cancelled') and deleted_at is null) or public.is_admin());
create policy admin_events on public.events for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.event_distances enable row level security;
alter table public.event_sources enable row level security;
create policy public_distances on public.event_distances for select using(exists(select 1 from public.events e where e.id=event_id));
create policy admin_distances on public.event_distances for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_sources on public.event_sources for select using(exists(select 1 from public.events e where e.id=event_id));
create policy admin_sources on public.event_sources for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.event_categories enable row level security;
create policy public_categories on public.event_categories for select using(true);
alter table public.favorites enable row level security;
alter table public.event_attendance enable row level security;
create policy own_favorites on public.favorites for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.events where id=event_id and status in ('published','finished','cancelled') and deleted_at is null));
create policy own_attendance on public.event_attendance for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.events where id=event_id and status='published' and coalesce(end_date,start_date)>now() and deleted_at is null));
alter table public.alerts enable row level security;
create policy own_alerts on public.alerts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
alter table public.organizer_profiles enable row level security;
create policy organizers_read on public.organizer_profiles for select using(true);
create policy organizers_admin on public.organizer_profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.sponsored_campaigns enable row level security;
create policy campaigns_admin on public.sponsored_campaigns for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.analytics_events enable row level security;
create policy analytics_admin on public.analytics_events for select to authenticated using(public.is_admin());

create function public.attendance_count(race_id uuid) returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.event_attendance a where a.event_id=race_id and exists(select 1 from public.events e where e.id=race_id and e.status in ('published','finished','cancelled') and e.deleted_at is null);
$$;
create function public.nearby_events(lat double precision, lng double precision, radius_km double precision default 100)
returns table(id uuid, distance_km double precision) language sql stable security invoker set search_path=public as $$
 select e.id, ST_Distance(e.location, ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography)/1000 from events e
 where e.status='published' and coalesce(e.end_date,e.start_date)>now() and e.deleted_at is null and radius_km between 1 and 2000 and lat between -90 and 90 and lng between -180 and 180
 and ST_DWithin(e.location, ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography,radius_km*1000) order by 2;
$$;
create function public.track_event(kind text, race_id uuid default null, sid uuid default null, origin text default null, props jsonb default '{}')
returns void language plpgsql security definer set search_path='' as $$
begin
 if kind not in ('page_view','race_impression','race_view','race_save','race_unsave','race_share','going_add','going_remove','registration_click','search','filter_used','location_permission_granted','location_permission_denied','manual_location_selected') then raise exception 'Invalid event'; end if;
 if octet_length(props::text)>2048 or length(origin)>200 then raise exception 'Payload too large'; end if;
 if race_id is not null and not exists(select 1 from public.events where id=race_id and status in ('published','finished','cancelled') and deleted_at is null) then return; end if;
 if sid is not null then
  perform pg_advisory_xact_lock(hashtext(sid::text));
  if (select count(*) from public.analytics_events where session_id=sid and created_at>now()-interval '1 minute') >= 60 then return; end if;
 end if;
 insert into public.analytics_events(event_name,event_id,user_id,session_id,source,properties) values(kind,race_id,case when origin='registration_redirect' then null else auth.uid() end,sid,left(origin,200),props);
end; $$;
revoke all on function public.track_event(text,uuid,uuid,text,jsonb) from public;
grant execute on function public.track_event(text,uuid,uuid,text,jsonb) to anon,authenticated;
revoke all on function public.attendance_count(uuid) from public;
grant execute on function public.attendance_count(uuid) to anon,authenticated;

-- Atomically persist the event and normalized children; no partial saves.
create function public.save_event(payload jsonb) returns uuid language plpgsql security invoker set search_path=public as $$
declare eid uuid; item jsonb;
begin
 if not public.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 eid := coalesce((payload->>'id')::uuid, gen_random_uuid());
 insert into events(id,slug,name,short_description,description,start_date,end_date,city,state,country,venue,address,latitude,longitude,organizer_name,event_category,official_url,registration_url,regulation_url,price_from,cover_image_url,cover_image_source,has_usable_official_image,short_tagline,status,organizer_verified,published_at)
 values(eid,payload->>'slug',payload->>'name',payload->>'short_description',payload->>'description',(payload->>'start_date')::timestamptz,(payload->>'end_date')::timestamptz,payload->>'city',payload->>'state','BR',payload->>'venue',payload->>'address',(payload->>'latitude')::float8,(payload->>'longitude')::float8,payload->>'organizer_name',payload->>'event_category',payload->>'official_url',payload->>'registration_url',payload->>'regulation_url',(payload->>'price_from')::numeric,payload->>'cover_image_url',payload->>'cover_image_source',(payload->>'has_usable_official_image')::boolean,payload->>'short_tagline',payload->>'status',(payload->>'organizer_verified')::boolean,case when payload->>'status'='published' then now() end)
 on conflict(id) do update set slug=excluded.slug,name=excluded.name,short_description=excluded.short_description,description=excluded.description,start_date=excluded.start_date,end_date=excluded.end_date,city=excluded.city,state=excluded.state,venue=excluded.venue,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,organizer_name=excluded.organizer_name,event_category=excluded.event_category,official_url=excluded.official_url,registration_url=excluded.registration_url,regulation_url=excluded.regulation_url,price_from=excluded.price_from,cover_image_url=excluded.cover_image_url,cover_image_source=excluded.cover_image_source,has_usable_official_image=excluded.has_usable_official_image,short_tagline=excluded.short_tagline,status=excluded.status,organizer_verified=excluded.organizer_verified,published_at=coalesce(events.published_at,excluded.published_at),updated_at=now();
 delete from event_distances where event_id=eid;
 for item in select * from jsonb_array_elements(payload->'event_distances') loop
  insert into event_distances(event_id,label,distance_km,category,start_time,price_from,order_index) values(eid,item->>'label',(item->>'distance_km')::numeric,item->>'category',item->>'start_time',(item->>'price_from')::numeric,coalesce((item->>'order_index')::int,0));
 end loop;
 delete from event_sources where event_id=eid and import_method='manual';
 insert into event_sources(event_id,source_name,source_url,import_method,last_verified_at) values(eid,coalesce(payload->>'source_name','Cadastro manual'),coalesce(payload->>'source_url',''),coalesce(payload->>'source_method','manual'),now());
 return eid;
end; $$;
revoke all on function public.save_event(jsonb) from public,anon;
grant execute on function public.save_event(jsonb) to authenticated;

-- Explicit grants: RLS remains the final authorization boundary.
grant usage on schema public to anon,authenticated;
grant select on public.events,public.event_distances,public.event_sources,public.event_categories,public.organizer_profiles to anon,authenticated;
grant insert,update,delete on public.events,public.event_distances,public.event_sources,public.organizer_profiles to authenticated;
grant select,insert,update,delete on public.favorites,public.event_attendance,public.alerts,public.sponsored_campaigns to authenticated;
grant select on public.analytics_events to authenticated;
revoke insert,update,delete on public.analytics_events from anon,authenticated;
