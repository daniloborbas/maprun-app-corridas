'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { RaceEvent } from '@/features/events/types';
export function EventCover({
  event,
  priority = false,
  sizes = '(max-width: 700px) 100vw, 700px',
}: {
  event: RaceEvent;
  priority?: boolean;
  sizes?: string;
}) {
  const fallback =
    event.event_category === 'trail'
      ? '/images/mantiqueira-run.png'
      : event.event_category === 'night'
        ? '/images/road.jpg'
        : '/images/runners.jpg';
  const [failed, setFailed] = useState(false);
  const src = failed
    ? fallback
    : event.cover_image_source === 'official' && !event.has_usable_official_image
      ? fallback
      : event.cover_image_url || fallback;
  return (
    <Image
      src={src}
      alt={
        event.cover_image_source === 'official' && !failed
          ? event.name
          : `Imagem ilustrativa de ${event.event_category === 'trail' ? 'montanhas' : 'corrida'}`
      }
      fill
      sizes={sizes}
      priority={priority}
      className="event-image"
      unoptimized={src.startsWith('https://') && !src.startsWith('https://images.unsplash.com/')}
      onError={() => setFailed(true)}
    />
  );
}
