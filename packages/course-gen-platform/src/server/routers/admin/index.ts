/**
 * Admin Router - Main Entry Point
 * @module server/routers/admin
 *
 * Provides admin-only procedures for viewing and managing system-wide data.
 * All procedures in this router require admin role and use the Supabase admin
 * client to bypass RLS policies for complete visibility across organizations.
 *
 * This module merges all sub-routers into a single adminRouter.
 *
 * Sub-routers:
 * - organizations: listOrganizations, getOrganization, createOrganization, updateOrganization, getStatistics
 * - users: listUsers
 * - courses: listCourses
 * - apiKeys: listApiKeys, revokeApiKey, regenerateApiKey
 * - auditLogs: listAuditLogs
 * - generationMonitoring: getGenerationTrace, getCourseGenerationDetails, triggerStage6ForLesson,
 *                         regenerateLessonWithRefinement, getGenerationHistory, exportTraceData, finalizeCourse
 * - tiers: listTiers, getTier, updateTier, resetTierToDefaults
 */

import { router } from '../../trpc';

// Import all sub-routers
import { organizationsRouter } from './organizations';
import { usersRouter } from './users';
import { coursesRouter } from './courses';
import { apiKeysRouter } from './api-keys';
import { auditLogsRouter } from './audit-logs';
import { generationMonitoringRouter } from './generation-monitoring';
import { tiersRouter } from './tiers';

// Re-export shared types for external consumers
export * from './shared/types';
export * from './shared/schemas';

/**
 * Admin Router
 *
 * Merges all sub-routers into a single router that maintains the same API surface
 * as the original monolithic admin.ts file.
 *
 * All procedures require admin role (adminProcedure) or superadmin role (superadminProcedure).
 */
export const adminRouter = router({
  // Organizations (5 procedures)
  ...organizationsRouter._def.procedures,

  // Users (1 procedure)
  ...usersRouter._def.procedures,

  // Courses (1 procedure)
  ...coursesRouter._def.procedures,

  // API Keys (3 procedures)
  ...apiKeysRouter._def.procedures,

  // Audit Logs (1 procedure)
  ...auditLogsRouter._def.procedures,

  // Generation Monitoring (7 procedures)
  ...generationMonitoringRouter._def.procedures,

  // Tiers (4 procedures: listTiers, getTier, updateTier, resetTierToDefaults)
  ...tiersRouter._def.procedures,
});

/**
 * Type export for router type inference
 */
export type AdminRouter = typeof adminRouter;
