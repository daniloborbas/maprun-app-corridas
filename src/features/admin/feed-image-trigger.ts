export function shouldGeneratePublishedFeedImage(input: {
  status: string;
  feedImageUrl?: string | null;
  feedImageSource?: string | null;
}) {
  return input.status === 'published' && !input.feedImageUrl && input.feedImageSource !== 'manual_upload';
}
