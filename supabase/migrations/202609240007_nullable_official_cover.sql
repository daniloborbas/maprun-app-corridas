-- Official artwork is optional; presentation fallbacks must not be persisted as official assets.
alter table public.events alter column cover_image_url drop not null;
alter table public.events alter column cover_image_url drop default;
alter table public.events alter column cover_image_source drop not null;
alter table public.events alter column cover_image_source drop default;
