'use server'

import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import { toActionError } from '@/lib/trpc/action-error'

/**
 * Retry processing of a single failed document
 * Connects to trpc.documentProcessing.retryDocument
 */
export async function retryDocument(courseId: string, fileId: string) {
  try {
    const client = await getServerTrpcClient()
    return await client.documentProcessing.retryDocument.mutate({ courseId, fileId })
  } catch (error) {
    throw toActionError(error, 'Failed to retry document')
  }
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
