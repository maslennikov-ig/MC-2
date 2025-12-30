import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/client-factory';
import { authenticateRequest } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { OrgRole } from '@megacampus/shared-types';
import { validateEmailDomain } from '@/lib/organization-helpers';

// Type definitions for organization tables (not yet in generated types)
interface InvitationRow {
  id: string;
  organization_id: string;
  invitation_type: string;
  email: string | null;
  token: string | null;
  code: string | null;
  role: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  max_uses: number | null;
  current_uses: number;
  status: string;
  accepted_by: string | null;
  accepted_at: string | null;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string | null;
}

// Request body schema
const joinByCodeSchema = z.object({
  code: z.string().min(1, 'Code is required').max(10, 'Code is too long'),
});

/**
 * POST /api/invitations/code
 * Join organization via short code
 * Request body: { code: "ABC123" }
 */
export async function POST(request: NextRequest) {
  const requestId = nanoid(8);
  const startTime = Date.now();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please login to join an organization', requestId },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = joinByCodeSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation error',
          message: 'Invalid request body',
          details: parseResult.error.errors,
          requestId,
        },
        { status: 400 }
      );
    }

    // Normalize code to uppercase
    const code = parseResult.data.code.toUpperCase().trim();
    logger.info('Invitation Code POST: Joining by code', {
      requestId,
      codePrefix: code.slice(0, 3),
      userId: user.id,
    });

    // Use admin client for all operations
    const adminClient = getAdminClient();

    // Get invitation by code (organization_invitations table not yet in generated types)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invitation, error } = await (adminClient as any)
      .from('organization_invitations')
      .select('*')
      .eq('code', code)
      .single() as { data: InvitationRow | null; error: { message: string; code: string } | null };

    if (error || !invitation) {
      logger.warn('Invitation Code POST: Invalid code', { requestId, codePrefix: code.slice(0, 3) });
      return NextResponse.json(
        { error: 'Not found', message: 'Invalid invitation code', requestId },
        { status: 404 }
      );
    }

    // Validate invitation is still usable
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'Invalid invitation',
          message: invitation.status === 'accepted'
            ? 'This invitation code is no longer active'
            : invitation.status === 'revoked'
              ? 'This invitation has been revoked'
              : 'This invitation is no longer valid',
          requestId,
        },
        { status: 410 }
      );
    }

    if (expiresAt < now) {
      return NextResponse.json(
        { error: 'Expired', message: 'This invitation code has expired', requestId },
        { status: 410 }
      );
    }

    // Check usage limits
    if (invitation.max_uses !== null && invitation.current_uses >= invitation.max_uses) {
      return NextResponse.json(
        { error: 'Limit reached', message: 'This invitation code has reached its usage limit', requestId },
        { status: 410 }
      );
    }

    // Check if user is already a member
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingMember } = await (adminClient as any)
      .from('organization_members')
      .select('id, role')
      .eq('organization_id', invitation.organization_id)
      .eq('user_id', user.id)
      .single() as { data: { id: string; role: string } | null; error: unknown };

    if (existingMember) {
      return NextResponse.json(
        { error: 'Already member', message: 'You are already a member of this organization', requestId },
        { status: 409 }
      );
    }

    // Validate email domain if organization requires it
    const emailValidation = await validateEmailDomain(user.email || '', invitation.organization_id);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: 'Forbidden', message: emailValidation.error, requestId },
        { status: 403 }
      );
    }

    // Create membership record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: memberError } = await (adminClient as any)
      .from('organization_members')
      .insert({
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role,
        invited_by: invitation.created_by,
      });

    if (memberError) {
      logger.error('Invitation Code POST: Failed to create membership', {
        requestId,
        error: (memberError as { message: string; code: string }).message,
        code: (memberError as { message: string; code: string }).code,
      });
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to join organization', requestId },
        { status: 500 }
      );
    }

    // Update invitation usage
    const newCurrentUses = invitation.current_uses + 1;
    const shouldMarkAccepted = invitation.max_uses !== null && newCurrentUses >= invitation.max_uses;

    const updateData: Record<string, unknown> = {
      current_uses: newCurrentUses,
    };

    // Mark as accepted when max uses reached
    if (shouldMarkAccepted) {
      updateData.status = 'accepted';
      updateData.accepted_by = user.id;
      updateData.accepted_at = new Date().toISOString();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (adminClient as any)
      .from('organization_invitations')
      .update(updateData)
      .eq('id', invitation.id);

    if (updateError) {
      // Log but don't fail - membership was already created
      logger.warn('Invitation Code POST: Failed to update invitation', {
        requestId,
        error: (updateError as { message: string }).message,
      });
    }

    // Get organization details for response
    const { data: organization } = await adminClient
      .from('organizations')
      .select('id, name, slug')
      .eq('id', invitation.organization_id)
      .single() as { data: OrganizationRow | null; error: unknown };

    logger.info('Invitation Code POST: Success', {
      requestId,
      orgId: invitation.organization_id,
      role: invitation.role,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({
      message: 'Successfully joined organization',
      organization: organization ? {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      } : null,
      role: invitation.role as OrgRole,
      requestId,
    });
  } catch (error) {
    logger.error('Invitation Code POST: Unexpected error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Internal server error', message: 'An unexpected error occurred', requestId },
      { status: 500 }
    );
  }
}
