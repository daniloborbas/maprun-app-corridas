import { describe, expect, it } from 'vitest';
import { evaluateExtractionCompleteness, extractEventExtraction, extractRelevantPageText, shouldUseAiFallback } from '@/features/importer/url-import';

describe('contrato de extração determinística', () => {
  it('classifica JSON-LD completo e registra provenance', () => {
    const result = extractEventExtraction(`<script type="application/ld+json">{"@type":"Event","name":"Corrida Serra","startDate":"2026-10-18T07:00:00-03:00","location":{"address":{"addressLocality":"Itajubá","addressRegion":"MG"}},"organizer":{"name":"Equipe Serra"},"image":"https://cdn.example/race.jpg","offers":{"url":"https://tickets.example/race"}}</script><p>5 km</p>`, 'https://example.com/race');
    expect(result.extractionQuality.status).toBe('complete');
    expect(result.fieldSources.name).toBe('json_ld');
    expect(result.fieldSources.startDate).toBe('json_ld');
    expect(result.shouldUseAiFallback).toBe(false);
  });

  it('combina embedded quando JSON-LD está incompleto', () => {
    const result = extractEventExtraction(`<script type="application/ld+json">{"@type":"Event","name":"Prova"}</script><script id="__NEXT_DATA__" type="application/json">{"props":{"event":{"startDate":"2026-10-18","location":{"city":"Itajubá","state":"MG"}}}}</script>`, 'https://example.com/race');
    expect(result.event.date).toContain('2026-10-18');
    expect(result.event.city).toBe('Itajubá');
    expect(result.event.state).toBe('MG');
  });

  it('expõe conflito entre datas estruturadas', () => {
    const result = extractEventExtraction(`<script type="application/ld+json">{"@type":"Event","name":"Prova","startDate":"2026-10-18"}</script><script type="application/json">{"startDate":"2026-10-25"}</script>`, 'https://example.com/race');
    expect(result.extractionQuality.conflicts[0]?.field).toBe('startDate');
    expect(result.shouldUseAiFallback).toBe(true);
  });

  it('diferencia partial de insufficient sem inventar valores', () => {
    const event = {name:'Prova',date:'2026-10-18',startTime:null,city:'Itajubá',state:'MG',venue:null,address:null,distances:[],price:null,organizerName:null,registrationUrl:null,coverImageUrl:null};
    const partial = evaluateExtractionCompleteness(event);
    expect(partial.status).toBe('partial');
    const insufficient = evaluateExtractionCompleteness({...event, name:null, date:null, city:null, state:null});
    expect(insufficient.status).toBe('insufficient');
    expect(shouldUseAiFallback(insufficient)).toBe(true);
  });

  it('limpa scripts/styles e limita o texto preparado', () => {
    const text = extractRelevantPageText('<script>alert(1)</script><style>.x{}</style><h1>Corrida</h1><p>Detalhes</p>', 20);
    expect(text).not.toContain('alert');
    expect(text).not.toContain('.x');
    expect(text.length).toBeLessThanOrEqual(20);
  });
});
