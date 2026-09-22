'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { RaceEvent } from '@/features/events/types';
import { resolveEventImage } from '@/features/events/images';
export function EventCover({
  event,
  priority = false,
  sizes = '(max-width: 700px) 100vw, 700px',
}: {
  event: RaceEvent;
  priority?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = resolveEventImage(event);
  const src = failed ? fallback : resolveEventImage(event);
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
