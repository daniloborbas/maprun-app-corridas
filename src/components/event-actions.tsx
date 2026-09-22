'use client';
import { useEffect, useState } from 'react';
import { Heart, Bookmark, Share2 } from 'lucide-react';
import { useApp } from './app-provider';
import { getInteractionCounts } from '@/features/events/actions';
import { trackAnalyticsEvent } from '@/features/analytics/client';
import { isEnded } from '@/features/events/discovery';
import type { RaceEvent } from '@/features/events/types';
export function EventActions({ event, compact = false }: { event: RaceEvent; compact?: boolean }) {
  const { favorites, going, toggle, notify } = useApp();
  const [busy, setBusy] = useState(false),
    [count, setCount] = useState(0);
  const saved = favorites.includes(event.id),
    attending = going.includes(event.id);
  useEffect(() => {
    if (!event.demo) void getInteractionCounts(event.id).then(setCount);
  }, [event.id, event.demo, attending]);
  async function share() {
    const url = `${window.location.origin}/corrida/${event.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: event.name, url });
      else {
        await navigator.clipboard.writeText(url);
        notify('Link copiado. Compartilhe sua próxima corrida!');
      }
      trackAnalyticsEvent('race_share', event.id);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        notify(`Compartilhe este endereço: ${url}`);
    }
  }
  async function act(kind: 'favorite' | 'going') {
    if (busy) return;
    setBusy(true);
    try {
      await toggle(event.id, kind);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={compact ? 'event-actions compact-actions' : 'event-actions'}>
      {!compact && (
        <>
          <button
            aria-label={`Eu vou: ${event.name}`}
            aria-pressed={attending}
            className={attending ? 'selected' : ''}
            disabled={busy || event.status !== 'published' || isEnded(event)}
            onClick={() => act('going')}
          >
            <span>
              <Heart size={22} fill={attending ? 'currentColor' : 'none'} />
            </span>
            <small>
              Eu vou{(count > 0 || (event.demo && attending)) && ` · ${event.demo ? 1 : count}`}
            </small>
          </button>
          <button onClick={share} aria-label={`Compartilhar ${event.name}`}>
            <span>
              <Share2 size={21} />
            </span>
            <small>Compartilhar</small>
          </button>
        </>
      )}
      <button
        aria-label={`${saved ? 'Remover dos salvos' : 'Salvar'}: ${event.name}`}
        aria-pressed={saved}
        className={saved ? 'selected' : ''}
        disabled={busy}
        onClick={() => act('favorite')}
      >
        <span>
          <Bookmark size={21} fill={saved ? 'currentColor' : 'none'} />
        </span>
        {!compact && <small>{saved ? 'Salvo' : 'Salvar'}</small>}
      </button>
    </div>
  );
}
