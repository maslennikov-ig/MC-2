/**
 * Admin API Keys Router
 * @module server/routers/admin/api-keys
 *
 * Provides admin procedures for API key management.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';

export const apiKeysRouter = router({
  /**
   * List API keys for an organization
   */
  listApiKeys: superadminProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase
          .from('api_keys')
          .select('id, key_prefix, name, created_at, last_used_at, revoked_at')
          .eq('organization_id', input.organizationId)
          .order('created_at', { ascending: false });

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('API keys listing', error.message),
          });
        }

        return (data || []).map((key) => ({
          id: key.id,
          keyPrefix: key.key_prefix,
          name: key.name,
          createdAt: key.created_at || new Date().toISOString(),
          lastUsedAt: key.last_used_at,
          revokedAt: key.revoked_at,
        }));
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          organizationId: input.organizationId,
        }, 'Unexpected error in listApiKeys');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'API keys listing',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Revoke an API key
   *
   * Purpose: Immediately revoke an API key to prevent further use.
   * Sets revoked_at timestamp, making the key invalid for authentication.
   *
   * Authorization: Superadmin only (uses superadminProcedure)
   *
   * Input:
   * - keyId: UUID of the API key to revoke
   *
   * Output:
   * - Success status
   *
   * Error Handling:
   * - Unauthorized (not superadmin) → 403 FORBIDDEN (handled by superadminProcedure)
   * - API key not found → 404 NOT_FOUND
   * - Database error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * await trpc.admin.revokeApiKey.mutate({ keyId: '...' });
   * // { success: true }
   * ```
   */
  revokeApiKey: superadminProcedure
    .input(z.object({ keyId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const supabase = getSupabaseAdmin();

        // Fetch key details before revoking (for audit log)
        const { data: key, error: fetchError } = await supabase
          .from('api_keys')
          .select('id, key_prefix, organization_id')
          .eq('id', input.keyId)
          .single();

        if (fetchError || !key) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'API key not found',
          });
        }

        // Revoke the key
        const { error: revokeError } = await supabase
          .from('api_keys')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', input.keyId);

        if (revokeError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('API key revocation', revokeError.message),
          });
        }

        // Log audit event
        await supabase.from('admin_audit_logs').insert({
          admin_id: ctx.user!.id,
          action: 'revoke_api_key',
          resource_type: 'api_key',
          resource_id: key.id,
          metadata: {
            key_id: key.id,
            key_prefix: key.key_prefix,
            organization_id: key.organization_id,
          },
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          keyId: input.keyId,
        }, 'Unexpected error in revokeApiKey');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'API key revocation',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Regenerate API key for an organization
   *
   * Purpose: Revoke all existing API keys and generate a new one.
   * Used for key rotation or when a key is compromised.
   *
   * Authorization: Superadmin only (uses superadminProcedure)
   *
   * Input:
   * - organizationId: UUID of the organization
   *
   * Output:
   * - New API key (ONLY time the full key is shown)
   *
   * Error Handling:
   * - Unauthorized (not superadmin) → 403 FORBIDDEN (handled by superadminProcedure)
   * - Database error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.admin.regenerateApiKey.mutate({ organizationId: '...' });
   * // { apiKey: 'mcai_xyz789...' }
   * ```
   */
  regenerateApiKey: superadminProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const supabase = getSupabaseAdmin();

        // Revoke all existing keys for this organization
        const { error: revokeError } = await supabase
          .from('api_keys')
          .update({ revoked_at: new Date().toISOString() })
          .eq('organization_id', input.organizationId)
          .is('revoked_at', null);

        if (revokeError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('API key revocation', revokeError.message),
          });
        }

        // Generate new API key
        const apiKey = `mcai_${randomBytes(32).toString('hex')}`;
        const keyPrefix = apiKey.slice(0, 13); // 'mcai_' + first 8 hex chars
        const keyHash = await bcrypt.hash(apiKey, 10);

        // Store new API key
        const { error: keyError } = await supabase
          .from('api_keys')
          .insert({
            organization_id: input.organizationId,
            key_prefix: keyPrefix,
            key_hash: keyHash,
            name: 'Regenerated API Key',
            created_by: ctx.user!.id,
          });

        if (keyError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('API key creation', keyError.message),
          });
        }

        // Log audit event
        await supabase.from('admin_audit_logs').insert({
          admin_id: ctx.user!.id,
          action: 'regenerate_api_key',
          resource_type: 'api_key',
          resource_id: input.organizationId,
          metadata: {
            organization_id: input.organizationId,
            key_prefix: keyPrefix,
          },
        });

        return { apiKey };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          organizationId: input.organizationId,
        }, 'Unexpected error in regenerateApiKey');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'API key regeneration',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),
});

export type ApiKeysRouter = typeof apiKeysRouter;
