import { describe, expect, it } from 'vitest';
import { classifyRegistrationUrlSemantic } from '@/features/events/registration';

describe('semantic registration URL validation', () => {
  it('rejects photo and organizer pages', () => {
    expect(classifyRegistrationUrlSemantic('https://portaldascorridas.fotop.com.br/fotos/')).toBe('photo_page');
    expect(classifyRegistrationUrlSemantic('https://inscricao.corrida1.com.br/organizador')).toBe('organizer_page');
  });
  it('accepts specific known registration pages', () => {
    expect(classifyRegistrationUrlSemantic('https://www.sympla.com.br/evento/4a-corrida/3488566')).toBe('valid_registration');
    expect(classifyRegistrationUrlSemantic('https://keepsporting.com/cr/696113c/desafio')).toBe('valid_registration');
    expect(classifyRegistrationUrlSemantic('https://inscricao.corrida1.com.br/corridas/mg/itajuba/2027/corrida-exemplo')).toBe('valid_registration');
  });
  it('keeps incomplete pages out of registration', () => {
    expect(classifyRegistrationUrlSemantic('https://inscricao.corrida1.com.br/corridas/mg/itajuba')).toBe('event_page_only');
    expect(classifyRegistrationUrlSemantic('https://example.com/contato')).toBe('generic_page');
  });
});
