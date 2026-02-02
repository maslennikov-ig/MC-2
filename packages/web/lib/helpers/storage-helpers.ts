import { createClient } from '@/lib/supabase/client'

/**
 * Get a signed playback URL for an enrichment's audio asset
 * @param enrichment - The lesson enrichment with asset_id and status
 * @returns Signed URL valid for 1 hour, or null if asset not available
 */
export async function getEnrichmentPlaybackUrl(enrichment: {
  asset_id?: string | null
  status: string
}): Promise<string | null> {
  // Only return URL for completed enrichments with asset_id
  if (enrichment.status !== 'completed' || !enrichment.asset_id) {
    return null
  }

  const supabase = createClient()

  // Get asset file_path from database
  const { data: asset } = await supabase
    .from('assets')
    .select('file_path')
    .eq('id', enrichment.asset_id)
    .single()

  if (!asset?.file_path) return null

  // Create signed URL with 1 hour expiry
  const { data } = await supabase.storage
    .from('course-assets')
    .createSignedUrl(asset.file_path, 3600)

  return data?.signedUrl || null
}
