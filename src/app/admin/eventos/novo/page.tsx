import { requireAdmin } from '@/lib/supabase/server';
import { AdminEventForm } from '@/features/admin/event-form';
export default async function NewEventPage() {
  try {
    await requireAdmin();
  } catch {
    return null;
  }
  return (
    <>
      <div className="admin-heading">
        <h1>Cadastrar corrida</h1>
      </div>
      <AdminEventForm />
    </>
  );
}
