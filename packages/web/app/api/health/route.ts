import { NextResponse, NextRequest } from 'next/server'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'

// Use Node.js runtime for this route since it uses Node.js-specific APIs
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const healthCheckId = nanoid(8)

  logger.info('Health check started', { healthCheckId })

  // Проверяем критические переменные (без раскрытия чувствительных данных)
  const envCheck = {
    NEXT_PUBLIC_SUPABASE_URL: {
      exists: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      configured: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'CONFIGURED' : 'MISSING'
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      exists: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      configured: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'CONFIGURED' : 'MISSING'
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      exists: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      configured: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'CONFIGURED' : 'MISSING'
    },
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SITE_URL: !!process.env.NEXT_PUBLIC_SITE_URL ? 'CONFIGURED' : 'MISSING',
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL ? 'CONFIGURED' : 'MISSING',
    N8N_WEBHOOK_URL: !!process.env.N8N_WEBHOOK_URL ? 'CONFIGURED' : 'MISSING',
    ENABLE_DEV_AUTH: process.env.ENABLE_DEV_AUTH || 'false',
    API_KEY: !!process.env.API_KEY ? 'CONFIGURED' : 'NOT_SET'
  }
  
  // Пробуем создать Supabase клиент
  const supabaseCheck = {
    client_created: false,
    admin_client_created: false,
    error: null as string | null,
    test_query: false,
    connection_healthy: false,
    response_time: 0,
    // RLS and privilege checks
    admin_privileged_ok: false,
    anon_rls_denied: false,
    admin_query_time: 0,
    anon_query_time: 0,
    rls_error_code: null as string | null
  }

  try {
    const supabaseStart = Date.now()
    const { createClient, createAdminClient, checkSupabaseConnection } = await import('@/lib/supabase/server')

    // Test regular client
    const supabase = await createClient()
    supabaseCheck.client_created = true

    // Test admin client and RLS privileges
    try {
      const adminClient = await createAdminClient()
      supabaseCheck.admin_client_created = true

      // Test admin privileged query
      const adminQueryStart = Date.now()
      const { error: adminQueryError } = await adminClient
        .from('users')
        .select('id')
        .limit(1)

      supabaseCheck.admin_query_time = Date.now() - adminQueryStart

      if (!adminQueryError || adminQueryError.code === 'PGRST116') { // PGRST116 = no rows
        supabaseCheck.admin_privileged_ok = true
      } else {
        logger.warn('Admin privileged query failed', {
          error: adminQueryError.message,
          code: adminQueryError.code
        })
      }
    } catch (adminError) {
      supabaseCheck.admin_client_created = false
      logger.warn('Admin client creation failed in health check', {
        error: adminError instanceof Error ? adminError.message : 'Unknown error'
      })
    }

    // Test connection
    supabaseCheck.connection_healthy = await checkSupabaseConnection()

    // Пробуем простой запрос
    const { error } = await supabase
      .from('courses')
      .select('id')
      .limit(1)
      .single()

    if (!error || error.code === 'PGRST116') { // PGRST116 = no rows
      supabaseCheck.test_query = true
    } else {
      supabaseCheck.error = error.message
    }

    // Test anon client RLS (should be blocked on profiles table)
    const anonQueryStart = Date.now()
    const { error: anonError } = await supabase
      .from('users')
      .select('id')
      .limit(1)

    supabaseCheck.anon_query_time = Date.now() - anonQueryStart

    // Check if RLS properly blocks anon access
    if (anonError && (anonError.code === 'PGRST301' || anonError.message.includes('permission denied'))) {
      supabaseCheck.anon_rls_denied = true
      supabaseCheck.rls_error_code = anonError.code
    } else if (!anonError || anonError.code === 'PGRST116') {
      // If no error or just no rows, RLS might not be properly configured
      logger.warn('RLS may not be properly configured - anon client could read profiles', {
        error: anonError,
        code: anonError?.code
      })
    }

    supabaseCheck.response_time = Date.now() - supabaseStart
  } catch (e) {
    supabaseCheck.error = e instanceof Error ? e.message : 'Unknown error occurred'
    logger.error('Supabase check failed in health endpoint', { error: e })
  }

  // Test authentication system
  const authCheck = {
    authenticateRequest_available: false,
    mock_auth_test: false,
    error: null as string | null
  }

  try {
    const { authenticateRequest } = await import('@/lib/auth')
    authCheck.authenticateRequest_available = true

    // Create mock request to test auth
    const mockRequest = new NextRequest(new URL('/api/health', request.url))
    const user = await authenticateRequest(mockRequest)

    if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_AUTH === 'true') {
      authCheck.mock_auth_test = true
    } else {
      authCheck.mock_auth_test = !!user
    }
  } catch (e) {
    authCheck.error = e instanceof Error ? e.message : 'Unknown error'
    logger.error('Auth check failed in health endpoint', { error: e })
  }

  // Test share token generation
  const shareTokenCheck = {
    nanoid_available: false,
    token_generation: false,
    sample_token: null as string | null
  }

  try {
    shareTokenCheck.nanoid_available = true
    const testToken = nanoid(32)
    shareTokenCheck.token_generation = true
    shareTokenCheck.sample_token = `${testToken.substring(0, 8)}...${testToken.substring(24)}`
  } catch (e) {
    logger.error('Share token check failed in health endpoint', { error: e })
  }
  
  // Build comprehensive response
  const response = {
    status: 'ok',
    healthCheckId,
    timestamp: new Date().toISOString(),
    deployment: {
      node_version: process.version,
      node_env: process.env.NODE_ENV,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    },
    checks: {
      environment: envCheck,
      supabase: supabaseCheck,
      authentication: authCheck,
      shareToken: shareTokenCheck
    },
    execution_time: `${Date.now() - startTime}ms`,
    recommendations: [] as string[]
  }

  // Add recommendations based on checks
  if (!supabaseCheck.admin_client_created) {
    response.recommendations.push('Configure SUPABASE_SERVICE_ROLE_KEY for admin operations')
  }

  if (!supabaseCheck.admin_privileged_ok && supabaseCheck.admin_client_created) {
    response.recommendations.push('Admin client may lack proper privileges - check service role configuration')
  }

  if (!supabaseCheck.anon_rls_denied) {
    response.recommendations.push('RLS policies may not be properly configured - anon users can access protected tables')
  }

  if (!authCheck.mock_auth_test && process.env.NODE_ENV === 'development') {
    response.recommendations.push('Consider enabling ENABLE_DEV_AUTH=true for development')
  }

  if (!envCheck.NEXT_PUBLIC_SITE_URL || !envCheck.NEXT_PUBLIC_APP_URL) {
    response.recommendations.push('Configure NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL for share links')
  }

  // Determine overall health status
  let overallStatus = 'healthy'
  const criticalErrors = []

  // Critical checks
  if (!envCheck.NEXT_PUBLIC_SUPABASE_URL.exists) {
    criticalErrors.push('NEXT_PUBLIC_SUPABASE_URL is missing')
    overallStatus = 'critical'
  }

  if (!envCheck.NEXT_PUBLIC_SUPABASE_ANON_KEY.exists) {
    criticalErrors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
    overallStatus = 'critical'
  }

  if (!supabaseCheck.client_created) {
    criticalErrors.push('Cannot create Supabase client')
    overallStatus = 'critical'
  }

  if (!supabaseCheck.connection_healthy && overallStatus !== 'critical') {
    overallStatus = 'degraded'
  }

  // Update status
  response.status = overallStatus

  // Log health check completion
  logger.info('Health check completed', {
    healthCheckId,
    status: overallStatus,
    duration: Date.now() - startTime,
    criticalErrors
  })

  // Return appropriate status code
  if (overallStatus === 'critical') {
    return NextResponse.json({
      ...response,
      critical_errors: criticalErrors
    }, { status: 500 })
  }

  if (overallStatus === 'degraded') {
    return NextResponse.json(response, { status: 503 })
  }

  return NextResponse.json(response, { status: 200 })
}