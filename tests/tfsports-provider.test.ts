import { describe, expect, it, vi } from 'vitest';
import { extractTFSportsRunSeriesUrls, tfsportsProvider } from '@/features/discovery/providers/tfsports';

const source = { id: 'source-1', name: 'TFSports Run Series', base_url: 'https://www.tfsports.com.br/sitemap.xml', source_type: 'html_calendar' as const, active: true, region: 'Brasil', trust_level: 'B' as const, auto_ready_allowed: false };

describe('TFSports sitemap provider', () => {
  it('keeps only public run-series URLs on the official host', () => {
    const xml = '<urlset><url><loc>https://www.tfsports.com.br/run-series/santos-ii-2026/</loc></url><url><loc>https://www.tfsports.com.br/tf-experience/experience-1</loc></url><url><loc>https://example.com/run-series/fake</loc></url></urlset>';
    expect(extractTFSportsRunSeriesUrls(xml)).toEqual(['https://www.tfsports.com.br/run-series/santos-ii-2026/']);
  });

  it('returns stable slug identities and caps the volume', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<urlset><url><loc>https://www.tfsports.com.br/run-series/santos-ii-2026</loc></url></urlset>', { headers: { 'content-type': 'application/xml' } })));
    const result = await tfsportsProvider.discoverEvents(source);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source_id: 'source-1', external_id: 'tfsports:run-series:santos-ii-2026', source_url: 'https://www.tfsports.com.br/run-series/santos-ii-2026' });
  });
});
