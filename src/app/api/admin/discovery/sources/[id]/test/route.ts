import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { htmlCalendarProvider } from '@/features/discovery/providers/html-calendar';
import type { DiscoverySource } from '@/features/discovery/types';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){let access;try{access=await requireAdmin();}catch{return NextResponse.json({error:'Acesso restrito.'},{status:403});}const {id}=await params;const {data}=await access.client.from('discovery_sources').select('*').eq('id',id).single();if(!data)return NextResponse.json({error:'Fonte não encontrada.'},{status:404});const started=Date.now();try{const candidates=await htmlCalendarProvider.discoverEvents(data as DiscoverySource);return NextResponse.json({ok:true,elapsedMs:Date.now()-started,candidates:candidates.slice(0,5)});}catch(e){return NextResponse.json({ok:false,elapsedMs:Date.now()-started,error:e instanceof Error?e.message:'Falha ao testar fonte.'});}}
