import { notFound } from 'next/navigation';
import { collections, indexableCollection } from '@/features/events/collections';
import { listEvents } from '@/features/events/repository';
import { SearchView } from '@/features/search/search-view';
export async function generateMetadata({ params }: { params: Promise<{ collection: string }> }) {
  const key = (await params).collection;
  const collection = collections[key];
  if (!collection) return {};
  const events = (await listEvents()).filter(collection.matches);
  return {
    title: collection.title,
    alternates: { canonical: `/corridas/${key}` },
    robots: { index: indexableCollection(events), follow: true },
  };
}
export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const collection = collections[(await params).collection];
  if (!collection) notFound();
  return (
    <>
      <div className="collection-heading">
        <h1>{collection.title}</h1>
      </div>
      <SearchView events={(await listEvents()).filter(collection.matches)} />
    </>
  );
}
