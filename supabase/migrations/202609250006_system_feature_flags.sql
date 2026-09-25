create table if not exists public.system_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);
insert into public.system_feature_flags(key, enabled) values ('evidence_first_research', false) on conflict (key) do nothing;
create or replace function public.update_system_feature_flags_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists system_feature_flags_updated_at on public.system_feature_flags;
create trigger system_feature_flags_updated_at before update on public.system_feature_flags for each row execute function public.update_system_feature_flags_updated_at();
