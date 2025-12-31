/**
 * Supabase Storage Image Loader for Next.js
 * Enables automatic image optimization for Supabase Storage URLs
 *
 * @see https://supabase.com/docs/guides/storage/image-transformations#nextjs-loader
 */

interface ImageLoaderProps {
  src: string;
  width: number;
  quality?: number;
}

export default function supabaseLoader({ src, width, quality }: ImageLoaderProps): string {
  // Only transform Supabase Storage URLs
  if (!src.includes('supabase.co/storage')) {
    return src;
  }

  const url = new URL(src);
  url.searchParams.set('width', width.toString());
  url.searchParams.set('quality', (quality || 75).toString());
  return url.href;
}
