import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { extractWebSearchSources, OpenAIWebRaceResearchProvider, ResearchProviderError, createRaceResearchRequest, compareOpenAIResearchRequests, sanitizeOpenAIError } from '@/features/discovery/openai-research-provider';
import type { ResearchInput } from '@/features/discovery/research';

const known: ResearchInput = { sourceUrl: 'https://example.com/race', event: { name: 'Corrida Teste', date: '2026-10-10', startTime: null, city: 'Itajubá', state: 'MG', venue: null, address: null, distances: [], price: null, organizerName: null, registrationUrl: null, coverImageUrl: null } };
function fakeClient(payload: unknown) { const create = vi.fn().mockResolvedValue(payload); return { client: { responses: { create } }, create }; }
const output = { output_text: JSON.stringify({ facts: { startTime: '07:00' }, evidence: { startTime: [{ value: '07:00', sourceUrl: 'https://official.example/race', confidence: 95 }] }, conflicts: [], missingFields: ['price'], confidence: 90 }), output: [{ content: [{ annotations: [{ type: 'url_citation', url: 'https://official.example/race', title: 'Official race' }] }] }], usage: { input_tokens: 10, output_tokens: 20 } };

describe('OpenAI web research provider', () => {
  it('extracts and deduplicates action sources and url citations', () => {
    const extracted = extractWebSearchSources({ output: [
      { type: 'web_search_call', action: { type: 'search', sources: [{ url: 'https://official.example/race#section', title: 'Official' }] } },
      { type: 'message', content: [{ annotations: [{ type: 'url_citation', url: 'https://official.example/race', title: 'Official' }] }] },
    ] });
    expect(extracted.sources).toHaveLength(1);
    expect(extracted.webSearches).toBe(1);
  });
  it('does not accept URLs that only appear in structured JSON', () => {
    expect(extractWebSearchSources({ output_text: 'https://invented.example' }).sources).toEqual([]);
  });
  it('requires web_search and captures only returned citations', async () => {
    const { client, create } = fakeClient(output);
    const result = await new OpenAIWebRaceResearchProvider({ client, model: 'research-test' }).research({ queries: ['race'], known, maxSources: 8 });
    expect(create.mock.calls[0][0].tools).toEqual([{ type: 'web_search', search_context_size: 'low' }]);
    expect(create.mock.calls[0][0].include).toEqual(['web_search_call.action.sources']);
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
  it('preserves the original OpenAI error metadata through the provider', async () => {
    const apiError = Object.assign(new Error('Invalid request'), { name: 'BadRequestError', status: 400, type: 'invalid_request_error', code: 'schema_error', param: 'text.format.schema', request_id: 'req_test' });
    const client = { responses: { create: vi.fn().mockRejectedValue(apiError) } };
    await expect(new OpenAIWebRaceResearchProvider({ client, model: 'research-test' }).research({ queries: ['race'], known, maxSources: 8 })).rejects.toMatchObject({ code: 'invalid_request', details: { status: 400, providerType: 'invalid_request_error', param: 'text.format.schema', requestId: 'req_test', errorName: 'BadRequestError' } });
  });
  it('preserves network cause metadata', () => {
    const error = Object.assign(new Error('fetch failed'), { cause: Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }) });
    expect(sanitizeOpenAIError(error)).toMatchObject({ code: 'network_error', cause: { code: 'ECONNRESET' } });
  });
  it('compares smoke and race requests without exposing secrets', () => {
    const smoke = createRaceResearchRequest({ model: 'gpt-test', input: 'small' });
    const race = createRaceResearchRequest({ model: 'gpt-test', instructions: 'race context', input: 'query one\nquery two' });
    const comparison = compareOpenAIResearchRequests(smoke, race, 45000);
    expect(comparison.smoke.schemaHash).toBe(comparison.race.schemaHash);
    expect(comparison.smoke.tools).toEqual(comparison.race.tools);
    expect(comparison.smoke.toolChoice).toBe(comparison.race.toolChoice);
    expect(comparison.smoke.include).toEqual(comparison.race.include);
    expect(comparison.differences).toContain('inputChars');
    expect(JSON.stringify(comparison)).not.toContain('OPENAI_API_KEY');
  });
});
