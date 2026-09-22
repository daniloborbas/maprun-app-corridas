import { requireAdmin } from '@/lib/supabase/server';
import { AdminEventForm } from '@/features/admin/event-form';
import type { RaceEvent } from '@/features/events/types';
import { notFound } from 'next/navigation';
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  let access;
  try {
    access = await requireAdmin();
  } catch {
    return null;
  }
  const { data } = await access.client
    .from('events')
    .select('*,event_distances(*),event_sources(*)')
    .eq('id', (await params).id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) notFound();
  if (data.id === 'f1e1616e-c7df-43c0-9b14-52de54990750') {
    console.info('[MapRun source verification]', {
      eventId: data.id,
      count: data.event_sources?.length ?? 0,
      sources: (data.event_sources as Array<{ source_name: string; source_url: string; import_method?: string | null }> | null | undefined)?.map((source) => ({
        source_name: source.source_name,
        source_url: source.source_url,
        import_method: source.import_method,
      })),
    });
  }
  return (
    <>
      <div className="admin-heading">
        <h1>Editar corrida</h1>
      </div>
      <AdminEventForm event={data as RaceEvent} />
    </>
  );
}
