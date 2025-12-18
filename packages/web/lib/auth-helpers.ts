import { getUserClient } from '@/lib/supabase/client-factory'

export async function getCurrentUser() {
  try {
    const supabase = await getUserClient()

    // SECURITY: First validate user authenticity with getUser()
    // getUser() validates JWT by contacting Supabase Auth server
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return null
    }

    // Now that user is validated, get session to access JWT custom claims
    // Custom claims from Auth Hook are in the JWT token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return null
    }

    // Get role from JWT custom claims (added by custom_access_token_hook)
    // Decode JWT to get custom claims - they're in the access_token payload
    let role: string = 'student'

    try {
      const token = session.access_token
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
      role = payload.role || 'student'
    } catch {
      // Fallback to student if can't decode token
      role = 'student'
    }

    // Get full_name from user metadata
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0]

    return {
      id: user.id,
      email: user.email,
      name: fullName,
      role: role as 'admin' | 'instructor' | 'student'
    }
  } catch {
    // Return null on auth error
    return null
  }
}