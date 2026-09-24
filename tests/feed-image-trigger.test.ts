import { describe, expect, it } from 'vitest';
import { shouldGeneratePublishedFeedImage } from '@/features/admin/feed-image-trigger';

describe('gatilho da imagem do feed', () => {
  it('gera após publicação sem imagem', () => {
    expect(shouldGeneratePublishedFeedImage({ status: 'published', feedImageUrl: null, feedImageSource: 'none' })).toBe(true);
  });
  it('não gera em draft nem substitui imagem manual', () => {
    expect(shouldGeneratePublishedFeedImage({ status: 'draft', feedImageUrl: null, feedImageSource: 'none' })).toBe(false);
    expect(shouldGeneratePublishedFeedImage({ status: 'published', feedImageUrl: null, feedImageSource: 'manual_upload' })).toBe(false);
    expect(shouldGeneratePublishedFeedImage({ status: 'published', feedImageUrl: 'https://cdn/image.webp', feedImageSource: 'ai_generated' })).toBe(false);
  });
});
