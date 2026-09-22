import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MapRun — descubra sua próxima corrida',
    short_name: 'MapRun',
    description: 'Mais corridas. Mais histórias.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#14D160',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
