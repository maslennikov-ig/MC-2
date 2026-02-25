import { formatVideoSrc } from './packages/web/components/common/video-utils';

const urls = [
  'https://youtube.com/watch?v=123',
  'https://youtu.be/123',
  'https://vimeo.com/123',
  'https://example.com/video.mp4',
  'https://example.com/video.mp4?t=123',
  'https://supabase.co/storage/v1/object/public/bucket/123-456-789',
  'https://supabase.co/storage/v1/object/public/bucket/123-456-789?token=abc',
];

for (const u of urls) {
  console.log(u, '=>', formatVideoSrc(u));
}
