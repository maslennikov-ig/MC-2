/**
 * Pipeline Audit Logging Utility
 *
 * Centralized audit logging for all pipeline-admin mutations.
 * Logs actions to `admin_audit_logs` table for compliance and debugging.
 *
 * @module services/pipeline-audit
 *
 * Logged Actions:
 * - Model config updates (create, update, activate, deactivate)
 * - Prompt template updates (create, update, activate, deactivate)
 * - Global settings changes
 * - Config exports/imports
 * - Backup creation/restoration
 *
 * Each log entry includes:
 * - admin_id: UUID of user performing action
 * - action: Action type (e.g., "update_model_config")
 * - resource_type: Type of resource affected
 * - resource_id: UUID of affected resource
 * - metadata: Additional context (JSON)
 *
 * @example
 * ```typescript
 * await logPipelineAction(
 *   adminId,
 *   'update_model_config',
 *   'model_config',
 *   configId,
 *   { modelId: 'openai/gpt-4', temperature: 0.7 }
 * );
 * ```
 */

import { getSupabaseAdmin } from '../shared/supabase/admin';
import { logger } from '../shared/logger';
import type { Json } from '@megacampus/shared-types';

// Add this interface for admin_audit_logs table row
interface AdminAuditLogRow {
  id: string;
  admin_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Json | null;
  created_at: string;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Resource types for audit logging
 */
export type AuditResourceType =
  | 'model_config'
  | 'prompt_template'
  | 'global_settings'
  | 'config_backup'
  | 'config_export'
  | 'config_import'
  | 'api_key_config'
  | 'refinement_config';

/**
 * Common action types for pipeline admin
 */
export type AuditAction =
  // Model config actions
  | 'create_model_config'
  | 'update_model_config'
  | 'activate_model_config'
  | 'deactivate_model_config'
  | 'view_model_config_history'
  // Prompt template actions
  | 'create_prompt_template'
  | 'update_prompt_template'
  | 'activate_prompt_template'
  | 'deactivate_prompt_template'
  | 'view_prompt_history'
  // Global settings actions
  | 'update_global_settings'
  | 'view_global_settings'
  // Export/import actions
  | 'export_config'
  | 'preview_import'
  | 'import_config'
  // Backup actions
  | 'create_backup'
  | 'restore_backup'
  | 'delete_backup'
  | 'list_backups'
  // API key actions
  | 'update_api_key'
  | 'test_api_key'
  // Refinement config actions
  | 'update_refinement_config'
  | 'view_refinement_config_history';

/**
 * Audit log metadata (flexible JSON structure)
 */
export type AuditMetadata = Record<string, unknown>;

/**
 * Options for audit logging behavior
 */
export interface AuditOptions {
  /**
   * If true, throw error on audit logging failure
   * Default: false (non-blocking, backwards compatible)
   *
   * Use `failOnError: true` for critical operations where audit trail
   * is required for compliance (e.g., config updates, imports, restores)
   */
  failOnError?: boolean;
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Log a pipeline admin action to audit log
 *
 * Inserts a new entry into `admin_audit_logs` table.
 *
 * By default, audit logging is non-blocking (logs error but does not throw).
 * For critical operations, pass `{ failOnError: true }` to make audit logging required.
 *
 * @param adminId - UUID of admin user performing action
 * @param action - Action type (e.g., "update_model_config")
 * @param resourceType - Type of resource affected
 * @param resourceId - UUID of affected resource
 * @param metadata - Additional context (optional)
 * @param options - Audit behavior options (optional)
 *
 * @example
 * ```typescript
 * // Non-blocking (default)
 * await logPipelineAction(
 *   ctx.user.id,
 *   'update_model_config',
 *   'model_config',
 *   'config-uuid',
 *   {
 *     phaseName: 'stage_4_classification',
 *     oldModelId: 'openai/gpt-3.5-turbo',
 *     newModelId: 'openai/gpt-4',
 *     temperature: 0.7,
 *   }
 * );
 *
 * // Required audit trail (throws on failure)
 * await logPipelineAction(
 *   ctx.user.id,
 *   'import_config',
 *   'config_import',
 *   'import-uuid',
 *   { fileName: 'production-config.json' },
 *   { failOnError: true }
 * );
 * ```
 */
export async function logPipelineAction(
  adminId: string,
  action: string,
  resourceType: AuditResourceType,
  resourceId: string,
  metadata?: AuditMetadata,
  options?: AuditOptions
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    // Insert audit log entry
    // Cast metadata to Json type for database compatibility
    const { error } = await supabase.from('admin_audit_logs').insert({
      admin_id: adminId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata: (metadata || {}) as unknown as Json,
    });

    if (error) {
      const errorMessage = 'Failed to log pipeline action to audit log';
      logger.error(
        {
          adminId,
          action,
          resourceType,
          resourceId,
          error: error.message,
        },
        errorMessage
      );

      // Throw if audit logging is required for compliance
      if (options?.failOnError) {
        throw new Error(
          `${errorMessage}: ${error.message} - Operation aborted for compliance`
        );
      }
      return;
    }

    logger.debug(
      {
        adminId,
        action,
        resourceType,
        resourceId,
        hasMetadata: !!metadata,
      },
      'Pipeline action logged to audit log'
    );
  } catch (error) {
    // Catch any unexpected errors (e.g., network failures)
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        adminId,
        action,
        resourceType,
        resourceId,
        error: errorMessage,
      },
      'Unexpected error logging pipeline action'
    );

