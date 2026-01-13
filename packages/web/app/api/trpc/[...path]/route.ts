/**
 * tRPC Proxy Route Handler
 * @module api/trpc/[...path]
 *
 * Proxies tRPC requests to the course-gen-platform backend.
 * Used by useAutoCard hook and other direct tRPC calls.
 *
 * Routes:
 * - GET /api/trpc/[procedure] -> GET backend/trpc/[procedure]
 * - POST /api/trpc/[procedure] -> POST backend/trpc/[procedure]
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger, logPermanentFailure } from '@/lib/logger'

const BACKEND_URL = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456'

/**
 * Proxy GET requests to tRPC backend
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path, 'GET')
}

/**
 * Proxy POST requests to tRPC backend
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path, 'POST')
}

/**
 * Common proxy logic for GET and POST requests
 */
async function proxyRequest(
  request: NextRequest,
  path: string[],
  method: 'GET' | 'POST'
): Promise<NextResponse> {
  const procedure = path.join('/')

  try {
    // Get auth token from Supabase session
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const accessToken = session?.access_token

    // Build target URL
    const targetUrl = new URL(`${BACKEND_URL}/trpc/${procedure}`)

    // Copy query params for GET requests
    if (method === 'GET') {
      const { searchParams } = new URL(request.url)
      searchParams.forEach((value, key) => {
        targetUrl.searchParams.set(key, value)
      })
    }

    // Prepare headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    // Add body for POST requests
    if (method === 'POST') {
      try {
        const body = await request.text()
        if (body) {
          fetchOptions.body = body
        }
      } catch {
        // No body - that's fine for some requests
      }
    }

    // Forward request to backend
    const response = await fetch(targetUrl.toString(), fetchOptions)

    // Get response data
    const data = await response.json().catch(() => null)

    // Log errors for debugging
    if (!response.ok) {
      logger.warn(`tRPC proxy request failed: ${procedure} - status ${response.status}`)
    }

    // Return proxied response
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    logger.error(
      `tRPC proxy error: ${procedure} - ${error instanceof Error ? error.message : 'Unknown error'}`
    )

    // Log to error_logs for admin visibility
    logPermanentFailure({
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : null,
      severity: 'ERROR',
      job_type: 'TRPC_PROXY',
      metadata: {
        route: '/api/trpc/[...path]',
        procedure,
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch(() => {})

    return NextResponse.json(
      {
        error: {
          message: 'Internal proxy error',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    )
  }
}
