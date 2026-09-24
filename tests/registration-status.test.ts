import { describe, expect, it } from 'vitest';
import { normalizeRegistrationStatus, registrationStatusLabel } from '@/features/events/registration-status';

describe('registration status', () => {
  it('defaults missing values to open', () => {
    expect(normalizeRegistrationStatus(undefined)).toBe('open');
    expect(registrationStatusLabel(undefined)).toBe('Inscrições abertas');
  });
  it('exposes sold out and closed states', () => {
    expect(registrationStatusLabel('sold_out')).toBe('Inscrições esgotadas');
    expect(registrationStatusLabel('closed')).toBe('Inscrições encerradas');
  });
});
