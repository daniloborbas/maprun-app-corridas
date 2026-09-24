'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import type { RaceEvent } from '@/features/events/types';
import { formatDate, formatMoney } from '@/features/events/discovery';
import { EventCover } from './event-cover';
import { EventActions } from './event-actions';
import { trackAnalyticsEvent } from '@/features/analytics/client';
import { sanitizeEventText } from '@/features/events/text';
import { getRegistrationStatusPresentation } from '@/features/events/registration-status';
export function DiscoveryEventCard({ event, index }: { event: RaceEvent; index: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trackAnalyticsEvent('race_impression', event.id);
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [event.id]);
  return (
    <article ref={ref} className="discovery-card">
      <div className="card-media">
        <EventCover event={event} priority={index === 0} useFeedImage />
        <div className="cover-shade" />
        <span className="category-caption card-media-badge">
          {event.event_category === 'trail' ? 'TRAIL RUN' : event.event_category === 'night' ? 'NIGHT RUN' : event.event_category === 'kids' ? 'PARA OS PEQUENOS' : 'CORRIDA DE RUA'}
        </span>
        <EventActions event={event} />
      </div>
      <div className="card-content">
        <span className="category-caption">
          {event.sponsored ? 'PATROCINADO' : 'MAPRUN'}
        </span>
        <h2>{event.name}</h2>
        {sanitizeEventText(event.short_description) && <p className="card-description">{sanitizeEventText(event.short_description)}</p>}
        {getRegistrationStatusPresentation(event.registration_status).disabled && <span className={`registration-status-card ${getRegistrationStatusPresentation(event.registration_status).status}`}>{getRegistrationStatusPresentation(event.registration_status).shortLabel}</span>}
        <p>
          <MapPin size={16} />
          {event.city} · {event.state}
        </p>
        <p>
          <CalendarDays size={16} />
          {formatDate(event.start_date)}
        </p>
        <div className="card-distance-chips">{event.event_distances.map((d) => <span key={d.label}>{d.label}</span>)}</div>
        {event.price_from !== null && (
          <p className="card-price">
            {event.price_from === 0 ? 'Gratuito' : `A partir de ${formatMoney(event.price_from)}`}
          </p>
        )}
        {event.distance_km !== undefined && (
          <p className="distance-caption">
            <MapPin size={15} />
            {Math.round(event.distance_km)} km de você
          </p>
        )}
        <Link className="details-button" href={`/corrida/${event.slug}`}>
          Ver detalhes
          <ArrowRight size={18} />
        </Link>
      </div>
    </article>
  );
}
export function EventListCard({ event, grid = false }: { event: RaceEvent; grid?: boolean }) {
  return (
    <article className={grid ? 'event-grid-card' : 'event-list-card'}>
      <Link href={`/corrida/${event.slug}`} className="list-image">
        <EventCover event={event} sizes="(max-width: 700px) 45vw, 240px" useFeedImage />
      </Link>
      <div className="list-content">
        <h3>
          <Link href={`/corrida/${event.slug}`}>{event.name}</Link>
        </h3>
        <p>
          {event.city} · {event.state}
        </p>
        <p>
          <CalendarDays size={13} />
          {formatDate(event.start_date)}
        </p>
        <p className="muted">{event.event_distances.map((d) => d.label).join(' · ')}</p>
        {event.distance_km !== undefined && (
          <p className="green">
            <MapPin size={13} />
            {Math.round(event.distance_km)} km de você
          </p>
        )}
        {event.status !== 'published' && (
          <span className="status-badge">
            {event.status === 'cancelled' ? 'Cancelada' : 'Encerrada'}
          </span>
        )}
        {getRegistrationStatusPresentation(event.registration_status).disabled && <span className={`registration-status-card ${getRegistrationStatusPresentation(event.registration_status).status}`}>{getRegistrationStatusPresentation(event.registration_status).shortLabel}</span>}
      </div>
      <EventActions event={event} compact />
    </article>
  );
}
