import { describe, expect, it } from 'vitest';
import { feedImageVariantUrl, hasVersionedFeedImage } from '@/features/events/feed-image-variants';

describe('feed image variants', () => {
  it('derives the mobile 480w asset from a versioned 800w URL', () => {
    const url = 'https://cdn.example.com/event-feed/id/feed-123-800.webp';
    expect(feedImageVariantUrl(url, 480)).toBe('https://cdn.example.com/event-feed/id/feed-123-480.webp');
    expect(hasVersionedFeedImage(url)).toBe(true);
  });

  it('does not invent a variant for legacy assets', () => {
    const url = 'https://cdn.example.com/event-feed/id/feed-123.webp';
    expect(hasVersionedFeedImage(url)).toBe(false);
    expect(feedImageVariantUrl(url, 480)).toBe(url);
  });
});
