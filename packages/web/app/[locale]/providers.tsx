'use client'

import { SupabaseProvider } from '@/lib/supabase/browser-client'
import { AuthModal } from '@/components/auth/auth-modal'
import { AppThemeProvider } from '@/components/common/app-theme-provider'
import { QueryClient, QueryClientProvider, isServer } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

/**
 * Create a new QueryClient instance with sensible defaults.
 * staleTime of 60s prevents unnecessary refetches.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 60 seconds
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined = undefined

/**
 * Get or create QueryClient following TanStack Query best practices for Next.js App Router.
 * - Server: Always create new instance (prevents cross-request data leaks)
 * - Browser: Create once and reuse (enables proper caching)
 */
function getQueryClient() {
  if (isServer) {
    return makeQueryClient()
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient()
    return browserQueryClient
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <SupabaseProvider>
          {children}
          <AuthModal />
        </SupabaseProvider>
      </AppThemeProvider>
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
