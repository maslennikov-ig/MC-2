import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/database.generated'

export async function updateSession(
  request: NextRequest,
  response?: NextResponse  // Optional: use provided response (e.g., from next-intl)
) {
  // Use provided response or create new one
  // CRITICAL: When response is provided, we reuse it to preserve headers/cookies
  // set by other middleware (e.g., next-intl's createMiddleware)
  let supabaseResponse = response ?? NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // CRITICAL: Update request cookies first
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

          // CRITICAL: When response was provided, preserve its headers
          // Otherwise, create new response with updated request
          if (response) {
            // Response was provided (e.g., from next-intl) - just update cookies
            // Headers are already preserved on the original response object
          } else {
            // No response provided - create new one with updated request
            supabaseResponse = NextResponse.next({
              request,
            })
          }

          // CRITICAL: Set cookies on response
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // CRITICAL: Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()
  // This refreshes the auth token and sets new cookies if needed
  const { data: { user } } = await supabase.auth.getUser()

  // Only set minimal cache headers for auth pages
  const url = request.nextUrl.pathname
  if (url.startsWith('/api/auth') || url === '/login' || url === '/register') {
    supabaseResponse.headers.set('Cache-Control', 'no-cache, no-store, max-age=0')
  }

  // Add custom header to indicate auth status for debugging
  if (user) {
    supabaseResponse.headers.set('X-Auth-Status', 'authenticated')
    supabaseResponse.headers.set('X-User-Id', user.id)
  } else {
    supabaseResponse.headers.set('X-Auth-Status', 'unauthenticated')
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}