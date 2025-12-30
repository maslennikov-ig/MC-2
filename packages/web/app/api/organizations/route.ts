import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'
import { authenticateRequest } from '@/lib/auth'
import {
  createOrgInputSchema,
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

// Type for organization row
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
 * GET /api/organizations
 * List all organizations where the authenticated user is a member
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const supabase = getUntypedClient()

    // Get organizations where user is a member, including their role and member count
    const { data: memberships, error: membershipsError } = await supabase
      .from('organization_members')
      .select(`
        role,
        organization_id,
        organizations (
          id,
          name,
          slug,
          tier,
          settings,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', user.id)

    if (membershipsError) {
      logger.error('Error fetching user memberships:', membershipsError)
      return NextResponse.json(
        { error: 'Failed to fetch organizations' },
        { status: 500 }
      )
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ organizations: [] })
    }

    // Get member counts for all organizations
    const orgIds = (memberships as Array<{ organization_id: string }>).map(m => m.organization_id)
    const { data: memberCounts, error: countError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .in('organization_id', orgIds)

    if (countError) {
      logger.error('Error fetching member counts:', countError)
    }

    // Count members per organization
    const countMap = new Map<string, number>()
    ;(memberCounts as Array<{ organization_id: string }> | null)?.forEach(m => {
      const current = countMap.get(m.organization_id) || 0
      countMap.set(m.organization_id, current + 1)
    })

    // Transform to OrganizationWithMembership format
    type MembershipWithOrg = {
      role: string
      organization_id: string
      organizations: OrganizationRow | null
    }

    const organizations: OrganizationWithMembership[] = (memberships as unknown as MembershipWithOrg[])
      .filter(m => m.organizations)
      .map(m => {
        const org = m.organizations!
        return {
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
          memberRole: m.role as OrgRole,
          memberCount: countMap.get(m.organization_id) || 0,
        }
      })

    return NextResponse.json({ organizations })
  } catch (error) {
    logger.error('Unexpected error in GET /api/organizations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/organizations
 * Create a new organization (user becomes owner)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Validate input
    const parseResult = createOrgInputSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    // Sanitize inputs before use
    const name = sanitizeText(parseResult.data.name)
    const slug = sanitizeSlug(parseResult.data.slug)
    const { tier, settings } = parseResult.data
    const supabase = getUntypedClient()

    // Check if slug is already taken
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Slug already taken', field: 'slug' },
        { status: 409 }
      )
    }

    // Create organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name,
        slug,
        tier: tier || 'free',
        settings: settings || {},
      })
      .select()
      .single()

    if (orgError || !organization) {
      logger.error('Error creating organization:', orgError)
      return NextResponse.json(
        { error: 'Failed to create organization' },
        { status: 500 }
      )
    }

    const org = organization as OrganizationRow

    // Add user as owner
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: user.id,
        role: 'owner',
      })

    if (memberError) {
      logger.error('Error adding owner to organization:', memberError)
      // Rollback organization creation
      await supabase.from('organizations').delete().eq('id', org.id)
      return NextResponse.json(
        { error: 'Failed to add owner to organization' },
        { status: 500 }
      )
    }

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
      memberRole: 'owner',
      memberCount: 1,
    }

    return NextResponse.json({ organization: result }, { status: 201 })
  } catch (error) {
    logger.error('Unexpected error in POST /api/organizations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
