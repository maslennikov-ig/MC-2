/**
 * POST /api/courses/[slug]/restart-stage
 *
 * Restarts course generation from a specific stage.
 * Proxies to tRPC generation.restartStage endpoint.
 *
 * @module api/courses/[slug]/restart-stage
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

interface RestartStageInput {
  stageNumber: number;
}

/**
 * POST handler for stage restart
 *
 * Input:
 * - stageNumber: Stage to restart from (2-6)
 *
 * Output:
 * - success: boolean
 * - jobId?: string
 * - previousStatus?: string
 * - newStatus?: string
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('Unauthorized access attempt to restart-stage', {
        error: authError?.message,
        slug,
      });
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Get course by slug to get courseId
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', slug)
      .eq('user_id', user.id)
      .single();

    if (courseError || !course) {
      logger.warn('Course not found for restart-stage', {
        slug,
        userId: user.id,
        error: courseError?.message,
      });
      return NextResponse.json(
        { error: 'Course not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Parse request body
    let body: RestartStageInput;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    // Validate stageNumber
    const { stageNumber } = body;
    if (typeof stageNumber !== 'number' || stageNumber < 2 || stageNumber > 6) {
      return NextResponse.json(
        { error: 'Invalid stage number. Must be between 2 and 6.', code: 'INVALID_STAGE' },
        { status: 400 }
      );
    }

    logger.info('Proxying restart-stage request to tRPC', {
      userId: user.id,
      courseId: course.id,
      stageNumber,
    });

    // Get auth token for tRPC request
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No valid session', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Call tRPC endpoint
    const backendUrl = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456';
    const tRPCUrl = `${backendUrl}/trpc`;

    const tRPCResponse = await fetch(`${tRPCUrl}/generation.restartStage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        courseId: course.id,
        stageNumber,
      }),
    });

    const data = await tRPCResponse.json();

    if (!tRPCResponse.ok) {
      logger.error('tRPC generation.restartStage failed', {
        userId: user.id,
        courseId: course.id,
        stageNumber,
        status: tRPCResponse.status,
        error: data,
      });

      // Map tRPC error codes to HTTP status codes
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        BAD_REQUEST: 400,
        TOO_MANY_REQUESTS: 429,
      };

      const httpStatus = statusMap[data.error?.data?.code] || tRPCResponse.status;
      return NextResponse.json(
        {
          error: data.error?.message || 'Failed to restart stage',
          code: data.error?.data?.code || 'INTERNAL_ERROR',
        },
        { status: httpStatus }
      );
    }

    logger.info('Stage restart initiated successfully', {
      userId: user.id,
      courseId: course.id,
      stageNumber,
      previousStatus: data.result?.data?.previousStatus,
      newStatus: data.result?.data?.newStatus,
    });

    // Return tRPC result data
    return NextResponse.json({
      success: true,
      ...data.result?.data,
    });
  } catch (error) {
    logger.error('Unexpected error in restart-stage', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
