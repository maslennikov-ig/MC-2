import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { authenticateRequest } from '@/lib/auth'
import { logger, logPermanentFailure } from '@/lib/logger'
import { nanoid } from 'nanoid'
import type { OrgRole } from '@megacampus/shared-types'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Check if user has admin-level access to the organization
 */
async function checkOrgAdminAccess(
  client: SupabaseClient,
  userId: string,
  orgId: string
): Promise<{ hasAccess: boolean; role: OrgRole | null }> {
  const { data, error } = await client.rpc('get_user_org_role', {
    p_user_id: userId,
    p_org_id: orgId,
  })

  // Fallback to direct query if RPC doesn't exist
  if (error?.code === '42883') {
    const { data: membership, error: queryError } = await client
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single()

    if (queryError || !membership) {
      return { hasAccess: false, role: null }
    }

    const role = membership.role as OrgRole
    const hasAccess = role === 'owner' || role === 'manager'
    return { hasAccess, role }
  }

  if (error || !data) {
    return { hasAccess: false, role: null }
  }

  const role = (data as { role: string }).role as OrgRole
  const hasAccess = role === 'owner' || role === 'manager'
  return { hasAccess, role }
}

/**
 * DELETE /api/organizations/[orgId]/invitations/[invitationId]
 * Revoke an invitation (set status to 'revoked') - owner/admin only
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; invitationId: string }> }
) {
  const requestId = nanoid(8)
  const startTime = Date.now()

  try {
    const user = await authenticateRequest(_request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please login to revoke invitations', requestId },
        { status: 401 }
      )
    }

    const { orgId, invitationId } = await params
    logger.info('Invitation DELETE: Revoking invitation', {
      requestId,
      orgId,
      invitationId,
      userId: user.id,
    })

    // Use admin client
    const adminClient = getAdminClient()

    // Check admin access
    const { hasAccess } = await checkOrgAdminAccess(adminClient, user.id, orgId)
    if (!hasAccess && user.role !== 'superadmin') {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Only organization owners and admins can revoke invitations',
          requestId,
        },
        { status: 403 }
      )
    }

    // Verify invitation exists and belongs to this organization
    const { data: invitation, error: fetchError } = await adminClient
      .from('organization_invitations')
      .select('id, organization_id, invitation_type, status')
      .eq('id', invitationId)
      .single()

    if (fetchError || !invitation) {
      logger.warn('Invitation DELETE: Invitation not found', { requestId, invitationId })
      return NextResponse.json(
        { error: 'Not found', message: 'Invitation not found', requestId },
        { status: 404 }
      )
    }

    if (invitation.organization_id !== orgId) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Invitation does not belong to this organization',
          requestId,
        },
        { status: 403 }
      )
    }

    // Check if already revoked or accepted
    if (invitation.status === 'revoked') {
      return NextResponse.json(
        { error: 'Conflict', message: 'Invitation is already revoked', requestId },
        { status: 409 }
      )
    }

    if (invitation.status === 'accepted') {
      return NextResponse.json(
        { error: 'Conflict', message: 'Cannot revoke an accepted invitation', requestId },
        { status: 409 }
      )
    }

    // Update invitation status to 'revoked'
    const { error: updateError } = await adminClient
      .from('organization_invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId)

    if (updateError) {
      logger.error('Invitation DELETE: Database error', {
        requestId,
        error: updateError.message,
      })
      logPermanentFailure({
        user_id: user.id,
        organization_id: orgId,
        error_message: updateError.message || 'Database error revoking invitation',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'ORG_INVITE_REVOKE',
        metadata: {
          route: `/api/organizations/${orgId}/invitations/${invitationId}`,
          errorCode: 'INTERNAL_ERROR',
          requestId,
          invitationType: invitation.invitation_type as 'link' | 'code' | undefined,
          invitationId,
        },
      }).catch(() => {})
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to revoke invitation', requestId },
        { status: 500 }
      )
    }

    logger.info('Invitation DELETE: Success', {
      requestId,
      invitationId,
      duration: Date.now() - startTime,
    })

    return NextResponse.json({
      message: 'Invitation revoked successfully',
      requestId,
    })
  } catch (error) {
    logger.error('Invitation DELETE: Unexpected error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    })
    logPermanentFailure({
      user_id: undefined,
      error_message:
        error instanceof Error
          ? error.message
          : 'Unexpected error in DELETE /api/organizations/[orgId]/invitations/[invitationId]',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'ORG_INVITE_REVOKE',
      metadata: {
        route: '/api/organizations/[orgId]/invitations/[invitationId]',
        errorCode: 'INTERNAL_ERROR',
        requestId,
        invitationType: undefined, // Not available in catch block
        invitationId: undefined, // Not available in catch block
      },
    }).catch(() => {})

    return NextResponse.json(
      { error: 'Internal server error', message: 'An unexpected error occurred', requestId },
      { status: 500 }
    )
  }
}
