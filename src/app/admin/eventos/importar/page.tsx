import { requireAdmin } from '@/lib/supabase/server';
import { ImportPage } from '@/features/importer/import-page';
export default async function ImportEventPage() { try { await requireAdmin(); } catch { return null; } return <ImportPage />; }
