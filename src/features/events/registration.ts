import { isSpecificRegistrationUrl } from './validation';

export interface RegistrationDestinationEvent {
  registration_url?: string | null;
  official_url?: string | null;
}

export function resolveRegistrationDestination(event: RegistrationDestinationEvent): string | null {
  if (event.registration_url && isSpecificRegistrationUrl(event.registration_url)) return event.registration_url;
  if (event.official_url && isSpecificRegistrationUrl(event.official_url)) return event.official_url;
  return null;
}
