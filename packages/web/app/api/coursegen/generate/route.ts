/**
 * POST /api/coursegen/generate
 *
 * Thin proxy to tRPC generation.initiate endpoint.
 * All business logic is in packages/course-gen-platform/src/server/routers/generation.ts
 *
 * This endpoint serves as a compatibility layer for existing API consumers.
 * New integrations should use the tRPC endpoint directly for type safety.
 *
 * @module api/coursegen/generate
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * POST handler for course generation
 *
 * This is a thin proxy that:
 * 1. Validates authentication
 * 2. Proxies request to tRPC generation.initiate
 * 3. Returns formatted response
 */
export async function POST(request: NextRequest) {
  try {
    // Minimal auth check - get session for access_token to forward to backend
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      logger.warn('Unauthorized access attempt to /api/coursegen/generate', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
      });
      return NextResponse.json(
        { error: 'Требуется авторизация', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const user = session.user;
    const accessToken = session.access_token;

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      logger.error('Failed to parse request body', {
        userId: user.id,
        error: parseError instanceof Error ? parseError.message : 'Unknown error'
      });
      return NextResponse.json(
        { error: 'Некорректный формат запроса', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    logger.info('Proxying course generation request to tRPC', {
      userId: user.id,
      courseId: body.courseId
    });

    // Call tRPC endpoint
    // Use COURSEGEN_BACKEND_URL as single source of truth for backend URL
    const backendUrl = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456';
    const tRPCUrl = `${backendUrl}/trpc`;
    const response = await fetch(`${tRPCUrl}/generation.initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // Log tRPC errors
    if (!response.ok) {
      logger.error('tRPC generation.initiate failed', {
        userId: user.id,
        courseId: body.courseId,
        status: response.status,
        error: data
      });
    } else {
      logger.info('Course generation initiated successfully', {
        userId: user.id,
        courseId: body.courseId
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('Unexpected error in /api/coursegen/generate', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
