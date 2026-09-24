export type GeoBand = 'high' | 'medium' | 'unknown' | 'low';
export type EnrichmentPriorityCandidate = { id?: string; city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null; event_date?: string | null; trust_level?: string | null; discoveredInRun?: boolean; order?: number };
export const ITAJUBA_REFERENCE = { latitude: -22.4256, longitude: -45.4528 } as const;
const haversineKm = (aLat:number,aLon:number,bLat:number,bLon:number) => { const r=Math.PI/180, dLat=(bLat-aLat)*r, dLon=(bLon-aLon)*r, a=Math.sin(dLat/2)**2+Math.cos(aLat*r)*Math.cos(bLat*r)*Math.sin(dLon/2)**2; return 6371*2*Math.asin(Math.sqrt(a)); };
export function classifyGeographicPriority(candidate: Pick<EnrichmentPriorityCandidate,'latitude'|'longitude'>, reference=ITAJUBA_REFERENCE): GeoBand {
  if (typeof candidate.latitude !== 'number' || typeof candidate.longitude !== 'number') return 'unknown';
  const distance=haversineKm(reference.latitude,reference.longitude,candidate.latitude,candidate.longitude);
  return distance<=150?'high':distance<=300?'medium':'low';
}
const rank:Record<GeoBand,number>={high:0,medium:1,unknown:2,low:3};
const dateRank=(value?:string|null)=>{const t=value?Date.parse(value):Number.MAX_SAFE_INTEGER;return Number.isFinite(t)?t:Number.MAX_SAFE_INTEGER;};
export function sortByGeographicPriority<T extends EnrichmentPriorityCandidate>(items:T[]):T[]{return [...items].sort((a,b)=>{const band=rank[classifyGeographicPriority(a)]-rank[classifyGeographicPriority(b)];if(band)return band;const trust=(b.trust_level==='B'?1:0)-(a.trust_level==='B'?1:0);if(trust)return trust;const date=dateRank(a.event_date)-dateRank(b.event_date);return date||((a.order??0)-(b.order??0));});}
/** Allocates the fixed run budget to current-run candidates before older pending work. */
export function prioritizeEnrichmentCandidates<T extends EnrichmentPriorityCandidate>(newCandidates:T[],pendingCandidates:T[],budget:number):T[]{if(budget<=0)return[];return sortByGeographicPriority(newCandidates).concat(sortByGeographicPriority(pendingCandidates)).slice(0,budget);}
