import { NextResponse, NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ENV } from '@/lib/env'

export const runtime = 'nodejs'

// Service check timeout in milliseconds
const SERVICE_TIMEOUT = 5000

interface ServiceStatus {
  name: string
  status: 'healthy' | 'degraded' | 'error' | 'unknown'
  responseTime: number
  message?: string
  lastCheck: string
}

interface HealthResponse {
  overall: 'healthy' | 'degraded' | 'error'
  services: ServiceStatus[]
  timestamp: string
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = SERVICE_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Check Supabase database connection
 */
async function checkSupabase(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  try {
    const supabase = await createAdminClient()

    // Simple query to verify connection
    const { error } = await supabase
      .from('courses')
      .select('id')
      .limit(1)

    const responseTime = Date.now() - startTime

    if (error && error.code !== 'PGRST116') {
      return {
        name: 'Supabase',
        status: 'error',
        responseTime,
        message: error.message,
        lastCheck,
      }
    }

    return {
      name: 'Supabase',
      status: 'healthy',
      responseTime,
      lastCheck,
    }
  } catch (error) {
    return {
      name: 'Supabase',
      status: 'error',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastCheck,
    }
  }
}

/**
 * Check API Server health
 * Uses internal Docker network URL when available, falls back to public URL
 */
async function checkApiServer(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  // Try internal Docker URL first, then fall back to public URL
  const internalUrl = 'http://api:4000/health'
  const publicUrl = `${ENV.COURSEGEN_BACKEND_URL}/health`

  try {
    // Try internal URL first (Docker network)
    let response: Response | null = null
    let usedUrl = internalUrl

    try {
      response = await fetchWithTimeout(internalUrl)
    } catch {
      // Internal URL failed, try public URL
      usedUrl = publicUrl
      response = await fetchWithTimeout(publicUrl)
    }

    const responseTime = Date.now() - startTime

    if (response.ok) {
      return {
        name: 'API Server',
        status: 'healthy',
        responseTime,
        message: `Connected via ${usedUrl.includes('api:4000') ? 'internal' : 'external'} URL`,
        lastCheck,
      }
    }

    return {
      name: 'API Server',
      status: 'degraded',
      responseTime,
      message: `HTTP ${response.status}: ${response.statusText}`,
      lastCheck,
    }
  } catch (error) {
    return {
      name: 'API Server',
      status: 'error',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastCheck,
    }
  }
}

/**
 * Check Redis via API Server health endpoint
 * The API server's /health endpoint includes Redis status
 */
async function checkRedis(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  const internalUrl = 'http://api:4000/health'
  const publicUrl = `${ENV.COURSEGEN_BACKEND_URL}/health`

  try {
    let response: Response | null = null

    try {
      response = await fetchWithTimeout(internalUrl)
    } catch {
      response = await fetchWithTimeout(publicUrl)
    }

    const responseTime = Date.now() - startTime

    if (response.ok) {
      const data = await response.json()

      // Check if Redis status is included in API health response
      if (data.redis) {
        return {
          name: 'Redis',
          status: data.redis.connected ? 'healthy' : 'error',
          responseTime,
          message: data.redis.connected ? 'Connected' : 'Not connected',
          lastCheck,
        }
      }

      // If no Redis info in response, assume healthy if API is healthy
      return {
        name: 'Redis',
        status: 'healthy',
        responseTime,
        message: 'Inferred from API Server health',
        lastCheck,
      }
    }

    return {
      name: 'Redis',
      status: 'unknown',
      responseTime,
      message: 'Could not determine Redis status',
      lastCheck,
    }
  } catch (error) {
    return {
      name: 'Redis',
      status: 'unknown',
      responseTime: Date.now() - startTime,
      message: 'API Server unavailable, cannot check Redis',
      lastCheck,
    }
  }
}

/**
 * Check Docling MCP document processing service
 * Uses tools/list method which is standard MCP protocol
 */
async function checkDoclingMcp(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  // Try internal Docker URL first
  const internalUrl = process.env.DOCLING_MCP_URL || 'http://docling-mcp:8000/mcp'
  const fallbackUrl = 'http://localhost:8000/mcp'

  try {
    let response: Response | null = null
    let usedUrl = internalUrl

    // Use tools/list - standard MCP method that should always be available
    const mcpRequest = { jsonrpc: '2.0', method: 'tools/list', id: 1 }

    try {
      response = await fetchWithTimeout(internalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mcpRequest),
      })
    } catch {
      // Try fallback URL
      usedUrl = fallbackUrl
      response = await fetchWithTimeout(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mcpRequest),
      })
    }

    const responseTime = Date.now() - startTime

    // Check if we got a valid JSON-RPC response
    if (response.ok) {
      try {
        const data = await response.json()
        // Valid JSON-RPC response has either result or error
        if (data.jsonrpc === '2.0' && (data.result !== undefined || data.error !== undefined)) {
          // Even if method returns error, service is responding correctly
          const toolCount = data.result?.tools?.length
          return {
            name: 'Docling MCP',
            status: 'healthy',
            responseTime,
            message: toolCount !== undefined
              ? `${toolCount} tool(s) available`
              : `Service responding at ${usedUrl.includes('docling-mcp:8000') ? 'internal' : 'external'} URL`,
            lastCheck,
          }
        }
      } catch {
        // JSON parse failed but HTTP was OK - service is partially working
        return {
          name: 'Docling MCP',
          status: 'degraded',
          responseTime,
          message: 'Invalid JSON-RPC response',
          lastCheck,
        }
      }
    }

    return {
      name: 'Docling MCP',
      status: 'degraded',
      responseTime,
      message: `HTTP ${response.status}: ${response.statusText}`,
      lastCheck,
    }
  } catch (error) {
    return {
      name: 'Docling MCP',
      status: 'error',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastCheck,
    }
  }
}

