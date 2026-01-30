'use client'

import { SupabaseProvider } from '@/lib/supabase/browser-client'
import { AuthModal } from '@/components/auth/auth-modal'
import { AppThemeProvider } from '@/components/common/app-theme-provider'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { getQueryClient } from '@/lib/query-client'

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
