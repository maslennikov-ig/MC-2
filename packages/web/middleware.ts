import createMiddleware from 'next-intl/middleware';
import { type NextRequest } from 'next/server';
import { routing } from '@/src/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

const handleI18nRouting = createMiddleware(routing);

// Note: Redis-based rate limiting removed from middleware because ioredis
// is a Node.js-only library that cannot run in Edge runtime.
// Rate limiting for shared pages should be implemented at:
// 1. API route level (Node.js runtime)
// 2. CDN/WAF level (Cloudflare, Vercel)
// 3. Using Edge-compatible Redis client (e.g., @upstash/redis)

export async function middleware(request: NextRequest) {
  // Step 1: Handle i18n routing (locale detection, cookies)
  const response = handleI18nRouting(request);

  // Step 2: Update Supabase session (auth cookies)
  // Pass the i18n response to preserve its headers and cookies
  const finalResponse = await updateSession(request, response);

  // Step 3: Add request ID for logging correlation
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  finalResponse.headers.set('x-request-id', requestId);

  return finalResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - /api, /trpc (API routes)
     * - /_next, /_vercel (Next.js internals)
     * - Files with extensions (e.g., favicon.ico, *.svg)
     */
    '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
  ],
  // Allow dynamic code evaluation for Supabase libraries that use eval()
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
};
