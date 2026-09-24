import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchEventPage } from '@/features/importer/url-import';

const html = '<html><head><title>Corrida Teste</title></head><body></body></html>';
const response = (status: number, headers: Record<string, string> = {}, body = '') => new Response(body, { status, headers });

describe('redirects seguros do importador', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('permite um 308 same-origin e expõe finalUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(308, { location: '/race/' })).mockResolvedValueOnce(response(200, { 'content-type': 'text/html' }, html));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchEventPage('https://example.com/race');
    expect(result.finalUrl).toBe('https://example.com/race/');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('permite 301 same-origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(301, { location: '/race/' })).mockResolvedValueOnce(response(200, { 'content-type': 'text/html' }, html)));
    await expect(fetchEventPage('https://example.com/race')).resolves.toMatchObject({ finalUrl: 'https://example.com/race/' });
  });

  it.each([
    ['cross-origin', 'https://other.example/race', 'redirect_cross_origin_blocked'],
    ['localhost', 'http://localhost/race', ''],
    ['loopback', 'http://127.0.0.1/race', ''],
    ['protocol', 'ftp://example.com/race', ''],
  ])('bloqueia redirect inseguro: %s', async (_label, location, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(302, { location })));
    await expect(fetchEventPage('https://example.com/race')).rejects.toThrow(expected || /URL|rede privada|permitida|redirect_cross_origin_blocked/);
  });

  it('bloqueia cadeia de redirects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(307, { location: '/race/' })).mockResolvedValueOnce(response(308, { location: '/race//final' })));
    await expect(fetchEventPage('https://example.com/race')).rejects.toThrow('redirect_chain_blocked');
  });

  it('classifica redirect sem Location', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(308)));
    await expect(fetchEventPage('https://example.com/race')).rejects.toThrow('redirect_missing_location');
  });
});
