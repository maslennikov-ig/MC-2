export function formatVideoSrc(src: string | undefined | null) {
  if (!src) return src
  if (typeof src !== 'string') return src

  if (src.includes('youtube.com') || src.includes('youtu.be')) {
    const ytMatch = src.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})/
    )
    if (ytMatch && ytMatch[1]) {
      return `youtube/${ytMatch[1]}`
    }
    return src
  }

  if (src.includes('vimeo.com')) {
    const vimeoMatch = src.match(/vimeo\.com\/(?:video\/)?(\d+)/)
    if (vimeoMatch && vimeoMatch[1]) {
      return `vimeo/${vimeoMatch[1]}`
    }
    return src
  }

  if (src.includes('.m3u8')) {
    return { src, type: 'application/x-mpegurl' }
  }

  // If it's a URL without an extension like .mp4, .webm, .ogg
  if (src.startsWith('http') && !src.match(/\.(mp4|webm|ogg|mov|avi)(?:[?#].*)?$/i)) {
    // Treat unknown Supabase storage generic URLs as mp4 to ensure Vidstack selects the VideoProvider
    return { src, type: 'video/mp4' }
  }
  return src
}
