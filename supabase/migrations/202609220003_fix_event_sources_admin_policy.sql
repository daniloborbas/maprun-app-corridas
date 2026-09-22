-- Keep source persistence behind the admin RLS boundary used by save_event.
drop policy if exists admin_sources on public.event_sources;
create policy admin_sources on public.event_sources
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
