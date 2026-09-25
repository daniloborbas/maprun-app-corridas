import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { OpenAIWebRaceResearchProvider, ResearchProviderError } from '@/features/discovery/openai-research-provider';
import type { ResearchInput } from '@/features/discovery/research';

const known: ResearchInput = { sourceUrl: 'https://example.com/race', event: { name: 'Corrida Teste', date: '2026-10-10', startTime: null, city: 'Itajubá', state: 'MG', venue: null, address: null, distances: [], price: null, organizerName: null, registrationUrl: null, coverImageUrl: null } };
function fakeClient(payload: unknown) { const create = vi.fn().mockResolvedValue(payload); return { client: { responses: { create } }, create }; }
const output = { output_text: JSON.stringify({ facts: { startTime: '07:00' }, evidence: { startTime: [{ value: '07:00', sourceUrl: 'https://official.example/race', confidence: 95 }] }, conflicts: [], missingFields: ['price'], confidence: 90 }), output: [{ content: [{ annotations: [{ type: 'url_citation', url: 'https://official.example/race', title: 'Official race' }] }] }], usage: { input_tokens: 10, output_tokens: 20 } };

describe('OpenAI web research provider', () => {
  it('requires web_search and captures only returned citations', async () => {
    const { client, create } = fakeClient(output);
    const result = await new OpenAIWebRaceResearchProvider({ client, model: 'research-test' }).research({ queries: ['race'], known, maxSources: 8 });
    expect(create.mock.calls[0][0].tools).toEqual([{ type: 'web_search', search_context_size: 'low' }]);
    expect(create.mock.calls[0][0].reasoning).toEqual({ effort: 'low' });
    expect(create.mock.calls[0][0].tool_choice).toBe('required');
    expect(result.sources.map((source) => source.url)).toEqual(['https://official.example/race']);
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
  });
  it('uses the 45 second default timeout and supports the diagnostic two-query budget', async () => {
    const { client, create } = fakeClient(output);
    const provider = new OpenAIWebRaceResearchProvider({ client, model: 'research-test', maxQueries: 2 });
    await provider.research({ queries: ['ignored'], known, maxSources: 8 });
    expect(create.mock.calls[0][0].input.split('\n')).toHaveLength(2);
  });
  it('does not trust a URL present only in model JSON', async () => {
    const { client } = fakeClient({ ...output, output: [], output_text: JSON.stringify({ ...JSON.parse(output.output_text), evidence: { startTime: [{ value: '07:00', sourceUrl: 'https://invented.example', confidence: 99 }] } }) });
    const result = await new OpenAIWebRaceResearchProvider({ client, model: 'research-test' }).research({ queries: ['race'], known, maxSources: 8 });
    expect(result.sources).toEqual([]);
    expect(result.facts).toEqual({});
    expect(result.status).toBe('no_sources');
  });
  it('maps timeout and rate limit errors to controlled errors', async () => {
    const timeout = { responses: { create: vi.fn().mockRejectedValue({ status: 429 }) } };
    await expect(new OpenAIWebRaceResearchProvider({ client: timeout, model: 'research-test' }).research({ queries: ['race'], known, maxSources: 8 })).rejects.toMatchObject({ code: 'rate_limit' });
    expect(new ResearchProviderError('timeout', 'x').code).toBe('timeout');
  });
});
