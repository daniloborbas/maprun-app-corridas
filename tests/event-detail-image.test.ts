import { describe, expect, it } from 'vitest';
import { getEventDetailImage } from '@/features/events/images';

const base = { cover_image_source: null as 'official' | 'generated' | 'fallback' | null, has_usable_official_image: false };

describe('imagem dos detalhes', () => {
  it('prioriza arte oficial sobre a imagem do feed', () => {
    expect(getEventDetailImage({ ...base, cover_image_source: 'official', cover_image_url: 'https://cdn.test/official.jpg', feed_image_url: 'https://cdn.test/feed.webp' })).toEqual({ url: 'https://cdn.test/official.jpg', illustrative: false });
  });
  it('usa a imagem do feed como ilustrativa quando não há arte oficial', () => {
    expect(getEventDetailImage({ ...base, cover_image_url: null, feed_image_url: 'https://cdn.test/feed.webp' })).toEqual({ url: 'https://cdn.test/feed.webp', illustrative: true });
  });
  it('retorna placeholder quando nenhuma imagem existe', () => {
    expect(getEventDetailImage({ ...base, cover_image_url: null, feed_image_url: null })).toEqual({ url: null, illustrative: true });
  });
  it('não copia a imagem do feed para o campo oficial', () => {
    const event = { ...base, cover_image_url: null, feed_image_url: 'https://cdn.test/feed.webp' };
    expect(event.cover_image_url).toBeNull();
  });
});
