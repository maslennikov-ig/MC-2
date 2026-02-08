'use client'

import { useState } from 'react'
import { httpBatchLink } from '@trpc/client'
import { trpc } from './react'
import { TRPC_URL } from '@/lib/env-client'
import { getSupabaseClient } from '@/lib/supabase/browser-client'
import { getQueryClient } from '@/lib/query-client'

/**
 * tRPC Provider for client components.
 *
 * Configures the tRPC client with httpBatchLink pointing to the existing
 * /api/trpc proxy route. Auth is handled via Supabase JWT in headers.
 *
 * Must be nested inside QueryClientProvider (provided by providers.tsx).
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  const [trpcClient] = useState(() =>
    trpc.createClient({
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
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      {children}
    </trpc.Provider>
  )
}
