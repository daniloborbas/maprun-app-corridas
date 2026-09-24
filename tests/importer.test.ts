import { describe, expect, it } from 'vitest';
import { extractEventMetadata, importUrlSchema } from '@/features/importer/url-import';
import { mergeEventImports } from '@/features/importer/merge-imports';
const html = `<html><head><title>Corrida Serra</title><meta property="og:title" content="Corrida Serra 2026"><meta property="og:description" content="Uma prova incrível"><meta property="og:image" content="https://cdn.example.com/cover.jpg"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Corrida Serra 2026","description":"Uma prova incrível","startDate":"2026-10-18T07:00:00-03:00","location":{"@type":"Place","name":"Parque Central","address":{"@type":"PostalAddress","streetAddress":"Rua das Flores, 10","addressLocality":"Itajubá","addressRegion":"MG"}},"organizer":{"@type":"Organization","name":"Equipe Serra"},"offers":{"price":"89","url":"https://tickets.example.com/race"}}</script></head><body><p>Distâncias: 5 km, 10K e meia maratona</p></body></html>`;
describe('importador determinístico', () => {
  it('prioriza JSON-LD Event e extrai fallback semântico', () => { const draft=extractEventMetadata(html,'https://example.com/race'); expect(draft.name).toBe('Corrida Serra 2026'); expect(draft.city).toBe('Itajubá'); expect(draft.state).toBe('MG'); expect(draft.priceFrom).toBe(89); expect(draft.coverImageUrl).toContain('cover.jpg'); expect(draft.distances.map(d=>d.distance_km)).toEqual(expect.arrayContaining([5,10,21.097])); });
  it('rejeita esquemas e formas de URL inadequadas', () => { expect(importUrlSchema.safeParse('javascript:alert(1)').success).toBe(false); expect(importUrlSchema.safeParse('file:///tmp/a').success).toBe(false); expect(importUrlSchema.safeParse('https://example.com/race').success).toBe(true); });
  it('deixa ausentes vazios, sem inventar data', () => { const draft=extractEventMetadata('<html><head><title>Evento</title><meta property="article:published_time" content="2026-09-22"></head></html>','https://example.com/x'); expect(draft.startDate).toBeNull(); expect(draft.city).toBe(''); expect(draft.slug).toBe('evento'); });
  it('aceita Event dentro de @graph e gera slug', () => { const draft=extractEventMetadata('<script type="application/ld+json">{"@graph":[{"@type":"SportsEvent","name":"Corrida São João","startDate":"2026-06-12"}]}</script>','https://example.com/x'); expect(draft.name).toBe('Corrida São João'); expect(draft.slug).toBe('corrida-sao-joao'); expect(draft.startDate).toContain('2026-06-12'); });
  it('extrai localização, UF por extenso e CTA de inscrição do JSON embutido/HTML', () => { const draft=extractEventMetadata(`<script id="__NEXT_DATA__" type="application/json">{"props":{"event":{"name":"Prova","location":{"city":"Itajubá","state":"Minas Gerais"},"registrationUrl":"https://tickets.example.com/123"}}}</script><a href="https://tickets.example.com/123">Inscreva-se</a>`,'https://example.com/x'); expect(draft.city).toBe('Itajubá'); expect(draft.state).toBe('MG'); expect(draft.registrationUrl).toBe('https://tickets.example.com/123'); });
  it('mescla campos ausentes e preserva as duas fontes', () => { const a=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","name":"Prova","image":"https://a/img.jpg"}</script>','https://a.test'); const b=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","startDate":"2026-10-10","location":{"address":{"addressLocality":"Itajubá","addressRegion":"MG"}}}</script>','https://b.test'); const merged=mergeEventImports(a,b); expect(merged.draft.city).toBe('Itajubá'); expect(merged.draft.startDate).toContain('2026-10-10'); expect(merged.sources).toEqual(['https://a.test','https://b.test']); });
  it('registra conflito de data sem escolher silenciosamente', () => { const a=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","name":"Prova","startDate":"2026-10-10"}</script>','https://a.test'); const b=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","startDate":"2026-10-11"}</script>','https://b.test'); expect(mergeEventImports(a,b).conflicts[0].field).toBe('startDate'); });
});

describe('conflitos multi-source', () => {
  it('detecta divergência de inscrição, local e distâncias', () => {
    const a=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","name":"Prova","location":{"name":"Praça A"},"offers":{"url":"https://a.test/inscricao"},"startDate":"2026-10-10"}</script>','https://a.test');
    const b=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","name":"Prova","location":{"name":"Praça B"},"offers":{"url":"https://b.test/inscricao"},"startDate":"2026-10-11"}</script><p>5 km e 10 km</p>','https://b.test');
    const fields=mergeEventImports(a,b).conflicts.map(c=>c.field);
    expect(fields).toEqual(expect.arrayContaining(['startDate','venue','registrationUrl']));
  });
  it('mantém uma fonte sem conflitos', () => {
    const a=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","name":"Prova","startDate":"2026-10-10"}</script>','https://a.test');
    expect(mergeEventImports(a,a).conflicts).toHaveLength(0);
  });
});


describe('imagem importada', () => {
  it('ignora valor de imagem que não é URL', () => {
    const draft=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","name":"Prova","image":{"url":"objeto"}}</script>','https://example.com/x');
    expect(draft.coverImageUrl).toBe('');
  });
});

describe('conteúdo editorial e imagens oficiais', () => {
  it('gera descrições factuais sanitizadas a partir dos campos disponíveis', () => {
    const draft=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","name":"Corrida Serra","startDate":"2026-10-18T07:00:00-03:00","location":{"address":{"addressLocality":"Itajubá","addressRegion":"MG"}},"organizer":{"name":"Equipe Serra"}}</script><p>5 km</p>','https://example.com/race');
    expect(draft.shortDescription).toContain('Corrida Serra');
    expect(draft.description).toContain('Itajubá - MG');
    expect(draft.description).toContain('Equipe Serra');
    expect(draft.description).not.toContain('<p>');
  });
  it('usa twitter:image quando og:image está ausente e ignora logos', () => {
    const draft=extractEventMetadata('<meta name="twitter:image" content="https://cdn.example.com/race.jpg"><meta property="og:image" content="https://cdn.example.com/logo.png"><script type="application/ld+json">{"@type":"Event","name":"Prova"}</script>','https://example.com/race');
    expect(draft.coverImageUrl).toBe('https://cdn.example.com/race.jpg');
  });
  it('não inventa fatos ausentes na descrição', () => {
    const draft=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","name":"Prova"}</script>','https://example.com/race');
    expect(draft.description).not.toMatch(/Itajubá|MG|R\$|inscri/i);
  });
});

describe('inscrição segura', () => {
  it('não trata homepage ou login como inscrição específica', async () => {
    const { isSpecificRegistrationUrl } = await import('@/features/events/validation');
    expect(isSpecificRegistrationUrl('https://portal.example.com/')).toBe(false);
    expect(isSpecificRegistrationUrl('https://portal.example.com/login')).toBe(false);
    expect(isSpecificRegistrationUrl('https://portal.example.com/evento/corrida-serra')).toBe(true);
  });
});

describe('destino de inscrição', () => {
  it('classifica destinos genéricos, específicos e inválidos', async () => {
    const { classifyRegistrationUrl } = await import('@/features/events/registration');
    expect(classifyRegistrationUrl('https://portal.example/')).toBe('generic');
    expect(classifyRegistrationUrl('https://portal.example/login')).toBe('generic');
    expect(classifyRegistrationUrl('https://portal.example/resultados')).toBe('generic');
    expect(classifyRegistrationUrl('https://portal.example/calendario')).toBe('generic');
    expect(classifyRegistrationUrl('https://portal.example/busca')).toBe('generic');
    expect(classifyRegistrationUrl('https://portal.example/search')).toBe('generic');
    expect(classifyRegistrationUrl('https://portal.example/home')).toBe('generic');
    expect(classifyRegistrationUrl('https://portal.example/index')).toBe('generic');
    expect(classifyRegistrationUrl('https://portal.example/evento/corrida-serra')).toBe('specific');
    expect(classifyRegistrationUrl('http://portal.example/evento/corrida-serra')).toBe('invalid');
  });
  it('prioriza inscrição específica', async () => {
    const { resolveRegistrationDestination } = await import('@/features/events/registration');
    expect(resolveRegistrationDestination({ registration_url: 'https://inscricoes.example/evento/x', official_url: 'https://organizador.example/x' })).toBe('https://inscricoes.example/evento/x');
  });
  it('usa página oficial específica quando a inscrição é homepage', async () => {
    const { resolveRegistrationDestination } = await import('@/features/events/registration');
    expect(resolveRegistrationDestination({ registration_url: 'https://portal.example/', official_url: 'https://organizador.example/evento/x' })).toBe('https://organizador.example/evento/x');
  });
  it('retorna nulo sem destino específico', async () => {
    const { resolveRegistrationDestination } = await import('@/features/events/registration');
    expect(resolveRegistrationDestination({ registration_url: 'https://portal.example/', official_url: 'https://organizador.example/' })).toBeNull();
  });
});

describe('Portal das Corridas', () => {
  it('normaliza cidade e UF com Brasil', () => {
    const draft=extractEventMetadata('<html><body><div>Local: Itajubá, MG, Brasil</div></body></html>','https://www.portaldascorridas.com.br/event-details/itajuba');
    expect(draft.city).toBe('Itajubá'); expect(draft.state).toBe('MG');
  });
  it('remove CEP da localidade', () => {
    const draft=extractEventMetadata('<html><body><div>Três Pontas, MG, 37190-000, Brasil</div></body></html>','https://portaldascorridas.com.br/event-details/tres-pontas');
    expect(draft.city).toBe('Três Pontas'); expect(draft.state).toBe('MG');
  });
  it('aceita cidade com UF em formato separado e extrai local e horário', () => {
    const draft=extractEventMetadata('<html><body><div>Carmo de Minas - MG</div><div>Local: Praça Central</div><div>Largada às 07:00</div></body></html>','https://portaldascorridas.com.br/event-details/carmo');
    expect(draft.city).toBe('Carmo de Minas'); expect(draft.state).toBe('MG'); expect(draft.startTime).toBe('07:00');
  });
  it('não inventa UF quando só há cidade', () => {
    const draft=extractEventMetadata('<html><body><div>Local: Carmo de Minas</div></body></html>','https://portaldascorridas.com.br/event-details/carmo');
    expect(draft.city).toBe(''); expect(draft.state).toBe('');
  });
  it('reutiliza normalizador de distâncias múltiplas', () => {
    const draft=extractEventMetadata('<html><body><div>Provas: 5 km, 10 km e meia maratona</div></body></html>','https://portaldascorridas.com.br/event-details/prova');
    expect(draft.distances.map(item=>item.distance_km)).toEqual(expect.arrayContaining([5,10,21.097]));
  });
  it('extrai preço claramente marcado e mantém inscrição específica', () => {
    const draft=extractEventMetadata('<html><body><div>Inscrição: R$ 89,90</div><a href="https://portaldascorridas.com.br/event-details/prova">Detalhes</a><a href="https://inscricoes.example.com/evento/prova">Inscreva-se</a></body></html>','https://portaldascorridas.com.br/event-details/prova');
    expect(draft.priceFrom).toBe(89.9); expect(draft.registrationUrl).toBe('https://inscricoes.example.com/evento/prova');
  });
  it('mantém prioridade do JSON-LD sobre texto conflitante', () => {
    const draft=extractEventMetadata('<script type="application/ld+json">{"@type":"Event","name":"Prova","location":{"address":{"addressLocality":"Itajubá","addressRegion":"MG"}}}</script><body><div>Três Pontas, MG, Brasil</div></body>','https://portaldascorridas.com.br/event-details/prova');
    expect(draft.city).toBe('Itajubá'); expect(draft.state).toBe('MG');
  });
});

describe('Ticket Sports', () => {
  const mg = `<html><head><meta property="og:image" content="https://cdn.ticketsports.com.br/events/mart.jpg"><script type="application/ld+json">{"@type":"Event","name":"Corrida Mart Minas 2026","startDate":"2026-10-03T07:05:00-03:00","location":{"name":"Praça Nova da Pampulha","address":{"streetAddress":"Praça Nova da Pampulha","addressLocality":"Belo Horizonte","addressRegion":"MG"}},"organizer":{"name":"TBH Esportes"},"offers":{"price":"99.90","url":"https://site.ticketsports.com.br/event/mart-minas"}}</script></head><body>ORGANIZADOR TBH Esportes Corrida 21 km, corrida 10 km, corrida 5 km, caminhada de 2 km e Caminhada Kids. Largada 07:05 <a href="https://cdn.ticketsports.com.br/regulamento.pdf">Regulamento</a></body></html>`;
  const rs = `<html><head><meta property="og:title" content="Corrida do Grêmio 2026"><meta property="og:image" content="https://cdn.ticketsports.com.br/events/gremio.jpg"></head><body><div>Arena do Grêmio: Av. Padre Leopoldo Brentano, 110, Porto Alegre, RS, Brasil</div><div>ORGANIZADOR Run Sports</div><div>Largadas: Corrida 08:00</div><div>Distâncias: 3 km, 5 km e 10 km; caminhada 3 km; kids 2 a 13 anos</div><div>Inscrições</div><a href="https://www.corridadogremio.com.br/inscricao">Inscreva-se</a><a href="https://cdn.ticketsports.com.br/regulamento-gremio.pdf">Regulamento</a></body></html>`;
  it('extrai página Ticket Sports de MG e o external_id final', () => { const draft=extractEventMetadata(mg,'https://www.ticketsports.com.br/e/corrida-mart-minas-2026-87877'); expect(draft.externalId).toBe('87877'); expect(draft.city).toBe('Belo Horizonte'); expect(draft.state).toBe('MG'); expect(draft.organizerName).toBe('TBH Esportes'); expect(draft.startTime).toBe('07:05'); expect(draft.registrationUrl).toContain('site.ticketsports.com.br'); expect(draft.regulationUrl).toContain('regulamento'); expect(draft.coverImageUrl).toContain('mart.jpg'); expect(draft.distances.map(x=>x.distance_km)).toEqual(expect.arrayContaining([2,5,10,21])); expect(draft.distances.filter(x=>/kids/i.test(x.label))).toHaveLength(1); });
  it('extrai outro estado, separa inscrição de regulamento e não usa Ticket Sports como organizador', () => { const draft=extractEventMetadata(rs,'https://www.ticketsports.com.br/e/corrida-do-gremio-2026-87730'); expect(draft.externalId).toBe('87730'); expect(draft.city).toBe('Porto Alegre'); expect(draft.state).toBe('RS'); expect(draft.organizerName).toBe('Run Sports'); expect(draft.registrationUrl).toContain('corridadogremio.com.br'); expect(draft.regulationUrl).toContain('regulamento-gremio'); expect(draft.startTime).toBe('08:00'); expect(draft.coverImageUrl).toContain('gremio.jpg'); expect(draft.distances.map(x=>x.distance_km)).toEqual(expect.arrayContaining([3,5,10])); });
});


