import { listEvents } from '@/features/events/repository';
import { DiscoveryView } from '@/features/discovery/discovery-view';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const events=await listEvents();
  return <DiscoveryView events={events} />;
}
