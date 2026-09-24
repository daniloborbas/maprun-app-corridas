export type CoverImageSource = 'official' | 'generated' | 'fallback' | null;

export function resolveCoverImageSource(input: { existingSource?: string | null; coverImageUrl?: string | null }): CoverImageSource {
  if (input.existingSource === 'official' || input.existingSource === 'generated' || input.existingSource === 'fallback') return input.existingSource;
  return input.coverImageUrl?.trim() ? 'official' : null;
}
