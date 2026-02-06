import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { authenticateRequest } from '@/lib/auth'
import { logger, logPermanentFailure } from '@/lib/logger'
import { nanoid } from 'nanoid'
import type { OrgRole } from '@megacampus/shared-types'
import { validateEmailDomain } from '@/lib/organization-helpers'

/**
 * GET /api/invitations/[token]
 * Get invitation details by token (public - for accept page)
 * Returns organization info and invitation details for the UI
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const requestId = nanoid(8)
  const startTime = Date.now()

  try {
    const { token } = await params
    logger.info('Invitation Token GET: Fetching invitation', {
      requestId,
      tokenPrefix: token.slice(0, 8),
    })

    // Use admin client to bypass RLS (public endpoint)
    const adminClient = getAdminClient()

    const { data: invitation, error } = await adminClient
      .from('organization_invitations')
      .select('*')
      .eq('token', token)
      .single()

    if (error || !invitation) {
      logger.warn('Invitation Token GET: Not found', { requestId, tokenPrefix: token.slice(0, 8) })
      return NextResponse.json(
        { error: 'Not found', message: 'Invalid or expired invitation link', requestId },
        { status: 404 }
      )
    }

    // Check if invitation is still valid
    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'Invalid invitation',
          message:
            invitation.status === 'accepted'
              ? 'This invitation has already been used'
              : invitation.status === 'revoked'
                ? 'This invitation has been revoked'
                : 'This invitation is no longer valid',
          requestId,
        },
        { status: 410 }
      )
    }

    if (expiresAt < now) {
      return NextResponse.json(
        { error: 'Expired', message: 'This invitation has expired', requestId },
        { status: 410 }
      )
    }

    // For link invitations, check usage limits
    if (invitation.invitation_type === 'link' && invitation.max_uses !== null) {
      if (invitation.current_uses >= invitation.max_uses) {
        return NextResponse.json(
          {
            error: 'Limit reached',
            message: 'This invitation has reached its usage limit',
            requestId,
          },
          { status: 410 }
        )
      }
    }

    // Get organization details
    const { data: organization } = await adminClient
      .from('organizations')
      .select('id, name, slug')
      .eq('id', invitation.organization_id)
      .single()

    if (!organization) {
      return NextResponse.json(
        { error: 'Not found', message: 'Organization not found', requestId },
        { status: 404 }
      )
    }

    logger.info('Invitation Token GET: Success', {
      requestId,
      orgId: organization.id,
      duration: Date.now() - startTime,
    })

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        invitationType: invitation.invitation_type,
        role: invitation.role as OrgRole,
        expiresAt: invitation.expires_at,
        maxUses: invitation.max_uses,
        currentUses: invitation.current_uses,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      requestId,
    })
  } catch (error) {
    logger.error('Invitation Token GET: Unexpected error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    })
    logPermanentFailure({
      user_id: undefined,
      error_message:
        error instanceof Error ? error.message : 'Unexpected error in GET /api/invitations/[token]',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'ORG_INVITE_GET',
      metadata: {
        route: '/api/invitations/[token]',
        errorCode: 'INTERNAL_ERROR',
        requestId,
        invitationType: 'link',
        invitationId: undefined, // Not available in catch block
      },
    }).catch(() => {})

    return NextResponse.json(
      { error: 'Internal server error', message: 'An unexpected error occurred', requestId },
      { status: 500 }
    )
  }
}

/**
 * POST /api/invitations/[token]
 * Accept invitation by token
 * Creates organization_members record and updates invitation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const requestId = nanoid(8)
  const startTime = Date.now()

  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please login to accept this invitation', requestId },
        { status: 401 }
      )
    }

    const { token } = await params
    logger.info('Invitation Token POST: Accepting invitation', {
      requestId,
      tokenPrefix: token.slice(0, 8),
      userId: user.id,
    })

    // Use admin client for all operations
    const adminClient = getAdminClient()

    const { data: invitation, error } = await adminClient
      .from('organization_invitations')
      .select('*')
      .eq('token', token)
      .single()

    if (error || !invitation) {
      logger.warn('Invitation Token POST: Not found', { requestId, tokenPrefix: token.slice(0, 8) })
      return NextResponse.json(
        { error: 'Not found', message: 'Invalid or expired invitation link', requestId },
        { status: 404 }
      )
    }

    // Validate invitation is still usable
    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'Invalid invitation',
          message:
            invitation.status === 'accepted'
              ? 'This invitation has already been used'
              : 'This invitation is no longer valid',
          requestId,
        },
        { status: 410 }
      )
    }

    if (expiresAt < now) {
      return NextResponse.json(
        { error: 'Expired', message: 'This invitation has expired', requestId },
        { status: 410 }
      )
    }

    // For link invitations, check usage limits
    if (invitation.invitation_type === 'link' && invitation.max_uses !== null) {
      if (invitation.current_uses >= invitation.max_uses) {
        return NextResponse.json(
          {
            error: 'Limit reached',
            message: 'This invitation has reached its usage limit',
            requestId,
          },
          { status: 410 }
        )
      }
    }

    // Check if user is already a member
    const { data: existingMember } = await adminClient
      .from('organization_members')
      .select('id, role')
      .eq('organization_id', invitation.organization_id)
      .eq('user_id', user.id)
      .single()

    if (existingMember) {
      return NextResponse.json(
        {
          error: 'Already member',
          message: 'You are already a member of this organization',
          requestId,
        },
        { status: 409 }
      )
    }

    // Validate email domain if organization requires it
    const emailValidation = await validateEmailDomain(user.email || '', invitation.organization_id)
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: 'Forbidden', message: emailValidation.error, requestId },
        { status: 403 }
      )
    }

    // Create membership record
    const { error: memberError } = await adminClient.from('organization_members').insert({
      organization_id: invitation.organization_id,
      user_id: user.id,
      role: invitation.role,
      invited_by: invitation.created_by,
    })

    if (memberError) {
      logger.error('Invitation Token POST: Failed to create membership', {
        requestId,
        error: memberError.message,
        code: memberError.code,
      })
      logPermanentFailure({
        user_id: user.id,
        organization_id: invitation.organization_id,
        error_message: memberError.message || 'Failed to create membership',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'ORG_INVITE_ACCEPT',
        metadata: {
          route: '/api/invitations/[token]',
          errorCode: memberError.code || 'INTERNAL_ERROR',
          requestId,
          invitationType: 'link',
          invitationId: invitation.id,
        },
      }).catch(() => {})
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to join organization', requestId },
        { status: 500 }
      )
    }

    // Update invitation based on type
    const isLinkInvitation = invitation.invitation_type === 'link'
    const newCurrentUses = invitation.current_uses + 1
    const shouldMarkAccepted =
      !isLinkInvitation || (invitation.max_uses !== null && newCurrentUses >= invitation.max_uses)

    const updateData = shouldMarkAccepted
      ? {
          current_uses: newCurrentUses,
          status: 'accepted' as const,
          accepted_by: user.id,
          accepted_at: new Date().toISOString(),
        }
      : {
          current_uses: newCurrentUses,
        }

    const { error: updateError } = await adminClient
      .from('organization_invitations')
      .update(updateData)
      .eq('id', invitation.id)

    if (updateError) {
      // Log but don't fail - membership was already created
      logger.warn('Invitation Token POST: Failed to update invitation', {
        requestId,
        error: updateError.message,
      })
    }

    // Get organization details for response
    const { data: organization } = await adminClient
      .from('organizations')
      .select('id, name, slug')
      .eq('id', invitation.organization_id)
      .single()

    logger.info('Invitation Token POST: Success', {
      requestId,
      orgId: invitation.organization_id,
      role: invitation.role,
      duration: Date.now() - startTime,
    })

    return NextResponse.json({
      message: 'Successfully joined organization',
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          }
        : null,
      role: invitation.role as OrgRole,
      requestId,
    })
  } catch (error) {
    logger.error('Invitation Token POST: Unexpected error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    })
    logPermanentFailure({
      user_id: undefined,
      error_message:
        error instanceof Error
          ? error.message
          : 'Unexpected error in POST /api/invitations/[token]',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'ORG_INVITE_ACCEPT',
      metadata: {
        route: '/api/invitations/[token]',
        errorCode: 'INTERNAL_ERROR',
        requestId,
        invitationType: 'link',
        invitationId: undefined, // Not available in catch block
      },
    }).catch(() => {})

    return NextResponse.json(
      { error: 'Internal server error', message: 'An unexpected error occurred', requestId },
      { status: 500 }
    )
  }
}
