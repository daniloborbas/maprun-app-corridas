import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/config';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/perfil';
  const target =
    next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/perfil';
  const client = await db();
  if (client && code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, siteUrl));
  }
  return NextResponse.redirect(new URL('/perfil?auth_error=1', siteUrl));
}
