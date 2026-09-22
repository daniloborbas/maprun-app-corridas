-- The save_event RPC runs as the authenticated caller, so distance inserts
-- need the same admin RLS boundary as the parent event.
drop policy if exists admin_distances on public.event_distances;
create policy admin_distances on public.event_distances
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
