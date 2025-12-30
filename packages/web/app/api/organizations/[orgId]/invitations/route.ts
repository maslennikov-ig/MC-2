import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/client-factory';
import { authenticateRequest } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { nanoid, customAlphabet } from 'nanoid';
import {
  type OrgRole,
  type InvitationType,
} from '@megacampus/shared-types';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

// Type definitions for organization tables (not yet in generated types)
interface OrganizationInvitationRow {
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

/**
 * Invitation code configuration
 * 8 characters provides ~40 bits of entropy (30 char alphabet ^ 8 = ~6.5 trillion combinations)
 */
const INVITATION_CODE_LENGTH = 8;

/**
 * Cryptographically secure code generator using nanoid
 * Excludes confusing characters: 0/O, 1/I/L for readability
 */
const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', INVITATION_CODE_LENGTH);

/**
 * Generate a cryptographically secure token for link invitations
 */
function generateToken(): string {
  // Use nanoid with 21 characters for good entropy
  return `inv_${nanoid(21)}`;
}

/**
 * Check if user has admin-level access to the organization
 * Uses raw query to avoid type issues with new tables
 */
async function checkOrgAdminAccess(
  client: SupabaseClient,
  userId: string,
  orgId: string
): Promise<{ hasAccess: boolean; role: OrgRole | null }> {
  const { data, error } = await client.rpc('get_user_org_role', {
    p_user_id: userId,
    p_org_id: orgId,
  });

  // Fallback to direct query if RPC doesn't exist
  if (error?.code === '42883') {
    // Function doesn't exist, use direct query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: membership, error: queryError } = await (client as any)
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single() as { data: { role: string } | null; error: { message: string } | null };

    if (queryError || !membership) {
      return { hasAccess: false, role: null };
    }

    const role = membership.role as OrgRole;
    const hasAccess = role === 'owner' || role === 'manager';
    return { hasAccess, role };
  }

  if (error || !data) {
    return { hasAccess: false, role: null };
  }

  const role = (data as { role: string }).role as OrgRole;
  const hasAccess = role === 'owner' || role === 'manager';
  return { hasAccess, role };
}

// Request body schema for POST
const createInvitationRequestSchema = z.object({
  invitationType: z.enum(['email', 'link', 'code']),
  email: z.string().email().optional(),
  role: z.enum(['manager', 'instructor', 'student']).default('student'),
  expiresInDays: z.number().int().positive().max(365).default(7),
  maxUses: z.number().int().positive().max(1000).optional(),
}).refine(
  (data) => {
    if (data.invitationType === 'email') {
      return !!data.email;
    }
    return !data.email;
  },
  {
    message: 'Email is required for email invitations and not allowed for other types',
    path: ['email'],
  }
);

/**
 * GET /api/organizations/[orgId]/invitations
 * List all invitations for an organization (owner/admin only, paginated)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const requestId = nanoid(8);
  const startTime = Date.now();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please login to view invitations', requestId },
        { status: 401 }
      );
    }

    const { orgId } = await params;
    logger.info('Invitations API GET: Listing invitations', { requestId, orgId, userId: user.id });

    // Use admin client for consistent access
    const adminClient = getAdminClient();

    // Check admin access
    const { hasAccess } = await checkOrgAdminAccess(adminClient, user.id, orgId);
    if (!hasAccess && user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only organization owners and admins can view invitations', requestId },
        { status: 403 }
      );
    }

    // Extract pagination params
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));
    const offset = (page - 1) * pageSize;

    // Get invitations - use type assertion for new table (not yet in generated types)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invitations, count, error } = await (adminClient as any)
      .from('organization_invitations')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1) as {
        data: OrganizationInvitationRow[] | null;
        count: number | null;
        error: { message: string } | null;
      };

    if (error) {
      logger.error('Invitations API GET: Database error', { requestId, error: error.message });
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to fetch invitations', requestId },
        { status: 500 }
      );
    }

    // Get creator details for each invitation
    const creatorIds = [...new Set(invitations?.map((inv) => inv.created_by) || [])];
    let creatorsMap: Record<string, { email: string; full_name: string | null }> = {};

    if (creatorIds.length > 0) {
      const { data: creators } = await adminClient
        .from('users')
        .select('id, email, full_name')
        .in('id', creatorIds);

      if (creators) {
        creatorsMap = Object.fromEntries(
          creators.map((c) => [c.id, { email: c.email, full_name: c.full_name }])
        );
      }
    }

    // Transform to camelCase and add creator info
    const transformedInvitations = (invitations || []).map((inv) => ({
      id: inv.id,
      organizationId: inv.organization_id,
      invitationType: inv.invitation_type as InvitationType,
      email: inv.email,
      token: inv.token,
      code: inv.code,
      role: inv.role as OrgRole,
      createdBy: inv.created_by,
      createdAt: inv.created_at,
      expiresAt: inv.expires_at,
      maxUses: inv.max_uses,
      currentUses: inv.current_uses,
      status: inv.status,
      acceptedBy: inv.accepted_by,
      acceptedAt: inv.accepted_at,
      creator: creatorsMap[inv.created_by] || null,
    }));

    logger.info('Invitations API GET: Success', {
      requestId,
      count: transformedInvitations.length,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({
      invitations: transformedInvitations,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      requestId,
    });
  } catch (error) {
    logger.error('Invitations API GET: Unexpected error', {
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

/**
 * POST /api/organizations/[orgId]/invitations
 * Create a new invitation (owner/admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const requestId = nanoid(8);
  const startTime = Date.now();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please login to create invitations', requestId },
        { status: 401 }
      );
    }

    const { orgId } = await params;
    logger.info('Invitations API POST: Creating invitation', { requestId, orgId, userId: user.id });

    // Use admin client
    const adminClient = getAdminClient();

    // Check admin access
    const { hasAccess } = await checkOrgAdminAccess(adminClient, user.id, orgId);
    if (!hasAccess && user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only organization owners and admins can create invitations', requestId },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = createInvitationRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation error',
          message: 'Invalid request data',
          details: parseResult.error.errors,
          requestId,
        },
        { status: 400 }
      );
    }

    const { invitationType, email, role, expiresInDays, maxUses } = parseResult.data;

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Generate token or code based on invitation type
    let token: string | null = null;
    let code: string | null = null;

    if (invitationType === 'link') {
      token = generateToken();
    } else if (invitationType === 'code') {
      code = generateCode();
    }

    // Insert invitation - use type assertion for new table (not yet in generated types)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invitation, error } = await (adminClient as any)
      .from('organization_invitations')
      .insert({
        organization_id: orgId,
        invitation_type: invitationType,
        email: invitationType === 'email' ? email : null,
        token,
        code,
        role,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
        max_uses: maxUses ?? null,
        current_uses: 0,
        status: 'pending',
      })
      .select()
      .single() as { data: OrganizationInvitationRow | null; error: { message: string; code: string } | null };

    if (error) {
      logger.error('Invitations API POST: Database error', {
        requestId,
        error: error.message,
        code: error.code,
      });
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to create invitation', requestId },
        { status: 500 }
      );
    }

    if (!invitation) {
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to create invitation', requestId },
        { status: 500 }
      );
    }

    // Build share URL for link invitations
    let shareUrl: string | null = null;
    if (invitationType === 'link' && token) {
      const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL;
      shareUrl = `${origin}/join/${token}`;
    }

    logger.info('Invitations API POST: Success', {
      requestId,
      invitationId: invitation.id,
      invitationType,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        organizationId: invitation.organization_id,
        invitationType: invitation.invitation_type as InvitationType,
        email: invitation.email,
        token: invitation.token,
        code: invitation.code,
        role: invitation.role as OrgRole,
        createdBy: invitation.created_by,
        createdAt: invitation.created_at,
        expiresAt: invitation.expires_at,
        maxUses: invitation.max_uses,
        currentUses: invitation.current_uses,
        status: invitation.status,
      },
      shareUrl,
      requestId,
    });
  } catch (error) {
    logger.error('Invitations API POST: Unexpected error', {
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
