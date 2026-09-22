import { describe, expect, it } from 'vitest';
import { classifyDiscoveryCandidate } from '@/features/discovery/classifier';
import type { DiscoveredEventCandidate } from '@/features/discovery/types';

const candidate = (name: string, source_url: string): DiscoveredEventCandidate => ({ source_id: 's', source_url, name, raw_title: name, status: 'pending' });

describe('discovery candidate classifier', () => {
  it.each([
    ['Corrida da NCor — Itajubá/MG — 27/09/2026', 'https://example.test/corrida-ncor-2026'],
    ['Corrida Outubro Rosa MTOR — 11/10/2026 — 5 km', 'https://example.test/evento/mtor'],
    ['Circuito de Rua Pedal e Corrida IFSULDEMINAS — 27/09/2026', 'https://example.test/circuito-ifsuldeminas'],
  ])('classifica %s como EVENT', (name, url) => expect(classifyDiscoveryCandidate(candidate(name, url))).toBe('EVENT'));
  it.each([
    ['Calendário de corridas 2026', 'https://example.test/corridas/mg'],
    ['Corridas em Minas Gerais', 'https://example.test/corridas/minas-gerais'],
    ['Notícia: corrida reúne atletas', 'https://example.test/blog/noticia-corrida'],
  ])('exclui %s da fila normal', (name, url) => expect(['EDITORIAL', 'LISTING']).toContain(classifyDiscoveryCandidate(candidate(name, url))));
});
