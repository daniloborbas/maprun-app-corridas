'use client';
import { useState } from 'react';
import type { RaceEvent } from '@/features/events/types';
import { getEventDetailImage, resolveEventFallbackImage, resolveEventImage } from '@/features/events/images';
import { feedImageVariantUrl, hasVersionedFeedImage } from '@/features/events/feed-image-variants';
export function EventCover({
  event,
  priority = false,
  sizes = '(max-width: 700px) 100vw, 700px',
  useFeedImage = false,
  useDetailImage = false,
}: {
  event: RaceEvent;
  priority?: boolean;
  sizes?: string;
  useFeedImage?: boolean;
  useDetailImage?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = resolveEventFallbackImage(event);
  const detailImage = useDetailImage ? getEventDetailImage(event) : null;
  const activeImage = useDetailImage ? detailImage?.url : useFeedImage && event.feed_image_url ? event.feed_image_url : resolveEventImage(event);
  if (useDetailImage && (!activeImage || failed)) return <div className="event-image event-image-placeholder" role="img" aria-label="Imagem da corrida indisponível">MapRun</div>;
  const src = failed ? fallback : activeImage || fallback;
  const responsiveFeed = useFeedImage && !failed && Boolean(event.feed_image_url) && hasVersionedFeedImage(src);
  const alt =
        event.cover_image_source === 'official' && !failed && activeImage === event.cover_image_url
          ? event.name
          : `Imagem ilustrativa de ${event.event_category === 'trail' ? 'montanhas' : 'corrida'}`;
  const imageProps = { sizes, loading: priority ? 'eager' as const : 'lazy' as const, decoding: 'async' as const, fetchPriority: priority ? 'high' as const : 'auto' as const };
  return responsiveFeed ? (
    <picture>
      <source media="(max-width: 700px)" srcSet={feedImageVariantUrl(src, 480)} />
      <img src={src} alt={alt} className="event-image" {...imageProps} onError={() => setFailed(true)} />
    </picture>
  ) : <img src={src} alt={alt} className="event-image" {...imageProps} onError={() => setFailed(true)} />;
}
