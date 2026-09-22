import { NextRequest } from 'next/server';

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char);

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = escape(params.get('name') || 'Corrida MapRun');
  const place = escape([params.get('city'), params.get('state')].filter(Boolean).join(' · '));
  const category = escape(params.get('category') || 'rua');
  const distances = escape(params.get('distances') || '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#101b18"/><stop offset="1" stop-color="#176b43"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="1010" cy="100" r="260" fill="#14D160" opacity=".16"/><circle cx="180" cy="580" r="220" fill="#14D160" opacity=".1"/><path d="M0 500 Q260 390 500 500 T1200 430 V630 H0Z" fill="#0b2e22" opacity=".8"/><text x="72" y="92" fill="#14D160" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="4">MAPRUN</text><text x="72" y="270" fill="white" font-family="Arial,sans-serif" font-size="58" font-weight="700">${name}</text><text x="72" y="332" fill="#d9eee2" font-family="Arial,sans-serif" font-size="30">${place}</text><text x="72" y="390" fill="#d9eee2" font-family="Arial,sans-serif" font-size="25">${category}${distances ? ` · ${distances}` : ''}</text><path d="M860 470 l42 -120 42 120 -42 -25z" fill="#14D160"/><circle cx="902" cy="290" r="18" fill="#14D160"/><path d="M902 315 l-48 100 M902 315 l54 75 M902 340 l-65 15 M902 340 l58 12" stroke="#fff" stroke-width="12" stroke-linecap="round"/></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
