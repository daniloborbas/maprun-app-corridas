'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { EventListCard } from '@/components/event-card';
import { EmptyState } from '@/components/empty-state';
import { LocationPicker } from '@/features/location/location-picker';
import { searchEvents } from '@/features/events/discovery';
import type { DiscoveryQuery, RaceEvent } from '@/features/events/types';
import { trackAnalyticsEvent } from '@/features/analytics/client';
export function SearchView({
  events,
  initialDistance = '',
  initialCategory = '',
}: {
  events: RaceEvent[];
  initialDistance?: string;
  initialCategory?: string;
}) {
  const { location } = useApp();
  const [query, setQuery] = useState(''),
    [distance, setDistance] = useState(initialDistance),
    [category, setCategory] = useState(initialCategory),
    [city, setCity] = useState(''),
    [state, setState] = useState(''),
    [radius, setRadius] = useState(''),
    [advanced, setAdvanced] = useState(false),
    [sort, setSort] = useState<DiscoveryQuery['sort']>('date'),
    [limit, setLimit] = useState(12);
  const results = useMemo(
    () =>
      searchEvents(events, {
        query,
        distance: Number(distance) || undefined,
        category,
        city,
        state,
        location: location || undefined,
        radius: Number(radius) || undefined,
        sort,
      }),
    [events, query, distance, category, city, state, location, radius, sort],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) trackAnalyticsEvent('search', undefined, { results: results.length });
    }, 700);
    return () => clearTimeout(timer);
  }, [query, results.length]);
  function reset() {
    setQuery('');
    setDistance('');
    setCategory('');
    setCity('');
    setState('');
    setRadius('');
    setLimit(12);
  }
  return (
    <div className="page search-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow green">NOVOS LUGARES. NOVOS DESAFIOS.</span>
          <h1>Encontre sua próxima corrida.</h1>
        </div>
        <LocationPicker />
      </header>
      <div className="search-layout">
        <section className="search-results">
          <div className="search-input">
            <Search size={21} />
            <input
              aria-label="Buscar corridas"
              placeholder="Busque por cidade, prova ou organizador…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(12);
              }}
            />
            {query && (
              <button aria-label="Limpar busca" onClick={() => setQuery('')}>
                <X size={18} />
              </button>
            )}
          </div>
          <div className="filters" onChange={() => trackAnalyticsEvent('filter_used')}>
            <select
              aria-label="Filtrar cidade"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">Cidade</option>
              {[...new Set(events.map((e) => e.city))].sort().map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="Filtrar distância"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            >
              <option value="">Distância</option>
              {[5, 10, 21, 42].map((d) => (
                <option value={d} key={d}>
                  {d} km
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar categoria"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Categoria</option>
              <option value="rua">Rua</option>
              <option value="trail">Trilha e montanha</option>
              <option value="night">Night run</option>
              <option value="kids">Infantil</option>
            </select>
            <button
              className="filter-button"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              <SlidersHorizontal size={18} />
              <span>Mais filtros</span>
            </button>
          </div>
          {advanced && (
            <div className="advanced-filters">
              <label>
                Estado
                <select value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="">Todos</option>
                  {[...new Set(events.map((e) => e.state))].sort().map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Raio aproximado
                <select
                  disabled={!location}
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                >
                  <option value="">Brasil inteiro</option>
                  {[25, 50, 100, 200].map((km) => (
                    <option key={km} value={km}>
                      Até {km} km
                    </option>
                  ))}
                </select>
              </label>
              {!location && <p>Escolha uma região para filtrar por proximidade.</p>}
              <button className="text-button" onClick={reset}>
                Limpar filtros
              </button>
            </div>
          )}
          <div className="results-heading">
            <p>
              {results.length}{' '}
              {results.length === 1 ? 'corrida encontrada' : 'corridas encontradas'}
            </p>
            <select
              aria-label="Ordenar resultados"
              value={sort}
              onChange={(e) => setSort(e.target.value as DiscoveryQuery['sort'])}
            >
              <option value="date">Próximas datas</option>
              <option value="nearby" disabled={!location}>
                Mais perto de você
              </option>
              <option value="balanced" disabled={!location}>
                Perto e em breve
              </option>
            </select>
          </div>
          {results.slice(0, limit).map((event) => (
            <EventListCard key={event.id} event={event} />
          ))}
          {!results.length && (
            <EmptyState
              title={
                radius ? `Nenhuma corrida até ${radius} km` : 'Ainda não encontramos essa corrida'
              }
              description="Um novo percurso pode estar um pouco mais longe. Amplie sua busca."
            >
              <button
                className="button"
                onClick={() =>
                  radius && Number(radius) < 200 ? setRadius(String(Number(radius) * 2)) : reset()
                }
              >
                {radius && Number(radius) < 200
                  ? 'Ampliar o raio de busca'
                  : 'Explorar todas as corridas'}
              </button>
            </EmptyState>
          )}
          {results.length > limit && (
            <button className="button load-more" onClick={() => setLimit(limit + 12)}>
              Carregar mais
            </button>
          )}
        </section>
        <aside className="search-aside">
          <span className="eyebrow">SEU PRÓXIMO DESTINO</span>
          <h2>
            O melhor percurso
            <br />é o que vem
            <br />
            pela frente.
          </h2>
          <p>Da primeira prova à próxima maratona. Encontre seu ritmo, escolha seu lugar.</p>
          <div className="aside-image" />
        </aside>
      </div>
    </div>
  );
}
