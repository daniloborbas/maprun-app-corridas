create table if not exists public.discovery_evidence_cache (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  normalized_url text not null unique,
  domain text not null,
  title text,
  content_hash text,
  extracted_text text not null default '',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discovery_evidence_cache_expires_idx on public.discovery_evidence_cache (expires_at);
create index if not exists discovery_evidence_cache_domain_idx on public.discovery_evidence_cache (domain);
