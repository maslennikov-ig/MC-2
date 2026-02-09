import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { logger, logPermanentFailure } from '@/lib/logger'
import { authenticateRequest } from '@/lib/auth'
import {
  createOrgInputSchema,
  type OrganizationWithMembership,
  type OrgRole,
} from '@megacampus/shared-types'

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

/**
 * GET /api/organizations
 * List all organizations where the authenticated user is a member
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const supabase = getAdminClient()

    // Get organizations where user is a member, including their role and member count
    const { data: memberships, error: membershipsError } = await supabase
      .from('organization_members')
      .select(
        `
        role,
        organization_id,
        organizations (
          id,
          name,
          slug,
          tier,
          settings,
          created_at,
          updated_at,
          organization_members ( id )
        )
        /* NOTE: PostgREST doesn't support aggregate count in nested selects via supabase-js.
           Fetching IDs and using .length is the most efficient approach available.
           For very large orgs (10k+ members) consider a dedicated RPC function. */
      `
      )
      .eq('user_id', user.id)

    if (membershipsError) {
      logger.error('Error fetching user memberships:', membershipsError)
      logPermanentFailure({
        user_id: user.id,
        error_message: membershipsError.message || 'Error fetching user memberships',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'ORG_LIST',
        metadata: {
          route: '/api/organizations',
          errorCode: 'INTERNAL_ERROR',
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 })
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ organizations: [] })
    }

    // Transform to OrganizationWithMembership format
    type MembershipWithOrg = {
      role: string
      organization_id: string
      organizations: (OrganizationRow & { organization_members: { id: string }[] }) | null
    }

    const organizations: OrganizationWithMembership[] = (
      memberships as unknown as MembershipWithOrg[]
    )
      .filter((m) => m.organizations)
      .map((m) => {
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
          memberCount: org.organization_members?.length || 0,
        }
      })

    return NextResponse.json({ organizations })
  } catch (error) {
    logger.error('Unexpected error in GET /api/organizations:', error)
    logPermanentFailure({
      user_id: undefined,
      error_message:
        error instanceof Error ? error.message : 'Unexpected error in GET /api/organizations',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'ORG_LIST',
      metadata: {
        route: '/api/organizations',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch(() => {})
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
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
    const supabase = getAdminClient()

    // Check if slug is already taken
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Slug already taken', field: 'slug' }, { status: 409 })
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
      logPermanentFailure({
        user_id: user.id,
        error_message: orgError?.message || 'Error creating organization',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'ORG_CREATE',
        metadata: {
          route: '/api/organizations',
          errorCode: 'INTERNAL_ERROR',
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 })
    }

    const org = organization as OrganizationRow

    // Add user as owner
    const { error: memberError } = await supabase.from('organization_members').insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'owner',
    })

    if (memberError) {
      logger.error('Error adding owner to organization:', memberError)
      logPermanentFailure({
        user_id: user.id,
        organization_id: org.id,
        error_message: memberError.message || 'Error adding owner to organization',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'ORG_CREATE',
        metadata: {
          route: '/api/organizations',
          errorCode: 'INTERNAL_ERROR',
        },
      }).catch(() => {})
      // Rollback organization creation
      await supabase.from('organizations').delete().eq('id', org.id)
      return NextResponse.json({ error: 'Failed to add owner to organization' }, { status: 500 })
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
    logPermanentFailure({
      user_id: undefined,
      error_message:
        error instanceof Error ? error.message : 'Unexpected error in POST /api/organizations',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'ORG_CREATE',
      metadata: {
        route: '/api/organizations',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch(() => {})
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
