/**
 * API Keys Router
 * @module server/routers/pipeline-admin/api-keys
 *
 * Provides superadmin-only procedures for managing API key configuration.
 * Handles Jina and OpenRouter API keys with support for environment variable
 * or database storage.
 *
 * Procedures:
 * - getApiKeyStatus: Get status of API keys (configured, source)
 * - updateApiKeyConfig: Update API key configuration (source, value)
 * - testApiKey: Test if an API key is valid
 * - invalidateCache: Manually invalidate API key cache
 * - getApiKeysHealth: Public endpoint to check if API keys are configured
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { logPipelineAction } from '../../../services/pipeline-audit';
import { invalidateApiKeyCache, encryptApiKey, decryptApiKey, isEncrypted, isApiKeyConfigured } from '../../../shared/services/api-key-service';
import type { Database } from '@megacampus/shared-types';

// Type aliases for Database tables
type PipelineGlobalSetting = Database['public']['Tables']['pipeline_global_settings']['Row'];
type Json = PipelineGlobalSetting['setting_value'];

// API key validation patterns
const API_KEY_PATTERNS = {
  openrouter: /^sk-or-v1-[0-9a-f]{64}$/,
  jina: /^jina_[0-9a-zA-Z]{20,}/,
} as const;

const API_KEY_FORMAT_HINTS = {
  openrouter: 'Expected format: sk-or-v1-[64 hex characters]',
  jina: 'Expected format: jina_[20+ alphanumeric characters]',
} as const;

/**
 * Validate API key format
 * @param keyType - Type of API key (jina or openrouter)
 * @param value - API key value to validate
 * @returns true if valid format, false otherwise
 */
function validateApiKeyFormat(keyType: 'jina' | 'openrouter', value: string): boolean {
  return API_KEY_PATTERNS[keyType].test(value);
}

/**
 * API Keys Router
 *
 * Contains procedures for managing API key configuration:
 * - getApiKeyStatus: Retrieve status of API keys
 * - updateApiKeyConfig: Update API key source and value
 * - testApiKey: Test API key connectivity
 * - invalidateCache: Manually invalidate API key cache
 * - getApiKeysHealth: Public health check endpoint
 */
