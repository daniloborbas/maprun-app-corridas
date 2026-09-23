import { describe, expect, it } from 'vitest';
import { buildEventIdentity, classifyEventDeduplication, findBestEventDeduplication, normalizeEventName } from '@/features/discovery/deduplication';

const base = { eventDate: '2026-10-18T08:00:00-03:00', city: 'Pouso Alegre', state: 'MG' };
const event = (name: string, extra = {}) => ({ name, ...base, ...extra });

describe('event deduplication', () => {
  it('normalizes accents, punctuation, case and spaces', () => {
    expect(normalizeEventName('  1ª CORRIDA CAFÉ COM TRAIL – STAY HARD  ')).toBe('1 corrida cafe com trail stay hard');
  });
  it('classifies exact matches across case, accents and punctuation', () => {
    expect(classifyEventDeduplication(event('Corrida Integração'), event('CORRIDA INTEGRACAO')).type).toBe('exact');
    expect(classifyEventDeduplication(event('Night Run - Itajubá'), event('Night Run Itajuba')).type).toBe('exact');
  });
  it('ignores a year suffix for comparison but keeps it in identity name', () => {
    const identity = buildEventIdentity(event('Corrida da Cidade 2026'));
    expect(identity.name).toBe('corrida da cidade 2026');
    expect(classifyEventDeduplication(event('Corrida da Cidade 2026'), event('Corrida da Cidade')).type).toBe('exact');
  });
  it('classifies a conservative high similarity as probable', () => {
    const result = classifyEventDeduplication(event('Circuito das Montanhas Etapa Itajubá'), event('Circuito Montanhas - Etapa Itajuba'));
    expect(result.type).toBe('probable');
    expect(result.similarity).toBeGreaterThanOrEqual(0.88);
  });
  it('does not match different names in same context', () => {
    expect(classifyEventDeduplication(event('Corrida Outubro Rosa'), event('Trail da Mantiqueira')).type).toBe('none');
  });
  it('requires same city, state and date', () => {
    expect(classifyEventDeduplication(event('Corrida Integração'), event('Corrida Integração', { city: 'Itajubá' })).type).toBe('none');
    expect(classifyEventDeduplication(event('Corrida Integração'), event('Corrida Integração', { eventDate: '2026-10-19' })).type).toBe('none');
  });
  it('finds the exact match before a probable match', () => {
    const result = findBestEventDeduplication(event('Corrida Integração'), [event('Outra Corrida'), event('CORRIDA INTEGRACAO', { id: 'event-1' })]);
    expect(result.type).toBe('exact');
    expect(result.matchedEventId).toBe('event-1');
  });
  it('works independently of source id', () => {
    expect(classifyEventDeduplication(event('Corrida Integração', { source_id: 'a' }), event('Corrida Integração', { source_id: 'b' })).type).toBe('exact');
  });
});
