import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { DiscoveryAlreadyRunning, runDiscovery } from '@/features/discovery/service';
import type { DiscoverySource } from '@/features/discovery/types';
export async function POST(){let access;try{access=await requireAdmin();}catch{return NextResponse.json({error:'Acesso restrito.'},{status:403});}const {data,error}=await access.client.from('discovery_sources').select('*').eq('active',true);if(error)return NextResponse.json({error:'Não foi possível carregar as fontes.'},{status:503});try{return NextResponse.json({summary:await runDiscovery((data||[]) as DiscoverySource[])});}catch(error){if(error instanceof DiscoveryAlreadyRunning)return NextResponse.json({error:error.message},{status:409});return NextResponse.json({error:'Falha na descoberta.'},{status:500});}}
