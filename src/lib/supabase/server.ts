import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { hasSupabase } from '@/lib/config';
export async function db() {
  if (!hasSupabase) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* Server Component: proxy refreshes cookies. */
          }
        },
      },
    },
  );
}
export async function currentUser() {
  const client = await db();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  return user;
}
export async function requireAdmin() {
  const client = await db();
  if (!client) throw new Error('Configure o Supabase para acessar a administração.');
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('Autenticação necessária.');
  const { data } = await client.from('profiles').select('role').eq('id', user.id).single();
  if (data?.role !== 'admin') throw new Error('Acesso restrito à equipe MapRun.');
  return { client, user };
}
