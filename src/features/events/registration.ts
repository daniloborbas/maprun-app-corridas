import { isPublicHttpsUrl } from './validation';

export type RegistrationUrlSemanticKind = 'valid_registration' | 'probable_registration' | 'generic_page' | 'photo_page' | 'organizer_page' | 'event_page_only' | 'invalid';
export type RegistrationUrlKind = 'specific' | 'event_page' | 'generic' | 'invalid';
const GENERIC_PATH = /^\/(login|signin|contato|contact|eventos?|corridas?|resultados?|calendario|calendar|busca|buscar|search|home|index)\/?$/i;
const PHOTO_PATH = /(^|\/)(fotop|fotos?|photos?|galerias?|gallery)(\/|$)/i;
const ORGANIZER_PATH = /(^|\/)(organizador|organizer)(\/|$)/i;
const UF = '(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)';

export function classifyRegistrationUrlSemantic(value: string, context?: { officialUrl?: string | null }): RegistrationUrlSemanticKind {
  if (!value || !isPublicHttpsUrl(value)) return 'invalid';
  try {
    const url = new URL(value); const path = url.pathname;
    if (PHOTO_PATH.test(path) || /fotop\./i.test(url.hostname)) return 'photo_page';
    if (ORGANIZER_PATH.test(path)) return 'organizer_page';
    if (GENERIC_PATH.test(path) || path === '/') return 'generic_page';
    if (context?.officialUrl && new URL(context.officialUrl).toString() === url.toString()) return 'event_page_only';
    const host = url.hostname.toLowerCase();
    if (/sympla\.com\.br$/i.test(host) && /^\/evento\/[^/]+\/\d+/.test(path)) return 'valid_registration';
    if (/keepsporting\.com$/i.test(host) && /^\/cr\/[^/]+/.test(path)) return 'valid_registration';
    if (/corrida1\./i.test(host) && new RegExp(`^\\/corridas\\/${UF}\\/[^/]+\\/\\d{4}\\/[^/]+$`, 'i').test(path)) return 'valid_registration';
    if (/inscricaodecorrida|portaldascorridas|vamucorrer|ticket\s*sports|ticketsports/i.test(host) && path.split('/').filter(Boolean).length >= 2) return 'probable_registration';
    if (/\/event(?:o|s)?\//i.test(path) && path.split('/').filter(Boolean).length >= 2) return 'probable_registration';
    return 'event_page_only';
  } catch { return 'invalid'; }
}

/** Compatibility adapter for existing importer/admin callers. */
export function classifyRegistrationUrl(value: string, context?: { officialUrl?: string | null }): RegistrationUrlKind {
  const kind = classifyRegistrationUrlSemantic(value, context);
  if (kind === 'valid_registration' || kind === 'probable_registration') return 'specific';
  if (kind === 'event_page_only') return context?.officialUrl ? 'event_page' : 'specific';
  if (kind === 'generic_page' || kind === 'photo_page' || kind === 'organizer_page') return 'generic';
  return 'invalid';
}
export function isUsableRegistrationUrl(value: string | null | undefined, context?: { officialUrl?: string | null }): boolean {
  const kind = classifyRegistrationUrlSemantic(value || '', context);
  return kind === 'valid_registration' || kind === 'probable_registration';
}
export interface RegistrationDestinationEvent { registration_url?: string | null; official_url?: string | null; }
export function resolveRegistrationDestination(event: RegistrationDestinationEvent): string | null {
  if (event.registration_url && isUsableRegistrationUrl(event.registration_url)) return event.registration_url;
  if (event.official_url && ['valid_registration', 'probable_registration', 'event_page_only'].includes(classifyRegistrationUrlSemantic(event.official_url))) return event.official_url;
  return null;
}

