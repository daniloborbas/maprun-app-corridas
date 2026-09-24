import type { RegistrationStatus } from './types';

export function normalizeRegistrationStatus(value?: string | null): RegistrationStatus {
  return value === 'sold_out' || value === 'closed' ? value : 'open';
}

export function registrationStatusLabel(value?: string | null) {
  const status = normalizeRegistrationStatus(value);
  return status === 'sold_out' ? 'Inscrições esgotadas' : status === 'closed' ? 'Inscrições encerradas' : 'Inscrições abertas';
}

export function getRegistrationStatusPresentation(value?: string | null) {
  const status = normalizeRegistrationStatus(value);
  return {
    status,
    label: status === 'sold_out' ? 'Inscrições esgotadas' : status === 'closed' ? 'Inscrições encerradas' : 'Inscrições abertas',
    shortLabel: status === 'sold_out' ? 'Esgotado' : status === 'closed' ? 'Encerradas' : 'Inscrições abertas',
    disabled: status !== 'open',
    canRegister: status === 'open',
  } as const;
}
