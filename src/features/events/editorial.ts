import { sanitizeEventText } from '@/features/events/text';

export interface EventEditorialFacts {
  name: string;
  startDate: string | null;
  startTime?: string;
  city?: string;
  state?: string;
  venue?: string;
  organizerName?: string;
  distances?: Array<{ label: string; distance_km: number | null }>;
  priceFrom?: number | null;
  registrationUrl?: string;
  category?: string;
}

const clean = (value: unknown) => sanitizeEventText(value).replace(/\s+/g, ' ').trim();

function dateLabel(value: string | null): string {
  const civilDate = value ? /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1] : '';
  if (!civilDate) return '';
  const [year, month, day] = civilDate.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDistances(items: EventEditorialFacts['distances']): string[] {
  const seen = new Set<string>();
  return (items || []).map((item) => clean(item.label)).filter((label) => label && !seen.has(label) && seen.add(label));
}

function naturalList(values: string[]): string {
  if (values.length < 2) return values[0] || '';
  if (values.length === 2) return `${values[0]} e ${values[1]}`;
  return `${values.slice(0, -1).join(', ')} e ${values[values.length - 1]}`;
}

function categoryContext(facts: EventEditorialFacts, name: string): { noun: string; context: string } {
  const text = `${facts.category || ''} ${name}`.toLowerCase();
  if (/trail|montanha/.test(text)) return { noun: 'prova de trail', context: 'O evento integra a modalidade de trail running' };
  if (/night|noturna|night run/.test(text)) return { noun: 'corrida noturna', context: 'A programação acontece no período noturno' };
  if (/kids|infantil/.test(text)) return { noun: 'prova para o público infantil', context: 'A programação inclui a categoria kids' };
  if (/caminhada|walk/.test(text)) return { noun: 'evento de corrida e caminhada', context: 'A programação inclui caminhada' };
  if (/maratona/.test(text)) return { noun: 'maratona', context: 'A prova é identificada como maratona' };
  if (/meia/.test(text)) return { noun: 'meia maratona', context: 'A prova é identificada como meia maratona' };
  return { noun: 'corrida', context: 'A prova faz parte do calendário de corridas' };
}

function priceLabel(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `As inscrições partem de R$ ${value.toFixed(2).replace('.', ',')}.` : '';
}

export function generateEventEditorialContent(facts: EventEditorialFacts): { shortDescription: string; description: string } {
  const name = clean(facts.name);
  const city = clean(facts.city);
  const state = clean(facts.state);
  const place = [city, state].filter(Boolean).join(' - ');
  const date = dateLabel(facts.startDate);
  const timeValue = clean(facts.startTime);
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeValue) ? timeValue : '';
  const venue = clean(facts.venue);
  const organizer = clean(facts.organizerName);
  const distances = formatDistances(facts.distances);
  const category = categoryContext(facts, name);
  const eventWhen = [date, time && `às ${time}`].filter(Boolean).join(', ');
  const placeSentence = place ? `em ${place}` : '';
  const local = venue && place ? `${venue}, ${place}` : venue || place;
  const openingVariants = [
    () => `${name} é uma ${category.noun}${placeSentence ? ` ${placeSentence}` : ''}${eventWhen ? `, marcada para ${eventWhen}` : ''}.`,
    () => `${eventWhen ? `Em ${eventWhen}, ` : ''}${name} acontece${placeSentence ? ` ${placeSentence}` : ''}.`,
    () => `${local ? `${local} recebe ${name}` : name}${eventWhen ? ` em ${eventWhen}` : ''}.`,
    () => `${name} coloca ${category.noun}${placeSentence ? ` ${placeSentence}` : ''}${date ? ` no dia ${date}` : ''}.`,
    () => `Quem procura ${category.noun}${placeSentence ? ` ${placeSentence}` : ''} encontra ${name}${eventWhen ? ` em ${eventWhen}` : ''}.`,
    () => `${name} está prevista${placeSentence ? ` para ${placeSentence}` : ''}${eventWhen ? `, com data marcada para ${eventWhen}` : ''}.`,
    () => `${category.context}${placeSentence ? ` ${placeSentence}` : ''}: ${name}${eventWhen ? `, em ${eventWhen}` : ''}.`,
    () => `${name} reúne as informações oficiais${eventWhen ? ` da prova marcada para ${eventWhen}` : ''}${placeSentence ? ` ${placeSentence}` : ''}.`,
  ];
  const opening = openingVariants[(name.length + distances.length + (facts.category || '').length) % openingVariants.length]();
  const details: string[] = [];
  if (distances.length > 1) details.push(`Há opções de percurso de ${naturalList(distances)}.`);
  else if (distances.length === 1) details.push(`O percurso informado é de ${distances[0]}.`);
  if (category.context !== 'A prova faz parte do calendário de corridas') details.push(`${category.context}.`);
  if (time && !opening.includes(`às ${time}`)) details.push(`A largada está indicada para as ${time}.`);
  if (local && !opening.includes(local)) details.push(`O local informado é ${local}.`);
  if (organizer) details.push(`A organização está atribuída a ${organizer}.`);
  const closing = [priceLabel(facts.priceFrom), clean(facts.registrationUrl) && 'As inscrições estão disponíveis pelo canal oficial do evento.'].filter(Boolean).join(' ');
  const paragraphs = [opening, details.join(' '), closing].filter(Boolean);
  const fallback = name ? `${name}${date ? ` está prevista para ${date}` : ''}${placeSentence ? `, ${placeSentence}` : ''}.` : 'Consulte os detalhes oficiais da prova para informações atualizadas.';
  const description = paragraphs.join('\n\n') || fallback;
  const shortDescription = clean([name, date && `em ${date}`, place].filter(Boolean).join(' · ')).slice(0, 240);
  return { shortDescription: shortDescription || fallback.slice(0, 240), description };
}