    // Throw if audit logging is required for compliance
    if (options?.failOnError) {
      throw new Error(
        `Audit logging failed - operation aborted for compliance: ${errorMessage}`
      );
    }
  }
}

/**
 * Query audit logs for a specific resource
 *
 * Retrieves all audit log entries for a given resource, ordered by timestamp DESC.
 *
 * @param resourceType - Type of resource
 * @param resourceId - UUID of resource
 * @param limit - Maximum number of entries to return (default: 50)
 * @returns Array of audit log entries
 *
 * @example
 * ```typescript
 * const logs = await getResourceAuditLogs('model_config', configId, 20);
 * console.log(`Found ${logs.length} audit entries`);
 * ```
 */
export async function getResourceAuditLogs(
  resourceType: AuditResourceType,
  resourceId: string,
  limit = 50
): Promise<
  Array<{
    id: string;
    adminId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata: AuditMetadata;
    createdAt: string;
  }>
> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('admin_audit_logs')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(
        {
          resourceType,
          resourceId,
          error: error.message,
        },
        'Failed to fetch audit logs'
      );
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((row: AdminAuditLogRow) => ({
      id: row.id,
      adminId: row.admin_id,
      action: row.action,
      resourceType: row.resource_type || '',
      resourceId: row.resource_id || '', // Handle potentially null resource_id
      metadata: (row.metadata as AuditMetadata) || {},
      createdAt: row.created_at,
    }));
  } catch (error) {
    logger.error(
      {
        resourceType,
        resourceId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Unexpected error fetching audit logs'
    );
    return [];
  }
}

/**
 * Query recent audit logs by admin user
 *
 * Retrieves recent audit log entries for a specific admin, ordered by timestamp DESC.
 *
 * @param adminId - UUID of admin user
 * @param limit - Maximum number of entries to return (default: 50)
 * @returns Array of audit log entries
 *
 * @example
 * ```typescript
 * const recentActions = await getAdminAuditLogs(adminId, 10);
 * console.log(`Admin performed ${recentActions.length} recent actions`);
 * ```
 */
export async function getAdminAuditLogs(
  adminId: string,
  limit = 50
): Promise<
  Array<{
    id: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata: AuditMetadata;
    createdAt: string;
  }>
> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('admin_audit_logs')
      .select('*')
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(
        {
          adminId,
          error: error.message,
        },
        'Failed to fetch admin audit logs'
      );
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((row: AdminAuditLogRow) => ({
      id: row.id,
      action: row.action,
      resourceType: row.resource_type || '',
      resourceId: row.resource_id || '', // Handle potentially null resource_id
      metadata: (row.metadata as AuditMetadata) || {},
      createdAt: row.created_at,
    }));
  } catch (error) {
    logger.error(
      {
        adminId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Unexpected error fetching admin audit logs'
    );
    return [];
  }
}

/**
 * Query all audit logs with pagination
 *
 * Retrieves audit logs with optional filtering by resource type or action.
 *
 * @param options - Query options
 * @returns Array of audit log entries
 *
 * @example
 * ```typescript
 * const logs = await queryAuditLogs({
 *   resourceType: 'model_config',
 *   limit: 100,
 *   offset: 0,
 * });
 * ```
 */
export async function queryAuditLogs(options: {
  resourceType?: AuditResourceType;
  action?: string;
  limit?: number;
  offset?: number;
}): Promise<
  Array<{
    id: string;
    adminId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata: AuditMetadata;
    createdAt: string;
  }>
> {
  try {
    const supabase = getSupabaseAdmin();
    const { resourceType, action, limit = 50, offset = 0 } = options;

    let query = supabase.from('admin_audit_logs').select('*');

    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }

    if (action) {
      query = query.eq('action', action);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error(
        {
          resourceType,
          action,
          error: error.message,
        },
        'Failed to query audit logs'
      );
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((row: AdminAuditLogRow) => ({
      id: row.id,
      adminId: row.admin_id,
      action: row.action,
      resourceType: row.resource_type || '',
      resourceId: row.resource_id || '', // Handle potentially null resource_id
      metadata: (row.metadata as AuditMetadata) || {},
      createdAt: row.created_at,
    }));
  } catch (error) {
    logger.error(
      {
        options,
        error: error instanceof Error ? error.message : String(error),
      },
      'Unexpected error querying audit logs'
    );
    return [];
  }
}
