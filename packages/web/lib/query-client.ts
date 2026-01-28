'use client'

/**
 * TanStack Query Client Configuration
 *
 * Provides QueryClient singleton pattern for Next.js App Router.
 * This file is extracted from providers.tsx for reusability in:
 * - Client Components (QueryClientProvider)
 * - Tests (mocking)
 *
 * Note: For Server Component prefetching, use makeQueryClient() directly
 * in the server component instead of getQueryClient().
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr
 */

import { QueryClient, isServer } from '@tanstack/react-query'

/**
 * Default options for QueryClient.
 * - staleTime: 60s prevents unnecessary refetches after hydration
 * - gcTime: 5min garbage collection for inactive queries
 */
const DEFAULT_STALE_TIME = 60 * 1000 // 60 seconds
const DEFAULT_GC_TIME = 5 * 60 * 1000 // 5 minutes

/**
 * Create a new QueryClient instance with sensible defaults.
 *
 * @returns New QueryClient instance
 *
 * @example
 * ```ts
 * // Server Component prefetching
 * const queryClient = makeQueryClient()
 * await queryClient.prefetchQuery({
 *   queryKey: ['posts'],
 *   queryFn: fetchPosts,
 * })
 * ```
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME,
        gcTime: DEFAULT_GC_TIME,
      },
    },
  })
}

/**
 * Browser-side QueryClient singleton.
 * Prevents re-creation during React suspense/hydration.
 */
let browserQueryClient: QueryClient | undefined = undefined

/**
 * Get or create QueryClient following TanStack Query best practices for Next.js App Router.
 *
 * **Server**: Always creates new instance (prevents cross-request data leaks)
 * **Browser**: Creates once and reuses (enables proper caching)
 *
 * @returns QueryClient instance
 *
 * @example
 * ```tsx
 * // In providers.tsx
 * export function Providers({ children }) {
 *   const queryClient = getQueryClient()
 *   return (
 *     <QueryClientProvider client={queryClient}>
 *       {children}
 *     </QueryClientProvider>
 *   )
 * }
 * ```
 */
export function getQueryClient(): QueryClient {
  if (isServer) {
    // Server: always make a new query client
    // Prevents sharing data between requests (security)
    return makeQueryClient()
  } else {
    // Browser: make a new query client if we don't already have one
    // This is important so we don't re-make a new client if React
    // suspends during the initial render
    if (!browserQueryClient) {
      browserQueryClient = makeQueryClient()
    }
    return browserQueryClient
  }
}

/**
 * Reset browser QueryClient (for testing only).
 * @internal
 */
export function resetBrowserQueryClient(): void {
  browserQueryClient = undefined
}
