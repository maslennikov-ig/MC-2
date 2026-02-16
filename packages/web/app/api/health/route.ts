import { NextResponse } from 'next/server'

/**
 * Public health check endpoint - minimal response only.
 * Detailed infrastructure checks are available at /api/admin/health (authenticated).
 *
 * Returns 503 if heap usage exceeds 90% (signals LB to stop routing traffic).
 *
 * Security: This endpoint is unauthenticated. Do NOT expose Node.js version,
 * memory usage values, environment variables, Supabase connectivity, or any
 * other infrastructure details here.
 */
export function GET() {
  const memory = process.memoryUsage()
  const healthy = memory.heapUsed / memory.heapTotal < 0.9

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  )
}
