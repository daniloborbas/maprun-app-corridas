import { describe, expect, it } from 'vitest';
import { getRegistrationStatusPresentation, normalizeRegistrationStatus, registrationStatusLabel } from '@/features/events/registration-status';
import { eventSchema } from '@/features/events/validation';
import { demoEvents } from '@/features/events/fixtures';

describe('registration status', () => {
  it('defaults missing values to open', () => {
    expect(normalizeRegistrationStatus(undefined)).toBe('open');
    expect(registrationStatusLabel(undefined)).toBe('Inscrições abertas');
  });
  it('exposes sold out and closed states', () => {
    expect(registrationStatusLabel('sold_out')).toBe('Inscrições esgotadas');
    expect(registrationStatusLabel('closed')).toBe('Inscrições encerradas');
  });
  it.each(['open', 'sold_out', 'closed'] as const)('returns one consistent presentation for %s', (status) => {
    const presentation = getRegistrationStatusPresentation(status);
    expect(presentation.canRegister).toBe(status === 'open');
    expect(presentation.disabled).toBe(status !== 'open');
  });
  it('keeps the selected value in the validated admin payload', () => {
    const base = { ...demoEvents[0], registration_status: 'sold_out' as const };
    expect(eventSchema.parse(base).registration_status).toBe('sold_out');
    expect(eventSchema.parse({ ...base, registration_status: 'closed' }).registration_status).toBe('closed');
    expect(eventSchema.parse({ ...base, registration_status: undefined }).registration_status).toBe('open');
  });
});
