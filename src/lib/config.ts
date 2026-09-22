export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export const demoMode =
  !hasSupabase &&
  (process.env.MAPRUN_DEMO_MODE === 'true' ||
    (process.env.NODE_ENV === 'development' && process.env.MAPRUN_DEMO_MODE !== 'false'));
