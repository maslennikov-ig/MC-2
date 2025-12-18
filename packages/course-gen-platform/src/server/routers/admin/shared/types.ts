/**
 * Admin Shared Types
 * @module server/routers/admin/shared/types
 *
 * Common TypeScript types used across admin sub-routers.
 */

import type { Database } from '@megacampus/shared-types';

/**
 * Organization list item shape
 */
export type OrganizationListItem = {
  id: string;
  name: string;
  tier: Database['public']['Enums']['tier'];
  storageQuotaBytes: number;
  storageUsedBytes: number;
  storageUsedPercentage: number;
  createdAt: string;
  updatedAt: string | null;
};

/**
 * User list item shape with organization info
 */
export type UserListItem = {
  id: string;
  email: string;
  role: Database['public']['Enums']['role'];
  organizationId: string;
  organizationName: string;
  createdAt: string;
  updatedAt: string | null;
};

/**
 * Course list item shape with user and organization info
 */
export type CourseListItem = {
  id: string;
  title: string;
  slug: string;
  status: Database['public']['Enums']['course_status'];
  instructorId: string;
  instructorEmail: string;
  organizationId: string;
  organizationName: string;
  createdAt: string;
  updatedAt: string | null;
};

/**
 * Organization details (used in getOrganization)
 */
export type OrganizationDetails = OrganizationListItem & {
  userCount: number;
  courseCount: number;
  activeApiKeyCount: number;
};

/**
 * API key list item shape
 */
export type ApiKeyListItem = {
  id: string;
  keyPrefix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/**
 * Audit log list item shape
 */
export type AuditLogListItem = {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

/**
 * Platform statistics shape
 */
export type PlatformStatistics = {
  organizations: {
    total: number;
    byTier: {
      trial: number;
      free: number;
      basic: number;
      standard: number;
      premium: number;
    };
  };
  courses: {
    total: number;
    byStatus: {
      draft: number;
      published: number;
      archived: number;
    };
  };
  users: {
    total: number;
    byRole: {
      admin: number;
      instructor: number;
      student: number;
      superadmin: number;
    };
  };
};
