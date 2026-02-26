const src = [
  'https://youtube.com/watch?v=123',
  'https://youtu.be/123',
  'https://vimeo.com/123',
  'https://example.com/video.mp4',
  'https://example.com/video.mp4?t=123',
  'https://supabase.co/storage/v1/object/public/bucket/123-456-789',
  'https://supabase.co/storage/v1/object/public/bucket/123-456-789?token=abc',
]

for (const s of src) {
  let out = s;
  if (s.startsWith('http') && !s.match(/\.(mp4|webm|ogg|mov|avi)(?:[?#].*)?$/i) && !s.includes('youtube') && !s.includes('youtu.be') && !s.includes('vimeo')) {
    out = { src: s, type: 'video/mp4' };
  }
  console.log(s, "=>", out);
}
