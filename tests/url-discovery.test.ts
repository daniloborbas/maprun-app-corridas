import { describe, expect, it } from 'vitest';
import { discoverUrlsFromSource, normalizeDiscoveryUrl } from '@/features/discovery/url-discovery';
import type { DiscoverySource } from '@/features/discovery/types';

const source = (overrides: Partial<DiscoverySource> = {}): DiscoverySource => ({
  id: 'source-1', name: 'Fonte', base_url: 'https://example.com/sitemap.xml', source_type: 'other', active: true, region: 'MG', ...overrides,
});
function fetcher(pages: Record<string, string>) {
  return async (input: RequestInfo | URL) => new Response(pages[String(input)] || 'not found', { status: pages[String(input)] ? 200 : 404, headers: { 'content-type': 'application/xml' } });
}

describe('URL discovery providers', () => {
  it('discovers URLs from a simple sitemap, removes hashes and duplicates', async () => {
    const result = await discoverUrlsFromSource(source({ discovery_strategy: 'sitemap' }), { fetcher: fetcher({
      'https://example.com/sitemap.xml': '<urlset><url><loc>https://example.com/e/1#top</loc></url><url><loc>https://example.com/e/1</loc></url><url><loc>https://outside.test/e/2</loc></url></urlset>',
    }) });
    expect(result.map((item) => item.url)).toEqual(['https://example.com/e/1']);
    expect(result[0].discoveryMethod).toBe('sitemap');
  });

  it('supports a sitemap index with a bounded child sitemap', async () => {
    const result = await discoverUrlsFromSource(source({ discovery_strategy: 'sitemap' }), { fetcher: fetcher({
      'https://example.com/sitemap.xml': '<sitemapindex><sitemap><loc>https://example.com/events.xml</loc></sitemap></sitemapindex>',
      'https://example.com/events.xml': '<urlset><url><loc>/corrida/a</loc></url></urlset>',
    }) });
    expect(result.map((item) => item.url)).toEqual(['https://example.com/corrida/a']);
  });

  it('extracts listing links and applies include/exclude patterns', async () => {
    const result = await discoverUrlsFromSource(source({
      base_url: 'https://example.com/calendario', discovery_strategy: 'listing_page',
      config: { includePatterns: ['/corrida/'], excludePatterns: ['/encerrada'] },
    }), { fetcher: fetcher({ 'https://example.com/calendario': '<a href="/corrida/a">Corrida A</a><a href="/corrida/encerrada">X</a><a href="https://other.test/corrida/b">Fora</a>' }) });
    expect(result).toEqual([expect.objectContaining({ url: 'https://example.com/corrida/a', titleHint: 'Corrida A', discoveryMethod: 'listing_page' })]);
  });

  it('maps legacy source types to listing_page', async () => {
    const result = await discoverUrlsFromSource(source({ source_type: 'html_calendar', discovery_strategy: 'generic', base_url: 'https://example.com/list' }), { fetcher: fetcher({ 'https://example.com/list': '<a href="/e/1">Uma corrida</a>' }) });
    expect(result[0].discoveryMethod).toBe('listing_page');
  });

  it('uses generic as the listing fallback', async () => {
    const result = await discoverUrlsFromSource(source({ discovery_strategy: 'generic', base_url: 'https://example.com/list' }), { fetcher: fetcher({ 'https://example.com/list': '<a href="/e/1">Uma corrida</a>' }) });
    expect(result).toHaveLength(1);
  });

  it('blocks private hosts, invalid protocols and external domains', () => {
    expect(normalizeDiscoveryUrl('http://localhost/admin', 'https://example.com')).toBeNull();
    expect(normalizeDiscoveryUrl('http://127.0.0.1/admin', 'https://example.com')).toBeNull();
    expect(normalizeDiscoveryUrl('https://example.com/e/1', 'https://example.com')).toBe('https://example.com/e/1');
    expect(normalizeDiscoveryUrl('https://other.example/e/1', 'https://example.com')).toBeNull();
    expect(normalizeDiscoveryUrl('file:///tmp/x', 'https://example.com')).toBeNull();
  });

  it('returns a controlled error for custom strategies', async () => {
    await expect(discoverUrlsFromSource(source({ discovery_strategy: 'custom' }))).rejects.toThrow('custom ainda não possui provider');
  });
});
