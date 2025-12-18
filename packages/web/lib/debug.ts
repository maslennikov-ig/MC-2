/**
 * Debug Utility for Share Functionality
 * Provides comprehensive debugging tools for troubleshooting share button issues
 */

import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { authenticateRequest, type AuthUser } from '@/lib/auth'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'

/**
 * Test authentication flow
 * Validates current user session and token extraction
 */
export async function testAuthToken(request?: NextRequest): Promise<{
  success: boolean
  user: AuthUser | null
  error: string | null
  details: Record<string, unknown>
}> {
  const debugId = nanoid(8)
  logger.info(`[Debug ${debugId}] Testing authentication token`)

  try {
    if (!request) {
      // Create a mock request if none provided
      request = new NextRequest(new URL('http://localhost:3000/debug'))
    }

    const user = await authenticateRequest(request)

    if (user) {
      logger.info(`[Debug ${debugId}] Authentication successful`, {
        userId: user.id,
        email: user.email,
        role: user.role
      })

      return {
        success: true,
        user,
        error: null,
        details: {
          userId: user.id,
          email: user.email,
          role: user.role,
          timestamp: new Date().toISOString()
        }
      }
    }

    logger.warn(`[Debug ${debugId}] Authentication failed - no user`)
    return {
      success: false,
      user: null,
      error: 'No authenticated user found',
      details: {
        hasAuthHeader: request.headers.has('Authorization'),
        hasCookieHeader: request.headers.has('Cookie'),
        timestamp: new Date().toISOString()
      }
    }
  } catch (error) {
    logger.error(`[Debug ${debugId}] Authentication error`, { error })
    return {
      success: false,
      user: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        errorType: error instanceof Error ? error.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }
    }
  }
}

/**
 * Test Supabase connection
 * Validates database connectivity and client creation
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean
  regularClient: boolean
  adminClient: boolean
  error: string | null
  responseTime: number
}> {
  const debugId = nanoid(8)
  const startTime = Date.now()
  logger.info(`[Debug ${debugId}] Testing Supabase connection`)

  let regularClient = false
  let adminClient = false
  let error = null

  try {
    // Test regular client
    const client = await createClient()
    const { error: pingError } = await client
      .from('courses')
      .select('id')
      .limit(1)

    if (!pingError || pingError.code === 'PGRST116') {
      regularClient = true
      logger.info(`[Debug ${debugId}] Regular client connected successfully`)
    } else {
      error = `Regular client error: ${pingError.message}`
      logger.error(`[Debug ${debugId}] Regular client error`, { error: pingError })
    }

    // Test admin client
    try {
      const admin = await createAdminClient()
      const { error: adminPingError } = await admin
        .from('courses')
        .select('id')
        .limit(1)

      if (!adminPingError || adminPingError.code === 'PGRST116') {
        adminClient = true
        logger.info(`[Debug ${debugId}] Admin client connected successfully`)
      } else {
        error = error ? `${error}; Admin client error: ${adminPingError.message}` : `Admin client error: ${adminPingError.message}`
        logger.error(`[Debug ${debugId}] Admin client error`, { error: adminPingError })
      }
    } catch (adminError) {
      logger.warn(`[Debug ${debugId}] Admin client not available`, { error: adminError })
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown connection error'
    logger.error(`[Debug ${debugId}] Connection test failed`, { error: err })
  }

  const responseTime = Date.now() - startTime
  return {
    success: regularClient && !error,
    regularClient,
    adminClient,
    error,
    responseTime
  }
}

/**
 * Test course permissions
 * Checks if a user can share a specific course
 */
export async function testCoursePermissions(
  slug: string,
  userId?: string
): Promise<{
  success: boolean
  courseFound: boolean
  isOwner: boolean
  isAdmin: boolean
  canShare: boolean
  error: string | null
  details: Record<string, unknown>
}> {
  const debugId = nanoid(8)
  logger.info(`[Debug ${debugId}] Testing course permissions`, { slug, userId })

  try {
    const supabase = await createClient()

    // Get course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id, title, share_token')
      .eq('slug', slug)
      .single()

    if (courseError || !course) {
      logger.error(`[Debug ${debugId}] Course not found`, { slug, error: courseError })
      return {
        success: false,
        courseFound: false,
        isOwner: false,
        isAdmin: false,
        canShare: false,
        error: courseError?.message || 'Course not found',
        details: { slug, error: courseError }
      }
    }

    // If no userId provided, try to get from auth
    if (!userId) {
      const mockRequest = new NextRequest(new URL('http://localhost:3000/debug'))
      const user = await authenticateRequest(mockRequest)
      userId = user?.id
    }

    if (!userId) {
      return {
        success: false,
        courseFound: true,
        isOwner: false,
        isAdmin: false,
        canShare: false,
        error: 'No user ID available',
        details: { course: { id: course.id, title: course.title } }
      }
    }

    // Check ownership and admin status
    const isOwner = course.user_id === userId

    // Get user role from JWT instead of database
    let userRole = 'student'
    try {
      // SECURITY: First validate user authenticity with getUser()
      const { data: { user: validatedUser } } = await supabase.auth.getUser()

      if (validatedUser) {
        // Now get session to access JWT custom claims (user is already validated)
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
          userRole = payload.role || 'student'
        }
      }
    } catch (err) {
      logger.warn(`[Debug ${debugId}] Failed to decode JWT for role`, { err })
    }

    const isAdmin = userRole === 'admin' || userRole === 'superadmin'
    const canShare = isOwner || isAdmin

    logger.info(`[Debug ${debugId}] Permission check complete`, {
      courseId: course.id,
      userId,
      isOwner,
      isAdmin,
      canShare,
      hasShareToken: !!course.share_token
    })

    return {
      success: true,
      courseFound: true,
      isOwner,
      isAdmin,
      canShare,
      error: null,
      details: {
        course: {
          id: course.id,
          title: course.title,
          owner_id: course.user_id,
          has_share_token: !!course.share_token
        },
        user: {
          id: userId,
          role: userRole || 'student'
        }
      }
    }
  } catch (error) {
    logger.error(`[Debug ${debugId}] Permission check error`, { error })
    return {
      success: false,
      courseFound: false,
      isOwner: false,
      isAdmin: false,
      canShare: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: { error }
    }
  }
}

