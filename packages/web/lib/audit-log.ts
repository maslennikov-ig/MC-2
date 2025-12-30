import { getAdminClient } from '@/lib/supabase/client-factory';
import { logger } from '@/lib/logger';

/**
 * Audit action types for organization management
 */
export type AuditAction =
  | 'organization.created'
  | 'organization.updated'
  | 'organization.deleted'
  | 'organization.restored'
  | 'member.added'
  | 'member.removed'
  | 'member.role_changed'
  | 'invitation.created'
  | 'invitation.accepted'
  | 'invitation.revoked'
  | 'ownership.transferred';

/**
 * Entity types for audit logging
 */
export type AuditEntityType =
  | 'organization'
  | 'organization_member'
  | 'organization_invitation';

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  organizationId: string;
  userId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string;
}

/**
 * Log an audit entry for organization management actions.
 *
 * Writes to both the database audit_log table and the application logger.
 * Database errors are caught and logged but do not interrupt the main flow.
 *
 * @param entry - The audit log entry to record
 * @returns void - Errors are logged but not thrown to avoid disrupting main flow
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  // Also log to application logger for observability
  logger.info('Audit event', {
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    organizationId: entry.organizationId,
    userId: entry.userId,
    requestId: entry.requestId,
  });

  try {
    const adminClient = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Note: Type assertion needed due to TypeScript project reference caching issue.
    // The audit_log table schema includes organization_id in database.types.ts
    const { error } = await (adminClient as any).from('audit_log').insert({
      organization_id: entry.organizationId,
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId || null,
      old_values: entry.oldValues || null,
      new_values: entry.newValues || null,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
      request_id: entry.requestId || null,
    });

    if (error) {
      logger.error('Failed to write audit log to database', {
        error: error.message,
        action: entry.action,
        organizationId: entry.organizationId,
      });
    }
  } catch (error) {
    // Log but don't throw - audit logging should not break main operations
    logger.error('Audit logging database error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      action: entry.action,
    });
  }
}

/**
 * Create audit log helper with pre-filled context
 */
export function createAuditLogger(
  organizationId: string,
  userId: string,
  requestContext: { ipAddress?: string | null; userAgent?: string | null; requestId?: string }
) {
  return {
    log: (
      action: AuditAction,
      entityType: AuditEntityType,
      options?: {
        entityId?: string;
        oldValues?: Record<string, unknown>;
        newValues?: Record<string, unknown>;
      }
    ) =>
      logAudit({
        organizationId,
        userId,
        action,
        entityType,
        entityId: options?.entityId,
        oldValues: options?.oldValues,
        newValues: options?.newValues,
        ...requestContext,
      }),
  };
}
