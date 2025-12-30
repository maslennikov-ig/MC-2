/**
 * Organization Management Types - Single Source of Truth
 * @module organization
 *
 * This module provides shared Zod schemas and types for multi-tenant organization management.
 * Includes role-based access control, member management, and invitation flows.
 *
 * All other packages should import from here (or via @megacampus/shared-types).
 */

import { z } from 'zod';

// ============================================================================
// Organization Role Enum
// ============================================================================

/**
 * Organization role enum schema
 *
 * Roles:
 * - owner: Organization owner (full control, cannot be removed)
 * - manager: Manager (manage members, settings, but not ownership transfer)
 * - instructor: Course instructor (create/manage courses)
 * - student: Standard member (access courses)
 */
export const orgRoleSchema = z.enum(['owner', 'manager', 'instructor', 'student']);

/** Inferred OrgRole type from schema */
export type OrgRole = z.infer<typeof orgRoleSchema>;

/** Array of all organization roles */
export const ORG_ROLES = orgRoleSchema.options;

// ============================================================================
// Invitation Type Enum
// ============================================================================

/**
 * Invitation type enum schema
 *
 * Types:
 * - email: Direct email invitation (one-time use)
 * - link: Shareable link with token (can have max uses)
 * - code: Short alphanumeric code for easy sharing
 */
export const invitationTypeSchema = z.enum(['email', 'link', 'code']);

/** Inferred InvitationType type from schema */
export type InvitationType = z.infer<typeof invitationTypeSchema>;

/** Array of all invitation types */
export const INVITATION_TYPES = invitationTypeSchema.options;

// ============================================================================
// Invitation Status Enum
// ============================================================================

/**
 * Invitation status enum schema
 *
 * Statuses:
 * - pending: Invitation created, not yet used
 * - accepted: Invitation accepted (user joined)
 * - expired: Invitation expired (past expiration date)
 * - revoked: Invitation manually revoked by admin
 */
export const invitationStatusSchema = z.enum(['pending', 'accepted', 'expired', 'revoked']);

/** Inferred InvitationStatus type from schema */
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/** Array of all invitation statuses */
export const INVITATION_STATUSES = invitationStatusSchema.options;

// ============================================================================
// Organization Tier Enum
// ============================================================================

/**
 * Organization tier enum schema (matches database tier enum)
 */
export const organizationTierSchema = z.enum(['trial', 'free', 'basic', 'standard', 'premium']);

/** Inferred OrganizationTier type from schema */
export type OrganizationTier = z.infer<typeof organizationTierSchema>;

/** Array of all organization tiers */
export const ORGANIZATION_TIERS = organizationTierSchema.options;

// ============================================================================
// Organization Member Schema
// ============================================================================

/**
 * Organization member schema
 *
 * Represents a user's membership in an organization with role and metadata.
 */
export const organizationMemberSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: orgRoleSchema,
  joinedAt: z.string().datetime(),
  invitedBy: z.string().uuid().nullable(),
});

/** Inferred OrganizationMember type from schema */
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

// ============================================================================
// Organization Invitation Schema
// ============================================================================

/**
 * Organization invitation schema
 *
 * Supports email, link, and code-based invitations with usage tracking.
 */
export const organizationInvitationSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  invitationType: invitationTypeSchema,
  email: z.string().email().nullable(),
  token: z.string().nullable(),
  code: z.string().nullable(),
  role: orgRoleSchema,
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  maxUses: z.number().int().positive().nullable(),
  currentUses: z.number().int().nonnegative().default(0),
  status: invitationStatusSchema,
  acceptedBy: z.string().uuid().nullable(),
  acceptedAt: z.string().datetime().nullable(),
});

/** Inferred OrganizationInvitation type from schema */
export type OrganizationInvitation = z.infer<typeof organizationInvitationSchema>;

// ============================================================================
// Organization Settings Schema
// ============================================================================

/**
 * Organization settings schema (stored in organizations.settings JSONB column)
 *
 * Controls organization behavior and member management rules.
 */
export const organizationSettingsSchema = z.object({
  allowJoinRequests: z.boolean().default(false),
  defaultMemberRole: orgRoleSchema.default('student'),
  requireEmailDomain: z.string().nullable().default(null),
  maxMembers: z.number().int().positive().nullable().default(null),
});

