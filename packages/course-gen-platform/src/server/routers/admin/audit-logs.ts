/**
 * Admin Audit Logs Router
 * @module server/routers/admin/audit-logs
 *
 * Provides admin procedures for viewing audit logs.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';
import type { AuditLogListItem } from './shared/types';

export const auditLogsRouter = router({
  listAuditLogs: superadminProcedure
    .input(z.object({
      filter: z.object({
        adminId: z.string().uuid().optional(),
        action: z.string().optional(),
        resourceType: z.string().optional(),
        dateRange: z.object({
          from: z.date(),
          to: z.date(),
        }).optional(),
      }).optional(),
      pagination: z.object({
        limit: z.number().int().positive().max(100).default(20),
        offset: z.number().int().nonnegative().default(0),
      }).optional(),
    }))
    .query(async ({ input }): Promise<AuditLogListItem[]> => {
      try {
        const supabase = getSupabaseAdmin();
        const { limit = 20, offset = 0 } = input.pagination || {};

        // Build query with JOIN to users table
        let query = supabase
          .from('admin_audit_logs')
          .select(
            `
            id,
            admin_id,
            action,
            resource_type,
            resource_id,
            metadata,
            created_at,
            users:admin_id (
              email
            )
          `
          )
          .order('created_at', { ascending: false });

        // Apply filters if provided
        if (input.filter?.adminId) {
          query = query.eq('admin_id', input.filter.adminId);
        }

        if (input.filter?.action) {
          query = query.eq('action', input.filter.action);
        }

        if (input.filter?.resourceType) {
          query = query.eq('resource_type', input.filter.resourceType);
        }

        if (input.filter?.dateRange) {
          query = query
            .gte('created_at', input.filter.dateRange.from.toISOString())
            .lte('created_at', input.filter.dateRange.to.toISOString());
        }

        // Apply pagination
        query = query.range(offset, offset + limit - 1);

        // Execute query
        const { data, error } = await query;

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Audit logs listing', error.message),
          });
        }

        if (!data || data.length === 0) {
          return [];
        }

        // Transform data to match response shape
        return (data || []).map((log) => {
          const user = log.users as { email: string } | null;
          return {
            id: log.id,
            adminId: log.admin_id,
            adminEmail: user?.email || 'Unknown Admin',
            action: log.action,
            resourceType: log.resource_type,
            resourceId: log.resource_id,
            metadata: log.metadata as Record<string, unknown> | null,
            createdAt: log.created_at || new Date().toISOString(),
          };
        });
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          filter: input.filter,
        }, 'Unexpected error in listAuditLogs');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Audit logs listing',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),
});

export type AuditLogsRouter = typeof auditLogsRouter;
