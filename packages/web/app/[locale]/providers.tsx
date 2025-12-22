'use client'

import { SupabaseProvider } from '@/lib/supabase/browser-client'
import { AuthModal } from '@/components/auth/auth-modal'
import { AppThemeProvider } from '@/components/common/app-theme-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppThemeProvider>
      <SupabaseProvider>
        {children}
        <AuthModal />
      </SupabaseProvider>
    </AppThemeProvider>
  )
}