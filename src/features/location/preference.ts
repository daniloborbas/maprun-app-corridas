import type { LocationPreference } from '@/components/app-provider';

export const LOCATION_PREFERENCE_KEY = 'maprun.locationPreference';
export const LOCATION_RADIUS_OPTIONS = [25, 50, 100, 200] as const;

export function normalizeLocationPreference(value: unknown): LocationPreference | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!Number.isFinite(candidate.latitude) || !Number.isFinite(candidate.longitude) || typeof candidate.label !== 'string') return null;
  return {
    label: candidate.label,
    latitude: Number(candidate.latitude),
    longitude: Number(candidate.longitude),
    mode: candidate.mode === 'geolocation' ? 'geolocation' : 'manual',
    radiusKm: LOCATION_RADIUS_OPTIONS.includes(candidate.radiusKm as (typeof LOCATION_RADIUS_OPTIONS)[number]) ? Number(candidate.radiusKm) : 100,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    precise: candidate.precise === true,
  };
}
