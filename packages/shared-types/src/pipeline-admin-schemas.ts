/**
 * Admin Pipeline Dashboard - Aggregated Schemas
 *
 * Re-exports all Zod schemas and provides additional validation schemas
 * for import/export operations.
 *
 * @module pipeline-admin-schemas
 */

import { z } from 'zod';

// Re-export all schemas from individual modules
export * from './pipeline-admin';
export * from './prompt-template';
export * from './openrouter-models';

// =============================================================================
// Additional Validation Schemas
// =============================================================================

/**
 * Schema for configuration import options
 * Controls which parts of the configuration to import
 */
export const configImportOptionsSchema = z.object({
  importModelConfigs: z.boolean().default(true),
  importPromptTemplates: z.boolean().default(true),
  importGlobalSettings: z.boolean().default(true),
  overwriteExisting: z.boolean().default(false),
  createBackup: z.boolean().default(true),
});

export type ConfigImportOptions = z.infer<typeof configImportOptionsSchema>;
