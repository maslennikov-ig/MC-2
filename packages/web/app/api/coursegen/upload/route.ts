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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TRPCClientError } from '@trpc/client'
import { logger, logPermanentFailure } from '@/lib/logger'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import { isValidUUID } from '@/lib/uuid-validation'

/**
 * Input schema for file upload request
 */
interface UploadFileInput {
  courseId: string
  filename: string
  fileSize: number
  mimeType: string
  fileContent: string
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
  let userId: string | undefined

  try {
    // Minimal auth check
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized access attempt to /api/coursegen/upload', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      })
      return NextResponse.json(
        { error: 'Требуется авторизация', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    userId = user.id

    // Parse request body
    let body: UploadFileInput
    try {
      body = await request.json()
    } catch (parseError) {
      logger.error('Failed to parse upload request body', {
        userId: user.id,
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
      })
      return NextResponse.json(
        { error: 'Некорректный формат запроса', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    // Basic input validation
    if (!body.courseId || !body.filename || !body.fileContent) {
      return NextResponse.json(
        { error: 'Отсутствуют обязательные поля', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    // Validate courseId format (UUID)
    if (!isValidUUID(body.courseId)) {
      return NextResponse.json(
        { error: 'Некорректный формат ID курса', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    logger.info('Proxying file upload request to tRPC', {
      userId: user.id,
      courseId: body.courseId,
      filename: body.filename,
      fileSize: body.fileSize,
    })

    // Call tRPC via type-safe server caller
    const client = await getServerTrpcClient()
    const result = await client.generation.uploadFile.mutate({
      courseId: body.courseId,
      filename: body.filename,
      fileSize: body.fileSize,
      mimeType: body.mimeType,
      fileContent: body.fileContent,
    })

    logger.info('File uploaded successfully', {
      userId: user.id,
      courseId: body.courseId,
      filename: body.filename,
      fileId: result.fileId,
    })

    return NextResponse.json({
      fileId: result.fileId,
      storagePath: result.storagePath,
      message: result.message || 'Файл успешно загружен',
    })
  } catch (error) {
    // Handle tRPC errors with proper HTTP status codes
    if (error instanceof TRPCClientError) {
      const statusMap: Record<string, number> = {
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        TOO_MANY_REQUESTS: 429,
        BAD_REQUEST: 400,
        INTERNAL_SERVER_ERROR: 500,
      }
      const httpStatus = error.data?.httpStatus || statusMap[error.data?.code] || 500

      logger.error('tRPC generation.uploadFile failed', {
        userId,
        code: error.data?.code,
        message: error.message,
        httpStatus,
      })

      return NextResponse.json(
        { error: error.message, code: error.data?.code || 'UPLOAD_ERROR' },
        { status: httpStatus }
      )
    }

    logger.error('Unexpected error in /api/coursegen/upload', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    logPermanentFailure({
      user_id: userId,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'FILE_UPLOAD',
      metadata: {
        route: '/api/coursegen/upload',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
