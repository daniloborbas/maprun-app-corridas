'use client';

import { createBrowserClient } from '@supabase/ssr';
import { hasSupabase } from '@/lib/config';

export function browserDb() {
  if (!hasSupabase) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
