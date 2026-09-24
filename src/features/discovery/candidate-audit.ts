import type { DiscoverySource } from './types';

export type CandidateAuditClassification = 'probable_event' | 'probable_non_event' | 'uncertain';

export type CandidateAuditInput = {
  url: string;
  normalized_url?: string | null;
  title_hint?: string | null;
  discovery_method?: string | null;
};

export function classifyDiscoveryCandidate(candidate: CandidateAuditInput, source?: DiscoverySource | null) {
  let parsed: URL;
  try { parsed = new URL(candidate.url); } catch { return { classification: 'uncertain' as const, reasons: ['invalid_url'] }; }
  const path = parsed.pathname.toLowerCase();
  const text = `${candidate.title_hint || ''} ${path}`.toLowerCase();
  const config = (source?.config || {}) as Record<string, unknown>;
  const includes = Array.isArray(config.includePatterns) ? config.includePatterns.filter((value): value is string => typeof value === 'string') : [];
  const excludes = Array.isArray(config.excludePatterns) ? config.excludePatterns.filter((value): value is string => typeof value === 'string') : [];
  if (excludes.some((pattern) => text.includes(pattern.toLowerCase()))) return { classification: 'probable_non_event' as const, reasons: ['source_exclude_pattern'] };
  if (/\/(cadastroeventos|cronometragem|contato|sobre|politica|login)(\/|$)/.test(path)) return { classification: 'probable_non_event' as const, reasons: ['institutional_path'] };
  if (/(calendar|calendario|listagem|buscar|search|categoria)/.test(path) && !/(evento|corrida|event-details)/.test(path)) return { classification: 'probable_non_event' as const, reasons: ['listing_or_search_path'] };
  if (includes.length && includes.some((pattern) => text.includes(pattern.toLowerCase()))) return { classification: 'probable_event' as const, reasons: ['source_include_pattern'] };
  if (/\/(event-details|evento|event|corrida|run-series)(\/|$)/.test(path)) return { classification: 'probable_event' as const, reasons: ['event_path'] };
  if (/(corrida|run|maratona|meia|trail|race|caminhada|night run|kids)/.test(text) && !/(home|blog|noticia|news)/.test(path)) return { classification: 'probable_event' as const, reasons: ['event_title_or_slug'] };
  if (path === '/' || path.split('/').filter(Boolean).length <= 1) return { classification: 'probable_non_event' as const, reasons: ['root_or_shallow_path'] };
  return { classification: 'uncertain' as const, reasons: ['insufficient_deterministic_signal'] };
}

export function pathnamePattern(url: string) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return segments.length ? `/${segments[0]}/*` : '/';
  } catch { return 'invalid'; }
}
