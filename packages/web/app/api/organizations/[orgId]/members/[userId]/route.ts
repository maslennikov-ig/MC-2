import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { logger, logPermanentFailure } from '@/lib/logger'
import { authenticateRequest } from '@/lib/auth'
import { isValidUUID } from '@/lib/validation'
import { type OrgRole } from '@megacampus/shared-types'

type RouteParams = { params: Promise<{ orgId: string; userId: string }> }

/**
 * Helper to get user's role in an organization
 */
async function getUserOrgRole(userId: string, orgId: string): Promise<OrgRole | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single()

  return (data as { role: string } | null)?.role as OrgRole | null
}

/**
 * DELETE /api/organizations/[orgId]/members/[userId]
 * Remove a member from the organization
 * - Owner/admin can remove others (but not the owner)
 * - Users can leave (remove themselves, except if they're the owner)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await authenticateRequest(request)

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { orgId, userId: targetUserId } = await params
    const supabase = getAdminClient()

    // Validate UUID format
    if (!isValidUUID(orgId) || !isValidUUID(targetUserId)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    // Get current user's role in the organization
    const currentUserRole = await getUserOrgRole(user.id, orgId)
    if (!currentUserRole) {
      return NextResponse.json(
        { error: 'Organization not found or access denied' },
        { status: 404 }
      )
    }

    // Get target user's membership
    const { data: targetMember, error: memberError } = await supabase
      .from('organization_members')
      .select('id, role')
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId)
      .single()

    if (memberError || !targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const targetMemberRow = targetMember as { id: string; role: string }
    const targetRole = targetMemberRow.role as OrgRole
    const isSelf = user.id === targetUserId
    const isAdminOrOwner = currentUserRole === 'owner' || currentUserRole === 'manager'

    // Cannot remove the owner
    if (targetRole === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove the organization owner. Transfer ownership first.' },
        { status: 400 }
      )
    }

    // Check permissions:
    // 1. Users can remove themselves (leave the organization)
    // 2. Admins/owners can remove non-owner members
    if (!isSelf && !isAdminOrOwner) {
      return NextResponse.json(
        { error: 'Forbidden: You can only remove yourself or you need admin/owner access' },
        { status: 403 }
      )
    }

    // Additional check: if admin is trying to remove another admin, only owner can do that
    if (targetRole === 'manager' && currentUserRole === 'manager' && !isSelf) {
      return NextResponse.json(
        { error: 'Forbidden: Only the owner can remove admins' },
        { status: 403 }
      )
    }

    // Delete the membership
    const { error: deleteError } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', targetMemberRow.id)

    if (deleteError) {
      logger.error('Error removing member:', deleteError)
      logPermanentFailure({
        user_id: user.id,
        organization_id: orgId,
        error_message: deleteError.message || 'Error removing member',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'ORG_MEMBER_REMOVE',
        metadata: {
          route: `/api/organizations/${orgId}/members/${targetUserId}`,
          errorCode: 'INTERNAL_ERROR',
          targetUserId,
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }

    // Return appropriate message based on whether user left or was removed
    const message = isSelf ? 'You have left the organization' : 'Member removed successfully'

    return NextResponse.json({ message }, { status: 200 })
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/organizations/[orgId]/members/[userId]:', error)
    logPermanentFailure({
      user_id: undefined,
      error_message:
        error instanceof Error
          ? error.message
          : 'Unexpected error in DELETE /api/organizations/[orgId]/members/[userId]',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'ORG_MEMBER_REMOVE',
      metadata: {
        route: '/api/organizations/[orgId]/members/[userId]',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch(() => {})
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
