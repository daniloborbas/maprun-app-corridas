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
}

const clean = (value: unknown) => sanitizeEventText(value).replace(/\s+/g, ' ').trim();

function dateLabel(value: string | null): string {
  if (!value) return '';
  const civilMidnight = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?(?:Z|\+00:00)$/.exec(value);
  const date = new Date(civilMidnight ? `${civilMidnight[1]}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date);
}

export function generateEventEditorialContent(facts: EventEditorialFacts): { shortDescription: string; description: string } {
  const name = clean(facts.name);
  const place = [clean(facts.city), clean(facts.state)].filter(Boolean).join(' - ');
  const date = dateLabel(facts.startDate);
  const time = clean(facts.startTime);
  const distances = (facts.distances || []).map((item) => clean(item.label)).filter(Boolean).join(', ');
  const details = [date && `em ${date}${time ? `, às ${time}` : ''}`, place && `em ${place}`, clean(facts.venue) && `no local ${clean(facts.venue)}`, distances && `com as distâncias ${distances}`].filter(Boolean);
  const shortDescription = clean(details.length ? [name, `Corrida ${details.join(', ')}.`].join('. ') : name);
  const paragraphs = [
    name && `A ${name} reúne informações para você planejar sua próxima corrida.`,
    details.length && `Data e local: ${details.join(', ')}.`,
    clean(facts.organizerName) && `Organização: ${clean(facts.organizerName)}.`,
    facts.priceFrom != null && Number.isFinite(facts.priceFrom) && `Inscrições a partir de R$ ${facts.priceFrom.toFixed(2).replace('.', ',')}.`,
    clean(facts.registrationUrl) && 'Consulte o link de inscrição para conferir disponibilidade, valores e regras atualizadas.',
  ].filter(Boolean) as string[];
  return { shortDescription: shortDescription.slice(0, 240), description: paragraphs.join('\n\n') };
}
