import { NextRequest } from 'next/server';

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char);

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = params.get('name') || '';
  const category = escape(params.get('category') || 'rua');
  const night = /night|noturna/i.test(`${category} ${name}`);
  const trail = /trail|trilha|montanha/i.test(`${category} ${name}`);
  const start = night ? '#111827' : trail ? '#243b2f' : '#101b18';
  const end = night ? '#312e81' : trail ? '#5b3d22' : '#176b43';
  const nightLayer = night ? '<circle cx="120" cy="180" r="70" fill="#c4b5fd" opacity=".35"/><circle cx="640" cy="280" r="5" fill="#fff" opacity=".8"/><circle cx="710" cy="210" r="4" fill="#fff" opacity=".7"/>' : '';
  const terrain = trail ? '<path d="M0 760 Q140 560 280 720 T560 620 T800 700 V1000 H0Z" fill="#172a20" opacity=".8"/><path d="M0 830 Q190 690 370 820 T800 780" fill="none" stroke="#9a7645" stroke-width="18" opacity=".6"/>' : '<path d="M0 790 Q180 690 370 790 T800 740 V1000 H0Z" fill="#071a14" opacity=".72"/><path d="M0 835 H800" stroke="#d5e4da" stroke-width="8" opacity=".28"/>';
  const runners = '<circle cx="430" cy="370" r="34" fill="#f1c7a8"/><path d="M430 410 l-45 170 72 0 45 -170z" fill="#d9eee2"/><path d="M430 570 l-110 160 M455 570 l120 125 M405 450 l-110 85 M450 450 l105 50" stroke="#f1c7a8" stroke-width="24" stroke-linecap="round"/><circle cx="575" cy="420" r="24" fill="#c98f6e" opacity=".9"/><path d="M575 450 l-40 130 70 0 38 -130z" fill="#14D160" opacity=".8"/><path d="M575 575 l-75 125 M610 575 l90 105" stroke="#c98f6e" stroke-width="18" stroke-linecap="round" opacity=".9"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/>${nightLayer}<circle cx="670" cy="150" r="240" fill="#14D160" opacity=".12"/>${terrain}${runners}</svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
