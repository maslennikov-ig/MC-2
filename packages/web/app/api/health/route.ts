import { NextResponse } from 'next/server'

/**
 * Public health check endpoint - minimal response only.
 * Detailed infrastructure checks are available at /api/admin/health (authenticated).
 *
 * Returns 503 if heap usage exceeds 90% AND process has been running for >60s.
 * During cold start V8 allocates a small initial heap, making the ratio
 * unreliable (can be >90% with only 5MB used). Grace period avoids false 503s
 * that break Blue/Green deploy verification.
 *
 * Security: This endpoint is unauthenticated. Do NOT expose Node.js version,
 * memory usage values, environment variables, Supabase connectivity, or any
 * other infrastructure details here.
 */

const START_TIME = Date.now()
const STARTUP_GRACE_MS = 60_000

export function GET() {
  const memory = process.memoryUsage()
  const uptimeMs = Date.now() - START_TIME
  const heapRatio = memory.heapUsed / memory.heapTotal
  const healthy = uptimeMs < STARTUP_GRACE_MS || heapRatio < 0.9

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  )
}
