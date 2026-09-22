import type { DiscoveredEventCandidate } from './types';

export type DiscoveryClassification = 'EVENT' | 'EDITORIAL' | 'LISTING' | 'UNKNOWN';

const eventWords = /\b(corrida|run|running|maratona|meia\s*maratona|trail|circuito|prova|caminhada)\b/i;
const datePattern = /\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+(?:de\s+)?(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:ço|co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)(?:\s+de)?\s+\d{4}|20\d{2})\b/i;
const distancePattern = /\b\d{1,3}(?:[,.]\d+)?\s*(?:km|quil[oô]metros?)\b/i;
const listingPath = /\/(?:corridas?|calend[aá]rio|cidades?|categorias?|tags?|tag)(?:\/|$)/i;
const editorialText = /\b(?:calend[aá]rio(?:\s+de\s+corridas)?|corridas?\s+em\s+(?:minas|mg|[a-zá-ú ]+)|melhores\s+corridas?|not[ií]cia|artigo|resultado(?:s)?\s+de\s+prova|fotos?\s+da\s+corrida|divulgar\s+corrida|ver\s+corridas?|corridas?\s+do\s+m[eê]s|quando\s+procurar|[óo]culos\s+para\s+corrida)\b/i;

export function classifyDiscoveryCandidate(candidate: DiscoveredEventCandidate): DiscoveryClassification {
  const url = candidate.source_url.toLowerCase();
  const text = `${candidate.name} ${candidate.raw_title ?? ''}`.trim();
  const hasEventWord = eventWords.test(text) || eventWords.test(url);
  const hasSpecificSignal = datePattern.test(text) || distancePattern.test(text) || Boolean(candidate.event_date) || Boolean(candidate.registration_url);

  if (editorialText.test(text)) return 'EDITORIAL';
  if (listingPath.test(new URL(candidate.source_url).pathname) && !hasSpecificSignal) return 'LISTING';
  if (hasEventWord && hasSpecificSignal) return 'EVENT';
  if (hasEventWord && /\/(?:event|evento|race|prova)\b/i.test(url)) return 'EVENT';
  return 'UNKNOWN';
}
