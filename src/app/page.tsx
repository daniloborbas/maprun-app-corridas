import { listEvents } from '@/features/events/repository';
import { DiscoveryView } from '@/features/discovery/discovery-view';
import { db } from '@/lib/supabase/server';
import { matchEventsToPreferences } from '@/features/alerts/matching';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const events=await listEvents(); const client=await db(); let personalized:string[]=[]; let hasPreferences=false;
  if(client){const {data:{user}}=await client.auth.getUser(); if(user){const {data:p}=await client.from('profiles').select('*').eq('id',user.id).single(); if(p){hasPreferences=Boolean(p.alerts_enabled||p.nearby_events_enabled||p.city_events_enabled||p.saved_event_reminders_enabled||p.favorite_distances?.length||p.preferred_categories?.length); const matched=matchEventsToPreferences({...p,latitude:null,longitude:null},events.map(e=>({...e,distances:e.event_distances.map(d=>d.distance_km||0)}))); personalized=matched.flatMap(e=>e.id?[e.id]:[]);}}}
  return <DiscoveryView events={events} personalizedIds={personalized} hasPreferences={hasPreferences} />;
}
