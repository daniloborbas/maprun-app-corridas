import { describe, expect, it } from 'vitest';
import { generateEventEditorialContent } from '@/features/events/editorial';

const base = { name: 'Corrida da Serra', startDate: '2026-11-15T00:00:00Z', city: 'Itajubá', state: 'MG' };

describe('event editorial', () => {
  it('varia o contexto e lista distâncias sem duplicar', () => {
    const result = generateEventEditorialContent({ ...base, distances: [{ label: '3 km', distance_km: 3 }, { label: '5 km', distance_km: 5 }, { label: '5 km', distance_km: 5 }, { label: '21 km', distance_km: 21 }] });
    expect(result.description).toContain('3 km, 5 km e 21 km');
    expect(result.description).not.toContain('5 km, 5 km');
  });

  it('preserva data civil e horário local', () => {
    const result = generateEventEditorialContent({ ...base, startTime: '08:00' });
    expect(result.description).toContain('15 de novembro de 2026');
    expect(result.description).toContain('08:00');
    expect(result.description).not.toContain('11:00');
    expect(result.description).not.toContain('14 de novembro');
  });

  it('não inventa horário, preço ou URL', () => {
    const result = generateEventEditorialContent({ ...base });
    expect(result.description).not.toMatch(/às \d{2}:\d{2}|R\$|https?:/);
  });

  it('contextualiza trail e organizador sem confundir plataforma', () => {
    const result = generateEventEditorialContent({ ...base, category: 'trail', organizerName: 'Equipe Serra', registrationUrl: 'https://example.com/inscricao' });
    expect(result.description).toMatch(/trail/i);
    expect(result.description).toContain('Equipe Serra');
    expect(result.description).not.toContain('https://example.com');
  });

  it('gera fallback factual com dados mínimos', () => {
    const result = generateEventEditorialContent({ name: 'Prova Local', startDate: null });
    expect(result.description).toContain('Prova Local');
    expect(result.description).not.toMatch(/R\$|https?:|às \d{2}:\d{2}/);
  });
});
