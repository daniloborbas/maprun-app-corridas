# MapRun

Fundação do MVP de descoberta de corridas. Next.js App Router, TypeScript strict, Tailwind CSS, PostgreSQL/PostGIS e Supabase Auth. Interface em português, responsiva, com foco na imagem e divulgação progressiva das informações.

## Rodar localmente

Requer Node.js 22 ou superior e npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Abra http://localhost:3000. Sem Supabase, o desenvolvimento mostra 12 eventos **fictícios**. Favoritos e “Eu vou” desse modo ficam apenas neste navegador, com aviso visível. Nenhuma inscrição falsa é liberada. Em produção, fixtures só aparecem com `MAPRUN_DEMO_MODE=true`; configure `false` para usuários reais. Uma conexão Supabase configurada sempre substitui o repositório de demonstração.

## Conectar o Supabase

1. Crie um projeto Supabase/PostgreSQL e preencha `.env.local` com a URL e a **publishable key**, nunca uma service-role key. `NEXT_PUBLIC_SITE_URL` deve ser a origem real da aplicação, igual à usada no navegador durante o login.
2. Aplique `supabase/migrations/202609210001_foundation.sql` pelo SQL Editor do projeto ou com `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202609210001_foundation.sql`. Com um projeto vinculado pelo Supabase CLI, use `supabase db push`.
3. Em Authentication → URL Configuration, defina Site URL e permita `<origem>/auth/callback` nos redirects. Ative login por e-mail/link mágico e configure SMTP antes do lançamento. O login usa PKCE/cookies via `@supabase/ssr`.
4. Entre pelo Perfil. Depois, no SQL Editor, promova **a conta administrativa escolhida**: `update public.profiles set role = 'admin' where id = '<UUID_DA_CONTA>';`. Não existe promoção de role pelo frontend.
5. Acesse `/admin/eventos/novo`, cadastre a corrida e publique. Rascunhos não aparecem no aplicativo público.

Credenciais não foram fornecidas nesta entrega: autenticação por e-mail, persistência remota, métricas de produção e SQL/RLS precisam de verificação de integração no projeto Supabase antes do lançamento. O admin não tem bypass ou senha de demonstração.

## Seeds e primeiro evento real

