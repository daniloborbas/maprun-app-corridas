'use server';
import { z } from 'zod';
import { db } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/config';
export async function sendLoginLink(email: string, next: string) {
  if (!z.email().safeParse(email).success) return { error: 'Informe um e-mail válido.' };
  const client = await db();
  if (!client)
    return {
      error:
        'O login estará disponível quando o Supabase for conectado. Você pode continuar explorando.',
    };
  const target =
    next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/perfil';
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(target)}` },
  });
  return error
    ? { error: 'Não foi possível enviar o link. Aguarde um pouco e tente novamente.' }
    : { success: true };
}
export async function signOut() {
  const client = await db();
  if (client) await client.auth.signOut();
}
