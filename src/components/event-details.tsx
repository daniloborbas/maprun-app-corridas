'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  MapPin,
  BadgeCheck,
  ArrowRight,
} from 'lucide-react';
import type { RaceEvent } from '@/features/events/types';
import { formatDate, formatMoney, isEnded } from '@/features/events/discovery';
import { EventCover } from './event-cover';
import { EventActions } from './event-actions';
import { sanitizeEventText } from '@/features/events/text';
import { useApp } from './app-provider';
import { trackAnalyticsEvent } from '@/features/analytics/client';
export function EventDetails({ event }: { event: RaceEvent }) {
  const { demo } = useApp();
  const ended = isEnded(event),
    cancelled = event.status === 'cancelled';
  useEffect(() => {
    trackAnalyticsEvent('race_view', event.id);
  }, [event.id]);
  return (
    <article className="details-page">
      <div className="details-photo">
        <EventCover event={event} priority sizes="(max-width: 700px) 100vw, 55vw" />
        <Link href="/" className="back-button" aria-label="Voltar para descobrir">
          <ArrowLeft size={21} />
        </Link>
        <span className="photo-label">
          {event.cover_image_source === 'official' ? 'Imagem do evento' : 'Imagem ilustrativa'}
        </span>
      </div>
      <div className="details-content">
        <span className="eyebrow green">
          {event.event_category === 'trail' ? 'TRILHA E MONTANHA' : 'SUA PRÓXIMA LINHA DE CHEGADA'}
        </span>
        <h1>{event.name}</h1>
        <p className="details-city">
          <MapPin size={17} />
          {event.city} · {event.state}
        </p>
        {(ended || cancelled) && (
          <p className="status-message">
            {cancelled
              ? 'Evento cancelado. As inscrições estão indisponíveis.'
              : 'Esta edição já foi encerrada. Explore novas corridas no MapRun.'}
          </p>
        )}
        <div className="details-facts">
          <div>
            <CalendarDays />
            <p>
              <strong>{formatDate(event.start_date)}</strong>
              <span>
                {new Intl.DateTimeFormat('pt-BR', {
                  weekday: 'long',
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date(event.start_date))}
              </span>
            </p>
          </div>
          <div>
            <Clock3 />
            <p>
              <span>Largada às</span>
              <strong>
                {new Intl.DateTimeFormat('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date(event.start_date))}
              </strong>
            </p>
          </div>
        </div>
        <div className="venue">
          <MapPin />
          <p>
            <strong>{event.venue || 'Local a confirmar'}</strong>
            <span>{event.address || 'Consulte o organizador para confirmar o endereço.'}</span>
          </p>
        </div>
        <section>
          <h3>Modalidades</h3>
          <div className="distance-badges">
            {event.event_distances.map((d) => (
              <span key={d.label}>{d.label}</span>
            ))}
          </div>
        </section>
        <div className="details-price">
          <div>
            <small>{event.price_from === null ? 'Valor da inscrição' : 'A partir de'}</small>
            <strong>
              {event.price_from === null
                ? 'Consulte o organizador'
                : event.price_from === 0
                  ? 'Gratuito'
                  : formatMoney(event.price_from)}
            </strong>
          </div>
          <EventActions event={event} />
        </div>
        <section>
          <h3>Sobre a corrida</h3>
          <p className="description">{sanitizeEventText(event.description)}</p>
        </section>
        <section className="organizer">
          <h3>Organização</h3>
          <p>{event.organizer_name || 'Organizador a confirmar'}</p>
          {event.organizer_verified && (
            <p className="green">
              <BadgeCheck size={16} />
              Informações verificadas pelo organizador
            </p>
          )}
          <div className="detail-links">
            {event.official_url && (
              <a href={event.official_url} target="_blank" rel="noopener noreferrer">
                Site oficial <ArrowUpRight size={16} />
              </a>
            )}
            {event.regulation_url && (
              <a href={event.regulation_url} target="_blank" rel="noopener noreferrer">
                Regulamento <ArrowUpRight size={16} />
              </a>
            )}
          </div>
        </section>
        {event.event_sources?.map((source) => (
          <p className="source-note" key={source.source_url}>
            Fonte:{' '}
            <a href={source.source_url} target="_blank" rel="noopener noreferrer">
              {source.source_name}
            </a>
            {source.last_verified_at && ` · Conferida em ${formatDate(source.last_verified_at)}`}
          </p>
        ))}
        <div className="registration-cta">
          {!ended && !cancelled && event.registration_url && !event.demo ? (
            <a
              className="button"
              href={`/api/registration/${event.id}`}
              onClick={() => trackAnalyticsEvent('registration_click', event.id)}
            >
              Inscrever-se <ArrowRight size={20} />
            </a>
          ) : (
            <button className="button" disabled>
              {event.demo || demo
                ? 'Evento de demonstração'
                : cancelled
                  ? 'Evento cancelado'
                  : ended
                    ? 'Evento encerrado'
                    : 'Inscrições em breve'}
            </button>
          )}
          <small>
            {event.demo
              ? 'Dados fictícios. Não há inscrições para este exemplo.'
              : 'A inscrição acontece no site do organizador.'}
          </small>
        </div>
      </div>
    </article>
  );
}
