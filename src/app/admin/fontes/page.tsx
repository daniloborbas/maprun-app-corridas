import { requireAdmin } from '@/lib/supabase/server';
import { SourcesManager } from '@/features/discovery/sources-manager';
export default async function SourcesPage(){let access;try{access=await requireAdmin();}catch{return null;}const {data}=await access.client.from('discovery_sources').select('*').order('name');return <SourcesManager initial={(data||[]) as Record<string,unknown>[]}/>;}
