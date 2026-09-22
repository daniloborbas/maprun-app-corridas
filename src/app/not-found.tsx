import { EmptyState } from '@/components/empty-state';
export default function NotFound() {
  return (
    <div className="page">
      <EmptyState
        title="Esse percurso não foi encontrado"
        description="A corrida pode ter mudado de endereço. Continue descobrindo novas provas."
      />
    </div>
  );
}