/**
 * Check Qdrant vector database
 */
async function checkQdrant(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  const qdrantUrl = process.env.QDRANT_URL
  const qdrantApiKey = process.env.QDRANT_API_KEY

  if (!qdrantUrl) {
    return {
      name: 'Qdrant',
      status: 'unknown',
      responseTime: 0,
      message: 'QDRANT_URL not configured',
      lastCheck,
    }
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (qdrantApiKey) {
      headers['api-key'] = qdrantApiKey
    }

    // Get collections list to verify connection
    const response = await fetchWithTimeout(`${qdrantUrl}/collections`, {
      method: 'GET',
      headers,
    })

    const responseTime = Date.now() - startTime

    if (response.ok) {
      const data = await response.json()
      const collectionCount = data.result?.collections?.length ?? 0

      return {
        name: 'Qdrant',
        status: 'healthy',
        responseTime,
        message: `Connected, ${collectionCount} collection(s)`,
        lastCheck,
      }
    }

    return {
      name: 'Qdrant',
      status: 'error',
      responseTime,
      message: `HTTP ${response.status}: ${response.statusText}`,
      lastCheck,
    }
  } catch (error) {
    return {
      name: 'Qdrant',
      status: 'error',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastCheck,
    }
  }
}

/**
 * Admin Health Check API
 *
 * Checks the health of all system components:
 * - Supabase (database)
 * - API Server
 * - Redis (via API Server)
 * - Docling MCP (document processing)
 * - Qdrant (vector database)
 */
export async function GET(request: NextRequest): Promise<NextResponse<HealthResponse | { error: string }>> {
  const startTime = Date.now()

  // Authenticate and authorize
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized health check attempt', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      })
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check user role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role
    if (role !== 'admin' && role !== 'superadmin') {
      logger.warn('Forbidden health check attempt', {
        userId: user.id,
        role
      })
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Run all health checks in parallel
    const [
      supabaseStatus,
      apiServerStatus,
      redisStatus,
      doclingStatus,
      qdrantStatus,
    ] = await Promise.allSettled([
      checkSupabase(),
      checkApiServer(),
      checkRedis(),
      checkDoclingMcp(),
      checkQdrant(),
    ])

    // Extract results, handling rejected promises
    const services: ServiceStatus[] = [
      supabaseStatus.status === 'fulfilled'
        ? supabaseStatus.value
        : { name: 'Supabase', status: 'error' as const, responseTime: 0, message: 'Check failed', lastCheck: new Date().toISOString() },
      apiServerStatus.status === 'fulfilled'
        ? apiServerStatus.value
        : { name: 'API Server', status: 'error' as const, responseTime: 0, message: 'Check failed', lastCheck: new Date().toISOString() },
      redisStatus.status === 'fulfilled'
        ? redisStatus.value
        : { name: 'Redis', status: 'error' as const, responseTime: 0, message: 'Check failed', lastCheck: new Date().toISOString() },
      doclingStatus.status === 'fulfilled'
        ? doclingStatus.value
        : { name: 'Docling MCP', status: 'error' as const, responseTime: 0, message: 'Check failed', lastCheck: new Date().toISOString() },
      qdrantStatus.status === 'fulfilled'
        ? qdrantStatus.value
        : { name: 'Qdrant', status: 'error' as const, responseTime: 0, message: 'Check failed', lastCheck: new Date().toISOString() },
    ]

    // Determine overall status
    const hasError = services.some(s => s.status === 'error')
    const hasDegraded = services.some(s => s.status === 'degraded')
    const hasUnknown = services.some(s => s.status === 'unknown')

    let overall: 'healthy' | 'degraded' | 'error' = 'healthy'
    if (hasError) {
      overall = 'error'
    } else if (hasDegraded || hasUnknown) {
      overall = 'degraded'
    }

    const response: HealthResponse = {
      overall,
      services,
      timestamp: new Date().toISOString(),
    }

    logger.info('Admin health check completed', {
      overall,
      duration: Date.now() - startTime,
      userId: user.id,
      services: services.map(s => ({ name: s.name, status: s.status })),
    })

    // Always return 200, status is in the body
    return NextResponse.json(response)
  } catch (error) {
    logger.error('Admin health check failed', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
