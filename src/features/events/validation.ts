import { z } from 'zod';
export function isPublicHttpsUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !['localhost', '127.0.0.1', '::1'].includes(u.hostname) &&
      !u.hostname.endsWith('.local') &&
      u.hostname.includes('.')
    );
  } catch {
    return false;
  }
}
export function isSpecificRegistrationUrl(value: string) {
  if (!isPublicHttpsUrl(value)) return false;
  try {
    const path = new URL(value).pathname.toLowerCase();
    return path.length > 1 && !/^\/(login|signin|contato|contact|eventos?|corridas?)\/?$/.test(path);
  } catch { return false; }
}
const externalUrl = z
  .string()
  .max(2000)
  .refine((v) => v === '' || isPublicHttpsUrl(v), 'Utilize uma URL pública HTTPS.');
export const eventSourceSchema = z.object({ source_name: z.string().min(1).max(150), source_url: externalUrl, source_method: z.enum(['manual', 'url', 'discovery']).default('manual') });
export function normalizeSourceUrl(value: string) { try { const url = new URL(value); url.hash = ''; for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) url.searchParams.delete(key); url.pathname = url.pathname.replace(/\/$/, '') || '/'; return url.toString(); } catch { return value.trim(); } }
export const eventSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().min(3).max(150),
    slug: z
      .string()
      .min(3)
      .max(180)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    short_description: z.string().max(240).default(''),
    description: z.string().max(10000),
    description_source: z.enum(['manual', 'editorial_generated', 'imported', 'unknown']).default('unknown'),
    start_date: z.iso.datetime({ offset: true }),
    end_date: z.iso.datetime({ offset: true }).nullable().optional(),
    city: z.string().min(2).max(100),
    state: z
      .string()
      .regex(
        /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
      ),
    country: z.literal('BR').default('BR'),
    venue: z.string().max(200),
    address: z.string().max(300),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    organizer_name: z.string().max(150),
    event_category: z.enum(['rua', 'trail', 'night', 'kids']),
    official_url: externalUrl,
    registration_url: externalUrl,
    regulation_url: externalUrl,
    price_from: z.number().min(0).nullable(),
    cover_image_url: z
      .string()
      .refine(
        (v) =>
          [
            '/images/road.jpg',
            '/images/runners.jpg',
            '/images/mountains.jpg',
            '/images/mantiqueira-run.png',
          ].includes(v) || v.startsWith('/api/events/cover') || isPublicHttpsUrl(v),
        'Imagem deve ter URL HTTPS.',
      ),
    cover_image_source: z.enum(['official', 'generated', 'fallback']),
      feed_image_url: z.string().max(2000).nullable().optional(),
      feed_image_source: z.enum(['ai_generated', 'manual_upload', 'legacy', 'none']).nullable().optional(),
    fallback_image_key: z.string().max(100).nullable().optional(),
    has_usable_official_image: z.boolean(),
    short_tagline: z.string().max(100),
    status: z.enum(['draft', 'published', 'cancelled', 'finished', 'archived']),
    organizer_verified: z.boolean(),
    event_distances: z
      .array(
        z.object({
          label: z.string().min(1).max(40),
          distance_km: z.number().min(0).max(1000).nullable(),
          category: z.string().max(50),
          start_time: z.string().max(8).optional(),
          price_from: z.number().min(0).nullable().optional(),
          order_index: z.number().int().optional(),
        }),
      )
      .min(1)
      .max(30),
    source_name: z.string().max(150).default('Cadastro manual'),
    source_url: externalUrl.default(''),
    event_sources: z.array(eventSourceSchema).max(10).optional(),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), 'Preencha as duas coordenadas.')
  .refine(
    (v) => !v.end_date || Date.parse(v.end_date) >= Date.parse(v.start_date),
    'O término deve ser posterior à largada.',
  );
