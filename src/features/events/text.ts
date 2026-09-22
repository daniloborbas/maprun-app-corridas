const entities: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
export function sanitizeEventText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p\s*>|<\/div\s*>|<\/li\s*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&(?:amp|quot|#39|lt|gt|nbsp);/gi, (match) => entities[match.toLowerCase()] || ' ').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
