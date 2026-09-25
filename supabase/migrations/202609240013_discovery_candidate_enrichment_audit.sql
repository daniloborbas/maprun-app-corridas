alter table if exists public.discovery_candidate_enrichments
  add column if not exists research_metadata jsonb not null default '{}'::jsonb;

create index if not exists discovery_candidate_enrichments_updated_idx
  on public.discovery_candidate_enrichments(updated_at desc);

create or replace function public.update_discovery_candidate_enrichment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists discovery_candidate_enrichments_updated_at on public.discovery_candidate_enrichments;
create trigger discovery_candidate_enrichments_updated_at
before update on public.discovery_candidate_enrichments
for each row execute function public.update_discovery_candidate_enrichment_updated_at();
