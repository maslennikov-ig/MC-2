import { NextResponse } from 'next/server'
import { fetchWithFallback, API_URLS, API_TIMEOUTS } from '@/lib/api-fetch-utils'
import { createApiLogger } from '@/lib/logger'
import {
  WorkerReadinessBackendSchema,
  type WorkerReadinessResponse,
} from '@/lib/schemas/worker-readiness'

const logger = createApiLogger('/api/worker/readiness')

export const runtime = 'nodejs'

/**
 * GET /api/worker/readiness
 *
 * Proxies the worker readiness check from the course-gen-platform backend.
 * This endpoint is used by the frontend to check if the worker is ready
 * to accept course generation jobs before enabling the submit button.
 *
 * Returns:
 * - 200: Worker is ready
 * - 503: Worker is not ready (backend returns 503)
 * - 502: Backend is unavailable
 */
export async function GET(): Promise<NextResponse<WorkerReadinessResponse>> {
  try {
    const { response } = await fetchWithFallback({
      internalUrl: API_URLS.readiness.internal,
      publicUrl: API_URLS.readiness.public,
      method: 'GET',
      cache: 'no-store',
      timeout: API_TIMEOUTS.READINESS,
    })

    if (response.ok) {
      const rawData = await response.json()

      // Validate response with Zod
      const parseResult = WorkerReadinessBackendSchema.safeParse(rawData)

      if (!parseResult.success) {
        logger.error('Invalid worker readiness response', { issues: parseResult.error.issues })
        return NextResponse.json(
          {
            ready: false,
            message: 'Invalid response from worker service',
          },
          { status: 502 }
        )
      }

      const data = parseResult.data

      return NextResponse.json({
        ready: data.data?.ready ?? false, // Default to false (safer than assuming ready)
        message: data.data?.ready ? 'Worker ready' : 'Worker not ready',
        checks: data.data?.checks,
      })
    }

    // 503 means worker is not ready
    if (response.status === 503) {
      const data = await response.json().catch(() => ({}))
      return NextResponse.json(
        {
          ready: false,
          message: data.error || 'Worker not ready (pre-flight checks pending)',
          checks: data.data?.checks,
        },
        { status: 503 }
      )
    }

    // Other error statuses
    return NextResponse.json(
      {
        ready: false,
        message: `Backend returned ${response.status}: ${response.statusText}`,
      },
      { status: 502 }
    )
  } catch (error) {
    // Connection error or timeout
    const message = error instanceof Error
      ? error.name === 'AbortError'
        ? 'Backend connection timeout'
        : error.message
      : 'Backend connection failed'

    return NextResponse.json(
      {
        ready: false,
        message,
      },
      { status: 502 }
    )
  }
}
