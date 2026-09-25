alter table if exists public.discovery_candidate_enrichments
  alter column research_confidence type numeric(7,4)
  using research_confidence::numeric;

alter table if exists public.discovery_candidate_enrichments
  drop constraint if exists discovery_candidate_enrichments_research_confidence_check;

alter table if exists public.discovery_candidate_enrichments
  add constraint discovery_candidate_enrichments_research_confidence_check
  check (research_confidence >= 0 and research_confidence <= 100);
