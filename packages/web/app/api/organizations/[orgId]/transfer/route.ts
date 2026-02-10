import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { authenticateRequest } from '@/lib/auth'
import { logger, logPermanentFailure } from '@/lib/logger'
import { z } from 'zod'
import { validateUUID, requireOrgRole } from '@/lib/organization-helpers'
import { getRequestId, getClientInfo } from '@/lib/api-utils'
import { jsonError, ERROR_CODES } from '@/lib/api-response'
import { logAudit } from '@/lib/audit-log'

const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid('Invalid new owner ID'),
})

type RouteParams = { params: Promise<{ orgId: string }> }

/**
 * POST /api/organizations/[orgId]/transfer
 * Transfer ownership of an organization to another member
 * Only the current owner can transfer ownership
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = getRequestId(request)
  const clientInfo = getClientInfo(request)

  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return jsonError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { orgId } = await params

    // Validate org ID format
    const orgValidation = validateUUID(orgId, 'organization ID')
    if (!orgValidation.valid) {
      return jsonError(ERROR_CODES.VALIDATION_ERROR, orgValidation.error!, 400)
    }

    // Only owner can transfer ownership
    const { authorized } = await requireOrgRole(user.id, orgId, ['owner'])
    if (!authorized) {
      return jsonError(
        ERROR_CODES.FORBIDDEN,
        'Only the organization owner can transfer ownership',
        403
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = transferOwnershipSchema.safeParse(body)

    if (!parseResult.success) {
      return jsonError(
        ERROR_CODES.VALIDATION_ERROR,
        'Validation failed',
        400,
        parseResult.error.errors
      )
    }

    const { newOwnerId } = parseResult.data

    // Cannot transfer to self
    if (newOwnerId === user.id) {
      return jsonError(ERROR_CODES.VALIDATION_ERROR, 'Cannot transfer ownership to yourself', 400)
    }

    const adminClient = getAdminClient()

    // Call the database function for atomic ownership transfer
    const { data, error } = await adminClient.rpc('transfer_organization_ownership', {
      p_org_id: orgId,
      p_current_owner_id: user.id,
      p_new_owner_id: newOwnerId,
    })

    if (error) {
      logger.error('Ownership transfer RPC failed', { requestId, error: error.message })
      logPermanentFailure({
        user_id: user.id,
        organization_id: orgId,
        error_message: error.message || 'Ownership transfer RPC failed',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'ORG_TRANSFER',
        metadata: {
          route: `/api/organizations/${orgId}/transfer`,
          errorCode: 'INTERNAL_ERROR',
          requestId,
          newOwnerId,
        },
      }).catch((e) => console.error('Log write failed:', e.message))
      return jsonError(ERROR_CODES.INTERNAL_ERROR, 'Database operation failed', 500)
    }

    const result = data as {
      success: boolean
      error?: string
      message?: string
      new_owner_id?: string
    }

    if (!result.success) {
      return jsonError(ERROR_CODES.VALIDATION_ERROR, result.error || 'Transfer failed', 400)
    }

    // Log audit event
    await logAudit({
      organizationId: orgId,
      userId: user.id,
      action: 'ownership.transferred',
      entityType: 'organization',
      entityId: orgId,
      oldValues: { owner_id: user.id },
      newValues: { owner_id: newOwnerId },
      ...clientInfo,
      requestId,
    })

    logger.info('Ownership transferred', {
      requestId,
      orgId,
      fromUserId: user.id,
      toUserId: newOwnerId,
    })

    return NextResponse.json({
      success: true,
      message: result.message || 'Ownership transferred successfully',
      newOwnerId: result.new_owner_id,
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
          : 'Unexpected error in POST /api/organizations/[orgId]/transfer',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'ORG_TRANSFER',
      metadata: {
        route: '/api/organizations/[orgId]/transfer',
        errorCode: 'INTERNAL_ERROR',
        requestId,
      },
    }).catch((e) => console.error('Log write failed:', e.message))
    return jsonError(ERROR_CODES.INTERNAL_ERROR, 'An unexpected error occurred', 500)
  }
}
