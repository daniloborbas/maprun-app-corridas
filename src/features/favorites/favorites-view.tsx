'use client';
import { useState } from 'react';
import { Bookmark, ArrowRight } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { EventListCard } from '@/components/event-card';
import { EmptyState } from '@/components/empty-state';
import type { RaceEvent } from '@/features/events/types';
export function FavoritesView({ events }: { events: RaceEvent[] }) {
  const { user, demo, favorites, going, login } = useApp();
  const [tab, setTab] = useState('favorites');
  const selected = tab === 'favorites' ? favorites : going;
  return (
    <div className="page narrow-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow green">SEUS PRÓXIMOS CAPÍTULOS</span>
          <h1>Salvos</h1>
          <p>Corridas que merecem um lugar na sua agenda.</p>
        </div>
        <Bookmark className="heading-icon" />
      </header>
      {!user && !demo ? (
        <EmptyState
          title="Guarde a próxima linha de chegada"
          description="Entre para reunir suas corridas favoritas e acessá-las de qualquer lugar."
        >
          <button className="button" onClick={login}>
            Entrar para salvar <ArrowRight size={18} />
          </button>
        </EmptyState>
      ) : (
        <>
          <div className="saved-tabs-wrapper">
            <div className="segmented-control">
              <button
                className={tab === 'favorites' ? 'active' : ''}
                aria-pressed={tab === 'favorites'}
                onClick={() => setTab('favorites')}
              >
                Eventos ({favorites.length})
              </button>
              <button
                className={tab === 'going' ? 'active' : ''}
                aria-pressed={tab === 'going'}
                onClick={() => setTab('going')}
              >
                Eu vou ({going.length})
              </button>
            </div>
          </div>
          <div className="saved-grid">
            {events
              .filter((e) => selected.includes(e.id))
              .map((event) => (
                <EventListCard key={event.id} event={event} grid />
              ))}
          </div>
          {!selected.length && (
            <EmptyState
              title={
                tab === 'favorites'
                  ? 'Sua coleção começa com uma corrida'
                  : 'Qual será sua próxima prova?'
              }
              description={
                tab === 'favorites'
                  ? 'Toque no marcador de uma corrida para encontrá-la aqui depois.'
                  : 'Marque “Eu vou” nas corridas que fazem parte dos seus planos.'
              }
            />
          )}
        </>
      )}
      <blockquote>
        “Colecionando corridas,
        <br />
        viajando por novos horizontes.”
        <span />
      </blockquote>
    </div>
  );
}
