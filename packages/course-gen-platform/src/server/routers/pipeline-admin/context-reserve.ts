/**
 * Context Reserve Settings Router
 * CRUD operations for language-specific context reserve percentages
 * @module server/routers/pipeline-admin/context-reserve
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { updateContextReserveSettingSchema } from '@megacampus/shared-types';
import { createModelConfigService } from '../../../shared/llm/model-config-service';

export const contextReserveRouter = router({
  // List all context reserve settings
  listContextReserveSettings: superadminProcedure.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('context_reserve_settings')
      .select('*')
      .order('language');

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to fetch context reserve settings: ${error.message}`,
      });
    }

    return (data || []).map((setting) => ({
      id: setting.id,
      language: setting.language as 'en' | 'ru' | 'any',
      reservePercent: setting.reserve_percent,
      description: setting.description,
      createdAt: setting.created_at,
      updatedAt: setting.updated_at,
    }));
  }),

  // Update a context reserve setting
  updateContextReserveSetting: superadminProcedure
    .input(updateContextReserveSettingSchema)
    .mutation(async ({ input }) => {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from('context_reserve_settings')
        .update({
          reserve_percent: input.reservePercent,
          updated_at: new Date().toISOString(),
        })
        .eq('language', input.language)
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to update context reserve setting: ${error.message}`,
        });
      }

      logger.info({
        language: input.language,
        reservePercent: input.reservePercent,
      }, 'Context reserve setting updated');

      // Invalidate cache to ensure dynamic thresholds use new values immediately
      let cacheCleared = true;

      try {
        const modelConfigService = createModelConfigService();
        modelConfigService.clearCache();
        logger.debug({ language: input.language }, 'Model config cache cleared after reserve setting update');
      } catch (cacheErr) {
        // Non-blocking - cache will eventually expire naturally
        logger.warn({ cacheErr }, 'Failed to clear model config cache after reserve setting update');
        cacheCleared = false;
      }

      return {
        id: data.id,
        language: data.language as 'en' | 'ru' | 'any',
        reservePercent: data.reserve_percent,
        description: data.description,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        cacheCleared,
      };
    }),

  // Get reserve percentage for a specific language (with fallback to 'any')
  getReservePercent: superadminProcedure
    .input(z.object({ language: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();

      // Try exact language match first
      let { data } = await supabase
        .from('context_reserve_settings')
        .select('reserve_percent')
        .eq('language', input.language)
        .single();

      // Fallback to 'any' if not found
      if (!data) {
        const fallback = await supabase
          .from('context_reserve_settings')
          .select('reserve_percent')
          .eq('language', 'any')
          .single();
        data = fallback.data;
      }

      return {
        reservePercent: data?.reserve_percent ?? 0.20,
        language: data ? input.language : 'any',
      };
    }),
});
