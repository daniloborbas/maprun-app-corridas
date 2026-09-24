import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { getResearchModelConfiguration } from '@/features/discovery/openai-research-provider';

describe('admin discovery research configuration', () => {
  it('requires an explicit research model', () => {
    const previous = process.env.OPENAI_RESEARCH_MODEL;
    delete process.env.OPENAI_RESEARCH_MODEL;
    expect(() => getResearchModelConfiguration()).toThrow('OPENAI_RESEARCH_MODEL');
    if (previous) process.env.OPENAI_RESEARCH_MODEL = previous;
  });

  it('returns the configured model without exposing credentials', () => {
    process.env.OPENAI_RESEARCH_MODEL = 'test-research-model';
    expect(getResearchModelConfiguration()).toBe('test-research-model');
    expect(getResearchModelConfiguration()).not.toContain('KEY');
  });
});
