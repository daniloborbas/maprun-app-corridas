import { describe, expect, it } from 'vitest';
import { isCorrida1IndividualPath } from '@/features/discovery/individual-url';

describe('isCorrida1IndividualPath', () => {
  it.each([
    '/corridas/mg/itajuba/2026/desafio-da-serra',
    '/corridas/mg/pocos-de-caldas/2026/2-corrida-das-aguas',
    '/corridas/sp/sao-paulo/2027/corrida-exemplo',
  ])('accepts %s', (path) => expect(isCorrida1IndividualPath(path)).toBe(true));

  it.each(['/corridas', '/corridas/mg', '/corridas/mg/itajuba', '/corridas/mg/itajuba/2026', '/corridas/mg/2026/evento', '/blog/post', '/contato'])('rejects %s', (path) => expect(isCorrida1IndividualPath(path)).toBe(false));
});
