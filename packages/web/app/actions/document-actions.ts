'use server'

import { TRPCClientError } from '@trpc/client'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'

/**
 * Convert tRPC or unknown errors to a plain Error for server action boundaries
 */
function toActionError(error: unknown, fallback: string): Error {
  if (error instanceof TRPCClientError) return new Error(error.message)
  if (error instanceof Error) return error
  return new Error(fallback)
}

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
