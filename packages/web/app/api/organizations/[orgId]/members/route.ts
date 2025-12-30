import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'
import { authenticateRequest } from '@/lib/auth'
import { z } from 'zod'
import {
  orgRoleSchema,
  type OrganizationMemberWithUser,
  type OrgRole,
} from '@megacampus/shared-types'
import type { SupabaseClient } from '@supabase/supabase-js'

type RouteParams = { params: Promise<{ orgId: string }> }

// Type for organization member row (before migrations are in generated types)
interface OrganizationMemberRow {
  id: string
  organization_id: string
  user_id: string
  role: string
  joined_at: string
  invited_by: string | null
}

// Type for user row
interface UserRow {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
}

// Helper to cast supabase client to any for tables not in generated types
// TODO: Remove after organization_members migration is applied and types regenerated
function getUntypedClient(): SupabaseClient {
  return getAdminClient() as unknown as SupabaseClient
}

// Input schema for adding a member
const addMemberInputSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: orgRoleSchema.refine(
    (role) => role !== 'owner',
    { message: 'Cannot directly assign owner role' }
  ),
})

// Input schema for updating a member's role
const updateMemberInputSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: orgRoleSchema.refine(
    (role) => role !== 'owner',
    { message: 'Cannot change role to owner' }
  ),
})

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
 * Helper to check if user is admin or owner of organization
 */
async function isOrgAdminOrOwner(userId: string, orgId: string): Promise<boolean> {
  const role = await getUserOrgRole(userId, orgId)
  return role === 'owner' || role === 'manager'
}

