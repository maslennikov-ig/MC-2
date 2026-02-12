import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Validate that a path is a safe relative URL (prevents open redirect attacks).
 */
function isSafeRedirectPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false
  if (path.includes('\\')) return false
  try {
    const url = new URL(path, 'http://localhost')
    return url.origin === 'http://localhost'
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextParam = searchParams.get('next') ?? '/'
  const next = isSafeRedirectPath(nextParam) ? nextParam : '/'

  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = next
  redirectTo.searchParams.delete('token_hash')
  redirectTo.searchParams.delete('type')
  redirectTo.searchParams.delete('next')

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error) {
      return NextResponse.redirect(redirectTo)
    }
  }

  redirectTo.pathname = '/'
  redirectTo.searchParams.set('error', 'auth-confirm-error')
  return NextResponse.redirect(redirectTo)
}
