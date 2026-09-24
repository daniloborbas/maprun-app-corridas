export type EventStatus = 'draft' | 'published' | 'cancelled' | 'finished' | 'archived';
export type Category = 'rua' | 'trail' | 'night' | 'kids';
export type RegistrationStatus = 'open' | 'sold_out' | 'closed';
export interface EventDistance {
  label: string;
  distance_km: number | null;
  category: string;
  start_time?: string;
  price_from?: number | null;
  order_index?: number;
}
export interface RaceEvent {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  description: string;
  description_source?: 'manual' | 'editorial_generated' | 'imported' | 'unknown';
  start_date: string;
  end_date?: string | null;
  city: string;
  state: string;
  country: string;
  venue: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  organizer_name: string;
  event_category: Category;
  official_url: string;
  registration_url: string;
  registration_status?: RegistrationStatus;
  regulation_url: string;
  price_from: number | null;
  cover_image_url: string | null;
    feed_image_url?: string | null;
    feed_image_source?: 'ai_generated' | 'manual_upload' | 'legacy' | 'none' | null;
  cover_image_source: 'official' | 'generated' | 'fallback' | null;
  fallback_image_key?: string | null;
  has_usable_official_image: boolean;
  short_tagline: string;
  status: EventStatus;
  organizer_verified: boolean;
  published_at?: string | null;
  updated_at?: string;
  event_distances: EventDistance[];
  event_sources?: { source_name: string; source_url: string; source_method?: string; import_method?: string; last_verified_at: string | null }[];
  sponsored?: boolean;
  demo?: boolean;
  distance_km?: number;
}
export interface Coordinates {
  latitude: number;
  longitude: number;
}
export interface DiscoveryQuery {
  query?: string;
  city?: string;
  state?: string;
  category?: string;
  distance?: number;
  radius?: number;
  location?: Coordinates;
  sort?: 'date' | 'nearby' | 'balanced';
  now?: Date;
  includePast?: boolean;
}
