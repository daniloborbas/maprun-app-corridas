import { db } from '@/lib/supabase/server';
import { ProfileView } from '@/features/profile/profile-view';
export const metadata = { title: 'Perfil', robots: { index: false, follow: false } };
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const client = await db();
  const auth = client ? await client.auth.getUser() : null;
  const profile =
    client && auth?.data.user
      ? await client.from('profiles').select('*').eq('id', auth.data.user.id).single()
      : null;
  return (
    <ProfileView
      profile={profile?.data || null}
      authError={Boolean((await searchParams).auth_error)}
    />
  );
}
