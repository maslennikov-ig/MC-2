/**
 * GET /api/coursegen/job-status?jobId=<id>
 *
 * Thin proxy to tRPC jobs.getStatus endpoint.
 * Returns the status of a generation job.
 *
 * @module api/coursegen/job-status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * GET handler for job status query
 *
 * Query params:
 * - jobId: BullMQ job ID (required)
 */
export async function GET(request: NextRequest) {
  try {
    // Secure auth check using getUser() to verify with Supabase Auth server
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Requires authorization', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Get session for access token (needed for tRPC call)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json(
        { error: 'Session expired', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const accessToken = session.access_token;
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    // Call tRPC endpoint
    const backendUrl = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456';
    const tRPCUrl = `${backendUrl}/trpc`;
    const response = await fetch(
      `${tRPCUrl}/jobs.getStatus?input=${encodeURIComponent(JSON.stringify({ jobId }))}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      logger.error('tRPC jobs.getStatus failed', {
        userId: session.user.id,
        jobId,
        status: response.status,
        error: data,
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('Unexpected error in /api/coursegen/job-status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
