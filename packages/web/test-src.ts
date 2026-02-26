export function formatVideoSrc(src: string) {
  if (!src) return src
  if (src.includes('youtube.com') || src.includes('youtu.be')) return src
  if (src.includes('vimeo.com')) return src
  // If it's a URL without an extension like .mp4, .webm, .ogg
  if (src.startsWith('http') && !src.match(/\.(mp4|webm|ogg|mov|avi)$/i)) {
    return { src, type: 'video/mp4' }
  }
  return src
}
