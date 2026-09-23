'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CalendarDays, MapPin, Mountain } from 'lucide-react';
import type { RaceEvent, DiscoveryQuery } from '@/features/events/types';
import { getDiscoveryFeed } from '@/features/events/discovery';
import { useApp } from '@/components/app-provider';
import { LocationPicker } from '@/features/location/location-picker';
import { DiscoveryEventCard } from '@/components/event-card';
import { EventListCard } from '@/components/event-card';
import { EventCover } from '@/components/event-cover';
import { formatDate, formatMoney } from '@/features/events/discovery';
import { EmptyState } from '@/components/empty-state';
export function DiscoveryView({ events }: { events: RaceEvent[] }) {
  const { location } = useApp();
  const [category, setCategory] = useState(''),
    [sort, setSort] = useState<DiscoveryQuery['sort']>('date'),
    [limit, setLimit] = useState(4);
  const filterRailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = filterRailRef.current;
    if (!rail || !window.matchMedia('(max-width: 899px)').matches) return;
    const target = category
      ? rail.querySelector<HTMLElement>('[aria-pressed="true"]')
      : sort !== 'date'
        ? rail.querySelector<HTMLElement>('.sort-select')
        : null;
    if (!target) return;
    const left = target.offsetLeft;
    const right = left + target.offsetWidth;
    const visibleLeft = rail.scrollLeft;
    const visibleRight = visibleLeft + rail.clientWidth;
    const nextLeft = left < visibleLeft ? left : right > visibleRight ? right - rail.clientWidth : visibleLeft;
    if (nextLeft !== visibleLeft) rail.scrollTo({ left: nextLeft, behavior: 'smooth' });
  }, [category, sort]);
  const feed = useMemo(
    () => getDiscoveryFeed(events, { location: location || undefined, radius: location?.radiusKm, category, sort }),
    [events, location, category, sort],
  );
  return (
    <div className="discovery-layout">
      <aside className="discovery-intro">
        <div className="discovery-intro-sticky">
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
        </div>
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
        <h1 className="desktop-page-title">Descobrir corridas</h1>
        <div className="feed-toolbar">
          <div className="filter-scroll" ref={filterRailRef}>
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
        <div className="desktop-experience-grid">
          <div className="desktop-race-grid">
            {feed.slice(0, 6).map((event) => (
              <article className="desktop-race-card" key={event.id}>
                <div className="desktop-race-image">
                  <EventCover event={event} sizes="(min-width: 1440px) 24vw, 34vw" />
                  {event.distance_km !== undefined && <span className="desktop-distance-overlay">{Math.round(event.distance_km)} km de você</span>}
                  <div className="desktop-race-card-content">
                  <h2>{event.name}</h2>
                  <p><MapPin size={14} />{event.city} · {event.state}</p>
                  <p><CalendarDays size={14} />{formatDate(event.start_date)}</p>
                  <div className="desktop-distance-badges">{event.event_distances.slice(0, 4).map((distance) => <span key={distance.label}>{distance.label}</span>)}{event.event_distances.length > 4 && <span>+{event.event_distances.length - 4}</span>}</div>
                  {event.price_from !== null && <strong>{event.price_from === 0 ? 'Gratuito' : `A partir de ${formatMoney(event.price_from)}`}</strong>}
                  <a className="desktop-card-link" href={`/corrida/${event.slug}`} target="_blank" rel="noopener noreferrer">Mais detalhes <ArrowRight size={14} /></a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="desktop-discovery-grid">
          <div className="desktop-featured">
            {feed[0] && <DiscoveryEventCard event={feed[0]} index={0} />}
          </div>
          <aside className="desktop-upcoming">
            <div className="desktop-upcoming-heading">
              <div>
                <h2>Mais corridas para você</h2>
                <p>Eventos selecionados com base nos seus interesses.</p>
              </div>
              <Link href="/buscar" className="text-button">Ver todas <ArrowUpRight size={16} /></Link>
            </div>
            <div className="desktop-upcoming-list">
              {feed.slice(1, 6).map((event) => <EventListCard key={event.id} event={event} />)}
            </div>
          </aside>
        </div>
        <div className="discovery-feed mobile-discovery-feed">
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
        <div className="discovery-side-sticky">
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
        </div>
      </aside>
    </div>
  );
}
