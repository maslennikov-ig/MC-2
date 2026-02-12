'use server'

import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth'
import { extractApiError } from '@/lib/api-error-handler'

/**
 * Retry processing of a single failed document
 * Connects to trpc.documentProcessing.retryDocument
 */
export async function retryDocument(courseId: string, fileId: string) {
  const headers = await getBackendAuthHeaders()
  const response = await fetch(`${TRPC_URL}/documentProcessing.retryDocument`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, fileId }),
  })
  if (!response.ok) {
    await extractApiError(response, 'Failed to retry document')
  }
  const data = await response.json()
  return data?.result?.data || data
}

/**
 * Retry all failed documents in a course (batch)
 * Iterates over failed file IDs and retries each one.
 */
export async function retryFailedDocuments(
  courseId: string,
  fileIds: string[]
): Promise<{ successCount: number; failCount: number }> {
  let successCount = 0
  let failCount = 0

  for (const fileId of fileIds) {
    try {
      await retryDocument(courseId, fileId)
      successCount++
    } catch {
      failCount++
    }
  }

  return { successCount, failCount }
}
