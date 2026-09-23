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
