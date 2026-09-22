-- Run on a disposable local Supabase database AFTER migration and seed.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
begin;
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000001','rls-test-1@example.invalid'),('10000000-0000-4000-8000-000000000002','rls-test-2@example.invalid');
insert into public.events(id,slug,name,start_date,city,state,event_category,status) values ('20000000-0000-4000-8000-000000000001','private-test','Private draft',now()+interval '1 day','Test','MG','rua','draft');
set local role anon;
do $$ begin
 if exists(select 1 from public.events where slug='private-test') then raise exception 'Draft exposed to anon'; end if;
 begin insert into public.events(slug,name,start_date,city,state,event_category) values('forbidden','Forbidden',now(),'Test','MG','rua'); raise exception 'Anonymous write permitted'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 if public.is_admin() then raise exception 'User is admin'; end if;
 begin update public.profiles set role='admin' where id=auth.uid(); raise exception 'Self-promotion allowed'; exception when insufficient_privilege then null; end;
 begin perform public.save_event('{}'); raise exception 'Non-admin RPC allowed'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.profiles where id='10000000-0000-4000-8000-000000000002') then raise exception 'Other profile exposed'; end if;
 update public.profiles set name='Allowed update' where id=auth.uid();
end; $$;
reset role;
rollback;
