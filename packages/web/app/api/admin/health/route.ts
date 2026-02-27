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
    const { error } = await supabase.from('courses').select('id').limit(1)

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
  } catch (_error) {
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
 *
 * Two-tier strategy:
 * 1. GET /health — available via nginx proxy in production/dev
 * 2. POST to MCP endpoint — fallback for local dev without nginx;
 *    handles SSE (text/event-stream) responses from Streamable HTTP transport
 */
async function checkDoclingMcp(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  const mcpUrl = process.env.DOCLING_MCP_URL || 'http://docling-mcp:8000/mcp'
  const fallbackMcpUrl = 'http://localhost:8000/mcp'

  // Derive /health URL from MCP URL (replace /mcp path with /health)
  const deriveHealthUrl = (url: string) => url.replace(/\/mcp$/, '/health')

  // --- Tier 1: Try /health endpoint (nginx proxy provides this in production) ---
  try {
    const healthResponse = await fetchWithTimeout(deriveHealthUrl(mcpUrl), { method: 'GET' })

    if (healthResponse.ok) {
      return {
        name: 'Docling MCP',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        lastCheck,
      }
    }
  } catch {
    // /health not available (e.g., local dev without nginx proxy) — continue to Tier 2
  }

  // --- Tier 2: POST to MCP endpoint with SSE-aware response handling ---
  try {
    let response: Response | null = null

    const mcpRequest = { jsonrpc: '2.0', method: 'tools/list', id: 1 }
    const mcpHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }

    try {
      response = await fetchWithTimeout(mcpUrl, {
        method: 'POST',
        headers: mcpHeaders,
        body: JSON.stringify(mcpRequest),
      })
    } catch {
      response = await fetchWithTimeout(fallbackMcpUrl, {
        method: 'POST',
        headers: mcpHeaders,
        body: JSON.stringify(mcpRequest),
      })
    }

    const responseTime = Date.now() - startTime
    const contentType = response.headers.get('content-type') || ''

    // SSE response = MCP Streamable HTTP transport is working correctly
    if (contentType.includes('text/event-stream')) {
      return {
        name: 'Docling MCP',
        status: 'healthy',
        responseTime,
        message: 'MCP streaming transport active',
        lastCheck,
      }
    }

    // Try to parse JSON-RPC response
    try {
      const data = await response.json()

      if (data.jsonrpc === '2.0' && (data.result !== undefined || data.error !== undefined)) {
        const toolCount = data.result?.tools?.length
        return {
          name: 'Docling MCP',
          status: 'healthy',
          responseTime,
          message:
            toolCount !== undefined
              ? `${toolCount} tool(s) available`
              : `MCP responding: ${data.error?.message || 'OK'}`,
          lastCheck,
        }
      }
    } catch {
      // JSON parse failed — but server responded
    }

    // Server responded with unexpected format but is reachable
    if (response.ok || response.status === 400 || response.status === 405) {
      return {
        name: 'Docling MCP',
        status: 'healthy',
        responseTime,
        message: `MCP server responding (HTTP ${response.status})`,
        lastCheck,
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
 * Check Worker Readiness
 * Verifies that the BullMQ worker is ready to process jobs
 * (uploads directory accessible, pre-flight checks passed)
 */
async function checkWorkerReadiness(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  const internalUrl = 'http://api:4000/readiness'
  const publicUrl = `${ENV.COURSEGEN_BACKEND_URL}/readiness`

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

      if (data.data?.ready === true) {
        return {
          name: 'Worker',
          status: 'healthy',
          responseTime,
          message: 'Worker ready, uploads accessible',
          lastCheck,
        }
      }

      // Worker not ready yet
      const failedChecks = data.data?.checks?.filter((c: { passed: boolean }) => !c.passed) || []
      return {
        name: 'Worker',
        status: 'degraded',
        responseTime,
        message:
          failedChecks.length > 0
            ? `Pre-flight checks failed: ${failedChecks.map((c: { name: string }) => c.name).join(', ')}`
            : 'Worker not ready',
        lastCheck,
      }
    }

    // 503 means worker is not ready
    if (response.status === 503) {
      return {
        name: 'Worker',
        status: 'degraded',
        responseTime,
        message: 'Worker not ready (pre-flight checks pending)',
        lastCheck,
      }
    }

    return {
      name: 'Worker',
      status: 'error',
      responseTime,
      message: `HTTP ${response.status}: ${response.statusText}`,
      lastCheck,
    }
  } catch (error) {
    return {
      name: 'Worker',
      status: 'error',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastCheck,
    }
  }
}

/**
 * Check Stage 7 Worker Readiness
 * Verifies that the Stage 7 enrichment worker is ready to process jobs
 */
async function checkWorkerStage7Readiness(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  const internalUrl = 'http://api:4000/readiness/stage7'
  const publicUrl = `${ENV.COURSEGEN_BACKEND_URL}/readiness/stage7`

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

      if (data.data?.ready === true) {
        return {
          name: 'Worker Stage 7',
          status: 'healthy',
          responseTime,
          message: 'Enrichment worker ready',
          lastCheck,
        }
      }

      return {
        name: 'Worker Stage 7',
        status: 'degraded',
        responseTime,
        message: 'Worker not ready',
        lastCheck,
      }
    }

    // 503 means worker is not ready
    if (response.status === 503) {
      return {
        name: 'Worker Stage 7',
        status: 'degraded',
        responseTime,
        message: 'Worker not ready (starting or stopped)',
        lastCheck,
      }
    }

    return {
      name: 'Worker Stage 7',
      status: 'error',
      responseTime,
      message: `HTTP ${response.status}: ${response.statusText}`,
      lastCheck,
    }
  } catch (error) {
    return {
      name: 'Worker Stage 7',
      status: 'error',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastCheck,
    }
  }
}

