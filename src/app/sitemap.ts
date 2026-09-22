import type { MetadataRoute } from 'next';
import { listEvents } from '@/features/events/repository';
import { collections, indexableCollection } from '@/features/events/collections';
import { demoMode, siteUrl } from '@/lib/config';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (demoMode) return [];
  const events = (await listEvents()).filter((e) => !e.demo);
  return [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    ...events.map((e) => ({
      url: `${siteUrl}/corrida/${e.slug}`,
      lastModified: e.updated_at ? new Date(e.updated_at) : undefined,
    })),
    ...Object.entries(collections)
      .filter(([, c]) => indexableCollection(events.filter(c.matches)))
      .map(([slug]) => ({ url: `${siteUrl}/corridas/${slug}` })),
  ];
}
