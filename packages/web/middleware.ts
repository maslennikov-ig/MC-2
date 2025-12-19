import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Update Supabase session for all requests
  // i18n is handled via cookies/headers without URL rewrites (localePrefix: 'never')
  const response = await updateSession(request)

  // Add request ID for logging correlation
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
  response.headers.set('x-request-id', requestId)

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes including webhooks and trpc)
     * - trpc (tRPC endpoints)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api|trpc|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
  // Allow dynamic code evaluation for Supabase libraries that use Node.js APIs
  // This suppresses Edge Runtime warnings for code that won't actually run on Edge
  unstable_allowDynamic: [
    '**/node_modules/@supabase/realtime-js/**',
    '**/node_modules/@supabase/supabase-js/**',
    '**/node_modules/@supabase/ssr/**',
    '**/node_modules/@supabase/auth-js/**',
    '**/node_modules/@supabase/postgrest-js/**',
    '**/node_modules/@supabase/storage-js/**',
    '**/node_modules/@supabase/functions-js/**',
    '**/node_modules/@supabase/gotrue-js/**',
  ],
}
