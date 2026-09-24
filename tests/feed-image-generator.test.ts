import { describe, expect, it } from 'vitest';
import { buildFeedImagePrompt, classifyFeedImageMode } from '@/features/events/feed-image-generator';

describe('feed image prompt', () => {
  it('includes location and a strict no-text rule', () => {
    const prompt = buildFeedImagePrompt({ name: 'Corrida da Serra', city: 'Itajubá', state: 'MG', event_category: 'trail', venue: '', description: '', start_date: '', distances: [{ label: '10 km' }] });
    expect(prompt).toContain('Itajubá, MG');
    expect(prompt).toContain('trail race');
    expect(prompt.toLowerCase()).toContain('no text');
    expect(prompt).toContain('10 km');
  });

  it('does not invent a place when context is missing', () => {
    const prompt = buildFeedImagePrompt({ name: 'Night Run', city: '', state: '', event_category: 'night', venue: '', description: '', start_date: '', distances: null });
    expect(prompt).toContain('Brazil');
    expect(prompt).toContain('night road race');
  });

  it('keeps a mountain city as road when the structured category is road', () => {
    const prompt = buildFeedImagePrompt({ name: 'Maratona Serra Negra', city: 'Serra Negra', state: 'SP', event_category: 'rua', venue: '', description: '', start_date: '2026-09-26T08:00', distances: [{ label: '42 km' }] });
    expect(classifyFeedImageMode({ name: 'Maratona Serra Negra', city: 'Serra Negra', state: 'SP', event_category: 'rua', venue: '', description: '', start_date: '' })).toBe('road');
    expect(prompt).toContain('paved roads');
    expect(prompt).toContain('no trail running');
  });

  it('allows kids only when the event data explicitly contains kids', () => {
    const prompt = buildFeedImagePrompt({ name: 'Corrida Santa Rita', city: 'Boa Esperança', state: 'MG', event_category: 'rua', venue: '', description: '', start_date: '', distances: [{ label: 'Kids' }] });
    expect(classifyFeedImageMode({ name: 'Corrida Santa Rita', city: '', state: '', event_category: 'rua', venue: '', description: '', start_date: '', distances: [{ label: 'Kids' }] })).toBe('road');
    expect(prompt).toContain('paved roads');
  });

  it('does not let legacy trail wording override a structured road category', () => {
    expect(classifyFeedImageMode({ name: 'Santa Rita', city: '', state: '', event_category: 'rua', venue: '', description: 'O texto antigo menciona trail running.', start_date: '' })).toBe('road');
  });

  it.each([
    ['trail', 'trail'], ['kids', 'kids'], ['night', 'night-road'], ['rua', 'road'],
  ] as const)('maps structured category %s before free text', (category, expected) => {
    expect(classifyFeedImageMode({ name: 'Corrida Kids Trail', city: '', state: '', event_category: category, venue: '', description: 'trail running', start_date: '' })).toBe(expected);
  });

  it('keeps a secondary walk or kids distance as road', () => {
    expect(classifyFeedImageMode({ name: 'Corrida Urbana', city: '', state: '', event_category: 'rua', venue: '', description: '', start_date: '', distances: [{ label: 'Caminhada' }, { label: 'Kids' }] })).toBe('road');
  });

  it('uses strong name evidence only when category is absent', () => {
    expect(classifyFeedImageMode({ name: 'Trail da Serra', city: '', state: '', event_category: null, venue: '', description: '', start_date: '' })).toBe('trail');
    expect(classifyFeedImageMode({ name: 'Corrida', city: '', state: '', event_category: null, venue: '', description: 'Uma ocorrência isolada de trail no texto.', start_date: '' })).toBe('unknown');
  });
});
