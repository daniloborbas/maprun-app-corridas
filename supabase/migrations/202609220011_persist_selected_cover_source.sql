-- Restore atomic persistence of the manual source row when saving an event.
create or replace function public.save_event(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  eid uuid;
  item jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  eid := coalesce((payload->>'id')::uuid, gen_random_uuid());

  insert into public.events(
    id, slug, name, short_description, description, start_date, end_date,
    city, state, country, venue, address, latitude, longitude, organizer_name,
    event_category, official_url, registration_url, regulation_url, price_from,
    cover_image_url, cover_image_source, has_usable_official_image,
    short_tagline, status, organizer_verified, published_at
  ) values (
    eid, payload->>'slug', payload->>'name', payload->>'short_description',
    payload->>'description', (payload->>'start_date')::timestamptz,
    (payload->>'end_date')::timestamptz, payload->>'city', payload->>'state',
    'BR', payload->>'venue', payload->>'address', (payload->>'latitude')::float8,
    (payload->>'longitude')::float8, payload->>'organizer_name',
    payload->>'event_category', payload->>'official_url',
    payload->>'registration_url', payload->>'regulation_url',
    (payload->>'price_from')::numeric, payload->>'cover_image_url',
    payload->>'cover_image_source', (payload->>'has_usable_official_image')::boolean,
    payload->>'short_tagline', payload->>'status',
    (payload->>'organizer_verified')::boolean,
    case when payload->>'status' = 'published' then now() end
  )
  on conflict (id) do update set
    name = excluded.name,
    short_description = excluded.short_description,
    description = excluded.description,
    slug = excluded.slug,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    city = excluded.city,
    state = excluded.state,
    status = excluded.status,
    cover_image_url = excluded.cover_image_url,
    cover_image_source = excluded.cover_image_source,
    has_usable_official_image = excluded.has_usable_official_image,
    published_at = case
      when excluded.status = 'published' and events.published_at is null then now()
      else events.published_at
    end,
    updated_at = now();

  delete from public.event_distances where event_id = eid;
  for item in select * from jsonb_array_elements(coalesce(payload->'event_distances', '[]'::jsonb)) loop
    insert into public.event_distances(
      event_id, label, distance_km, category, start_time, price_from, order_index
    ) values (
      eid, item->>'label', (item->>'distance_km')::numeric,
      item->>'category', item->>'start_time', (item->>'price_from')::numeric,
      coalesce((item->>'order_index')::int, 0)
    );
  end loop;

  delete from public.event_sources where event_id = eid;
  if jsonb_typeof(payload->'event_sources') = 'array' then
    for item in select value from jsonb_array_elements(payload->'event_sources') loop
      if not exists (select 1 from public.event_sources where event_id=eid and lower(regexp_replace(regexp_replace(source_url, '[?#].*$', ''), '/$', '')) = lower(regexp_replace(regexp_replace(coalesce(item->>'source_url',''), '[?#].*$', ''), '/$', ''))) then
        insert into public.event_sources(event_id, source_name, source_url, import_method, last_verified_at) values(eid, coalesce(nullif(item->>'source_name',''),'Cadastro manual'), coalesce(item->>'source_url',''), coalesce(nullif(item->>'source_method',''),'manual'), now());
      end if;
    end loop;
  else
    insert into public.event_sources(event_id, source_name, source_url, import_method, last_verified_at) values(eid, coalesce(nullif(payload->>'source_name',''),'Cadastro manual'), coalesce(payload->>'source_url',''), coalesce(nullif(payload->>'source_method',''),'manual'), now());
  end if;
  return eid;
end;
$$;

revoke all on function public.save_event(jsonb) from public, anon;
grant execute on function public.save_event(jsonb) to authenticated;






