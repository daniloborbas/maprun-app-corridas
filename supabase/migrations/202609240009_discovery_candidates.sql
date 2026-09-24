create table if not exists public.discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.discovery_sources(id) on delete cascade,
  url text not null,
  normalized_url text not null,
  title_hint text,
  discovery_method text not null,
  status text not null default 'discovered' check (status in ('discovered','processing','extracted','ignored','failed')),
  first_discovered_at timestamptz not null default now(),
  last_discovered_at timestamptz not null default now(),
  discovery_count integer not null default 1 check (discovery_count > 0),
  last_processed_at timestamptz,
  next_process_at timestamptz,
  processing_attempts integer not null default 0 check (processing_attempts >= 0),
  processing_started_at timestamptz,
  processing_lease_expires_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, normalized_url)
);

create index if not exists discovery_candidates_ready_idx
  on public.discovery_candidates (status, next_process_at, first_discovered_at, id);
create index if not exists discovery_candidates_source_idx
  on public.discovery_candidates (source_id, normalized_url);

create or replace function public.set_discovery_candidate_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists discovery_candidates_set_updated_at on public.discovery_candidates;
create trigger discovery_candidates_set_updated_at
before update on public.discovery_candidates
for each row execute function public.set_discovery_candidate_updated_at();

create or replace function public.upsert_discovery_candidate(
  p_source_id uuid,
  p_url text,
  p_normalized_url text,
  p_title_hint text,
  p_discovery_method text,
  p_discovered_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  was_inserted boolean;
  row_data public.discovery_candidates;
begin
  insert into public.discovery_candidates(source_id, url, normalized_url, title_hint, discovery_method, first_discovered_at, last_discovered_at, metadata)
  values (p_source_id, p_url, p_normalized_url, nullif(p_title_hint, ''), p_discovery_method, coalesce(p_discovered_at, now()), coalesce(p_discovered_at, now()), coalesce(p_metadata, '{}'::jsonb))
  on conflict (source_id, normalized_url) do update set
    url = excluded.url,
    last_discovered_at = excluded.last_discovered_at,
    discovery_count = public.discovery_candidates.discovery_count + 1,
    title_hint = coalesce(nullif(excluded.title_hint, ''), public.discovery_candidates.title_hint),
    metadata = case when excluded.metadata = '{}'::jsonb then public.discovery_candidates.metadata else excluded.metadata end
  returning (xmax = 0) into was_inserted;
  select * into row_data from public.discovery_candidates where source_id = p_source_id and normalized_url = p_normalized_url;
  return jsonb_build_object('candidate', to_jsonb(row_data), 'inserted', was_inserted);
end;
$$;

create or replace function public.claim_discovery_candidate(p_candidate_id uuid)
returns setof public.discovery_candidates language sql security definer set search_path = public as $$
  update public.discovery_candidates
  set status = 'processing', processing_attempts = processing_attempts + 1,
      last_processed_at = now(), processing_started_at = now(),
      processing_lease_expires_at = now() + interval '5 minutes',
      last_error = null, updated_at = now()
  where id = p_candidate_id
    and (status = 'discovered' or (status = 'failed' and next_process_at is not null and next_process_at <= now()))
  returning *;
$$;

create or replace function public.recover_expired_discovery_candidates(p_limit integer default 50)
returns setof public.discovery_candidates language sql security definer set search_path = public as $$
  with expired as (
    select id from public.discovery_candidates
    where status = 'processing' and processing_lease_expires_at is not null
      and processing_lease_expires_at < now()
    order by processing_lease_expires_at, id
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.discovery_candidates c
  set status = 'discovered', processing_started_at = null,
      processing_lease_expires_at = null, next_process_at = null, updated_at = now()
  from expired where c.id = expired.id
  returning c.*;
$$;
