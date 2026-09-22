-- LOCAL DEVELOPMENT ONLY. 12 synthetic races; never run this on production.
-- Auth accounts are created through Supabase Auth, never with hard-coded passwords.
insert into public.events(id,slug,name,start_date,end_date,city,state,venue,address,latitude,longitude,organizer_name,event_category,description,short_description,short_tagline,price_from,cover_image_url,status,published_at)
select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'demonstracao-'||n, name, date::timestamptz, date::timestamptz + interval '6 hours',city,state,'Local ilustrativo','Endereço a confirmar',lat,lng,'Organização demonstrativa',category,
 'Evento fictício de demonstração. Dados, valores e datas não correspondem a uma prova confirmada. Não utilize para inscrições.',
 'Evento fictício para testar a descoberta de corridas.','Mais corridas. Mais histórias.',79+n*10,
 case when category='night' then '/images/road.jpg' when category='trail' or n=1 then '/images/mantiqueira-run.png' else '/images/runners.jpg' end,
 case when n=11 then 'finished' when n=12 then 'cancelled' else 'published' end,now()
from (values
 (1,'Meia Maratona da Mantiqueira','2026-10-18 07:00:00-03','Itajubá','MG',-22.425,-45.452,'rua'),
 (2,'Caminhos da Serra','2026-10-25 07:00:00-03','Campos do Jordão','SP',-22.739,-45.592,'trail'),
 (3,'Corre, Belo Horizonte','2026-11-01 07:00:00-03','Belo Horizonte','MG',-19.919,-43.938,'rua'),
 (4,'Night Run São Paulo','2026-11-07 19:00:00-03','São Paulo','SP',-23.551,-46.633,'night'),
 (5,'Maratona à Beira-Mar','2026-11-15 07:00:00-03','Rio de Janeiro','RJ',-22.907,-43.173,'rua'),
 (6,'Pequenos Corredores','2026-11-22 07:00:00-03','Itajubá','MG',-22.426,-45.459,'kids'),
 (7,'Desafio das Águas','2026-11-29 07:00:00-03','São Lourenço','MG',-22.116,-45.054,'rua'),
 (8,'Trilhas do Sul','2026-12-06 07:00:00-03','Pouso Alegre','MG',-22.23,-45.936,'trail'),
 (9,'Corrida do Verão','2026-12-13 07:00:00-03','Santos','SP',-23.961,-46.333,'rua'),
 (10,'Volta da Pampulha • exemplo','2026-12-20 07:00:00-03','Belo Horizonte','MG',-19.85,-43.97,'rua'),
 (11,'Circuito das Montanhas','2026-09-06 07:00:00-03','Gonçalves','MG',-22.658,-45.855,'trail'),
 (12,'Corrida do Parque','2026-12-27 07:00:00-03','Campinas','SP',-22.909,-47.062,'rua')
) as fixture(n,name,date,city,state,lat,lng,category)
on conflict(id) do nothing;
update public.events set is_demo=true where slug like 'demonstracao-%';
insert into public.event_distances(event_id,label,distance_km,category,order_index)
select e.id, d::text||' km', d, e.event_category, ord::int
from public.events e cross join lateral unnest(case when e.event_category='kids' then array[0.5,1]::numeric[] when e.event_category='trail' then array[10,21]::numeric[] else array[5,10,21]::numeric[] end) with ordinality as distances(d,ord)
where e.slug like 'demonstracao-%' and not exists(select 1 from public.event_distances where event_id=e.id);
insert into public.event_sources(event_id,source_name,import_method,last_verified_at)
select id,'Demonstração fictícia','seed',now() from public.events e where e.slug like 'demonstracao-%' and not exists(select 1 from public.event_sources where event_id=e.id);
insert into public.sponsored_campaigns(event_id,campaign_start,campaign_end,status)
select id,'2026-09-01','2026-11-01','draft' from public.events where slug='demonstracao-3' and not exists(select 1 from public.sponsored_campaigns);
