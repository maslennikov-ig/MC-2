import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/**
 * Backend URL configuration - Single Source of Truth
 * Used for all tRPC calls to course-gen-platform backend
 */
export const BACKEND_URL = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456'
export const TRPC_URL = `${BACKEND_URL}/trpc`

/**
 * Get auth headers for backend tRPC requests
 * Returns Bearer token from Supabase session for server-to-server auth
 *
 * @example
 * ```ts
 * const headers = await getBackendAuthHeaders()
 * const response = await fetch(`${TRPC_URL}/admin.getData`, { headers })
 * ```
 */
export async function getBackendAuthHeaders(): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  }
}

export interface AuthUser {
  id: string
  email: string
  role?: string
}

export interface AuthSession {
  user: AuthUser | null
}

/**
 * Authenticates a request using Supabase Auth
 * Gets the session from Authorization header or cookies
 */
export async function authenticateRequest(_request: NextRequest): Promise<AuthUser | null> {
  try {
    // Create Supabase client using unified server approach
    // This automatically handles cookie parsing and session management
    const supabase = await createClient()

    // The server client automatically reads cookies from the request
    // No need for manual cookie parsing - it's handled by @supabase/ssr
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      // Log detailed error info for debugging
      if (error) {
        logger.error('Auth error details:', {
          message: error.message,
          status: error.status,
          code: error.code
        })
      }
      return null
    }

    // Get user profile for role
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows returned
      logger.warn('Failed to fetch user profile:', {
        userId: user.id,
        error: profileError.message
      })
    }

    return {
      id: user.id,
      email: user.email!,
      role: userProfile?.role || 'student'
    }
  } catch (error) {
    logger.error('Authentication error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    })
    return null
  }
}

/**
 * Higher-order function to protect API routes with authentication
 * Returns a 401 response if authentication fails
 */
export function withAuth<T extends unknown[]>(
  handler: (request: NextRequest, user: AuthUser, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const user = await authenticateRequest(request)
    
    if (!user) {
      return NextResponse.json(
        { 
          error: 'Authentication required',
          message: 'Please provide a valid authorization token'
        },
        { status: 401 }
      )
    }

    return handler(request, user, ...args)
  }
}

/**
 * Higher-order function to protect API routes with role-based authorization
 * Returns a 403 response if user doesn't have required role
 */
export function withRole<T extends unknown[]>(
  requiredRole: string,
  handler: (request: NextRequest, user: AuthUser, ...args: T) => Promise<NextResponse>
) {
  return withAuth(async (request: NextRequest, user: AuthUser, ...args: T): Promise<NextResponse> => {
    // Superadmin and admin have access to everything
    const isPrivilegedRole = user.role === 'superadmin' || user.role === 'admin'

    if (user.role !== requiredRole && !isPrivilegedRole) {
      return NextResponse.json(
        {
          error: 'Insufficient permissions',
          message: `This action requires ${requiredRole} role`
        },
        { status: 403 }
      )
    }

    return handler(request, user, ...args)
  })
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 * Useful for endpoints that work for both authenticated and anonymous users
 */
export function withOptionalAuth<T extends unknown[]>(
  handler: (request: NextRequest, user: AuthUser | null, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const user = await authenticateRequest(request)
    return handler(request, user, ...args)
  }
}

/**
 * Get current authenticated user session for App Router API routes
 * Returns user session or null if not authenticated
 */
export async function auth(): Promise<AuthSession | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    // Get user profile for role
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    return {
      user: {
        id: user.id,
        email: user.email!,
        role: userProfile?.role ?? undefined
      }
    }
  } catch (error) {
    logger.error('Error in auth():', error)
    return null
  }
}

/**
 * API Key authentication for server-to-server communication
 * Validates API key from X-API-Key header
 */
export async function authenticateApiKey(request: NextRequest): Promise<boolean> {
  const apiKey = request.headers.get('X-API-Key')
  
  if (!apiKey) {
    return false
  }

  // Require API key to be set in environment variables - no fallbacks for security
  const validApiKey = process.env.API_KEY
  
  if (!validApiKey) {
    logger.error('API_KEY environment variable is not set')
    return false
  }
  
  return apiKey === validApiKey
}

/**
 * Higher-order function for API key protected endpoints
 */
export function withApiKey<T extends unknown[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const isValidApiKey = await authenticateApiKey(request)
    
    if (!isValidApiKey) {
      return NextResponse.json(
        { 
          error: 'Invalid API key',
          message: 'Please provide a valid X-API-Key header'
        },
        { status: 401 }
      )
    }

    return handler(request, ...args)
  }
}

/**
 * Rate limiting aware authentication
 * Combines authentication with existing rate limiting
 */
interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export function withAuthAndRateLimit<T extends unknown[]>(
  rateLimitCheck: (request: NextRequest) => { allowed: boolean; info: RateLimitInfo },
  handler: (request: NextRequest, user: AuthUser, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    // Check rate limit first
    const rateLimit = rateLimitCheck(request)
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: "Rate limit exceeded",
          message: "Too many requests. Please wait before trying again.",
          retryAfter: Math.ceil((rateLimit.info.reset - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimit.info.limit.toString(),
            'X-RateLimit-Remaining': rateLimit.info.remaining.toString(),
            'X-RateLimit-Reset': Math.ceil(rateLimit.info.reset / 1000).toString(),
            'Retry-After': Math.ceil((rateLimit.info.reset - Date.now()) / 1000).toString(),
          }
        }
      )
    }

    // Then check authentication
    const user = await authenticateRequest(request)
    
    if (!user) {
      return NextResponse.json(
        { 
          error: 'Authentication required',
          message: 'Please provide a valid authorization token'
        },
        { status: 401 }
      )
    }

    return handler(request, user, ...args)
  }
}

/**
 * Development mode bypass for testing
 * In development, allows requests without authentication but with limited permissions
 */
export function withDevBypass<T extends unknown[]>(
  handler: (request: NextRequest, user: AuthUser | null, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    // Additional production safeguard: Check for production indicators
    const isProductionUrl = process.env.NEXT_PUBLIC_SITE_URL?.includes('megacampus') ||
                          process.env.NEXT_PUBLIC_SITE_URL?.includes('vercel.app') ||
                          process.env.VERCEL_ENV === 'production' ||
                          process.env.RAILWAY_ENVIRONMENT === 'production'

    // CRITICAL: Never allow dev bypass in production, even if misconfigured
    const canUseDevBypass = process.env.NODE_ENV === 'development' &&
                           process.env.ENABLE_DEV_AUTH === 'true' &&
                           !isProductionUrl // Additional safeguard

    // In development mode with explicit bypass enabled and NOT in production
    if (canUseDevBypass) {
      let user = await authenticateRequest(request)

      if (!user) {
        // Create limited dev user, not admin
        user = {
          id: 'dev-user',
          email: 'dev@example.com',
          role: 'user' // Limited to 'user' role for security
        }
      }

      return handler(request, user, ...args)
    }

    // In all other cases (production or dev without explicit bypass), require proper authentication
    return withAuth(handler)(request, ...args)
  }
}