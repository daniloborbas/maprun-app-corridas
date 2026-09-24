insert into storage.buckets (id, name, public)
values ('event-feed', 'event-feed', true)
on conflict (id) do update set public = true;

create policy "Public event feed images are readable"
on storage.objects for select
to public
using (bucket_id = 'event-feed');

create policy "Admins manage event feed images"
on storage.objects for all
to authenticated
using (bucket_id = 'event-feed' and public.is_admin())
with check (bucket_id = 'event-feed' and public.is_admin());
