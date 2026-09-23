'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Mountain, MapPin } from 'lucide-react';
import type { RaceEvent, DiscoveryQuery } from '@/features/events/types';
import { getDiscoveryFeed } from '@/features/events/discovery';
import { useApp } from '@/components/app-provider';
import { LocationPicker } from '@/features/location/location-picker';
import { DiscoveryEventCard } from '@/components/event-card';
import { EmptyState } from '@/components/empty-state';
export function DiscoveryView({ events }: { events: RaceEvent[] }) {
  const { location } = useApp();
  const [category, setCategory] = useState(''),
    [sort, setSort] = useState<DiscoveryQuery['sort']>('date'),
    [limit, setLimit] = useState(4);
  const feed = useMemo(
    () => getDiscoveryFeed(events, { location: location || undefined, radius: location?.radiusKm, category, sort }),
    [events, location, category, sort],
  );
  return (
    <div className="discovery-layout">
      <aside className="discovery-intro">
        <span className="eyebrow green">DESCUBRA NOVOS PERCURSOS</span>
        <h1>
          Sua próxima
          <br />
          corrida começa
          <br />
          <span className="green">aqui.</span>
        </h1>
        <p>
          Um novo destino.
          <br />
          Uma nova linha de chegada.
          <br />
          Uma história para contar.
        </p>
        <LocationPicker />
        <div className="intro-bottom">
          <Mountain size={28} />
          <p>
            Mais corridas.
            <br />
            <strong>Mais histórias.</strong>
          </p>
        </div>
        <Link className="subtle-link" href="/buscar">
          Encontre uma prova <ArrowUpRight size={17} />
        </Link>
      </aside>
      <section className="discovery-main" aria-label="Descobrir corridas">
        <div className="mobile-discovery-title">
          <div className="mobile-discovery-brand-row">
            <Link href="/" className="mobile-brand" aria-label="MapRun — início">
              <Mountain size={20} strokeWidth={2.5} />
              <span>Map<span className="green">Run</span></span>
            </Link>
            <LocationPicker />
          </div>
          <h1>Descobrir</h1>
        </div>
        <div className="feed-toolbar">
          <div className="filter-scroll">
            <div className="category-tabs" aria-label="Categorias">
              {[
                ['', 'Para você'],
                ['rua', 'Rua'],
                ['trail', 'Trilha'],
                ['night', 'Night run'],
              ].map(([value, label]) => (
                <button
                  aria-pressed={category === value}
                  className={category === value ? 'active' : ''}
                  key={value}
                  onClick={() => {
                    setCategory(value);
                    setLimit(4);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              className="sort-select"
              aria-label="Ordenar corridas"
              value={sort}
              onChange={(e) => setSort(e.target.value as DiscoveryQuery['sort'])}
            >
              <option value="date">Próximas datas</option>
              <option value="nearby" disabled={!location}>
                Mais perto
              </option>
              <option value="balanced" disabled={!location}>
                Perto e em breve
              </option>
            </select>
          </div>
        </div>
        <div className="discovery-feed">
          {feed.slice(0, limit).map((event, index) => (
            <DiscoveryEventCard key={event.id} event={event} index={index} />
          ))}
          {!feed.length && (
            <EmptyState
              title="Novos caminhos estão chegando"
              description="Ainda não temos corridas publicadas nesta categoria. Explore outras provas."
            />
          )}
          {feed.length > limit && (
            <button className="button load-more" onClick={() => setLimit(limit + 4)}>
              Descobrir mais corridas
            </button>
          )}
        </div>
      </section>
      <aside className="discovery-side">
        <MapPin size={22} className="green" />
        <h2>
          Vale a pena
          <br />
          ir mais longe.
        </h2>
        <p>Encontre corridas que também são um convite para conhecer novos lugares.</p>
        <Link href="/buscar" className="text-button">
          Explorar destinos <ArrowUpRight size={16} />
        </Link>
        <div className="side-note">
          ESCOLHA SEU DESAFIO
          <Link href="/buscar?distance=5">
            Os primeiros 5 km <span>↗</span>
          </Link>
          <Link href="/buscar?distance=21">
            Sua próxima meia <span>↗</span>
          </Link>
          <Link href="/buscar?category=trail">
            Fora do asfalto <span>↗</span>
          </Link>
        </div>
        <Link className="privacy-link" href="/privacidade">
          Privacidade
        </Link>
      </aside>
    </div>
  );
}
