import { describe, expect, it } from 'vitest';
import { buildGeneratedFeedImageUrl } from '@/features/events/images';
import { GET } from '@/app/api/events/cover/route';
import { NextRequest } from 'next/server';

describe('feed image generation contract', () => {
  it('builds a deterministic persisted image URL from real event fields', () => {
    const url = buildGeneratedFeedImageUrl({ slug: 'corrida-teste', name: 'Corrida Teste', city: 'Itajubá', state: 'MG', category: 'rua', distances: ['5 km', '10 km'], startDate: '2026-10-04', price: null });
    expect(url).toContain('/api/events/cover?');
    expect(url).toContain('startDate=2026-10-04');
    expect(url).toContain('distances=5+km%2C+10+km');
  });
  it('omits an unreliable time rather than inventing one', () => {
    const url = buildGeneratedFeedImageUrl({ slug: 'date-only', name: 'Date Only', startDate: '2026-10-04' });
    expect(url).toContain('startDate=2026-10-04');
    expect(url).not.toContain('00%3A00');
  });
  it('returns a 4:5 image-only SVG with no text or branding', async () => {
    const response = GET(new NextRequest('https://maprun.test/api/events/cover?category=trail&city=Itajuba'));
    const svg = await response.text();
    expect(svg).toContain('viewBox="0 0 800 1000"');
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('MAPRUN');
    expect(svg).not.toContain('Itajuba');
  });
});
