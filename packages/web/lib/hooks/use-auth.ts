'use client'

import { useSupabase } from '@/lib/supabase/browser-client'

export function useAuth() {
  const { supabase, session, isLoading } = useSupabase()

  // Extract role from JWT custom claims, not from user object
  let role = 'student'
  if (session?.access_token) {
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]))
      role = payload.role || 'student'
    } catch {
      // Fallback to student if JWT decode fails
      role = 'student'
    }
  }

  const user = session?.user ? {
    id: session.user.id,
    email: session.user.email,
    role: role
  } : null

  return {
    user,
    loading: isLoading,
    isAuthenticated: !!user,
    isSuperAdmin: user?.role === 'superadmin',
    // For backward compatibility with old code
    getAccessToken: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.access_token || null
    }
  }
}