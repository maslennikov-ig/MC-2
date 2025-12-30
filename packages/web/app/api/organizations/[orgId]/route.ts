import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'
import { authenticateRequest } from '@/lib/auth'
import {
  updateOrgInputSchema,
  type OrganizationWithMembership,
  type OrgRole,
} from '@megacampus/shared-types'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sanitize text input to prevent XSS attacks
 */
function sanitizeText(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Sanitize slug to only allow lowercase alphanumeric and hyphens
 */
function sanitizeSlug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]/g, '')
}

type RouteParams = { params: Promise<{ orgId: string }> }

// Type for organization row (before migrations are in generated types)
interface OrganizationRow {
  id: string
  name: string
  slug: string
  tier: string
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string | null
}

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
 * Helper to check if user is admin or owner of organization
 */
async function isOrgAdminOrOwner(userId: string, orgId: string): Promise<boolean> {
  const role = await getUserOrgRole(userId, orgId)
  return role === 'owner' || role === 'manager'
}

/**
 * Helper to check if user is the owner of organization
 */
async function isOrgOwner(userId: string, orgId: string): Promise<boolean> {
  const role = await getUserOrgRole(userId, orgId)
  return role === 'owner'
}

/**
 * GET /api/organizations/[orgId]
 * Get organization details
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

    // Get organization details
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (orgError || !organization) {
      logger.error('Error fetching organization:', orgError)
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    const org = organization as OrganizationRow

    // Get member count
    const { count } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)

    const result: OrganizationWithMembership = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      tier: org.tier as 'trial' | 'free' | 'basic' | 'standard' | 'premium',
      settings: {
        allowJoinRequests: (org.settings?.allowJoinRequests as boolean) ?? false,
        defaultMemberRole: (org.settings?.defaultMemberRole as OrgRole) ?? 'student',
        requireEmailDomain: (org.settings?.requireEmailDomain as string) ?? null,
        maxMembers: (org.settings?.maxMembers as number) ?? null,
      },
      createdAt: org.created_at,
      updatedAt: org.updated_at ?? undefined,
      memberRole: userRole,
      memberCount: (count as number | null) ?? 0,
    }

    return NextResponse.json({ organization: result })
  } catch (error) {
    logger.error('Unexpected error in GET /api/organizations/[orgId]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/organizations/[orgId]
 * Update organization (admin/owner only)
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
    const canEdit = await isOrgAdminOrOwner(user.id, orgId)
    if (!canEdit) {
      return NextResponse.json(
        { error: 'Forbidden: Admin or owner access required' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const parseResult = updateOrgInputSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    // Sanitize inputs before use
    const name = parseResult.data.name !== undefined ? sanitizeText(parseResult.data.name) : undefined
    const slug = parseResult.data.slug !== undefined ? sanitizeSlug(parseResult.data.slug) : undefined
    const { settings } = parseResult.data

    // If changing slug, check uniqueness
    if (slug) {
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .neq('id', orgId)
        .single()

      if (existing) {
        return NextResponse.json(
          { error: 'Slug already taken', field: 'slug' },
          { status: 409 }
        )
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (slug !== undefined) updateData.slug = slug
    if (settings !== undefined) updateData.settings = settings

    // Update organization
    const { data: organization, error: updateError } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', orgId)
      .select()
      .single()

    if (updateError || !organization) {
      logger.error('Error updating organization:', updateError)
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    const org = organization as OrganizationRow

    // Get user's role for response
    const userRole = await getUserOrgRole(user.id, orgId)

    // Get member count
    const { count } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)

    const result: OrganizationWithMembership = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      tier: org.tier as 'trial' | 'free' | 'basic' | 'standard' | 'premium',
      settings: {
        allowJoinRequests: (org.settings?.allowJoinRequests as boolean) ?? false,
        defaultMemberRole: (org.settings?.defaultMemberRole as OrgRole) ?? 'student',
        requireEmailDomain: (org.settings?.requireEmailDomain as string) ?? null,
        maxMembers: (org.settings?.maxMembers as number) ?? null,
      },
      createdAt: org.created_at,
      updatedAt: org.updated_at ?? undefined,
      memberRole: userRole ?? undefined,
      memberCount: (count as number | null) ?? 0,
    }

    return NextResponse.json({ organization: result })
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/organizations/[orgId]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/organizations/[orgId]
 * Delete organization (owner only)
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

    // Check if user is owner (only owners can delete)
    const isOwner = await isOrgOwner(user.id, orgId)
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Forbidden: Only the organization owner can delete it' },
        { status: 403 }
      )
    }

    // Delete organization (CASCADE will handle members and invitations)
    const { error: deleteError } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgId)

    if (deleteError) {
      logger.error('Error deleting organization:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete organization' },
        { status: 500 }
      )
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/organizations/[orgId]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
