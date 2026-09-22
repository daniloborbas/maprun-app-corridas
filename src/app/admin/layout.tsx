import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/server';
import { EmptyState } from '@/components/empty-state';
export const metadata = { title: 'Administração', robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let allowed = false;
  try {
    await requireAdmin();
    allowed = true;
  } catch {
    /* Fail closed. */
  }
  if (!allowed)
    return (
      <div className="page">
        <EmptyState
          title="Área da equipe MapRun"
          description="Entre com uma conta administradora para cadastrar corridas e acompanhar as métricas."
        >
          <Link className="button" href="/perfil">
            Acessar minha conta
          </Link>
        </EmptyState>
      </div>
    );
  return (
    <div className="admin-shell">
      <span className="eyebrow green">MAPRUN · ADMINISTRAÇÃO</span>
      <nav className="admin-nav">
        <Link href="/admin">Visão geral</Link>
        <Link href="/admin/eventos">Eventos</Link>
<Link href="/admin/descobertas">Descobertas</Link><Link href="/admin/fontes">Fontes</Link>
        <Link href="/admin/analytics">Métricas</Link>
        <Link href="/">Abrir aplicativo ↗</Link>
      </nav>
      {children}
    </div>
  );
}
