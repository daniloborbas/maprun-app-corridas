-- Keep slugs unique for active events while allowing soft-deleted events to retain history.
alter table public.events drop constraint if exists events_slug_key;
drop index if exists public.events_slug_key;
create unique index if not exists events_active_slug_unique_idx
  on public.events (slug)
  where deleted_at is null;
