/**
 * OpenRouter Models Router
 * @module server/routers/pipeline-admin/openrouter-models
 *
 * Provides procedures for listing and refreshing OpenRouter models.
 * Used by the pipeline admin UI to display available AI models.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import { getOpenRouterModels, filterModels } from '../../../services/openrouter-models';
import { logger } from '../../../shared/logger/index.js';

/**
 * OpenRouter Models Router
 *
 * Procedures:
 * - listOpenRouterModels: Get cached list of OpenRouter models with optional filters
 * - refreshOpenRouterModels: Force refresh the OpenRouter models cache
 */
export const openrouterModelsRouter = router({
  /**
   * List OpenRouter models with optional filters (T030)
   *
   * Fetches models from OpenRouter API (cached for 1 hour).
   * Supports filtering by provider, context size range, and price.
   *
   * Authorization: Superadmin only
   *
   * Input (optional):
   * - provider: Filter by provider (e.g., 'openai', 'anthropic')
   * - minContextSize: Minimum context window size
   * - maxContextSize: Maximum context window size
   * - maxPricePerMillion: Maximum price per million tokens
   *
   * Output:
   * - models: Array of OpenRouter model definitions
   * - fromCache: Whether data came from cache
   * - cacheAge: Age of cache in milliseconds
   *
   * @example
   * ```typescript
   * const { models, fromCache } = await trpc.pipelineAdmin.listOpenRouterModels.query({
   *   provider: 'openai',
   *   minContextSize: 32000,
   * });
   * ```
   */
  listOpenRouterModels: superadminProcedure
    .input(
      z
        .object({
          provider: z.string().optional(),
          minContextSize: z.number().optional(),
          maxContextSize: z.number().optional(),
          maxPricePerMillion: z.number().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      try {
        // Fetch models from OpenRouter API (with caching)
        const result = await getOpenRouterModels();

        // Apply filters if provided
        if (input) {
          const filter = {
            providers: input.provider ? [input.provider] : undefined,
            minContextLength: input.minContextSize,
            maxContextLength: input.maxContextSize,
            maxPricePerMillion: input.maxPricePerMillion,
          };

          const filteredModels = filterModels(result.models, filter);

          return {
            models: filteredModels,
            fromCache: result.fromCache,
            cacheAge: result.cacheAge,
            lastFetchedAt: result.lastFetchedAt,
          };
        }

        return result;
      } catch (error: unknown) {
        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Error in listOpenRouterModels'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch OpenRouter models',
        });
      }
    }),

  /**
   * Refresh OpenRouter models cache (T031)
   *
   * Forces cache refresh by calling OpenRouter API.
   * Returns count of models fetched.
   *
   * Authorization: Superadmin only
   *
   * Output:
   * - count: Number of models fetched
   *
   * @example
   * ```typescript
   * const { count } = await trpc.pipelineAdmin.refreshOpenRouterModels.mutate();
   * console.log(`Refreshed ${count} models`);
   * ```
   */
  refreshOpenRouterModels: superadminProcedure.mutation(async ({ ctx }) => {
    try {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      }

      const result = await getOpenRouterModels(true); // forceRefresh=true

      logger.info(
        {
          userId: ctx.user.id,
          modelsCount: result.models.length,
        },
        'OpenRouter models cache refreshed'
      );

      return { count: result.models.length };
    } catch (error: unknown) {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          userId: ctx.user?.id || 'unknown',
        },
        'Error in refreshOpenRouterModels'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to refresh OpenRouter models',
      });
    }
  }),
});
