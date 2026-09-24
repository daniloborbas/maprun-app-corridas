export function feedImageVariantUrl(url: string, width: 480 | 800): string {
  if (width === 800 || !hasVersionedFeedImage(url)) return url;
  return url.replace(/-(\d+)(?:-800)?\.webp(?=$|[?#])/i, '-$1-480.webp');
}

export function hasVersionedFeedImage(url: string): boolean {
  return /\/(?:feed|manual)-\d+-800\.webp(?:$|[?#])/i.test(url);
}
