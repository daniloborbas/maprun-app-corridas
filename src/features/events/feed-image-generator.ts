import OpenAI from 'openai';
import sharp from 'sharp';
import type { RaceEvent } from './types';

export type FeedImageContext = Pick<RaceEvent, 'name' | 'city' | 'state' | 'venue' | 'event_category' | 'description'> & { distances?: Array<{ label?: string | null }> | null };

function family(event: FeedImageContext) {
  const text = `${event.event_category || ''} ${event.name || ''} ${event.description || ''}`.toLowerCase();
  if (/kids|infantil|criança/.test(text)) return 'kids running event';
  if (/night|noturna|night run/.test(text)) return 'night road race';
  if (/trail|trilha|montanha|serra/.test(text)) return 'trail race';
  if (/walk|caminhada/.test(text)) return 'community walking event';
  if (/maratona|marathon/.test(text)) return 'marathon road race';
  return 'road running event';
}

export function buildFeedImagePrompt(event: FeedImageContext): string {
  const place = [event.city, event.state].filter(Boolean).join(', ') || 'Brazil';
  const distanceText = (event.distances || []).map((d) => d.label).filter(Boolean).join(', ');
  return [
    `Create a realistic editorial sports photograph for a ${family(event)} in ${place}, Brazil.`,
    event.venue ? `The setting may be inspired by the venue ${event.venue}, without inventing recognizable landmarks.` : 'Use a plausible Brazilian race setting without inventing recognizable landmarks.',
    distanceText ? `The event includes these distances: ${distanceText}.` : '',
    'Show runners and authentic atmosphere with natural lighting, premium composition, and a vertical 4:5 editorial crop.',
    'Absolutely no text, letters, numbers, logos, brand marks, signs, bib writing, watermarks, or UI elements anywhere in the image.',
    'Do not depict a specific person. Keep the image suitable as a clean race discovery feed cover.',
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
