import type { ImageLoaderProps } from 'next/image'

/**
 * Custom Next.js image loader for Supabase Storage optimization
 *
 * Uses Supabase's image transformation API for public buckets:
 * - Converts `/storage/v1/object/public/{bucket}/{path}`
 * - To `/storage/v1/render/image/public/{bucket}/{path}?width=X&quality=Y`
 *
 * @see https://supabase.com/docs/guides/storage/image-transformations
 */
export default function supabaseLoader({ src, width, quality }: ImageLoaderProps): string {
  // Only transform Supabase Storage URLs
  if (!src.includes('supabase.co/storage')) {
    return src
  }

  try {
    const url = new URL(src)
    const q = quality || 75

    // Check if using public bucket (course-enrichments is public)
    if (url.pathname.includes('/object/public/')) {
      // Use Supabase image transformation endpoint
      // Format: /storage/v1/render/image/public/{bucket}/{path}?width=X&quality=Y
      const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/)
      if (pathMatch) {
        const [, bucket, path] = pathMatch
        return `${url.origin}/storage/v1/render/image/public/${bucket}/${path}?width=${width}&quality=${q}`
      }
    }

    // Fallback: append query params (for signed URLs or non-transformable buckets)
    url.searchParams.set('width', width.toString())
    url.searchParams.set('quality', q.toString())
    return url.href
  } catch (error) {
    // If URL parsing fails, return original
    console.warn('[supabase-image-loader] Failed to parse URL:', src)
    return src
  }
}
