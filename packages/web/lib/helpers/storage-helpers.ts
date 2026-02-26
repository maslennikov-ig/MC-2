import { getBrowserTrpcClient } from '@/lib/trpc/browser-client'

/**
 * Get playback URL for an enrichment media asset
 * @param enrichment - The lesson enrichment with ID and status
 * @returns Playback URL (signed URL for Supabase, public URL for local storage)
 */
export async function getEnrichmentPlaybackUrl(enrichment: {
  id: string
  status: string
}): Promise<string | null> {
  // Only return URL for completed enrichments
  if (enrichment.status !== 'completed') {
    return null
  }

  try {
    const client = getBrowserTrpcClient()
    const result = await client.enrichment.getPlaybackUrl.query({
      enrichmentId: enrichment.id,
    })
    return result.url
  } catch (error) {
    console.error(
      '[storage-helpers] Failed to get playback URL for enrichment',
      enrichment.id,
      error
    )
    return null
  }
}
