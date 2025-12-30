/**
 * Organization Helpers - Shared utilities for organization management
 *
 * Consolidates common patterns used across organization API routes including:
 * - UUID validation
 * - Role-based access control checks
 * - Email domain validation
 */

import { getAdminClient } from '@/lib/supabase/client-factory';
import type { OrgRole } from '@megacampus/shared-types';
import { z } from 'zod';

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid();

/**
 * Validate UUID format
 */
export function validateUUID(value: string, fieldName = 'ID'): { valid: boolean; error?: string } {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    return { valid: false, error: `Invalid ${fieldName} format` };
  }
  return { valid: true };
}

/**
 * Get user's role in a specific organization
 */
export async function getUserOrgRole(
  userId: string,
  orgId: string
): Promise<OrgRole | null> {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.role as OrgRole;
}

/**
 * Check if user has admin-level access (owner or manager) to an organization
 */
export async function requireOrgAdminAccess(
  userId: string,
  orgId: string
): Promise<{ authorized: boolean; role: OrgRole | null }> {
  const role = await getUserOrgRole(userId, orgId);
  const authorized = role === 'owner' || role === 'manager';
  return { authorized, role };
}

/**
 * Check if user has any of the specified roles in the organization
 */
export async function requireOrgRole(
  userId: string,
  orgId: string,
  requiredRoles: OrgRole[]
): Promise<{ authorized: boolean; role: OrgRole | null }> {
  const role = await getUserOrgRole(userId, orgId);
  return {
    authorized: role !== null && requiredRoles.includes(role),
    role,
  };
}

/**
 * Validate email domain against organization's requireEmailDomain setting
 */
export async function validateEmailDomain(
  userEmail: string,
  orgId: string
): Promise<{ valid: boolean; error?: string }> {
  const adminClient = getAdminClient();
  const { data: org } = await adminClient
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single();

  const requiredDomain = (org?.settings as Record<string, unknown> | null)?.requireEmailDomain as string | null;

  if (requiredDomain) {
    const domain = userEmail.split('@')[1];
    if (domain !== requiredDomain) {
      return {
        valid: false,
        error: `Only users with @${requiredDomain} email addresses can join this organization`,
      };
    }
  }

  return { valid: true };
}