/**
 * Validate environment configuration
 * Checks all required environment variables
 */
export function validateEnvironment(): {
  valid: boolean
  missing: string[]
  warnings: string[]
  details: Record<string, boolean>
} {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ]

  const recommended = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_APP_URL',
    'N8N_WEBHOOK_URL'
  ]

  const missing: string[] = []
  const warnings: string[] = []
  const details: Record<string, boolean> = {}

  // Check required
  for (const key of required) {
    const exists = !!process.env[key]
    details[key] = exists
    if (!exists) {
      missing.push(key)
    }
  }

  // Check recommended
  for (const key of recommended) {
    const exists = !!process.env[key]
    details[key] = exists
    if (!exists) {
      warnings.push(key)
    }
  }

  logger.info('[Debug] Environment validation', {
    valid: missing.length === 0,
    missing,
    warnings
  })

  return {
    valid: missing.length === 0,
    missing,
    warnings,
    details
  }
}

/**
 * Test Supabase configuration
 * Validates URL format and key structure
 */
export function testSupabaseConfig(): {
  valid: boolean
  urlValid: boolean
  anonKeyValid: boolean
  serviceKeyValid: boolean
  projectRef: string | null
  errors: string[]
} {
  const errors: string[] = []
  let urlValid = false
  let anonKeyValid = false
  let serviceKeyValid = false
  let projectRef: string | null = null

  // Test URL
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url) {
    try {
      const parsed = new URL(url)
      urlValid = parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')
      projectRef = parsed.hostname.split('.')[0] || null
    } catch {
      errors.push('Invalid Supabase URL format')
    }
  } else {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is not set')
  }

  // Test anon key (basic validation)
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (anonKey) {
    anonKeyValid = anonKey.length > 100 && anonKey.includes('.')
    if (!anonKeyValid) {
      errors.push('Anon key appears to be invalid')
    }
  } else {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')
  }

  // Test service key (if available)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) {
    serviceKeyValid = serviceKey.length > 100 && serviceKey.includes('.')
    if (!serviceKeyValid) {
      errors.push('Service role key appears to be invalid')
    }
  }

  return {
    valid: urlValid && anonKeyValid,
    urlValid,
    anonKeyValid,
    serviceKeyValid,
    projectRef,
    errors
  }
}

/**
 * Log request details for debugging
 * Logs headers, cookies, and auth information
 */
export function logRequestDetails(request: NextRequest, context?: string): void {
  const debugId = nanoid(8)
  const details = {
    debugId,
    context: context || 'request-debug',
    url: request.url,
    method: request.method,
    headers: {
      host: request.headers.get('host'),
      userAgent: request.headers.get('user-agent'),
      contentType: request.headers.get('content-type'),
      authorization: request.headers.has('Authorization') ? 'present' : 'missing',
      cookie: request.headers.has('cookie') ? 'present' : 'missing'
    },
    timestamp: new Date().toISOString()
  }

  logger.info(`[Debug ${debugId}] Request details`, details)
}

/**
 * Test share token generation
 * Validates nanoid functionality
 */
