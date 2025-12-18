/**
 * POST /api/coursegen/upload
 *
 * Thin proxy to tRPC generation.uploadFile endpoint.
 * Accepts file upload data and forwards to course-gen-platform tRPC server.
 *
 * Input (JSON body):
 * - courseId: string (UUID)
 * - filename: string
 * - fileSize: number (bytes)
 * - mimeType: string
 * - fileContent: string (base64 encoded)
 *
 * Output:
 * - fileId: string (UUID)
 * - storagePath: string
 * - message: string
 *
 * @module api/coursegen/upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Input schema for file upload request
 */
interface UploadFileInput {
  courseId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  fileContent: string;
}

/**
 * POST handler for file upload
 *
 * This is a thin proxy that:
 * 1. Validates authentication
 * 2. Validates input data
 * 3. Proxies request to tRPC generation.uploadFile
 * 4. Returns formatted response
 */
export async function POST(request: NextRequest) {
  try {
    // Minimal auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('Unauthorized access attempt to /api/coursegen/upload', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
      });
      return NextResponse.json(
        { error: 'Требуется авторизация', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Parse request body
    let body: UploadFileInput;
    try {
      body = await request.json();
    } catch (parseError) {
      logger.error('Failed to parse upload request body', {
        userId: user.id,
        error: parseError instanceof Error ? parseError.message : 'Unknown error'
      });
      return NextResponse.json(
        { error: 'Некорректный формат запроса', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    // Basic input validation
    if (!body.courseId || !body.filename || !body.fileContent) {
      return NextResponse.json(
        { error: 'Отсутствуют обязательные поля', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    // Validate courseId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(body.courseId)) {
      return NextResponse.json(
        { error: 'Некорректный формат ID курса', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    logger.info('Proxying file upload request to tRPC', {
      userId: user.id,
      courseId: body.courseId,
      filename: body.filename,
      fileSize: body.fileSize,
    });

    // Get authorization header from Supabase session
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Не удалось получить токен авторизации', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Call tRPC endpoint
    // Use COURSEGEN_BACKEND_URL from .env (single source of truth)
    const backendUrl = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456';
    const tRPCUrl = `${backendUrl}/trpc`;

    // tRPC v11 with Express adapter expects plain input data (not wrapped in { json: ... })
    const tRPCBody = {
      courseId: body.courseId,
      filename: body.filename,
      fileSize: body.fileSize,
      mimeType: body.mimeType,
      fileContent: body.fileContent,
    };

    const response = await fetch(`${tRPCUrl}/generation.uploadFile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(tRPCBody),
    });

    const data = await response.json();

    // Handle tRPC errors
    if (!response.ok) {
      logger.error('tRPC generation.uploadFile failed', {
        userId: user.id,
        courseId: body.courseId,
        filename: body.filename,
        status: response.status,
        error: data
      });

      // Extract error message from tRPC error format
      const errorMessage = data?.error?.message || data?.message || 'Ошибка загрузки файла';
      const errorCode = data?.error?.code || 'UPLOAD_ERROR';

      return NextResponse.json(
        { error: errorMessage, code: errorCode },
        { status: response.status }
      );
    }

    // tRPC v11 with Express adapter returns data in { result: { data: ... } } format
    const result = data?.result?.data || data;

    logger.info('File uploaded successfully', {
      userId: user.id,
      courseId: body.courseId,
      filename: body.filename,
      fileId: result.fileId,
    });

    return NextResponse.json({
      fileId: result.fileId,
      storagePath: result.storagePath,
      message: result.message || 'Файл успешно загружен',
    });

  } catch (error) {
    logger.error('Unexpected error in /api/coursegen/upload', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
