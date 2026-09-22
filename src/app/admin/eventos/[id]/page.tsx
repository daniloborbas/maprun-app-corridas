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
  return (
    <>
      <div className="admin-heading">
        <h1>Editar corrida</h1>
      </div>
      <AdminEventForm event={data as RaceEvent} />
    </>
  );
}
