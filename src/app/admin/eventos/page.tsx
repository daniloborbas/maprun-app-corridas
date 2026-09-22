import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/server';
import { formatDate } from '@/features/events/discovery';
export default async function AdminEventsPage() {
  let access;
  try {
    access = await requireAdmin();
  } catch {
    return null;
  }
  const { data, error } = await access.client
    .from('events')
    .select('id,name,city,state,status,start_date')
    .is('deleted_at', null)
    .order('start_date', { ascending: false });
  return (
    <>
      <div className="admin-heading">
        <h1>Eventos</h1>
        <Link className="button" href="/admin/eventos/novo">
          Cadastrar corrida
        </Link>
        <Link className="button secondary" href="/admin/eventos/importar">
          Importar por URL
        </Link>
      </div>
      {error && <p className="error-message">Não foi possível carregar os eventos.</p>}
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Corrida</th>
              <th>Cidade</th>
              <th>Data</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>
                  {e.city} · {e.state}
                </td>
                <td>{formatDate(e.start_date)}</td>
                <td>{e.status}</td>
                <td>
                  <Link href={`/admin/eventos/${e.id}`}>Editar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data?.length && !error && (
        <p className="admin-note">
          Nenhum evento cadastrado. Comece com uma corrida da sua região.
        </p>
      )}
    </>
  );
}
