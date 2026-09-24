'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { RaceEvent } from '@/features/events/types';
import { resolveEventFallbackImage, resolveEventImage } from '@/features/events/images';
export function EventCover({
  event,
  priority = false,
  sizes = '(max-width: 700px) 100vw, 700px',
  className = 'event-image',
}: {
  event: RaceEvent;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = resolveEventFallbackImage(event);
  const activeImage = resolveEventImage(event);
  const src = failed ? fallback : activeImage;
  return (
    <Image
      src={src}
      alt={
        event.cover_image_source === 'official' && !failed && activeImage === event.cover_image_url
          ? event.name
          : `Imagem ilustrativa de ${event.event_category === 'trail' ? 'montanhas' : 'corrida'}`
      }
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      unoptimized={src.startsWith('https://') || src.startsWith('/api/events/cover')}
      onError={() => setFailed(true)}
    />
  );
}