/**
 * GET /api/organizations/[orgId]/members
 * List all members with user info (paginated)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await authenticateRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { orgId } = await params
    const supabase = getUntypedClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return NextResponse.json(
        { error: 'Invalid organization ID format' },
        { status: 400 }
      )
    }

    // Check if user is a member of the organization
    const userRole = await getUserOrgRole(user.id, orgId)
    if (!userRole) {
      return NextResponse.json(
        { error: 'Organization not found or access denied' },
        { status: 404 }
      )
    }

    // Extract pagination params
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)))
    const offset = (page - 1) * pageSize

    // Get all members with user information (paginated)
    const { data: members, count, error: membersError } = await supabase
      .from('organization_members')
      .select(`
        id,
        organization_id,
        user_id,
        role,
        joined_at,
        invited_by,
        users:user_id (
          id,
          email,
          full_name,
          avatar_url
        )
      `, { count: 'exact' })
      .eq('organization_id', orgId)
      .order('joined_at', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (membersError) {
      logger.error('Error fetching organization members:', membersError)
      return NextResponse.json(
        { error: 'Failed to fetch members' },
        { status: 500 }
      )
    }

    type MemberWithUser = OrganizationMemberRow & { users: UserRow | null }

    // Transform to OrganizationMemberWithUser format
    const result: OrganizationMemberWithUser[] = ((members as unknown as MemberWithUser[] | null) || [])
      .filter(m => m.users)
      .map(m => {
        const userData = m.users!
        return {
          id: m.id,
          organizationId: m.organization_id,
          userId: m.user_id,
          role: m.role as OrgRole,
          joinedAt: m.joined_at,
          invitedBy: m.invited_by,
          user: {
            id: userData.id,
            email: userData.email,
            fullName: userData.full_name,
            avatarUrl: userData.avatar_url,
          },
        }
      })

    return NextResponse.json({
      members: result,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    })
  } catch (error) {
    logger.error('Unexpected error in GET /api/organizations/[orgId]/members:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/organizations/[orgId]/members
 * Add a member directly (owner/admin only)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await authenticateRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { orgId } = await params
    const supabase = getUntypedClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return NextResponse.json(
        { error: 'Invalid organization ID format' },
        { status: 400 }
      )
    }

    // Check if user is admin or owner
    const canManage = await isOrgAdminOrOwner(user.id, orgId)
    if (!canManage) {
      return NextResponse.json(
        { error: 'Forbidden: Admin or owner access required' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const parseResult = addMemberInputSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { userId: newUserId, role } = parseResult.data

    // Check if user exists
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, avatar_url')
      .eq('id', newUserId)
      .single()

    if (userError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const targetUserRow = targetUser as UserRow

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', newUserId)
      .single()

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member of this organization' },
        { status: 409 }
      )
    }

    // Check organization's member limit
    const { data: org } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single()

    const maxMembers = ((org as { settings: Record<string, unknown> | null } | null)?.settings)?.maxMembers as number | null
    if (maxMembers) {
      const { count } = await supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)

      if (count && count >= maxMembers) {
        return NextResponse.json(
          { error: 'Organization has reached maximum member limit' },
          { status: 400 }
        )
      }
    }

    // Add member
    const { data: newMember, error: insertError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: orgId,
        user_id: newUserId,
        role,
        invited_by: user.id,
      })
      .select()
      .single()

    if (insertError || !newMember) {
      logger.error('Error adding member:', insertError)
      return NextResponse.json(
        { error: 'Failed to add member' },
        { status: 500 }
      )
    }

    const newMemberRow = newMember as OrganizationMemberRow

    const result: OrganizationMemberWithUser = {
      id: newMemberRow.id,
      organizationId: newMemberRow.organization_id,
      userId: newMemberRow.user_id,
      role: newMemberRow.role as OrgRole,
      joinedAt: newMemberRow.joined_at,
      invitedBy: newMemberRow.invited_by,
      user: {
        id: targetUserRow.id,
        email: targetUserRow.email,
        fullName: targetUserRow.full_name,
        avatarUrl: targetUserRow.avatar_url,
      },
    }

    return NextResponse.json({ member: result }, { status: 201 })
  } catch (error) {
    logger.error('Unexpected error in POST /api/organizations/[orgId]/members:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/organizations/[orgId]/members
 * Update a member's role (owner/admin only, cannot change owner role)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await authenticateRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { orgId } = await params
    const supabase = getUntypedClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return NextResponse.json(
        { error: 'Invalid organization ID format' },
        { status: 400 }
      )
    }

    // Check if user is admin or owner
    const canManage = await isOrgAdminOrOwner(user.id, orgId)
    if (!canManage) {
      return NextResponse.json(
        { error: 'Forbidden: Admin or owner access required' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const parseResult = updateMemberInputSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { userId: targetUserId, role: newRole } = parseResult.data

    // Get current member info
    const { data: existingMember, error: memberError } = await supabase
      .from('organization_members')
      .select('id, role')
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId)
      .single()

    if (memberError || !existingMember) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
    }

    const existingMemberRow = existingMember as { id: string; role: string }

    // Cannot change owner's role (ownership transfer is a separate operation)
    if (existingMemberRow.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot change the owner\'s role. Use ownership transfer instead.' },
        { status: 400 }
      )
    }

    // Update member role
    const { data: updatedMember, error: updateError } = await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', existingMemberRow.id)
      .select(`
        id,
        organization_id,
        user_id,
        role,
        joined_at,
        invited_by,
        users:user_id (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .single()

    if (updateError || !updatedMember) {
      logger.error('Error updating member role:', updateError)
      return NextResponse.json(
        { error: 'Failed to update member role' },
        { status: 500 }
      )
    }

    type MemberWithUser = OrganizationMemberRow & { users: UserRow | null }
    const updatedMemberRow = updatedMember as unknown as MemberWithUser
    const userData = updatedMemberRow.users!

    const result: OrganizationMemberWithUser = {
      id: updatedMemberRow.id,
      organizationId: updatedMemberRow.organization_id,
      userId: updatedMemberRow.user_id,
      role: updatedMemberRow.role as OrgRole,
      joinedAt: updatedMemberRow.joined_at,
      invitedBy: updatedMemberRow.invited_by,
      user: {
        id: userData.id,
        email: userData.email,
        fullName: userData.full_name,
        avatarUrl: userData.avatar_url,
      },
    }

    return NextResponse.json({ member: result })
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/organizations/[orgId]/members:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
