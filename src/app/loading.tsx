export default function Loading() {
  return (
    <div className="page" role="status" aria-label="Carregando corridas">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-card" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
