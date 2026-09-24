alter table public.events
  add column if not exists feed_image_source text not null default 'none';

alter table public.events
  drop constraint if exists events_feed_image_source_check;

alter table public.events
  add constraint events_feed_image_source_check
  check (feed_image_source in ('ai_generated', 'manual_upload', 'legacy', 'none'));
