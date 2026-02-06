import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { authenticateRequest } from '@/lib/auth'
import { logger, logPermanentFailure } from '@/lib/logger'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import type { OrgRole } from '@megacampus/shared-types'
import { validateEmailDomain } from '@/lib/organization-helpers'

// Request body schema
const joinByCodeSchema = z.object({
  code: z.string().min(1, 'Code is required').max(10, 'Code is too long'),
})

/**
 * POST /api/invitations/code
 * Join organization via short code
 * Request body: { code: "ABC123" }
 */
export async function POST(request: NextRequest) {
  const requestId = nanoid(8)
  const startTime = Date.now()

  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please login to join an organization', requestId },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = joinByCodeSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation error',
          message: 'Invalid request body',
          details: parseResult.error.errors,
          requestId,
        },
        { status: 400 }
      )
    }

    // Normalize code to uppercase
    const code = parseResult.data.code.toUpperCase().trim()
    logger.info('Invitation Code POST: Joining by code', {
      requestId,
      codePrefix: code.slice(0, 3),
      userId: user.id,
    })

    // Use admin client for all operations
    const adminClient = getAdminClient()

    const { data: invitation, error } = await adminClient
      .from('organization_invitations')
      .select('*')
      .eq('code', code)
      .single()

    if (error || !invitation) {
      logger.warn('Invitation Code POST: Invalid code', { requestId, codePrefix: code.slice(0, 3) })
      return NextResponse.json(
        { error: 'Not found', message: 'Invalid invitation code', requestId },
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
              ? 'This invitation code is no longer active'
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
        { error: 'Expired', message: 'This invitation code has expired', requestId },
        { status: 410 }
      )
    }

    // Check usage limits
    if (invitation.max_uses !== null && invitation.current_uses >= invitation.max_uses) {
      return NextResponse.json(
        {
          error: 'Limit reached',
          message: 'This invitation code has reached its usage limit',
          requestId,
        },
        { status: 410 }
      )
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
      logger.error('Invitation Code POST: Failed to create membership', {
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
          route: '/api/invitations/code',
          errorCode: memberError.code || 'INTERNAL_ERROR',
          requestId,
          invitationType: 'code',
          invitationId: invitation.id,
        },
      }).catch(() => {})
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to join organization', requestId },
        { status: 500 }
      )
    }

    // Update invitation usage
    const newCurrentUses = invitation.current_uses + 1
    const shouldMarkAccepted = invitation.max_uses !== null && newCurrentUses >= invitation.max_uses

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
      logger.warn('Invitation Code POST: Failed to update invitation', {
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

    logger.info('Invitation Code POST: Success', {
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
    logger.error('Invitation Code POST: Unexpected error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    })
    logPermanentFailure({
      user_id: undefined,
      error_message:
        error instanceof Error ? error.message : 'Unexpected error in POST /api/invitations/code',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'ORG_INVITE_ACCEPT',
      metadata: {
        route: '/api/invitations/code',
        errorCode: 'INTERNAL_ERROR',
        requestId,
        invitationType: 'code',
        invitationId: undefined, // Not available in catch block
      },
    }).catch(() => {})

    return NextResponse.json(
      { error: 'Internal server error', message: 'An unexpected error occurred', requestId },
      { status: 500 }
    )
  }
}
