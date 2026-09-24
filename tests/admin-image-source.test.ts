import { describe, expect, it } from 'vitest';
import { resolveCoverImageSource } from '@/features/admin/image-source';

describe('cover_image_source do editor', () => {
  it('usa official para URL nova ou importada', () => {
    expect(resolveCoverImageSource({ coverImageUrl: 'https://cdn.example.com/arte.jpg' })).toBe('official');
  });
  it('preserva fallback quando ele já foi escolhido', () => {
    expect(resolveCoverImageSource({ existingSource: 'fallback', coverImageUrl: '/images/runners.jpg' })).toBe('fallback');
  });
  it('preserva generated e nunca envia provenance do feed', () => {
    expect(resolveCoverImageSource({ existingSource: 'generated', coverImageUrl: 'https://cdn.example.com/arte.jpg' })).toBe('generated');
    expect(resolveCoverImageSource({ existingSource: 'ai_generated', coverImageUrl: 'https://cdn.example.com/feed.webp' })).toBe('official');
  });
  it('usa fallback quando não há arte', () => {
    expect(resolveCoverImageSource({ coverImageUrl: '' })).toBe('fallback');
  });
});
