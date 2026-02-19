import { NextResponse } from 'next/server'

/**
 * Public health check endpoint - minimal response only.
 * Detailed infrastructure checks are available at /api/admin/health (authenticated).
 *
 * Degraded (503) when BOTH conditions are true:
 *   1. RSS exceeds 512 MB (absolute memory pressure)
 *   2. Heap ratio > 90% (V8 cannot reclaim memory)
 *
 * Previous logic used heap ratio alone, but V8 in Next.js standalone keeps
 * heapTotal close to heapUsed (compact GC), so ratio is routinely >90%
 * even at 5-10 MB used. The absolute RSS threshold prevents false 503s.
 *
 * Security: This endpoint is unauthenticated. Do NOT expose Node.js version,
 * memory usage values, environment variables, Supabase connectivity, or any
 * other infrastructure details here.
 */

const RSS_THRESHOLD_BYTES = 512 * 1024 * 1024 // 512 MB

export function GET() {
  const memory = process.memoryUsage()
  const heapRatio = memory.heapUsed / memory.heapTotal
  const healthy = memory.rss < RSS_THRESHOLD_BYTES || heapRatio < 0.9

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  )
}
