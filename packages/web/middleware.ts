import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const SUPPORTED_LOCALES = ['ru', 'en'] as const;
const DEFAULT_LOCALE = 'ru';

export async function middleware(request: NextRequest) {
  // Update Supabase session for all requests
  const response = await updateSession(request)

  // Handle i18n: read locale from NEXT_LOCALE cookie
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  const locale = SUPPORTED_LOCALES.includes(cookieLocale as typeof SUPPORTED_LOCALES[number])
    ? cookieLocale
    : DEFAULT_LOCALE;

  // Set locale header for next-intl to read
  response.headers.set('x-next-intl-locale', locale!);

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
