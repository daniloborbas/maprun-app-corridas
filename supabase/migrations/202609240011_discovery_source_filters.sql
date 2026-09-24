update public.discovery_sources
set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
  'includePatterns', jsonb_build_array('/event-details/'),
  'excludePatterns', jsonb_build_array('/cronometragem', '/cadastroeventos')
),
updated_at = now()
where name = 'Portal das Corridas';
