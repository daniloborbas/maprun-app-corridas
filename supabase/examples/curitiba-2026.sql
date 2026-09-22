-- OPTIONAL REAL-EVENT DRAFT. Verified against official sources on 2026-09-21.
-- The organizer has not published the start time; this draft must be reviewed
-- and its time confirmed before publishing. The timestamp below is date-only placeholder.
insert into public.events(slug,name,start_date,city,state,venue,organizer_name,event_category,description,short_description,official_url,registration_url,regulation_url,cover_image_url,status)
values('maratona-de-curitiba-2026','Santander Maratona de Curitiba 2026','2026-11-15 00:00:00-03','Curitiba','PR','Praça Nossa Senhora de Salete','Associação Amazing Runs','rua',
 'Prova com distâncias de 5 km, 10 km, 21,097 km e 42,195 km. Consulte o organizador para horários, percursos, preços e disponibilidade. Cadastro em revisão: horário de largada ainda não informado no regulamento consultado.',
 'Corridas de 5 km a maratona em Curitiba, em 15 de novembro de 2026.',
 'https://maratonadecuritiba.com.br/',
 'https://site.ticketsports.com.br/Inscricao/categoria.aspx?__idEvento=86884&lang=pt-BR&origem=novo-site',
 'https://storagefileta.blob.core.windows.net/ticketagora/arquivos/evento/86884/7f977c97d0ac4cd982ecd9922e141c0f639171340990707350.pdf',
 '/images/runners.jpg','draft') on conflict(slug) do nothing;
insert into public.event_distances(event_id,label,distance_km,category,order_index)
select e.id,d.label,d.km,'rua',d.position from public.events e cross join (values ('5 km',5,0),('10 km',10,1),('21 km',21.097,2),('42 km',42.195,3)) d(label,km,position)
where e.slug='maratona-de-curitiba-2026' and not exists(select 1 from public.event_distances where event_id=e.id);
insert into public.event_sources(event_id,source_name,source_url,import_method,last_verified_at)
select id,'Site oficial da Maratona de Curitiba','https://maratonadecuritiba.com.br/','manual','2026-09-21T12:00:00Z' from public.events e
where slug='maratona-de-curitiba-2026' and not exists(select 1 from public.event_sources where event_id=e.id);