- `src/features/events/fixtures.ts`: 12 fixtures isoladas para a prévia sem banco; encerrado, cancelado, infantil, trail, noturna, diferentes cidades e um destaque patrocinado explicitamente ilustrativo.
- `supabase/seed.sql`: dados **somente para desenvolvimento**, para executar depois da migration em um banco de teste. Não execute no banco de produção.
- `supabase/examples/curitiba-2026.sql`: cadastro opcional **em rascunho** da Maratona de Curitiba 2026, consultado no [site oficial](https://maratonadecuritiba.com.br/) e no regulamento em 21/09/2026. O horário ainda não estava confirmado; revise esse dado antes de publicar. Não inventa preço ou coordenadas. Os dados desse arquivo não são importados automaticamente.

## Rotas

| Rota                                                           | Função                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `/`                                                            | Feed vertical Descobrir                                              |
| `/buscar`                                                      | Nome, cidade, UF, distância, categoria, modalidade, raio e ordenação |
| `/corrida/[slug]`                                              | Página pública, dados estruturados e inscrição externa               |
| `/salvos`                                                      | Favoritos e “Eu vou”                                                 |
| `/perfil`                                                      | Login, perfil e preferências                                         |
| `/corridas/[collection]`                                       | Coleções por localidade ou distância                                 |
| `/admin`, `/admin/analytics`                                   | Acessos, atividade recente, funil e interesse por corrida            |
| `/admin/eventos`, `/admin/eventos/novo`, `/admin/eventos/[id]` | Cadastro e edição, status e exclusão lógica                          |
| `/privacidade`                                                 | Política preliminar e controles de métricas                          |

`/api/analytics` valida os eventos de uso; `/api/registration/[id]` confere status e URL, registra clique agregado e redireciona. O dashboard usa o marcador `registration_redirect` para não duplicar a conversão enviada pelo navegador com atribuição. Falha de analytics não deve impedir a inscrição. Supabase pode ser acessado pela API HTTP por um app mobile futuro; as regras de autorização ficam no PostgreSQL.

## Banco e arquitetura

Uma migration cria `profiles`, `organizer_profiles`, `event_categories`, `events`, `event_distances`, `event_sources`, `favorites`, `event_attendance`, `alerts`, `analytics_events` e `sponsored_campaigns`. PostGIS fornece coluna geográfica, índice GiST e RPC `nearby_events`. A RPC `save_event` salva evento, distâncias e origem na mesma transação.

- `src/features/events`: tipos, validação Zod, repositório, busca, ranking determinístico e Haversine. SSR usa o repositório; interface usa regras de domínio independentes do Supabase.
- `src/features/{discovery,search,favorites,profile,admin,analytics,location}`: funcionalidades separadas por domínio.
- `src/integrations/events/normalize.ts`: contrato de provider, normalização e chave para candidatos a duplicata. Cadastro manual alerta sobre nome/cidade/data duplicados.
- `src/lib/supabase`: cliente SSR e guarda de administrador; `src/proxy.ts` renova sessão. Server Actions validam sessão e entrada. RLS e restrição de colunas impedem autopromoção e acesso a dados de outras contas.
- `src/components`: navegação, cards, ações, estados, capa e contexto de sessão.

O MVP carrega o catálogo pequeno e revela cards progressivamente, com lazy loading das imagens. Antes de uma base nacional grande, mover paginação/filtros do catálogo para consultas server-side com cursor e PostGIS. A API pública do Supabase tem limites de linhas, então não interpretar o catálogo atual como busca nacional ilimitada.

## SEO, imagens e PWA

Páginas públicas têm renderização no servidor, canonical, metadados específicos, Open Graph e JSON-LD `SportsEvent` (subtipo de `Event`). Rascunhos e itens excluídos não ficam públicos; encerrados e cancelados preservam a página. Coleções só entram no sitemap/indexação com pelo menos três eventos reais futuros. A demonstração usa `noindex` e sitemap vazio.

Capas usam Next Image; imagens oficiais externas devem usar HTTPS. Fallbacks locais são reutilizáveis. Créditos e prompt da capa em `docs/assets.md`. Manifest, ícones 192/512 e service worker com página offline mínima. Não há cache de perfis, admin ou páginas autenticadas. A instalação PWA requer HTTPS (ou localhost).

## Privacidade e métricas

Localização precisa fica só na memória da sessão; cidade manual fica no navegador. Analytics de comportamento exige consentimento. Não envia texto da busca, coordenadas ou e-mail. Métricas incluem origem/UTM/ref e conta somente quando aplicável; cliques operacionais de inscrição são agregados sem identificação. “Online” é uma aproximação por atividade recente, não um heartbeat contínuo. Métricas de recorrência devem usar contas consentidas; não se tenta identificar visitantes anônimos entre dispositivos.

Antes de receber usuários reais, a equipe precisa definir controlador, canal LGPD e retenção na política preliminar. A chave GA4 e verificação Search Console estão previstas no ambiente; nenhum script GA4 é carregado sem integração futura com consentimento. A RPC de analytics limita sessões a 60 ações/minuto; aplique também limites no edge/WAF antes de tráfego público, pois identificadores anônimos podem ser trocados.

## Validação

```powershell
npm run lint
npm run typecheck
npm test
npm run build
# Com npm run dev ativo em 127.0.0.1:3000, em modo de demonstração:
npx playwright install chromium
npx playwright test
```

Testes de domínio verificam distância, filtros, elegibilidade temporal, normalização, URLs e analytics. E2E verificam os fluxos em desktop e mobile, persistência demonstrativa, estados vazios e proteção do admin. `supabase/tests/security.sql` verifica RLS e tentativa de autopromoção em um banco local descartável com migration/seed aplicados. Esse teste não substitui validação do login/CRUD com um Supabase real.

## Deploy

### Descoberta automática

Em produção na Vercel, `vercel.json` agenda `POST /api/internal/discovery/run` uma vez por dia às 08:00 UTC (05:00 em Brasília). Configure `CRON_SECRET` com um valor aleatório; o endpoint exige `Authorization: Bearer <CRON_SECRET>`. A execução consulta apenas fontes ativas, registra `discovery_runs` e adiciona candidatos à fila. Nenhum evento é publicado automaticamente. A busca manual continua disponível em `/admin/descobertas`; o lock de banco impede execuções simultâneas recentes. Para desativar, remova o cron ou marque as fontes como inativas.

Vercel: importe o repositório, configure as variáveis, use `npm run build` e conecte o Supabase. Faça o build com as variáveis finais; as `NEXT_PUBLIC_*` são incorporadas ao bundle. Para prévia com fixtures, habilite `MAPRUN_DEMO_MODE=true` também durante o build. Cloudflare exige adaptar Next.js com OpenNext e validar SSR/proxy no runtime; não foi configurado um adaptador neste MVP. Não usar exportação estática: autenticação e admin dependem do servidor.

## Preparado, sem aprofundar

Campanhas patrocinadas, organizadores, alertas desativados, providers de importação, deduplicação assistida, origem/referral e futuras edições. Não há cobrança, checkout, crawler, app nativo, tracking GPS, feed social ou envio de notificações. CSV e importação por URL ficam para um provider posterior. Sem esquema especulativo de pedidos/pagamentos.
