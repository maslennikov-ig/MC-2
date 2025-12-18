/**
 * GET /api/coursegen/lesson-content
 *
 * Thin proxy to tRPC lessonContent.getLessonContent endpoint.
 * Retrieves generated lesson content from lesson_contents table.
 *
 * @module api/coursegen/lesson-content
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * GET handler for fetching lesson content
 *
 * Query params:
 * - courseId: Course UUID
 * - lessonId: Lesson ID in format "section.lesson" (e.g., "1.2") or lesson UUID
 *
 * This is a thin proxy that:
 * 1. Validates authentication
 * 2. Validates required parameters
 * 3. Proxies request to tRPC lessonContent.getLessonContent
 * 4. Returns formatted response
 */
export async function GET(request: NextRequest) {
  try {
    // Minimal auth check
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      logger.warn('Unauthorized access attempt to /api/coursegen/lesson-content', {
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

    // Parse query params
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
    const lessonId = searchParams.get('lessonId');

    // Validate required fields
    if (!courseId) {
      logger.warn('Missing courseId in lesson-content request', { userId: user.id });
      return NextResponse.json(
        { error: 'courseId обязателен', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    if (!lessonId) {
      logger.warn('Missing lessonId in lesson-content request', {
        userId: user.id,
        courseId,
      });
      return NextResponse.json(
        { error: 'lessonId обязателен', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    logger.debug('Fetching lesson content', {
      userId: user.id,
      courseId,
      lessonId,
    });

    // Call tRPC endpoint (GET query)
    const backendUrl = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456';
    const tRPCUrl = `${backendUrl}/trpc`;

    // tRPC query format: ?input=JSON_ENCODED_INPUT
    const input = encodeURIComponent(JSON.stringify({ courseId, lessonId }));
    const response = await fetch(`${tRPCUrl}/lessonContent.getLessonContent?input=${input}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    // Log tRPC errors
    if (!response.ok) {
      logger.error('tRPC lessonContent.getLessonContent failed', {
        userId: user.id,
        courseId,
        lessonId,
        status: response.status,
        error: data,
      });
    } else {
      const contentFound = !!data.result?.data;
      logger.debug('Lesson content fetched', {
        userId: user.id,
        courseId,
        lessonId,
        found: contentFound,
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('Unexpected error in /api/coursegen/lesson-content', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
