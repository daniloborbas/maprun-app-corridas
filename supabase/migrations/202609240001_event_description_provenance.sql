-- Track how an event description was produced without reclassifying legacy rows.
alter table public.events
  add column if not exists description_source text not null default 'unknown';

alter table public.events
  drop constraint if exists events_description_source_check;

alter table public.events
  add constraint events_description_source_check
  check (description_source in ('manual', 'editorial_generated', 'imported', 'unknown'));

-- Keep the existing admin RPC authoritative while persisting the provenance sent by new clients.
create or replace function public.save_event(payload jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare eid uuid; item jsonb;
begin
  if not public.is_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  eid := coalesce((payload->>'id')::uuid, gen_random_uuid());
  insert into public.events(
    id, slug, name, short_description, description, description_source, start_date, end_date,
    city, state, country, venue, address, latitude, longitude, organizer_name,
    event_category, official_url, registration_url, regulation_url, price_from,
    cover_image_url, cover_image_source, has_usable_official_image, fallback_image_key,
    short_tagline, status, organizer_verified, published_at
  ) values (
    eid, payload->>'slug', payload->>'name', payload->>'short_description', payload->>'description',
    coalesce(nullif(payload->>'description_source',''),'unknown'), (payload->>'start_date')::timestamptz,
    (payload->>'end_date')::timestamptz, payload->>'city', payload->>'state', 'BR', payload->>'venue', payload->>'address',
    (payload->>'latitude')::float8, (payload->>'longitude')::float8, payload->>'organizer_name', payload->>'event_category',
    payload->>'official_url', payload->>'registration_url', payload->>'regulation_url', (payload->>'price_from')::numeric,
    payload->>'cover_image_url', payload->>'cover_image_source', (payload->>'has_usable_official_image')::boolean,
    payload->>'fallback_image_key', payload->>'short_tagline', payload->>'status', (payload->>'organizer_verified')::boolean,
    case when payload->>'status' = 'published' then now() end
  ) on conflict (id) do update set
    name=excluded.name, short_description=excluded.short_description, description=excluded.description,
    description_source=excluded.description_source, slug=excluded.slug, start_date=excluded.start_date, end_date=excluded.end_date,
    city=excluded.city, state=excluded.state, venue=excluded.venue, address=excluded.address, latitude=excluded.latitude, longitude=excluded.longitude,
    organizer_name=excluded.organizer_name, event_category=excluded.event_category, official_url=excluded.official_url, registration_url=excluded.registration_url,
    regulation_url=excluded.regulation_url, price_from=excluded.price_from, status=excluded.status, organizer_verified=excluded.organizer_verified,
    cover_image_url=excluded.cover_image_url, cover_image_source=excluded.cover_image_source, has_usable_official_image=excluded.has_usable_official_image,
    fallback_image_key=excluded.fallback_image_key, published_at=case when excluded.status='published' and events.published_at is null then now() else events.published_at end,
    updated_at=now();
  delete from public.event_distances where event_id=eid;
  for item in select * from jsonb_array_elements(coalesce(payload->'event_distances','[]'::jsonb)) loop
    insert into public.event_distances(event_id,label,distance_km,category,start_time,price_from,order_index)
    values(eid,item->>'label',(item->>'distance_km')::numeric,item->>'category',item->>'start_time',(item->>'price_from')::numeric,coalesce((item->>'order_index')::int,0));
  end loop;
  delete from public.event_sources where event_id=eid;
  if jsonb_typeof(payload->'event_sources')='array' then
    for item in select value from jsonb_array_elements(payload->'event_sources') loop
      if not exists(select 1 from public.event_sources where event_id=eid and lower(regexp_replace(regexp_replace(source_url,'[?#].*$',''), '/$',''))=lower(regexp_replace(regexp_replace(coalesce(item->>'source_url',''),'[?#].*$',''), '/$',''))) then
        insert into public.event_sources(event_id,source_name,source_url,import_method,last_verified_at) values(eid,coalesce(nullif(item->>'source_name',''),'Cadastro manual'),coalesce(item->>'source_url',''),coalesce(nullif(item->>'source_method',''),'manual'),now());
      end if;
    end loop;
  else
    insert into public.event_sources(event_id,source_name,source_url,import_method,last_verified_at) values(eid,coalesce(nullif(payload->>'source_name',''),'Cadastro manual'),coalesce(payload->>'source_url',''),coalesce(nullif(payload->>'source_method',''),'manual'),now());
  end if;
  return eid;
end; $$;
revoke all on function public.save_event(jsonb) from public, anon;
grant execute on function public.save_event(jsonb) to authenticated;
