/**
 * POST /api/coursegen/partial-generate
 *
 * Thin proxy to tRPC lessonContent.partialGenerate endpoint.
 * Enables partial generation of specific lessons or sections.
 *
 * This endpoint serves as a compatibility layer for existing API consumers.
 * New integrations should use the tRPC endpoint directly for type safety.
 *
 * @module api/coursegen/partial-generate
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

interface PartialGenerateRequest {
  courseId: string; // Course UUID
  lessonIds?: string[]; // ["1.1", "1.2", "2.1"]
  sectionIds?: number[]; // [1, 2, 3]
  priority?: number; // 1-10, default 5
}

/**
 * POST handler for partial course generation
 *
 * This is a thin proxy that:
 * 1. Validates authentication
 * 2. Validates required parameters (courseId + lessonIds/sectionIds)
 * 3. Proxies request to tRPC lessonContent.partialGenerate
 * 4. Returns formatted response
 */
export async function POST(request: NextRequest) {
  try {
    // Minimal auth check
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      logger.warn('Unauthorized access attempt to /api/coursegen/partial-generate', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      });
      return NextResponse.json(
        { error: 'Требуется авторизация', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const user = session.user;
    const accessToken = session.access_token;

    let body: PartialGenerateRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      logger.error('Failed to parse request body', {
        userId: user.id,
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
      });
      return NextResponse.json(
        { error: 'Некорректный формат запроса', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.courseId) {
      logger.warn('Missing courseId in partial-generate request', { userId: user.id });
      return NextResponse.json(
        { error: 'courseId обязателен', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    if (!body.lessonIds?.length && !body.sectionIds?.length) {
      logger.warn('Missing lessonIds and sectionIds in partial-generate request', {
        userId: user.id,
        courseId: body.courseId,
      });
      return NextResponse.json(
        { error: 'Укажите lessonIds или sectionIds', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    logger.info('Proxying partial generation request to tRPC', {
      userId: user.id,
      courseId: body.courseId,
      lessonIds: body.lessonIds,
      sectionIds: body.sectionIds,
      priority: body.priority,
    });

    // Call tRPC endpoint
    // Use COURSEGEN_BACKEND_URL as single source of truth for backend URL
    const backendUrl = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456';
    const tRPCUrl = `${backendUrl}/trpc`;
    const response = await fetch(`${tRPCUrl}/lessonContent.partialGenerate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        courseId: body.courseId,
        lessonIds: body.lessonIds,
        sectionIds: body.sectionIds,
        priority: body.priority ?? 5,
      }),
    });

    const data = await response.json();

    // Log tRPC errors
    if (!response.ok) {
      logger.error('tRPC lessonContent.partialGenerate failed', {
        userId: user.id,
        courseId: body.courseId,
        lessonIds: body.lessonIds,
        sectionIds: body.sectionIds,
        status: response.status,
        error: data,
      });
    } else {
      logger.info('Partial generation initiated successfully', {
        userId: user.id,
        courseId: body.courseId,
        jobCount: data.result?.data?.jobCount,
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('Unexpected error in /api/coursegen/partial-generate', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
