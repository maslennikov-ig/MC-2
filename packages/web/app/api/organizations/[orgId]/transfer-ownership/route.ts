import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { authenticateRequest } from '@/lib/auth'
import { logger, logPermanentFailure } from '@/lib/logger'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { validateUUID, getUserOrgRole } from '@/lib/organization-helpers'

const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid(),
})

type RouteParams = { params: Promise<{ orgId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = nanoid(8)

  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required', requestId },
        { status: 401 }
      )
    }

    const { orgId } = await params

    const orgValidation = validateUUID(orgId, 'organization ID')
    if (!orgValidation.valid) {
      return NextResponse.json(
        { error: 'Bad request', message: orgValidation.error, requestId },
        { status: 400 }
      )
    }

    // Verify current user is owner
    const currentRole = await getUserOrgRole(user.id, orgId)
    if (currentRole !== 'owner') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the owner can transfer ownership', requestId },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parseResult = transferOwnershipSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Bad request',
          message: 'Invalid request body',
          requestId,
          details: parseResult.error.errors,
        },
        { status: 400 }
      )
    }

    const { newOwnerId } = parseResult.data

    if (newOwnerId === user.id) {
      return NextResponse.json(
        { error: 'Bad request', message: 'Cannot transfer ownership to yourself', requestId },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Call the RPC function for atomic transfer
    const { data, error } = await adminClient.rpc('transfer_organization_ownership', {
      p_org_id: orgId,
      p_current_owner_id: user.id,
      p_new_owner_id: newOwnerId,
    })

    if (error) {
      logger.error('Ownership transfer failed', { requestId, error: error.message })
      logPermanentFailure({
        user_id: user.id,
        organization_id: orgId,
        error_message: error.message || 'Ownership transfer failed',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'ORG_TRANSFER',
        metadata: {
          route: `/api/organizations/${orgId}/transfer-ownership`,
          errorCode: 'INTERNAL_ERROR',
          requestId,
          newOwnerId,
        },
      }).catch((e) => console.error('Log write failed:', e.message))
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to transfer ownership', requestId },
        { status: 500 }
      )
    }

    const result = data as { success: boolean; error?: string } | null
    if (!result || !result.success) {
      return NextResponse.json(
        { error: 'Transfer failed', message: result?.error || 'Unknown error', requestId },
        { status: 400 }
      )
    }

    logger.info('Ownership transferred successfully', { requestId, orgId, newOwnerId })

    return NextResponse.json({
      message: 'Ownership transferred successfully',
      requestId,
    })
  } catch (error) {
    logger.error('Ownership transfer error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    logPermanentFailure({
      user_id: undefined,
      error_message:
        error instanceof Error
          ? error.message
          : 'Unexpected error in POST /api/organizations/[orgId]/transfer-ownership',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'ORG_TRANSFER',
      metadata: {
        route: '/api/organizations/[orgId]/transfer-ownership',
        errorCode: 'INTERNAL_ERROR',
        requestId,
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json(
      { error: 'Internal server error', message: 'An unexpected error occurred', requestId },
      { status: 500 }
    )
  }
}
