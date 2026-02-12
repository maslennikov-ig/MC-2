'use client'

import { SupabaseProvider } from '@/lib/supabase/browser-client'
import { AuthModal } from '@/components/auth/auth-modal'
import { AppThemeProvider } from '@/components/common/app-theme-provider'
import { UserbackProvider } from '@/components/feedback/UserbackProvider'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { getQueryClient } from '@/lib/query-client'
import { TRPCProvider } from '@/lib/trpc/trpc-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  // QueryClientProvider wraps TRPCProvider. Both access the same queryClient
  // singleton via getQueryClient(). This nesting order works because TRPCProvider
  // calls getQueryClient() directly (not from context). See trpc-provider.tsx.
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider>
        <AppThemeProvider>
          <SupabaseProvider>
            {children}
            <AuthModal />
            <UserbackProvider />
          </SupabaseProvider>
        </AppThemeProvider>
      </TRPCProvider>
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
