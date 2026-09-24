import { describe, expect, it } from 'vitest';
import { resolveCoverImageSource } from '@/features/admin/image-source';

describe('arte oficial e imagem do feed', () => {
  it('não transforma ausência de arte oficial em fallback persistido', () => {
    expect(resolveCoverImageSource({ coverImageUrl: null })).toBeNull();
  });
  it('mantém os ativos independentes', () => {
    expect(resolveCoverImageSource({ existingSource: 'official', coverImageUrl: 'https://example.com/poster.webp' })).toBe('official');
  });
});
