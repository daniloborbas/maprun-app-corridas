import OpenAI from 'openai';
import sharp from 'sharp';
import type { RaceEvent } from './types';

export type FeedImageContext = Pick<RaceEvent, 'name' | 'city' | 'state' | 'venue' | 'event_category' | 'description' | 'start_date'> & { distances?: Array<{ label?: string | null }> | null };

export function classifyFeedImageMode(event: FeedImageContext): 'road' | 'trail' | 'night-road' | 'walk' | 'kids' | 'unknown' {
  const structured = String(event.event_category || '').toLowerCase();
  const text = `${event.name || ''} ${event.description || ''} ${(event.distances || []).map((d) => d.label || '').join(' ')}`.toLowerCase();
  if (/trail|trilha|montanha/.test(structured) || /trail|trilha|corrida de montanha/.test(text)) return 'trail';
  if (/infantil|kids/.test(structured) || /kids|infantil|corrida infantil/.test(text)) return 'kids';
  if (/night|noturna/.test(structured) || /night run|corrida noturna/.test(text)) return 'night-road';
  if (/caminhada/.test(structured) && !/corrida|run|maratona/.test(structured)) return 'walk';
  if (/rua|road|maratona|run/.test(structured) || /corrida|run|maratona/.test(text)) return 'road';
  return 'unknown';
}

export function buildFeedImagePrompt(event: FeedImageContext): string {
  const place = [event.city, event.state].filter(Boolean).join(', ') || 'Brazil';
  const distanceText = (event.distances || []).map((d) => d.label).filter(Boolean).join(', ');
  const mode = classifyFeedImageMode(event);
  const modeInstruction = mode === 'trail' ? 'Use dirt trail, forest or natural terrain appropriate for trail running.' : mode === 'walk' ? 'Show adult recreational walkers on a paved park or urban path.' : mode === 'night-road' ? 'Show an adult road race on paved streets at night.' : mode === 'kids' ? 'Show an adult-led family race on paved streets, with adults as the primary runners and children only as a secondary presence.' : 'Show adult recreational runners on paved roads or urban park paths; no trail running, no dirt path, no hiking, and no off-road terrain.';
  const hour = event.start_date?.match(/T(\d{2}):/i)?.[1];
  const light = mode === 'night-road' ? 'Use a confirmed night atmosphere.' : hour && Number(hour) >= 18 ? 'Use evening light because the event time is after 18:00.' : hour && Number(hour) >= 5 && Number(hour) < 12 ? 'Use neutral morning daylight.' : 'Use neutral daylight; do not infer a night scene.';
  return [
    `Create a realistic editorial sports photograph for a ${mode === 'trail' ? 'trail race' : mode === 'night-road' ? 'night road race' : mode === 'walk' ? 'community walking event' : mode === 'kids' ? 'family running event' : 'road running event'} in ${place}, Brazil.`,
    modeInstruction,
    light,
    event.venue ? `The setting may be inspired by the venue ${event.venue}, without inventing recognizable landmarks.` : 'Use a plausible Brazilian race setting without inventing recognizable landmarks.',
    distanceText ? `The event includes these distances: ${distanceText}.` : '',
    'Show runners and authentic atmosphere with natural lighting, premium composition, and a vertical 4:5 editorial crop.',
    'Absolutely no text, letters, numbers, logos, brand marks, signs, bib writing, watermarks, or UI elements anywhere in the image.',
    'Adults must be the primary subjects unless this is explicitly a kids race. Never make children the main subjects by default. Do not depict a specific person. Keep the image suitable as a clean race discovery feed cover with the central subject and edges safe for card overlays.',
  ].filter(Boolean).join(' ');
}

export interface FeedImageGenerator { generate(event: FeedImageContext): Promise<{ bytes: Buffer; mimeType: string; prompt: string; provider: string; durationMs: number }>; }

export class OpenAIFeedImageGenerator implements FeedImageGenerator {
  async generate(event: FeedImageContext) {
    const prompt = buildFeedImagePrompt(event);
    const started = Date.now();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('missing_api_key');
    const client = new OpenAI({ apiKey });
    const result = await client.images.generate({
      model: process.env.OPENAI_FEED_IMAGE_MODEL || 'gpt-image-2',
      prompt,
      size: '1024x1536',
      quality: 'low',
      output_format: 'webp',
      output_compression: 85,
      n: 1,
    });
    const encoded = result.data?.[0]?.b64_json;
    if (!encoded) throw new Error('provider_empty_image');
    const bytes = await sharp(Buffer.from(encoded, 'base64')).resize(800, 1000, { fit: 'cover', position: 'centre' }).webp({ quality: 85 }).toBuffer();
    return { bytes, mimeType: 'image/webp', prompt, provider: 'openai', durationMs: Date.now() - started };
  }
}