export const apiKeysRouter = router({
  /**
   * Get API Key Status
   *
   * Purpose: Retrieve status of API keys (Jina, OpenRouter).
   * Shows whether keys are configured and from which source (env/database).
   *
   * Authorization: Superadmin only
   *
   * Output: Object with jina and openRouter status
   */
  getApiKeyStatus: superadminProcedure.query(async () => {
    try {
      const supabase = getSupabaseAdmin();

      // Query API key settings from pipeline_global_settings
      const { data: settings, error } = await supabase
        .from('pipeline_global_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['jina_api_key', 'openrouter_api_key']);

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch API key settings: ${error.message}`,
        });
      }

      const settingsMap: Record<string, Json> = {};
      for (const row of settings || []) {
        settingsMap[row.setting_key] = row.setting_value;
      }

      // Check if env vars are actually set
      const jinaEnvSet = !!process.env.JINA_API_KEY;
      const openRouterEnvSet = !!process.env.OPENROUTER_API_KEY;

      // Parse settings with defaults
      const jinaConfig = (settingsMap.jina_api_key as { source?: string; env_var?: string; is_configured?: boolean }) || {
        source: 'env',
        env_var: 'JINA_API_KEY',
        is_configured: false,
      };

      const openRouterConfig = (settingsMap.openrouter_api_key as { source?: string; env_var?: string; is_configured?: boolean }) || {
        source: 'env',
        env_var: 'OPENROUTER_API_KEY',
        is_configured: false,
      };

      // Determine if configured based on source
      const jinaIsConfigured = jinaConfig.source === 'env' ? jinaEnvSet : !!jinaConfig.is_configured;
      const openRouterIsConfigured = openRouterConfig.source === 'env' ? openRouterEnvSet : !!openRouterConfig.is_configured;

      return {
        jina: {
          key: 'jina_api_key',
          source: (jinaConfig.source || 'env') as 'env' | 'database',
          envVar: jinaConfig.env_var || 'JINA_API_KEY',
          isConfigured: jinaIsConfigured,
        },
        openRouter: {
          key: 'openrouter_api_key',
          source: (openRouterConfig.source || 'env') as 'env' | 'database',
          envVar: openRouterConfig.env_var || 'OPENROUTER_API_KEY',
          isConfigured: openRouterIsConfigured,
        },
      };
    } catch (error: unknown) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'Unexpected error in getApiKeyStatus'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch API key status',
      });
    }
  }),

  /**
   * Update API key configuration
   *
   * Purpose: Update the source (env/database) for an API key.
   * If source is 'database', stores the encrypted key value.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - keyType: 'jina' | 'openrouter'
   * - source: 'env' | 'database'
   * - value: Optional key value (required if source is 'database')
   */
  updateApiKeyConfig: superadminProcedure
    .input(
      z.object({
        keyType: z.enum(['jina', 'openrouter']),
        source: z.enum(['env', 'database']),
        value: z.string().optional(),
      }).refine((data) => {
        // Only validate format when source is 'database' and value is provided
        if (data.source === 'database' && data.value) {
          return validateApiKeyFormat(data.keyType, data.value);
        }
        return true;
      }, (data) => ({
        message: `Invalid ${data.keyType} API key format. ${API_KEY_FORMAT_HINTS[data.keyType]}`,
        path: ['value'],
      }))
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        const settingKey = input.keyType === 'jina' ? 'jina_api_key' : 'openrouter_api_key';
        const envVar = input.keyType === 'jina' ? 'JINA_API_KEY' : 'OPENROUTER_API_KEY';

        // Build new setting value with encryption
        let encryptedValue: string | undefined;
        if (input.source === 'database' && input.value) {
          try {
            encryptedValue = encryptApiKey(input.value);
            logger.debug({ keyType: input.keyType }, 'API key encrypted successfully');
          } catch (err) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: err instanceof Error ? err.message : 'Failed to encrypt API key',
            });
          }
        }

        const settingValue = {
          source: input.source,
          env_var: envVar,
          is_configured: input.source === 'database' && !!input.value,
          value: encryptedValue,
        };

        // Update setting
        const { error } = await supabase
          .from('pipeline_global_settings')
          .update({
            setting_value: settingValue as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('setting_key', settingKey);

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to update API key config: ${error.message}`,
          });
        }

        // Invalidate API key cache so new key takes effect immediately
        invalidateApiKeyCache(input.keyType);

        // Audit log
        await logPipelineAction(ctx.user.id, 'update_api_key', 'api_key_config', settingKey, {
          keyType: input.keyType,
          source: input.source,
        }, { failOnError: true });

        logger.info(
          { userId: ctx.user.id, keyType: input.keyType, source: input.source },
          'API key config updated and cache invalidated'
        );

        return { success: true };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          { err: error instanceof Error ? error.message : String(error), input: { keyType: input.keyType, source: input.source } },
          'Unexpected error in updateApiKeyConfig'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update API key configuration',
        });
      }
    }),

  /**
   * Test API key connection
   *
   * Purpose: Test if an API key is valid by making a test request.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - keyType: 'jina' | 'openrouter'
   *
   * Output: { success: boolean, error?: string }
   */
  testApiKey: superadminProcedure
    .input(
      z.object({
        keyType: z.enum(['jina', 'openrouter']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // Get current config
        const settingKey = input.keyType === 'jina' ? 'jina_api_key' : 'openrouter_api_key';
        const { data: setting } = await supabase
          .from('pipeline_global_settings')
          .select('setting_value')
          .eq('setting_key', settingKey)
          .single();

        const config = (setting?.setting_value as { source?: string; value?: string }) || { source: 'env' };

        // Get API key based on source
        let apiKey: string | undefined;
        if (config.source === 'database' && config.value) {
          // Decrypt the key if it's encrypted
          if (isEncrypted(config.value)) {
            try {
              apiKey = decryptApiKey(config.value);
            } catch (err) {
              logger.error(
                { keyType: input.keyType, error: err instanceof Error ? err.message : String(err) },
                'Failed to decrypt API key for testing'
              );
              return { success: false, error: 'Failed to decrypt API key' };
            }
          } else {
            // Legacy plain text value
            apiKey = config.value;
          }
        } else {
          apiKey = input.keyType === 'jina'
            ? process.env.JINA_API_KEY
            : process.env.OPENROUTER_API_KEY;
        }

        if (!apiKey) {
          return { success: false, error: 'API key not configured' };
        }

        // Test the API key
        if (input.keyType === 'jina') {
          // Test Jina API with a simple embedding request
          const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'jina-embeddings-v3',
              input: ['test'],
              task: 'text-matching',
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Jina API error: ${response.status} - ${errorText}` };
          }

          // Update test status in DB
          await supabase
            .from('pipeline_global_settings')
            .update({
              setting_value: {
                ...config,
                test_status: 'success',
                last_tested: new Date().toISOString(),
              } as unknown as Json,
              updated_at: new Date().toISOString(),
            })
            .eq('setting_key', settingKey);

          return { success: true };
        } else {
          // Test OpenRouter API with models list
          const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `OpenRouter API error: ${response.status} - ${errorText}` };
          }

          // Update test status in DB
          await supabase
            .from('pipeline_global_settings')
            .update({
              setting_value: {
                ...config,
                test_status: 'success',
                last_tested: new Date().toISOString(),
              } as unknown as Json,
              updated_at: new Date().toISOString(),
            })
            .eq('setting_key', settingKey);

          return { success: true };
        }
      } catch (error: unknown) {
        logger.error(
          { err: error instanceof Error ? error.message : String(error), keyType: input.keyType },
          'Unexpected error in testApiKey'
        );
        return { success: false, error: error instanceof Error ? error.message : 'Test failed' };
      }
    }),

  /**
   * Manually invalidate API key cache
   *
   * Purpose: Allow admin to force cache refresh when env vars change.
   * Useful after docker restart, k8s configmap update, etc.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - keyType: Optional 'jina' | 'openrouter'. If omitted, invalidates all.
   */
  invalidateCache: superadminProcedure
    .input(
      z.object({
        keyType: z.enum(['jina', 'openrouter']).optional(),
      }).optional()
    )
    .mutation(({ input }) => {
      invalidateApiKeyCache(input?.keyType);
      logger.info({ keyType: input?.keyType || 'all' }, 'API key cache manually invalidated');
      return { success: true, invalidated: input?.keyType || 'all' };
    }),

  /**
   * Get API Keys Health Status
   *
   * Purpose: Public endpoint to check if API keys are configured.
   * Returns only whether keys are configured, not the actual values.
   * Useful for monitoring and health checks.
   *
   * Authorization: Public (no auth required)
   *
   * Output: { jina: { configured: boolean }, openRouter: { configured: boolean }, timestamp: string }
   */
  getApiKeysHealth: publicProcedure.query(async () => {
    const jinaConfigured = await isApiKeyConfigured('jina');
    const openRouterConfigured = await isApiKeyConfigured('openrouter');

    return {
      jina: { configured: jinaConfigured },
      openRouter: { configured: openRouterConfigured },
      timestamp: new Date().toISOString(),
    };
  }),
});

/**
 * Type export for router type inference
 */
export type ApiKeysRouter = typeof apiKeysRouter;
