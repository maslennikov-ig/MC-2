import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'
import { authenticateRequest } from '@/lib/auth'
import { type OrgRole } from '@megacampus/shared-types'
import type { SupabaseClient } from '@supabase/supabase-js'

type RouteParams = { params: Promise<{ orgId: string; userId: string }> }

// Helper to cast supabase client to any for tables not in generated types
// TODO: Remove after organization_members migration is applied and types regenerated
function getUntypedClient(): SupabaseClient {
  return getAdminClient() as unknown as SupabaseClient
}

/**
 * Helper to get user's role in an organization
 */
async function getUserOrgRole(userId: string, orgId: string): Promise<OrgRole | null> {
  const supabase = getUntypedClient()
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
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { orgId, userId: targetUserId } = await params
    const supabase = getUntypedClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(targetUserId)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
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
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
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
      return NextResponse.json(
        { error: 'Failed to remove member' },
        { status: 500 }
      )
    }

    // Return appropriate message based on whether user left or was removed
    const message = isSelf
      ? 'You have left the organization'
      : 'Member removed successfully'

    return NextResponse.json({ message }, { status: 200 })
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/organizations/[orgId]/members/[userId]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
