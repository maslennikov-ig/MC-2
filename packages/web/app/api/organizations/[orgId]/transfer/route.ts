import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/client-factory';
import { authenticateRequest } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { validateUUID, requireOrgRole } from '@/lib/organization-helpers';
import { getRequestId, getClientInfo, ApiErrors } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit-log';

const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid('Invalid new owner ID'),
});

type RouteParams = { params: Promise<{ orgId: string }> };

/**
 * POST /api/organizations/[orgId]/transfer
 * Transfer ownership of an organization to another member
 * Only the current owner can transfer ownership
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

    // Validate org ID format
    const orgValidation = validateUUID(orgId, 'organization ID');
    if (!orgValidation.valid) {
      return ApiErrors.badRequest(orgValidation.error!, requestId);
    }

    // Only owner can transfer ownership
    const { authorized } = await requireOrgRole(user.id, orgId, ['owner']);
    if (!authorized) {
      return ApiErrors.forbidden('Only the organization owner can transfer ownership', requestId);
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = transferOwnershipSchema.safeParse(body);

    if (!parseResult.success) {
      return ApiErrors.validationError(parseResult.error.errors, requestId);
    }

    const { newOwnerId } = parseResult.data;

    // Cannot transfer to self
    if (newOwnerId === user.id) {
      return ApiErrors.badRequest('Cannot transfer ownership to yourself', requestId);
    }

    const adminClient = getAdminClient();

    // Call the database function for atomic ownership transfer
    const { data, error } = await adminClient.rpc('transfer_organization_ownership', {
      p_org_id: orgId,
      p_current_owner_id: user.id,
      p_new_owner_id: newOwnerId,
    });

    if (error) {
      logger.error('Ownership transfer RPC failed', { requestId, error: error.message });
      return ApiErrors.databaseError(requestId);
    }

    const result = data as { success: boolean; error?: string; message?: string; new_owner_id?: string };

    if (!result.success) {
      return ApiErrors.badRequest(result.error || 'Transfer failed', requestId);
    }

    // Log audit event
    await logAudit({
      organizationId: orgId,
      userId: user.id,
      action: 'ownership.transferred',
      entityType: 'organization',
      entityId: orgId,
      oldValues: { owner_id: user.id },
      newValues: { owner_id: newOwnerId },
      ...clientInfo,
      requestId,
    });

    logger.info('Ownership transferred', {
      requestId,
      orgId,
      fromUserId: user.id,
      toUserId: newOwnerId,
    });

    return NextResponse.json({
      success: true,
      message: result.message || 'Ownership transferred successfully',
      newOwnerId: result.new_owner_id,
      requestId,
    });
  } catch (error) {
    logger.error('Ownership transfer error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return ApiErrors.internal(requestId);
  }
}
