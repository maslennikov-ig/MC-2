import { NextResponse } from 'next/server'
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

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/'
  const next = isSafeRedirectPath(nextParam) ? nextParam : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth-code-error`)
}
