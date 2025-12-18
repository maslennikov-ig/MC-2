// This file is kept for backward compatibility
// Use lib/supabase/browser-client.tsx instead

import { getSupabaseClient } from './browser-client'

// Export function that returns the singleton client
export function createClient() {
  if (typeof window === 'undefined') {
    throw new Error('createClient can only be used in browser context. Use createServerClient for SSR.')
  }
  return getSupabaseClient()
}