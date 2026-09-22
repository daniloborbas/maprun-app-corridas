'use client';
import { EmptyState } from '@/components/empty-state';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page">
      <EmptyState
        title="Uma pausa no caminho"
        description="Não foi possível carregar as corridas agora. Tente novamente em instantes."
      >
        <button className="button" onClick={reset}>
          Tentar novamente
        </button>
      </EmptyState>
    </div>
  );
}
