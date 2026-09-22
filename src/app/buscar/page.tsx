import { listEvents } from '@/features/events/repository';
import { SearchView } from '@/features/search/search-view';
export const metadata = { title: 'Buscar corridas', alternates: { canonical: '/buscar' } };
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  return (
    <SearchView
      events={await listEvents()}
      initialDistance={params.distance}
      initialCategory={params.category}
    />
  );
}