/**
 * Check Telegram Bot connectivity
 * Verifies the bot is accessible and webhook is configured
 */
async function checkTelegramBot(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!botToken) {
    return {
      name: 'Telegram Bot',
      status: 'unknown',
      responseTime: 0,
      message: 'TELEGRAM_BOT_TOKEN not configured',
      lastCheck,
    }
  }

  try {
    // Check bot info and webhook status in parallel
    const [botResponse, webhookResponse] = await Promise.all([
      fetchWithTimeout(`https://api.telegram.org/bot${botToken}/getMe`),
      fetchWithTimeout(`https://api.telegram.org/bot${botToken}/getWebhookInfo`),
    ])

    const responseTime = Date.now() - startTime

    if (!botResponse.ok) {
      return {
        name: 'Telegram Bot',
        status: 'error',
        responseTime,
        message: `Bot API error: HTTP ${botResponse.status}`,
        lastCheck,
      }
    }

    const botData = await botResponse.json()
    const webhookData = await webhookResponse.json()

    if (!botData.ok) {
      return {
        name: 'Telegram Bot',
        status: 'error',
        responseTime,
        message: botData.description || 'Bot not accessible',
        lastCheck,
      }
    }

    const botUsername = botData.result?.username
    const webhookUrl = webhookData.result?.url
    const pendingUpdates = webhookData.result?.pending_update_count || 0
    const lastError = webhookData.result?.last_error_message

    // Check webhook configuration
    if (!webhookUrl) {
      return {
        name: 'Telegram Bot',
        status: 'degraded',
        responseTime,
        message: `@${botUsername}: webhook not configured`,
        lastCheck,
      }
    }

    // Check for recent errors
    if (lastError) {
      return {
        name: 'Telegram Bot',
        status: 'degraded',
        responseTime,
        message: `@${botUsername}: ${lastError}`,
        lastCheck,
      }
    }

    return {
      name: 'Telegram Bot',
      status: 'healthy',
      responseTime,
      message: `@${botUsername}, pending: ${pendingUpdates}`,
      lastCheck,
    }
  } catch (error) {
    return {
      name: 'Telegram Bot',
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
 * Check NotebookLM Bridge health
 * Verifies the bridge service is running, auth is configured, and proxy is active
 */
async function checkNotebookLMBridge(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  // Try Stage, Dev, and local URLs in order.
  // First reachable bridge is authoritative — if it returns non-OK,
  // that's a real issue, not a reason to try the next URL.
  const urls = [
    'http://notebooklm-bridge:8000/health',
    'http://notebooklm-bridge-dev:8000/health',
    'http://localhost:8010/health',
  ]

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      const response = await fetchWithTimeout(url, {}, 3000)
      const responseTime = Date.now() - startTime

      if (i > 0) {
        logger.info('NotebookLM Bridge health: responded via fallback URL', { url, attempt: i + 1 })
      }

      if (response.ok) {
        const data = await response.json()
        const checks: { name: string; passed: boolean; message?: string }[] = data.checks || []
        const failedChecks = checks.filter((c) => !c.passed)
        const activeTasks: number = data.active_tasks ?? 0

        // Derive proxy status from checks array
        const proxyCheck = checks.find((c) => c.name === 'proxy')
        const proxyActive = proxyCheck?.passed ?? false

        // Determine status based on checks
        let status: 'healthy' | 'degraded' | 'error' = 'healthy'
        const messageParts: string[] = []

        if (failedChecks.length > 0) {
          status = 'degraded'
          messageParts.push(failedChecks.map((c) => c.message || c.name).join('; '))
        }

        if (proxyActive) {
          messageParts.push('SOCKS proxy active')
        }
        if (activeTasks > 0) {
          messageParts.push(`${activeTasks} active task(s)`)
        }
        if (messageParts.length === 0) {
          messageParts.push(`Mode: ${data.mode || 'unknown'}`)
        }

        return {
          name: 'NotebookLM Bridge',
          status,
          responseTime,
          message: messageParts.join(' | '),
          lastCheck,
        }
      }

      // Reachable but unhealthy — authoritative result, don't try other URLs
      return {
        name: 'NotebookLM Bridge',
        status: 'degraded',
        responseTime,
        message: `HTTP ${response.status}: ${response.statusText}`,
        lastCheck,
      }
    } catch {
      // Network-level failure — try next URL
      continue
    }
  }

  return {
    name: 'NotebookLM Bridge',
    status: 'error',
    responseTime: Date.now() - startTime,
    message: 'Connection failed (all URLs)',
    lastCheck,
  }
}

