import { describe, expect, it } from 'vitest';
import { evaluateShadowAutoPublishEligibility, evaluateShadowCandidate } from '@/features/discovery/shadow-auto';
const base = { event: { name:'A',date:'2026-10-10',city:'Itajuba',state:'MG',distances:['5 km'],registrationUrl:'https://www.sympla.com.br/evento/a/123' }, researchConfidence:80, contentQualityScore:80, persistenceStatus:'persisted' as const };
describe('shadow auto eligibility', () => {
 it('varies only the confidence threshold for safe candidates',()=>{ expect(evaluateShadowAutoPublishEligibility(base,80)).toBe(true); expect(evaluateShadowAutoPublishEligibility(base,90)).toBe(false); });
 it('keeps data and safety blockers at every threshold',()=>{ for(const candidate of [{...base,event:{...base.event,registrationUrl:'https://inscricao.corrida1.com.br/organizador'},researchConfidence:100},{...base,event:{...base.event,distances:[]},researchConfidence:100},{...base,conflicts:[{severity:'high'}],researchConfidence:100},{...base,unsupportedClaims:['x'],researchConfidence:100}]) expect(evaluateShadowCandidate(candidate).shadow72).toBe(false); });
 it('classifies readiness explicitly',()=>{ expect(evaluateShadowCandidate(base).semanticReadiness).toBe('SAFE_READY'); expect(evaluateShadowCandidate({...base,event:{...base.event,registrationUrl:'https://inscricao.corrida1.com.br/organizador'}}).semanticReadiness).toBe('NEEDS_DATA_FIX'); expect(evaluateShadowCandidate({...base,conflicts:[{severity:'high'}]}).semanticReadiness).toBe('REAL_CONFLICT'); });
});
