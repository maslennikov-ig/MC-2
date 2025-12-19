/**
 * Admin Shared Schemas
 * @module server/routers/admin/shared/schemas
 *
 * Common Zod schemas used across admin sub-routers.
 */

import { z } from 'zod';
import { roleSchema } from '@megacampus/shared-types';

/**
 * Pagination schema
 * Used across all list procedures for consistent pagination behavior
 */
export const paginationSchema = z.object({
  /** Number of items to return (1-100, default: 20) */
  limit: z.number().int().positive().max(100).default(20),

  /** Number of items to skip for pagination (default: 0) */
  offset: z.number().int().nonnegative().default(0),
});

/**
 * List organizations input schema
 */
export const listOrganizationsInputSchema = paginationSchema;

/**
 * List users input schema with filters
 */
export const listUsersInputSchema = paginationSchema.extend({
  /** Filter by organization ID (optional) */
  organizationId: z.string().uuid('Invalid organization ID').optional(),

  /** Filter by user role (optional) - uses shared roleSchema for consistency */
  role: roleSchema.optional(),

  /** Filter by activation status (optional) */
  isActive: z.boolean().optional(),

  /** Search by email (optional) */
  search: z.string().optional(),
});

/**
 * List courses input schema with filters
 */
export const listCoursesInputSchema = paginationSchema.extend({
  /** Filter by organization ID (optional) */
  organizationId: z.string().uuid('Invalid organization ID').optional(),

  /** Filter by course status (optional) */
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

// Type exports for consumers
export type PaginationInput = z.infer<typeof paginationSchema>;
export type ListOrganizationsInput = z.infer<typeof listOrganizationsInputSchema>;
export type ListUsersInput = z.infer<typeof listUsersInputSchema>;
export type ListCoursesInput = z.infer<typeof listCoursesInputSchema>;
