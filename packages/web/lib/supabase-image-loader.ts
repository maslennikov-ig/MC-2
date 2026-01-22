import type { ImageLoaderProps } from 'next/image'

/**
 * Custom Next.js image loader for Supabase Storage
 *
 * Note: Supabase Image Transformations (/storage/v1/render/image/) require Pro plan.
 * Since this feature is not enabled, we use Next.js built-in image optimization
 * for all images, including Supabase Storage URLs.
 *
 * Next.js Image Optimization:
 * - Automatically resizes and optimizes images
 * - Serves WebP/AVIF where supported
 * - Caches optimized images
 * - Works with any external URL via remotePatterns config
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/images
 */
export default function supabaseLoader({ src, width, quality }: ImageLoaderProps): string {
  const q = quality || 75

  // Use Next.js built-in image optimization for all images
  // This works because **.supabase.co is in remotePatterns config
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${q}`
}
