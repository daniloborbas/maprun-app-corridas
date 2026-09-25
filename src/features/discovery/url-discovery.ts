import type { DiscoverySource } from './types';

export type DiscoveryMethod = 'sitemap' | 'listing_page' | 'generic';
export interface DiscoveredUrl {
  url: string;
  sourceId: string;
  discoveredAt: string;
  discoveryMethod: DiscoveryMethod;
  titleHint?: string;
}
export interface DiscoveryProviderContext { fetcher?: typeof fetch; now?: Date; maxDiscoveredUrls?: number; }
export interface UrlDiscoveryProvider {
  discover(source: DiscoverySource, context?: DiscoveryProviderContext): Promise<DiscoveredUrl[]>;
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_URLS = 500;
const MAX_SITEMAP_DEPTH = 1;
const USER_AGENT = 'MapRunDiscovery/2.0 (+https://maprun-app-corridas.vercel.app)';

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/[\[\]]/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'local' || host.endsWith('.local')) return true;
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 || octets[0] === 0 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

export function normalizeDiscoveryUrl(raw: string, baseUrl: string, allowedHostname = new URL(baseUrl).hostname): string | null {
  let parsed: URL;
  try { parsed = new URL(raw, baseUrl); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHostname(parsed.hostname)) return null;
  const host = parsed.hostname.toLowerCase();
  const allowed = allowedHostname.toLowerCase();
  if (host !== allowed && !host.endsWith(`.${allowed}`)) return null;
  parsed.hash = '';
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString();
}

function textFromHtml(value: string) { return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function configPatterns(source: DiscoverySource, key: 'includePatterns' | 'excludePatterns'): RegExp[] {
  const values = source.config?.[key];
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => { try { return typeof value === 'string' ? [new RegExp(value, 'i')] : []; } catch { return []; } });
}

async function fetchText(rawUrl: string, source: DiscoverySource, context: DiscoveryProviderContext): Promise<string> {
  const url = normalizeDiscoveryUrl(rawUrl, source.base_url);
  if (!url) throw new Error('URL de discovery bloqueada ou fora do domínio permitido.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await (context.fetcher || fetch)(url, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'text/html,application/xml,text/xml', 'User-Agent': USER_AGENT } });
    if (response.status >= 300 && response.status < 400) throw new Error('Redirect não seguido durante discovery.');
    if (!response.ok) throw new Error(`Fonte indisponível (HTTP ${response.status}).`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_RESPONSE_BYTES) throw new Error('Resposta da fonte excede o limite permitido.');
    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) throw new Error('Resposta da fonte excede o limite permitido.');
    return body;
  } finally { clearTimeout(timer); }
}
/** Shared guarded fetch for evidence consumers; keeps the discovery SSRF/size/timeout policy in one place. */
export async function fetchSafeDiscoveryText(rawUrl: string, source: DiscoverySource, context: DiscoveryProviderContext = {}): Promise<string> {
  return fetchText(rawUrl, source, context);
}

function xmlLocations(xml: string) { return [...xml.matchAll(/<loc[^>]*>\s*([\s\S]*?)\s*<\/loc>/gi)].map((match) => textFromHtml(match[1])); }
function addUnique(result: DiscoveredUrl[], item: DiscoveredUrl, limit = MAX_URLS) { if (result.length < limit && !result.some((existing) => existing.url === item.url)) result.push(item); }

export const sitemapDiscoveryProvider: UrlDiscoveryProvider = {
  async discover(source, context = {}) {
    const discoveredAt = (context.now || new Date()).toISOString();
    const result: DiscoveredUrl[] = [];
    const limit = Math.max(1, Math.min(MAX_URLS, context.maxDiscoveredUrls ?? MAX_URLS));
    async function visit(sitemapUrl: string, depth: number) {
      if (depth > MAX_SITEMAP_DEPTH || result.length >= limit) return;
      const xml = await fetchText(sitemapUrl, source, context);
      const locations = xmlLocations(xml);
      if (/<sitemapindex\b/i.test(xml)) {
        for (const location of locations) await visit(location, depth + 1);
        return;
      }
      for (const location of locations) {
        const url = normalizeDiscoveryUrl(location, source.base_url);
        if (url) addUnique(result, { url, sourceId: source.id, discoveredAt, discoveryMethod: 'sitemap' }, limit);
      }
    }
    await visit(source.base_url, 0);
    return result;
  },
};

export const listingPageDiscoveryProvider: UrlDiscoveryProvider = {
  async discover(source, context = {}) {
    const html = await fetchText(source.base_url, source, context);
    const include = configPatterns(source, 'includePatterns');
    const exclude = configPatterns(source, 'excludePatterns');
    const discoveredAt = (context.now || new Date()).toISOString();
    const result: DiscoveredUrl[] = [];
    const limit = Math.max(1, Math.min(MAX_URLS, context.maxDiscoveredUrls ?? MAX_URLS));
    for (const [, href, label] of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = normalizeDiscoveryUrl(href, source.base_url);
      if (!url || (include.length > 0 && !include.some((pattern) => pattern.test(url))) || exclude.some((pattern) => pattern.test(url))) continue;
      addUnique(result, { url, sourceId: source.id, discoveredAt, discoveryMethod: 'listing_page', titleHint: textFromHtml(label) || undefined }, limit);
    }
    return result;
  },
};

export const genericDiscoveryProvider: UrlDiscoveryProvider = listingPageDiscoveryProvider;

export async function discoverUrlsFromSource(source: DiscoverySource, context: DiscoveryProviderContext = {}): Promise<DiscoveredUrl[]> {
  const legacySource = source.source_type === 'html_calendar' || source.source_type === 'organizer_page';
  const strategy = legacySource && (!source.discovery_strategy || source.discovery_strategy === 'generic')
    ? 'listing_page'
    : source.discovery_strategy || 'generic';
  if (strategy === 'custom') throw new Error('Estratégia custom ainda não possui provider registrado.');
  if (strategy === 'sitemap') return sitemapDiscoveryProvider.discover(source, context);
  if (strategy === 'listing_page') return listingPageDiscoveryProvider.discover(source, context);
  return genericDiscoveryProvider.discover(source, context);
}
