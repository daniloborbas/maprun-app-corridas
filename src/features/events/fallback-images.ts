export type FallbackTerrain = 'urban' | 'trail' | 'rural' | 'night' | 'park' | 'coastal' | 'general';

export interface FallbackImage {
  src: string;
  tags: string[];
  terrains: FallbackTerrain[];
  regions: ('city' | 'mountain' | 'inland' | 'coastal')[];
  time: ('day' | 'morning' | 'night')[];
}

// Keep every local cover in one manifest so the library can grow without changing the resolver.
export const EVENT_FALLBACK_IMAGES: FallbackImage[] = [
  { src: '/images/runners.jpg', tags: ['road', 'urban', 'general'], terrains: ['urban', 'general'], regions: ['city', 'inland'], time: ['day', 'morning'] },
  { src: '/images/road.jpg', tags: ['road', 'rural', 'inland'], terrains: ['urban', 'rural', 'general'], regions: ['inland', 'city'], time: ['day', 'morning'] },
  { src: '/images/mountains.jpg', tags: ['trail', 'mountain', 'serra'], terrains: ['trail'], regions: ['mountain', 'inland'], time: ['day', 'morning'] },
  { src: '/images/mantiqueira-run.webp', tags: ['trail', 'mountain', 'inland'], terrains: ['trail', 'rural'], regions: ['mountain', 'inland'], time: ['day', 'morning'] },
];

export const FALLBACK_EMERGENCY_IMAGE = '/images/runners.jpg';
