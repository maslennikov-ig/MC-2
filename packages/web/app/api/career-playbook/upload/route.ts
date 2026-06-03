import { NextRequest, NextResponse } from 'next/server'
import { TRPCClientError } from '@trpc/client'

import { logger, logPermanentFailure } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import { isValidUUID } from '@/lib/uuid-validation'

const MAX_UPLOAD_BYTES = 104_857_600
const MAX_MULTIPART_BODY_BYTES = MAX_UPLOAD_BYTES + 16_384

function isOversizedContentLength(request: NextRequest) {
  const contentLength = request.headers.get('content-length')
  if (!contentLength) return false

  const parsed = Number(contentLength)
  return Number.isFinite(parsed) && parsed > MAX_MULTIPART_BODY_BYTES
}

function hasInvalidContentType(request: NextRequest) {
  const contentType = request.headers.get('content-type')
  return Boolean(contentType && !contentType.toLowerCase().startsWith('multipart/form-data'))
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    'name' in value &&
    'size' in value
  )
}

export async function POST(request: NextRequest) {
  let userId: string | undefined

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized access attempt to /api/career-playbook/upload', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      })
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    userId = user.id

    if (isOversizedContentLength(request)) {
      return NextResponse.json(
        { error: 'Upload payload is too large', code: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      )
    }

    if (hasInvalidContentType(request)) {
      return NextResponse.json(
        { error: 'Invalid request format', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (parseError) {
      logger.error('Failed to parse Career Playbook upload request body', {
        userId,
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
      })
      return NextResponse.json(
        { error: 'Invalid request format', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const playbookId = formData.get('playbookId')
    const file = formData.get('file')

    if (typeof playbookId !== 'string' || !playbookId || !isUploadedFile(file)) {
      return NextResponse.json(
        { error: 'Missing required fields', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    if (file.size <= 0 || !file.name) {
      return NextResponse.json(
        { error: 'Invalid file size', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Upload payload is too large', code: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      )
    }

    if (!isValidUUID(playbookId)) {
      return NextResponse.json(
        { error: 'Invalid Career Playbook ID format', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const fileContent = Buffer.from(await file.arrayBuffer()).toString('base64')
    const client = await getServerTrpcClient()
    const result = await client.careerPlaybook.sources.uploadFile.mutate({
      playbookId,
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      fileContent,
    })

    return NextResponse.json({
      sourceId: result.sourceId,
      fileId: result.fileId,
      storagePath: result.storagePath,
      status: result.status,
      message: result.message,
    })
  } catch (error) {
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

      logger.error('tRPC careerPlaybook.sources.uploadFile failed', {
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

    logger.error('Unexpected error in /api/career-playbook/upload', {
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
        route: '/api/career-playbook/upload',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((logError) => logger.error('Log write failed:', { data: logError.message }))

    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
