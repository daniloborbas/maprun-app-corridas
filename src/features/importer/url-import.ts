import dns from 'node:dns/promises';
import net from 'node:net';
import { z } from 'zod';
import { sanitizeEventText } from '@/features/events/text';
import { generateEventEditorialContent } from '@/features/events/editorial';
import { classifyRegistrationUrl } from '@/features/events/registration';
import { normalizeBrazilianState } from '@/features/locations/state';

export interface ImportedEventDraft {
  name: string; slug: string; shortDescription: string; description: string; startDate: string | null; startTime: string;
  city: string; state: string; venue: string; address: string; organizerName: string; category: 'rua'|'trail'|'night'|'kids';
  priceFrom: number | null; registrationUrl: string; regulationUrl: string; officialUrl: string; coverImageUrl: string; latitude?: number|null; longitude?: number|null;
  distances: { label: string; distance_km: number | null; category: string }[]; sourceUrl: string; fieldsFound: string[]; externalId?: string;
  extraction?: Pick<ExtractionResult, 'event'|'fieldSources'|'extractionQuality'|'shouldUseAiFallback'|'relevantPageText'>;
}
export type ExtractionSource = 'json_ld' | 'embedded_data' | 'html' | 'url' | 'derived' | 'ai';
export type ExtractionField = keyof Pick<ImportedEventDraft, 'name'|'startDate'|'startTime'|'city'|'state'|'venue'|'address'|'distances'|'priceFrom'|'organizerName'|'registrationUrl'|'coverImageUrl'>;
export type ExtractionFieldSources = Partial<Record<ExtractionField, ExtractionSource>>;
export interface ExtractionConflict { field: ExtractionField; values: { value: string; source: ExtractionSource }[]; }
export type ExtractionCompletenessStatus = 'complete' | 'partial' | 'insufficient';
export interface ExtractionQuality { status: ExtractionCompletenessStatus; missingEssentialFields: ExtractionField[]; missingImportantFields: ExtractionField[]; conflicts: ExtractionConflict[]; }
export interface ExtractedRaceEvent { name: string|null; date: string|null; startTime: string|null; city: string|null; state: string|null; venue: string|null; address: string|null; distances: string[]; price: string|null; organizerName: string|null; registrationUrl: string|null; coverImageUrl: string|null; }
export interface ExtractionResult { event: ExtractedRaceEvent; draft: ImportedEventDraft; fieldSources: ExtractionFieldSources; extractionQuality: ExtractionQuality; shouldUseAiFallback: boolean; relevantPageText: string; }
export const importUrlSchema = z.string().trim().url().max(2000).refine(v => /^https?:\/\//i.test(v), 'Use uma URL http:// ou https://.');
function ipBlocked(ip: string) { const version = net.isIP(ip); if (version === 4) { const [a,b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224; } if (version === 6) { const normalized = ip.toLowerCase(); return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb'); } return true; }
export async function assertSafeImportUrl(raw: string) { const parsed = importUrlSchema.parse(raw); const url = new URL(parsed); if (url.username || url.password || url.port && !['80','443'].includes(url.port)) throw new Error('URL não permitida.'); const host = url.hostname.toLowerCase(); if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal' || host === '169.254.169.254') throw new Error('URL interna bloqueada.'); const addresses = await dns.lookup(host, { all: true, verbatim: true }); if (!addresses.length || addresses.some(a => ipBlocked(a.address))) throw new Error('O endereço aponta para uma rede privada e foi bloqueado.'); return url.toString(); }
const clean = (v: string | undefined) => sanitizeEventText(v || '').replace(/\s+/g, ' ').trim();
const decode = (v: string) => clean(v.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
function tag(html: string, name: string, attr: string, value: string) { const re = new RegExp(`<${name}[^>]*${attr}=["']${value}["'][^>]*>`, 'i'); const m = html.match(re); return m ? decode(m[1] || m[0].replace(/.*content=["']([^"']*)["'].*/i,'$1')) : ''; }
function titleTag(html: string) { const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? decode(m[1]) : ''; }
type JsonLdRecord = Record<string, unknown>;
function isRecord(value: unknown): value is JsonLdRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function jsonLd(html: string): JsonLdRecord[] { return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m => { try { const parsed: unknown = JSON.parse(m[1]); return Array.isArray(parsed) ? parsed : [parsed]; } catch { return []; } }).flatMap(value => { if (!isRecord(value)) return []; const graph = value['@graph']; return Array.isArray(graph) ? graph : [value]; }).filter(isRecord); }
const textOf = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));
const EXTRACTION_TEXT_LIMIT = 24_000;
export function extractRelevantPageText(html: string, limit = EXTRACTION_TEXT_LIMIT): string {
  const withoutNoise = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const semantic = withoutNoise.replace(/<\/(?:nav|footer|aside)[^>]*>[\s\S]*?<\/(?:nav|footer|aside)>/gi, ' ');
  return decode(semantic.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, Math.max(1, limit));
}
function embeddedRecords(html: string): JsonLdRecord[] { const records: JsonLdRecord[]=[]; for(const m of html.matchAll(/<script[^>]*(?:id=["']__NEXT_DATA__["']|type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi)){ try { const value: unknown=JSON.parse(m[1]); const visit=(v: unknown, depth=0)=>{ if(depth>5||records.length>100)return; if(Array.isArray(v)){v.slice(0,100).forEach(x=>visit(x,depth+1));return;} if(!isRecord(v))return; records.push(v); Object.values(v).forEach(x=>visit(x,depth+1)); }; visit(value); } catch {} } return records; }
function registrationLink(html: string): string { const candidates=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:decode(m[1]),text:textOf(m[2]).toLowerCase()})); const strong=/(inscreva-se|inscriç(?:ão|ões)|participar|garanta sua vaga|comprar (?:inscrição|ingresso)|quero participar)/i; const blocked=/(login|contato|whatsapp|instagram|facebook|termos|política)/i; return candidates.filter(x=>classifyRegistrationUrl(x.url)==='specific'&&!blocked.test(x.text)).sort((a,b)=>Number(strong.test(b.text))-Number(strong.test(a.text)))[0]?.url || ''; }
function usableImage(value: unknown): string { if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return ''; const url = value.trim(); return /(favicon|logo|avatar|icon|sprite|pixel|tracking)/i.test(new URL(url).pathname) ? '' : url; }
function dateValue(v: unknown): string | null { const s = typeof v === 'string' ? v : ''; if (!s) return null; const iso = Date.parse(s); if (!Number.isNaN(iso)) return new Date(iso).toISOString(); const m=s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/); return m ? new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T00:00:00-03:00`).toISOString() : null; }
function slugify(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function distances(text: string) { const found = new Map<number|string,{label:string;distance_km:number|null;category:string}>(); const patterns=[/(\d{1,3}(?:[,.]\d{1,3})?)\s*(?:km|k)\b/gi,/\b(meia\s*maratona|maratona|caminhada|kids)\b/gi]; for(const p of patterns) for(const m of text.matchAll(p)){const raw=m[1]; const n=/^\d/.test(raw) ? Number(raw.replace(',','.')) : raw.toLowerCase().includes('meia') ? 21.097 : raw.toLowerCase().includes('maratona') ? 42.195 : null; const label=n ? `${n % 1 ? n.toString().replace('.',',') : n} km` : raw; found.set(n ?? label,{label,distance_km:n,category:raw.toLowerCase().includes('trail')?'trail':'rua'});} return [...found.values()].slice(0,20); }
function isPortalDasCorridas(sourceUrl: string) { try { return new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '') === 'portaldascorridas.com.br'; } catch { return false; } }
function ticketSportsId(sourceUrl: string): string | null { try { const url = new URL(sourceUrl); if (!/^(?:www\.)?ticketsports\.com\.br$/i.test(url.hostname)) return null; const match = url.pathname.match(/^\/e\/[^/]+-(\d+)\/?$/i); return match?.[1] || null; } catch { return null; } }
function ticketSportsTime(text: string) { return text.match(/\b(?:largada|largadas|in[ií]cio|start)\b[^\d]{0,40}(\d{1,2}:\d{2})\b/i)?.[1] || ''; }
function timeValue(v: unknown): string { const value=typeof v==='string'?v:''; return value.match(/T(\d{2}:\d{2})/)?.[1] || ''; }
function ticketSportsPlace(text: string): { city: string; state: string } { const match = text.match(/(?:^|,|–|-|:)\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{1,50}),\s*([A-Z]{2})(?:,|\b)/); return match ? { city: clean(match[1]), state: normalizeBrazilianState(match[2]) } : { city: '', state: '' }; }
function ticketSportsOrganizer(text: string) { const value=text.match(/(?:ORGANIZADOR|Organizador)\s+(.{1,100}?)(?=\s+(?:Largada|Largadas|Data|Local|Distâncias|Inscrições|PERCURSO|REGULAMENTO)\b|$)/i)?.[1] || ''; return clean(value); }
function ticketSportsRegulationLink(html: string) { const links=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]; return links.map(m=>({url:decode(m[1]),text:textOf(m[2])})).find(x=>/regulamento/i.test(x.text))?.url || ''; }
function portalLocation(text: string): { city: string; state: string } {
  const normalized = clean(text).replace(/\s*,\s*/g, ', ');
  const patterns = [
    /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,60}?),\s*([A-Za-z]{2})(?:,\s*\d{5}-?\d{3})?(?:,\s*Brasil)?\b/i,
    /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' ]{1,60}?)\s*-\s*([A-Za-z]{2})\b/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const state = normalizeBrazilianState(match[2]);
    if (state) return { city: clean(match[1]).replace(/\s+(?:-\s*)?$/, ''), state };
  }
  return { city: '', state: '' };
}
function portalTime(text: string) { return text.match(/\b(?:largada|início|inicio)\s*(?:às|as|:)?\s*(\d{1,2}:\d{2})\b/i)?.[1] || ''; }
function portalPrice(text: string) { const match=text.match(/R\$\s*([\d.]+(?:,[\d]{2})?)/i); if(!match) return null; const value=Number(match[1].replace(/\./g,'').replace(',','.')); return Number.isFinite(value) ? value : null; }
export function extractEventMetadata(html: string, sourceUrl: string): ImportedEventDraft { const graph=jsonLd(html).find(x => {const t=x['@type']; return t === 'Event' || t === 'SportsEvent' || (Array.isArray(t) && t.some(v => v === 'Event' || v === 'SportsEvent')); }) || {}; const embedded=embeddedRecords(html); const embeddedEvent=embedded.find(x=>isRecord(x.location)||x.city||x.cidade||x.registrationUrl||x.registration_url)||{}; const loc=isRecord(graph.location)?graph.location:(isRecord(embeddedEvent.location)?embeddedEvent.location:{}); const addr=isRecord(loc.address)?loc.address:{}; const offers=isRecord(graph.offers)?graph.offers:{}; const organizer=isRecord(graph.organizer)?graph.organizer:{}; const name=clean(String(graph.name||embeddedEvent.name||embeddedEvent.title||tag(html,'meta','property','og:title')||tag(html,'meta','name','twitter:title')||titleTag(html))); const sourceDescription=sanitizeEventText(String(graph.description||embeddedEvent.description||tag(html,'meta','property','og:description')||tag(html,'meta','name','description'))); const start=dateValue(graph.startDate||embeddedEvent.startDate||embeddedEvent.date); const imageCandidates=[Array.isArray(graph.image)?graph.image[0]:graph.image, embeddedEvent.image, tag(html,'meta','property','og:image'), tag(html,'meta','name','twitter:image')]; const image=imageCandidates.map(usableImage).find(Boolean)||''; const allText=textOf(html); const portal=isPortalDasCorridas(sourceUrl); const ticketId=ticketSportsId(sourceUrl); const portalPlace=portal ? portalLocation(allText) : {city:'',state:''}; const ticketPlace=ticketId ? ticketSportsPlace(allText) : {city:'',state:''}; const ds=distances(`${name} ${sourceDescription} ${allText}`); const embeddedCity=embeddedEvent.city||embeddedEvent.cidade||embeddedEvent.addressLocality||(isRecord(loc)?loc.city||loc.cidade:''); const embeddedState=embeddedEvent.state||embeddedEvent.uf||embeddedEvent.addressRegion||(isRecord(loc)?loc.state||loc.uf:''); const ticketLocationPlace=ticketId ? [loc.name, addr.name, embeddedEvent.venue, embeddedEvent.local].map(value => ticketSportsPlace(clean(String(value||'')))).find(place => place.city && place.state) || {city:'',state:''} : {city:'',state:''}; const city=clean(String(addr.addressLocality||embeddedCity||portalPlace.city||ticketPlace.city||ticketLocationPlace.city||'')); const state=normalizeBrazilianState(addr.addressRegion||embeddedState||portalPlace.state||ticketPlace.state||ticketLocationPlace.state); const venue=clean(String(loc.name||embeddedEvent.venue||embeddedEvent.local||'')); const ticketOrganizer=ticketId ? ticketSportsOrganizer(allText) : ''; const organizerName=clean(String(organizer.name||embeddedEvent.organizer||ticketOrganizer)); const registrationCandidates=[offers.url, embeddedEvent.registrationUrl, embeddedEvent.registration_url, registrationLink(html)].map(value=>clean(typeof value==='string'?value:'')).filter(value=>classifyRegistrationUrl(value)==='specific'); const registrationUrl=registrationCandidates[0]||''; const price=offers.price?Number(offers.price):(portal ? portalPrice(allText) : (ticketId ? portalPrice(allText) : null)); const startTime=ticketId ? (timeValue(graph.startDate||embeddedEvent.startDate||embeddedEvent.date)||ticketSportsTime(allText)) : (start?start.slice(11,16):(portal ? portalTime(allText) : '')); const generated=generateEventEditorialContent({name,startDate:start,startTime,city,state,venue,organizerName,distances:ds,priceFrom:price,registrationUrl}); const draft: ImportedEventDraft={name,slug:slugify(name),shortDescription:generated.shortDescription,description:generated.description||sourceDescription,startDate:start,startTime,city,state,venue,address:clean(String(addr.streetAddress||addr.name||embeddedEvent.address||embeddedEvent.endereco||'')), organizerName,category:/trail|montanha/i.test(allText)?'trail':/night|noturna/i.test(allText)?'night':/kids|infantil/i.test(allText)?'kids':'rua',priceFrom:price,registrationUrl,regulationUrl:ticketId ? ticketSportsRegulationLink(html) : '',officialUrl:sourceUrl,coverImageUrl:image,distances:ds,sourceUrl,fieldsFound:[],externalId:ticketId||undefined}; for(const [key,value] of Object.entries(draft)) if(value&&(!Array.isArray(value)||value.length)) draft.fieldsFound.push(key); return draft; }
function structuredDates(html: string): { value: string; source: ExtractionSource }[] {
  const values: { value: string; source: ExtractionSource }[] = [];
  for (const record of jsonLd(html)) { const type=record['@type']; if (type==='Event'||type==='SportsEvent'||(Array.isArray(type)&&type.some(v=>v==='Event'||v==='SportsEvent'))) { const value=dateValue(record.startDate); if(value) values.push({value,source:'json_ld'}); } }
  for (const record of embeddedRecords(html)) { const value=dateValue(record.startDate||record.date); if(value) values.push({value,source:'embedded_data'}); }
  for (const match of textOf(html).matchAll(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/g)) { const value=dateValue(match[1]); if(value) values.push({value,source:'html'}); }
  return values;
}
export function evaluateExtractionCompleteness(event: ExtractedRaceEvent, conflicts: ExtractionConflict[] = []): ExtractionQuality {
  const essential: ExtractionField[] = ['name','startDate','city','state'];
  const important: ExtractionField[] = ['distances','registrationUrl','organizerName','venue','coverImageUrl'];
  const missingEssentialFields=essential.filter(field => { const value=field==='startDate'?event.date:event[field as keyof ExtractedRaceEvent]; return value===null||value===''||(Array.isArray(value)&&value.length===0); });
  const missingImportantFields=important.filter(field => { const key=field==='startDate'?'date':field; const value=event[key as keyof ExtractedRaceEvent]; return value===null||value===''||(Array.isArray(value)&&value.length===0); });
  const status=missingEssentialFields.length ? 'insufficient' : missingImportantFields.length >= 3 || conflicts.length ? 'partial' : 'complete';
  return {status,missingEssentialFields,missingImportantFields,conflicts};
}
export function shouldUseAiFallback(quality: ExtractionQuality): boolean { return quality.status === 'insufficient' || quality.conflicts.length > 0; }
export function extractEventExtraction(html: string, sourceUrl: string): ExtractionResult {
  const draft=extractEventMetadata(html,sourceUrl);
  const dates=structuredDates(html);
  const uniqueDates=[...new Set(dates.map(item=>item.value))];
  const conflicts: ExtractionConflict[]=uniqueDates.length>1 ? [{field:'startDate',values:dates}] : [];
  const event: ExtractedRaceEvent={name:draft.name||null,date:draft.startDate,startTime:draft.startTime||null,city:draft.city||null,state:draft.state||null,venue:draft.venue||null,address:draft.address||null,distances:draft.distances.map(item=>item.label),price:draft.priceFrom===null?null:String(draft.priceFrom),organizerName:draft.organizerName||null,registrationUrl:draft.registrationUrl||null,coverImageUrl:draft.coverImageUrl||null};
  const ld=jsonLd(html); const embedded=embeddedRecords(html); const hasLd=(key: string) => ld.some(record => Boolean(record[key])); const hasEmbedded=(key: string) => embedded.some(record => Boolean(record[key]));
  const sourceFor=(key: string): ExtractionSource|undefined => hasLd(key) ? 'json_ld' : hasEmbedded(key) ? 'embedded_data' : undefined;
  const fieldSources: ExtractionFieldSources={name:sourceFor('name')||'html',startDate:dates.find(item=>item.source!=='html')?.source||dates[0]?.source,city:draft.city?(sourceFor('city')||sourceFor('location')||'html'):undefined,state:draft.state?(sourceFor('state')||sourceFor('location')||'html'):undefined,venue:draft.venue?(sourceFor('location')||'html'):undefined,address:draft.address?(sourceFor('address')||'html'):undefined,distances:draft.distances.length?'derived':undefined,priceFrom:draft.priceFrom!==null?(sourceFor('offers')||'json_ld'):undefined,organizerName:draft.organizerName?(sourceFor('organizer')||'html'):undefined,registrationUrl:draft.registrationUrl?(hasLd('offers')?'json_ld':hasEmbedded('registrationUrl')||hasEmbedded('registration_url')?'embedded_data':'html'):undefined,coverImageUrl:draft.coverImageUrl?(sourceFor('image')||'html'):undefined};
  const extractionQuality=evaluateExtractionCompleteness(event,conflicts);
  return {event,draft,fieldSources,extractionQuality,shouldUseAiFallback:shouldUseAiFallback(extractionQuality),relevantPageText:extractRelevantPageText(html)};
}
export async function fetchEventPage(rawUrl: string): Promise<ImportedEventDraft> { const url=await assertSafeImportUrl(rawUrl); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10000); try { const response=await fetch(url,{signal:controller.signal,redirect:'manual',headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'MapRunImporter/1.0'}}); if(response.status>=300&&response.status<400) throw new Error('Redirecionamento bloqueado. Use a URL final da página.'); if(!response.ok) throw new Error(`Página indisponível (HTTP ${response.status}).`); const type=response.headers.get('content-type')||''; if(!type.includes('text/html')&&!type.includes('application/xhtml+xml')) throw new Error('A URL não retornou uma página HTML.'); const length=Number(response.headers.get('content-length')||0); if(length>2_000_000) throw new Error('A página excede o limite de importação.'); const html=await response.text(); if(html.length>2_000_000) throw new Error('A página excede o limite de importação.'); const result=extractEventExtraction(html,url); return {...result.draft, extraction: {event:result.event,fieldSources:result.fieldSources,extractionQuality:result.extractionQuality,shouldUseAiFallback:result.shouldUseAiFallback,relevantPageText:result.relevantPageText}}; } catch(e) { if(e instanceof Error&&e.name==='AbortError') throw new Error('Tempo limite excedido ao acessar a página.'); throw e; } finally { clearTimeout(timer); } }






