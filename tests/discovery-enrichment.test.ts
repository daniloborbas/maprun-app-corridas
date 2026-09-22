import { describe, expect, it } from 'vitest';
import { qualityForDraft } from '@/features/discovery/enrichment';

const base = { name:'Corrida', slug:'corrida', shortDescription:'', description:'', startDate:'2027-01-01T08:00:00.000Z', startTime:'08:00', city:'Itajubá', state:'MG', venue:'Praça', address:'', organizerName:'Org', category:'rua' as const, priceFrom:null, registrationUrl:'', regulationUrl:'', officialUrl:'https://example.com', coverImageUrl:'', distances:[], sourceUrl:'https://example.com', fieldsFound:[] };

describe('discovery enrichment quality', () => {
  it('marks a complete future draft ready', () => expect(qualityForDraft(base)).toBe('ready'));
  it('marks missing location incomplete', () => expect(qualityForDraft({...base, city:''})).toBe('incomplete'));
  it('marks missing date incomplete', () => expect(qualityForDraft({...base, startDate:null})).toBe('incomplete'));
});