export function testShareTokenGeneration(): {
  success: boolean
  token: string | null
  error: string | null
} {
  try {
    const token = nanoid(32)
    const isValid = token.length === 32 && /^[A-Za-z0-9_-]+$/.test(token)

    if (isValid) {
      logger.info('[Debug] Share token generation successful', {
        tokenLength: token.length,
        sample: `${token.substring(0, 8)}...`
      })

      return {
        success: true,
        token,
        error: null
      }
    }

    return {
      success: false,
      token: null,
      error: 'Generated token is invalid'
    }
  } catch (error) {
    logger.error('[Debug] Share token generation failed', { error })
    return {
      success: false,
      token: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Test course query
 * Attempts to fetch a course by slug
 */
interface Course {
  id: string
  user_id: string | null
  title: string | null
  slug: string | null
  share_token?: string | null
  course_description?: string | null
  [key: string]: unknown
}

export async function testCourseQuery(slug: string): Promise<{
  success: boolean
  course: Course | null
  error: string | null
  queryTime: number
}> {
  const startTime = Date.now()
  const debugId = nanoid(8)
  logger.info(`[Debug ${debugId}] Testing course query`, { slug })

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('slug', slug)
      .single()

    const queryTime = Date.now() - startTime

    if (error) {
      logger.error(`[Debug ${debugId}] Query error`, { slug, error, queryTime })
      return {
        success: false,
        course: null,
        error: error.message,
        queryTime
      }
    }

    logger.info(`[Debug ${debugId}] Query successful`, { slug, courseId: data?.id, queryTime })
    return {
      success: true,
      course: data,
      error: null,
      queryTime
    }
  } catch (error) {
    const queryTime = Date.now() - startTime
    logger.error(`[Debug ${debugId}] Query exception`, { slug, error, queryTime })
    return {
      success: false,
      course: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      queryTime
    }
  }
}

/**
 * Test share token update
 * Attempts to update a course's share token
 */
export async function testShareTokenUpdate(
  courseId: string,
  token: string | null
): Promise<{
  success: boolean
  error: string | null
  updateTime: number
}> {
  const startTime = Date.now()
  const debugId = nanoid(8)
  logger.info(`[Debug ${debugId}] Testing share token update`, { courseId, hasToken: !!token })

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('courses')
      .update({ share_token: token })
      .eq('id', courseId)

    const updateTime = Date.now() - startTime

    if (error) {
      logger.error(`[Debug ${debugId}] Update error`, { courseId, error, updateTime })
      return {
        success: false,
        error: error.message,
        updateTime
      }
    }

    logger.info(`[Debug ${debugId}] Update successful`, { courseId, updateTime })
    return {
      success: true,
      error: null,
      updateTime
    }
  } catch (error) {
    const updateTime = Date.now() - startTime
    logger.error(`[Debug ${debugId}] Update exception`, { courseId, error, updateTime })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      updateTime
    }
  }
}

/**
 * Test fetch request (client-side simulation)
 * Simulates a fetch request to the share API
 */
export async function testFetchRequest(
  url: string,
  options: RequestInit = {}
): Promise<{
  success: boolean
  status: number | null
  data: unknown | null
  error: string | null
  responseTime: number
}> {
  const startTime = Date.now()
  const debugId = nanoid(8)
  logger.info(`[Debug ${debugId}] Testing fetch request`, { url, method: options.method || 'GET' })

  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    const responseTime = Date.now() - startTime
    let data = null

    try {
      data = await response.json()
    } catch (parseError) {
      logger.warn(`[Debug ${debugId}] Response parse error`, { parseError })
      data = await response.text()
    }

    logger.info(`[Debug ${debugId}] Fetch complete`, {
      status: response.status,
      ok: response.ok,
      responseTime
    })

    return {
      success: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : data?.error || data?.message || 'Request failed',
      responseTime
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    logger.error(`[Debug ${debugId}] Fetch error`, { error, responseTime })
    return {
      success: false,
      status: null,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime
    }
  }
}

/**
 * Run comprehensive debug suite
 * Executes all debug tests and returns a report
 */
export async function runDebugSuite(slug?: string): Promise<{
  timestamp: string
  environment: ReturnType<typeof validateEnvironment>
  supabase: Awaited<ReturnType<typeof testSupabaseConnection>>
  authentication: Awaited<ReturnType<typeof testAuthToken>>
  shareToken: ReturnType<typeof testShareTokenGeneration>
  course?: Awaited<ReturnType<typeof testCourseQuery>>
  summary: {
    passed: number
    failed: number
    warnings: number
  }
}> {
  logger.info('[Debug] Starting comprehensive debug suite')

  const results = {
    timestamp: new Date().toISOString(),
    environment: validateEnvironment(),
    supabase: await testSupabaseConnection(),
    authentication: await testAuthToken(),
    shareToken: testShareTokenGeneration(),
    course: slug ? await testCourseQuery(slug) : undefined,
    summary: {
      passed: 0,
      failed: 0,
      warnings: 0
    }
  }

  // Calculate summary
  if (results.environment.valid) results.summary.passed++; else results.summary.failed++
  if (results.supabase.success) results.summary.passed++; else results.summary.failed++
  if (results.authentication.success) results.summary.passed++; else results.summary.failed++
  if (results.shareToken.success) results.summary.passed++; else results.summary.failed++
  if (results.course?.success) results.summary.passed++; else if (results.course) results.summary.failed++

  results.summary.warnings = results.environment.warnings.length

  logger.info('[Debug] Debug suite complete', results.summary)
  return results
}