/**
 * Check Mermaid Pipeline health via API Server
 * Verifies the regex sanitizer, validator, and full pipeline orchestration
 */
async function checkMermaidPipeline(): Promise<ServiceStatus> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  const internalUrl = 'http://api:4000/health/mermaid'
  const publicUrl = `${ENV.COURSEGEN_BACKEND_URL}/health/mermaid`

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
      const checksCount = data.data?.checks?.length ?? 0
      const passedCount =
        data.data?.checks?.filter((c: { passed: boolean }) => c.passed).length ?? 0

      return {
        name: 'Mermaid Pipeline',
        status: data.data?.status === 'healthy' ? 'healthy' : 'degraded',
        responseTime,
        message: `${passedCount}/${checksCount} checks passed`,
        lastCheck,
      }
    }

    return {
      name: 'Mermaid Pipeline',
      status: 'degraded',
      responseTime,
      message: `HTTP ${response.status}: ${response.statusText}`,
      lastCheck,
    }
  } catch (error) {
    return {
      name: 'Mermaid Pipeline',
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
 * - NotebookLM Bridge (audio/video generation)
 * - Mermaid Pipeline (diagram syntax fixer)
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<HealthResponse | { error: string }>> {
  const startTime = Date.now()

  // Authenticate and authorize
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized health check attempt', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      })
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Check user role
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()

    const role = profile?.role
    if (role !== 'admin' && role !== 'superadmin') {
      logger.warn('Forbidden health check attempt', {
        userId: user.id,
        role,
      })
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Run all health checks in parallel
    const [
      supabaseStatus,
      apiServerStatus,
      redisStatus,
      doclingStatus,
      qdrantStatus,
      workerStatus,
      workerStage7Status,
      notebookLMBridgeStatus,
      telegramStatus,
      mermaidPipelineStatus,
    ] = await Promise.allSettled([
      checkSupabase(),
      checkApiServer(),
      checkRedis(),
      checkDoclingMcp(),
      checkQdrant(),
      checkWorkerReadiness(),
      checkWorkerStage7Readiness(),
      checkNotebookLMBridge(),
      checkTelegramBot(),
      checkMermaidPipeline(),
    ])

    // Extract results, handling rejected promises
    const services: ServiceStatus[] = [
      supabaseStatus.status === 'fulfilled'
        ? supabaseStatus.value
        : {
            name: 'Supabase',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
      apiServerStatus.status === 'fulfilled'
        ? apiServerStatus.value
        : {
            name: 'API Server',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
      redisStatus.status === 'fulfilled'
        ? redisStatus.value
        : {
            name: 'Redis',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
      doclingStatus.status === 'fulfilled'
        ? doclingStatus.value
        : {
            name: 'Docling MCP',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
      qdrantStatus.status === 'fulfilled'
        ? qdrantStatus.value
        : {
            name: 'Qdrant',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
      workerStatus.status === 'fulfilled'
        ? workerStatus.value
        : {
            name: 'Worker',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
      workerStage7Status.status === 'fulfilled'
        ? workerStage7Status.value
        : {
            name: 'Worker Stage 7',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
      notebookLMBridgeStatus.status === 'fulfilled'
        ? notebookLMBridgeStatus.value
        : {
            name: 'NotebookLM Bridge',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
      telegramStatus.status === 'fulfilled'
        ? telegramStatus.value
        : {
            name: 'Telegram Bot',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
      mermaidPipelineStatus.status === 'fulfilled'
        ? mermaidPipelineStatus.value
        : {
            name: 'Mermaid Pipeline',
            status: 'error' as const,
            responseTime: 0,
            message: 'Check failed',
            lastCheck: new Date().toISOString(),
          },
    ]

    // Determine overall status
    const hasError = services.some((s) => s.status === 'error')
    const hasDegraded = services.some((s) => s.status === 'degraded')
    const hasUnknown = services.some((s) => s.status === 'unknown')

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
      services: services.map((s) => ({ name: s.name, status: s.status })),
    })

    // Always return 200, status is in the body
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    logger.error('Admin health check failed', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
