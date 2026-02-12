import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@megacampus/course-gen-platform/app-router'
import { TRPC_URL } from '@/lib/env-client'
import { getSupabaseClient } from '@/lib/supabase/browser-client'

/**
 * Vanilla tRPC client for browser use (non-React-Query).
 *
 * Use this in custom hooks that manage their own polling/state
 * instead of React Query. For standard data fetching, prefer
 * the `trpc` hooks from `@/lib/trpc/react` with TRPCProvider.
 *
 * Auth is handled via Supabase session token in headers,
 * fetched fresh on each request to avoid stale tokens.
 */
let client: ReturnType<typeof createTRPCClient<AppRouter>> | null = null

export function getBrowserTrpcClient() {
  if (!client) {
    client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: TRPC_URL,
          async headers() {
            const supabase = getSupabaseClient()
            const {
              data: { session },
            } = await supabase.auth.getSession()
            const headers: Record<string, string> = {}
            if (session?.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`
            }
            return headers
          },
        }),
      ],
    })
  }
  return client
}