/** Inferred OrganizationSettings type from schema */
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;

// ============================================================================
// Extended Organization Schema
// ============================================================================

/**
 * Organization with membership information
 *
 * Includes user's role and member count for display purposes.
 */
export const organizationWithMembershipSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  tier: organizationTierSchema,
  settings: organizationSettingsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  memberRole: orgRoleSchema.optional(),
  memberCount: z.number().int().nonnegative().optional(),
});

/** Inferred OrganizationWithMembership type from schema */
export type OrganizationWithMembership = z.infer<typeof organizationWithMembershipSchema>;

// ============================================================================
// API Input Schemas
// ============================================================================

/**
 * Create organization input schema (v2 - with slug and settings)
 *
 * Note: The basic createOrganizationInputSchema (name + tier only) exists in zod-schemas.ts
 * Use this schema for the new organization management system with full features.
 */
export const createOrgInputSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(255),
  slug: z.string()
    .min(1, 'Slug is required')
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  tier: organizationTierSchema.optional().default('free'),
  settings: organizationSettingsSchema.optional().default({}),
});

/** Inferred CreateOrgInput type from schema */
export type CreateOrgInput = z.infer<typeof createOrgInputSchema>;

/**
 * Update organization input schema (v2 - with slug and settings)
 *
 * Note: The basic updateOrganizationInputSchema exists in zod-schemas.ts
 * Use this schema for the new organization management system with full features.
 */
export const updateOrgInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  settings: organizationSettingsSchema.optional(),
});

/** Inferred UpdateOrgInput type from schema */
export type UpdateOrgInput = z.infer<typeof updateOrgInputSchema>;

/**
 * Create invitation input schema
 */
export const createInvitationInputSchema = z.object({
  organizationId: z.string().uuid(),
  invitationType: invitationTypeSchema,
  email: z.string().email().optional(),
  role: orgRoleSchema,
  expiresInDays: z.number().int().positive().default(7),
  maxUses: z.number().int().positive().optional(),
}).refine(
  (data) => {
    // Email invitations must have email
    if (data.invitationType === 'email' && !data.email) {
      return false;
    }
    return true;
  },
  {
    message: 'Email is required for email invitations',
    path: ['email'],
  }
);

/** Inferred CreateInvitationInput type from schema */
export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;

/**
 * Accept invitation input schema
 */
export const acceptInvitationInputSchema = z.object({
  token: z.string().optional(),
  code: z.string().optional(),
}).refine(
  (data) => data.token || data.code,
  {
    message: 'Either token or code is required',
  }
);

/** Inferred AcceptInvitationInput type from schema */
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;

// ============================================================================
// API Output Schemas
// ============================================================================

/**
 * List organizations output schema
 */
export const listOrganizationsOutputSchema = z.array(organizationWithMembershipSchema);

/** Inferred ListOrganizationsOutput type from schema */
export type ListOrganizationsOutput = z.infer<typeof listOrganizationsOutputSchema>;

/**
 * List members output schema
 */
export const organizationMemberWithUserSchema = organizationMemberSchema.extend({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
  }),
});

/** Inferred OrganizationMemberWithUser type from schema */
export type OrganizationMemberWithUser = z.infer<typeof organizationMemberWithUserSchema>;

export const listMembersOutputSchema = z.array(organizationMemberWithUserSchema);

/** Inferred ListMembersOutput type from schema */
export type ListMembersOutput = z.infer<typeof listMembersOutputSchema>;

/**
 * List invitations output schema
 */
export const organizationInvitationWithCreatorSchema = organizationInvitationSchema.extend({
  creator: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string().nullable(),
  }),
});

/** Inferred OrganizationInvitationWithCreator type from schema */
export type OrganizationInvitationWithCreator = z.infer<typeof organizationInvitationWithCreatorSchema>;

export const listInvitationsOutputSchema = z.array(organizationInvitationWithCreatorSchema);

/** Inferred ListInvitationsOutput type from schema */
export type ListInvitationsOutput = z.infer<typeof listInvitationsOutputSchema>;
