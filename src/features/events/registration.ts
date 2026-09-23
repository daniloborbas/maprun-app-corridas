import { isPublicHttpsUrl } from './validation';

export type RegistrationUrlKind = 'specific' | 'event_page' | 'generic' | 'invalid';

// These routes describe a portal section, not the event itself. Keeping this
// list centralized prevents import/enrichment data from activating a misleading
// registration CTA when a source redirects to a generic page.
const GENERIC_PATH = /^\/(login|signin|contato|contact|eventos?|corridas?|resultados?|calendario|calendar|busca|buscar|search|home|index)\/?$/i;

export function classifyRegistrationUrl(value: string, context?: { officialUrl?: string | null }): RegistrationUrlKind {
  if (!value || !isPublicHttpsUrl(value)) return 'invalid';
  try {
    const url = new URL(value);
    if (GENERIC_PATH.test(url.pathname)) return 'generic';
    if (context?.officialUrl && new URL(context.officialUrl).toString() === url.toString()) return 'event_page';
    return url.pathname === '/' ? 'generic' : 'specific';
  } catch {
    return 'invalid';
  }
}

export interface RegistrationDestinationEvent {
  registration_url?: string | null;
  official_url?: string | null;
}

export function resolveRegistrationDestination(event: RegistrationDestinationEvent): string | null {
  if (event.registration_url && classifyRegistrationUrl(event.registration_url) === 'specific') return event.registration_url;
  if (event.official_url && ['specific', 'event_page'].includes(classifyRegistrationUrl(event.official_url))) return event.official_url;
  return null;
}
