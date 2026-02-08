import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@megacampus/course-gen-platform/app-router'
import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth'

/**
 * Create a type-safe tRPC client for server-side use (Server Actions, API routes).
 *
 * Uses the same auth pattern as existing Server Actions (Supabase session from cookies)
 * but provides full type inference for procedure names, inputs, and outputs.
 *
 * @example
 * ```ts
 * 'use server'
 * import { getServerTrpcClient } from '@/lib/trpc/server-caller'
 *
 * export async function triggerGeneration(courseId: string) {
 *   const client = await getServerTrpcClient()
 *   return client.generation.initiate.mutate({ courseId })
 * }
 * ```
 */
export async function getServerTrpcClient() {
  const headers = await getBackendAuthHeaders()

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: TRPC_URL,
        headers: () => headers,
      }),
    ],
  })
}
