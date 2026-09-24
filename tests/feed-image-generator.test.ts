import { describe, expect, it } from 'vitest';
import { buildFeedImagePrompt } from '@/features/events/feed-image-generator';

describe('feed image prompt', () => {
  it('includes location and a strict no-text rule', () => {
    const prompt = buildFeedImagePrompt({ name: 'Corrida da Serra', city: 'Itajubá', state: 'MG', event_category: 'trail', venue: '', description: '', distances: [{ label: '10 km' }] });
    expect(prompt).toContain('Itajubá, MG');
    expect(prompt).toContain('trail race');
    expect(prompt.toLowerCase()).toContain('no text');
    expect(prompt).toContain('10 km');
  });

  it('does not invent a place when context is missing', () => {
    const prompt = buildFeedImagePrompt({ name: 'Night Run', city: '', state: '', event_category: 'night', venue: '', description: '', distances: null });
    expect(prompt).toContain('Brazil');
    expect(prompt).toContain('night road race');
  });
});
