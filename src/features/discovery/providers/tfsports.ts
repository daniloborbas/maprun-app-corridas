import { assertSafeImportUrl } from '@/features/importer/url-import';
import type { DiscoveredEventCandidate, DiscoverySource } from '../types';
import type { DiscoveryProvider } from './html-calendar';

const SITEMAP_URL = 'https://www.tfsports.com.br/sitemap.xml';
const MAX_CANDIDATES = 40;

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function titleFromSlug(slug: string): string {
  return slug.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function extractTFSportsRunSeriesUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeXml(match[1].trim()))
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.hostname === 'www.tfsports.com.br' && /^\/run-series\/[^/]+\/?$/i.test(parsed.pathname);
      } catch { return false; }
    })
    .map((url) => new URL(url).toString())
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, MAX_CANDIDATES);
}

export const tfsportsProvider: DiscoveryProvider = {
  supports: (source: DiscoverySource) => source.name === 'TFSports Run Series' || source.base_url.includes('tfsports.com.br/sitemap.xml'),
  async discoverEvents(source: DiscoverySource): Promise<DiscoveredEventCandidate[]> {
    const sitemapUrl = await assertSafeImportUrl(source.base_url || SITEMAP_URL);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(sitemapUrl, { signal: controller.signal, headers: { Accept: 'application/xml,text/xml', 'User-Agent': 'MapRunDiscovery/1.0' } });
      if (!response.ok) throw new Error(`Sitemap indisponível (HTTP ${response.status}).`);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('xml') && !type.includes('text')) throw new Error('Sitemap não retornou XML.');
      return extractTFSportsRunSeriesUrls((await response.text()).slice(0, 2_000_000)).map((sourceUrl) => {
        const slug = new URL(sourceUrl).pathname.replace(/^\/run-series\//i, '').replace(/\/$/, '');
        return { source_id: source.id, source_url: sourceUrl, external_id: `tfsports:run-series:${slug}`, name: titleFromSlug(slug), raw_title: titleFromSlug(slug), status: 'pending' as const, discovered_at: new Date().toISOString() };
      });
    } finally { clearTimeout(timer); }
  },
};
