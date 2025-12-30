import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/client-factory';
import { authenticateRequest } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { requireOrgAdminAccess, validateUUID } from '@/lib/organization-helpers';
import { getRequestId, getClientInfo, ApiErrors } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit-log';
import { INVITATION_BULK_MAX_EMAILS } from '@megacampus/shared-types';

const bulkInvitationSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(INVITATION_BULK_MAX_EMAILS),
  role: z.enum(['manager', 'instructor', 'student']).default('student'),
  expiresInDays: z.number().int().positive().max(365).default(7),
});

type RouteParams = { params: Promise<{ orgId: string }> };

/**
 * POST /api/organizations/[orgId]/invitations/bulk
 * Create multiple email invitations at once
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = getRequestId(request);
  const clientInfo = getClientInfo(request);

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return ApiErrors.unauthorized(requestId);
    }

    const { orgId } = await params;

    const orgValidation = validateUUID(orgId, 'organization ID');
    if (!orgValidation.valid) {
      return ApiErrors.badRequest(orgValidation.error!, requestId);
    }

    const { authorized } = await requireOrgAdminAccess(user.id, orgId);
    if (!authorized) {
      return ApiErrors.forbidden('Only owners and managers can create invitations', requestId);
    }

    const body = await request.json();
    const parseResult = bulkInvitationSchema.safeParse(body);

    if (!parseResult.success) {
      return ApiErrors.validationError(parseResult.error.errors, requestId);
    }

    const { emails, role, expiresInDays } = parseResult.data;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    // Generate invitation records
    const invitations = emails.map(email => ({
      organization_id: orgId,
      invitation_type: 'email' as const,
      email,
      role,
      token: `inv_${nanoid(21)}`,
      created_by: user.id,
      expires_at: expiresAt,
      status: 'pending' as const,
      current_uses: 0,
    }));

    const adminClient = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (adminClient as any)
      .from('organization_invitations')
      .insert(invitations)
      .select('id, email, token, role, expires_at');

    if (error) {
      logger.error('Bulk invitation creation failed', { requestId, error: error.message });
      return ApiErrors.databaseError(requestId);
    }

    // Log audit event
    await logAudit({
      organizationId: orgId,
      userId: user.id,
      action: 'invitation.created',
      entityType: 'organization_invitation',
      newValues: { count: emails.length, role, emails },
      ...clientInfo,
      requestId,
    });

    logger.info('Bulk invitations created', { requestId, count: data?.length, orgId });

    return NextResponse.json({
      invitations: data,
      count: data?.length || 0,
      requestId,
    });
  } catch (error) {
    logger.error('Bulk invitation error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return ApiErrors.internal(requestId);
  }
}
