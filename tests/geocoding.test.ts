import { describe, expect, it, vi } from 'vitest';
import { geocodeEventLocation } from '@/features/geocoding/service';

const result = (state = 'Minas Gerais') => ({ ok: true, json: async () => [{ lat: '-22.42', lon: '-45.45', address: { country_code: 'br', state } }] }) as Response;

describe('geocoding service', () => {
  it('uses address before venue and city', async () => { const fetchImpl = vi.fn(async () => result()); const found = await geocodeEventLocation({ address:'Rua A', venue:'Praça B', city:'Itajubá', state:'MG' }, { fetchImpl }); expect(found?.precision).toBe('address'); expect(fetchImpl).toHaveBeenCalledTimes(1); });
  it('falls back to venue when address fails', async () => { const fetchImpl = vi.fn().mockResolvedValueOnce({ ok:false }).mockResolvedValueOnce(result()); const found = await geocodeEventLocation({ address:'Rua inválida', venue:'Estádio', city:'Itajubá', state:'MG' }, { fetchImpl }); expect(found?.precision).toBe('venue'); expect(fetchImpl).toHaveBeenCalledTimes(2); });
  it('falls back to city and normalizes state names and lowercase UF', async () => { const fetchImpl = vi.fn(async () => ({ ok:false }) as Response); expect(await geocodeEventLocation({ city:'Itajubá', state:'mg' }, { fetchImpl })).toBeNull(); const cityOnly = await geocodeEventLocation({ city:'Itajubá', state:'Minas Gerais' }, { fetchImpl:vi.fn(async () => result()) }); expect(cityOnly?.precision).toBe('city'); });
  it('rejects incompatible country or state results', async () => { const fetchImpl = vi.fn(async () => ({ ok:true, json:async()=>[{lat:'-22',lon:'-45',address:{country_code:'br',state:'São Paulo'}}] }) as Response); expect(await geocodeEventLocation({ city:'Itajubá', state:'MG' }, { fetchImpl })).toBeNull(); });
  it('returns null when Nominatim is unavailable', async () => { const fetchImpl = vi.fn(async () => { throw new Error('offline'); }); expect(await geocodeEventLocation({ city:'Itajubá', state:'MG' }, { fetchImpl })).toBeNull(); });
});
