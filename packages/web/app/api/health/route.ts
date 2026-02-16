import { NextResponse } from 'next/server'

/**
 * Public health check endpoint - minimal response only.
 * Detailed infrastructure checks are available at /api/admin/health (authenticated).
 *
 * Security: This endpoint is unauthenticated. Do NOT expose Node.js version,
 * memory usage, environment variables, Supabase connectivity, or any other
 * infrastructure details here.
 */
export function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}
