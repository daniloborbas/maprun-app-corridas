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
    expect(classifyFeedImageMode({ name: 'Corrida Santa Rita', city: '', state: '', event_category: 'rua', venue: '', description: '', start_date: '', distances: [{ label: 'Kids' }] })).toBe('kids');
    expect(prompt).toContain('adults as the primary runners');
  });
});
