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
