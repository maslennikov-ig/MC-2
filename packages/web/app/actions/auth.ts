'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { cookies } from 'next/headers'

export async function checkAuthStatus() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  return {
    isAuthenticated: !!user,
    user: user ? { id: user.id, email: user.email } : null
  }
}

export async function refreshAuthState() {
  // Force refresh all auth-related caches
  revalidatePath('/', 'layout')
  revalidatePath('/courses', 'layout')
  revalidatePath('/create', 'layout')
  revalidatePath('/courses/[slug]', 'layout')
  
  // Revalidate auth tag if we use it
  revalidateTag('auth')
  
  // Force cookies refresh
  await cookies()
  const supabase = await createClient()
  
  // Verify session is valid
  const { data: { user } } = await supabase.auth.getUser()
  
  return { 
    success: true,
    isAuthenticated: !!user
  }
}