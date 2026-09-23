import type { Metadata, Viewport } from 'next';
import { AppProvider } from '@/components/app-provider';
import { Navigation } from '@/components/navigation';
import { db } from '@/lib/supabase/server';
import { demoMode, siteUrl } from '@/lib/config';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display', display: 'swap' });
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'MapRun — descubra sua próxima corrida', template: '%s | MapRun' },
  description: 'Descubra corridas, explore novos destinos e encontre sua próxima linha de chegada.',
  icons: { icon: '/icon.svg', apple: '/icons/icon-192.png' },
  manifest: '/manifest.webmanifest',
  robots: demoMode ? { index: false, follow: false } : undefined,
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
  openGraph: {
    title: 'MapRun — descubra sua próxima corrida',
    description: 'Mais corridas. Mais histórias.',
    locale: 'pt_BR',
    type: 'website',
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#14D160' };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const client = await db();
  const auth = client ? await client.auth.getUser() : null;
  const user = auth?.data.user;
  const [profile, favorites, going] =
    client && user
      ? await Promise.all([
          client.from('profiles').select('name, avatar_url').eq('id', user.id).single(),
          client.from('favorites').select('event_id').eq('user_id', user.id),
          client.from('event_attendance').select('event_id').eq('user_id', user.id),
        ])
      : [null, null, null];
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${poppins.variable}`}>
        <AppProvider
          user={user ? { id: user.id, name: profile?.data?.name || '', avatarUrl: profile?.data?.avatar_url || null, googleAvatarUrl: typeof user.user_metadata?.picture === 'string' ? user.user_metadata.picture : typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null } : null}
          demo={demoMode}
          initialFavorites={favorites?.data?.map((e) => e.event_id) || []}
          initialGoing={going?.data?.map((e) => e.event_id) || []}
        >
          <a href="#conteudo" className="skip-link">
            Pular para o conteúdo
          </a>
          <Navigation />
          {demoMode && (
            <div className="demo-banner">
              Prévia do MapRun · Eventos fictícios para demonstração
            </div>
          )}
          <main id="conteudo">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
