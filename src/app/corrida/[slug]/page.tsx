import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/features/events/repository';
import { EventDetails } from '@/components/event-details';
import { siteUrl } from '@/lib/config';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  if (!event) return { title: 'Corrida não encontrada' };
  return {
    title: `${event.name} em ${event.city}`,
    description: event.short_description,
    alternates: { canonical: `/corrida/${event.slug}` },
    robots: event.demo ? { index: false, follow: false } : undefined,
    openGraph: {
      title: event.name,
      description: event.short_description,
      url: `/corrida/${event.slug}`,
      images: [new URL(event.cover_image_url || '/images/runners.jpg', siteUrl).href],
    },
  };
}
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getEventBySlug((await params).slug);
  if (!event) notFound();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.name,
    description: event.description,
    startDate: event.start_date,
    endDate: event.end_date || undefined,
    eventStatus:
      event.status === 'cancelled'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: new URL(event.cover_image_url, siteUrl).href,
    url: `${siteUrl}/corrida/${event.slug}`,
    location: {
      '@type': 'Place',
      name: event.venue || event.city,
      address: {
        '@type': 'PostalAddress',
        streetAddress: event.address,
        addressLocality: event.city,
        addressRegion: event.state,
        addressCountry: 'BR',
      },
    },
    organizer: event.organizer_name
      ? {
          '@type': 'Organization',
          name: event.organizer_name,
          url: event.official_url || undefined,
        }
      : undefined,
    offers:
      event.price_from !== null && event.registration_url
        ? {
            '@type': 'Offer',
            price: event.price_from,
            priceCurrency: 'BRL',
            url: event.registration_url,
          }
        : undefined,
  };
  return (
    <>
      {!event.demo && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
        />
      )}
      <EventDetails event={event} />
    </>
  );
}
