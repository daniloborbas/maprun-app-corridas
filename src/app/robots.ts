import type { MetadataRoute } from 'next';
import { demoMode, siteUrl } from '@/lib/config';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: demoMode ? undefined : '/',
      disallow: demoMode ? '/' : ['/admin', '/api/', '/perfil', '/salvos', '/auth/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
