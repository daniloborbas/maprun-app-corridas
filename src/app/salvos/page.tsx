import { listEvents } from '@/features/events/repository';
import { FavoritesView } from '@/features/favorites/favorites-view';
export const metadata = { title: 'Suas corridas salvas', robots: { index: false, follow: false } };
export default async function FavoritesPage() {
  return <FavoritesView events={await listEvents()} />;
}
