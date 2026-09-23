import { describe, expect, it } from 'vitest';
import { extractRaceEventWithAi, type AiExtractionProvider } from '@/features/importer/ai-extractor';
import type { ExtractedRaceEvent } from '@/features/importer/url-import';

const deterministic: ExtractedRaceEvent = { name:'Corrida Serra', date:'2026-10-18T00:00:00.000Z', startTime:null, city:null, state:'MG', venue:null, address:null, distances:[], price:null, organizerName:null, registrationUrl:null, coverImageUrl:null };
const response = (value: unknown): AiExtractionProvider => ({ extract: async () => ({ outputText: JSON.stringify(value) }) });
const valid = { name:'Corrida Serra', date:'2026-10-18T00:00:00.000Z', startTime:'07:00', city:'Itajubá', state:'MG', venue:null, address:null, distances:['5 km'], price:null, organizerName:'Equipe Serra', registrationUrl:null, coverImageUrl:null, evidence:{date:'18/10/2026',city:'Itajubá',state:'MG',distances:'5 km',organizerName:'Equipe Serra'} };

describe('extrator de IA isolado', () => {
  it('retorna saída estruturada e provenance ai', async () => { const result=await extractRaceEventWithAi({sourceUrl:'https://example.com/race',pageText:'Corrida em Itajubá em 18/10/2026',deterministicEvent:deterministic},response(valid)); expect(result.ok).toBe(true); if(result.ok){expect(result.result.event.city).toBe('Itajubá'); expect(result.result.fieldSources.city).toBe('ai');} });
  it('mantém campos ausentes como null e arrays vazios', async () => { const result=await extractRaceEventWithAi({sourceUrl:'https://example.com/race',pageText:'Prova',deterministicEvent:deterministic},response({...valid,city:null,distances:[]})); expect(result.ok).toBe(true); if(result.ok){expect(result.result.event.city).toBeNull(); expect(result.result.event.distances).toEqual([]);} });
  it('registra conflito com valor determinístico', async () => { const result=await extractRaceEventWithAi({sourceUrl:'https://example.com/race',pageText:'25/10/2026',deterministicEvent:deterministic},response({...valid,date:'2026-10-25T00:00:00.000Z'})); expect(result.ok).toBe(true); if(result.ok) expect(result.result.conflicts.some(conflict=>conflict.field==='startDate')).toBe(true); });
  it('controla resposta inválida, provider, timeout, chave ausente e texto vazio', async () => {
    const input={sourceUrl:'https://example.com/race',pageText:'Prova',deterministicEvent:deterministic};
    expect((await extractRaceEventWithAi({...input,pageText:''},response(valid))).ok).toBe(false);
    const invalid=await extractRaceEventWithAi(input,response({extra:true})); expect(invalid.ok ? '' : invalid.error).toBe('schema_validation_error');
    const provider=await extractRaceEventWithAi(input,{extract:async()=>{throw new Error('offline');}}); expect(provider.ok ? '' : provider.error).toBe('provider_error');
    const timeout=await extractRaceEventWithAi({...input,timeoutMs:1},{extract:async({signal})=>{await new Promise(resolve=>setTimeout(resolve,30)); if(signal.aborted) throw new Error('aborted'); return {outputText:JSON.stringify(valid)};}}); expect(timeout.ok ? '' : timeout.error).toBe('timeout');
  });
  it('preserva metadados seguros do erro do provider e mascara secrets', async () => {
    const result=await extractRaceEventWithAi({sourceUrl:'https://example.com/race',pageText:'Prova',deterministicEvent:deterministic},{extract:async()=>{const error=Object.assign(new Error('bad sk-test-secret'),{status:429,code:'insufficient_quota',type:'invalid_request_error',request_id:'req_test'}); throw error;}});
    expect(result.ok).toBe(false); if(!result.ok){expect(result.metadata).toEqual({status:429,code:'insufficient_quota',providerType:'invalid_request_error',requestId:'req_test',safeMessage:'bad [redacted]'}); expect(result.message).not.toContain('sk-test-secret');}
  });
  it.each([
    [401, undefined, 'authentication_error'],
    [400, 'invalid_request', 'invalid_request_error'],
  ])('preserva status e tipo em erro HTTP %s', async (status, code, type) => {
    const result=await extractRaceEventWithAi({sourceUrl:'https://example.com/race',pageText:'Prova',deterministicEvent:deterministic},{extract:async()=>{throw Object.assign(new Error('provider failure'),{status,code,type,request_id:'req_safe'});}});
    expect(result.ok).toBe(false); if(!result.ok) expect(result.metadata).toMatchObject({status,code,providerType:type,requestId:'req_safe'});
  });
  it('trata erro JavaScript genérico como provider_error', async () => {
    const result=await extractRaceEventWithAi({sourceUrl:'https://example.com/race',pageText:'Prova',deterministicEvent:deterministic},{extract:async()=>{throw new Error('offline');}});
    expect(result).toMatchObject({ok:false,error:'provider_error',message:'offline'});
  });
});
