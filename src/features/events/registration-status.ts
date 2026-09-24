import type { RegistrationStatus } from './types';

export function normalizeRegistrationStatus(value?: string | null): RegistrationStatus {
  return value === 'sold_out' || value === 'closed' ? value : 'open';
}

export function registrationStatusLabel(value?: string | null) {
  const status = normalizeRegistrationStatus(value);
  return status === 'sold_out' ? 'Inscrições esgotadas' : status === 'closed' ? 'Inscrições encerradas' : 'Inscrições abertas';
}
