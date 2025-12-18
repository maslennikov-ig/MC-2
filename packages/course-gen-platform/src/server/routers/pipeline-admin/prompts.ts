/**
 * Pipeline Admin Prompts Router
 * @module server/routers/pipeline-admin/prompts
 *
 * Provides superadmin-only procedures for viewing and managing prompt templates.
 * All procedures require superadmin role.
 *
 * Procedures:
 * - listPromptTemplates: List all active prompt templates grouped by stage
 * - getPromptTemplate: Get single prompt template with full details
 * - updatePromptTemplate: Update prompt template (creates new version)
 * - getPromptHistory: Get prompt history (all versions)
 * - revertPromptToVersion: Revert prompt to specific version
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import type { PromptTemplate } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { logPipelineAction } from '../../../services/pipeline-audit';

// =============================================================================
// Prompts Router
// =============================================================================

export const promptsRouter = router({
  /**
   * List all active prompt templates grouped by stage (T038)
   *
   * Purpose: Provide overview of all prompts for the Prompts tab.
   * Groups prompts by stage for organized display.
   *
   * Authorization: Superadmin only
   *
   * Output: Record<stage, PromptTemplate[]> grouped by stage
   *
   * @example
   * ```typescript
   * const prompts = await trpc.pipelineAdmin.listPromptTemplates.query();
   * // { stage_3: [...], stage_4: [...], stage_5: [...], stage_6: [...] }
   * ```
   */
  listPromptTemplates: superadminProcedure.query(async () => {
    try {
      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*, users:created_by(email)')
        .eq('is_active', true)
        .order('stage')
        .order('prompt_key');

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch prompt templates: ${error.message}`,
        });
      }

      // Group by stage
      const grouped: Record<string, Array<PromptTemplate & { createdByEmail: string | null }>> = {
        stage_3: [],
        stage_4: [],
        stage_5: [],
        stage_6: [],
      };

      for (const prompt of data || []) {
        const stage = prompt.stage;
        if (grouped[stage]) {
          grouped[stage].push({
            id: prompt.id,
            stage: prompt.stage as PromptTemplate['stage'],
            promptKey: prompt.prompt_key,
            promptName: prompt.prompt_name,
            promptDescription: prompt.prompt_description,
            promptTemplate: prompt.prompt_template,
            variables: (prompt.variables || []) as PromptTemplate['variables'],
            version: prompt.version,
            isActive: prompt.is_active,
            createdAt: prompt.created_at ?? new Date().toISOString(),
            updatedAt: prompt.updated_at ?? new Date().toISOString(),
            createdBy: prompt.created_by,
            createdByEmail: (prompt.users as { email: string } | null)?.email || null,
          });
        }
      }

      return grouped;
    } catch (error: unknown) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        'Unexpected error in listPromptTemplates'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list prompt templates',
      });
    }
  }),

  /**
   * Get single prompt template with full details (T039)
   *
   * Purpose: Fetch complete prompt data for editing in the editor dialog.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - id: Prompt template UUID
   *
   * Output: PromptTemplate with full template text and variables
   *
   * @example
   * ```typescript
   * const prompt = await trpc.pipelineAdmin.getPromptTemplate.query({
   *   id: 'prompt-uuid',
   * });
   * // { id: '...', stage: 'stage_3', promptTemplate: '...', ... }
   * ```
   */
  getPromptTemplate: superadminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase
          .from('prompt_templates')
          .select('*, users:created_by(email)')
          .eq('id', input.id)
          .single();

        if (error || !data) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prompt template not found',
          });
        }

        return {
          id: data.id,
          stage: data.stage as PromptTemplate['stage'],
          promptKey: data.prompt_key,
          promptName: data.prompt_name,
          promptDescription: data.prompt_description,
          promptTemplate: data.prompt_template,
          variables: (data.variables || []) as PromptTemplate['variables'],
          version: data.version,
          isActive: data.is_active,
          createdAt: data.created_at ?? new Date().toISOString(),
          updatedAt: data.updated_at ?? new Date().toISOString(),
          createdBy: data.created_by,
          createdByEmail: (data.users as { email: string } | null)?.email || null,
        };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in getPromptTemplate'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch prompt template',
        });
      }
    }),

  /**
   * Update prompt template (T040)
   *
   * Creates a new version with updated content.
   * Validates XML structure with fast-xml-parser before saving.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - id: Current prompt UUID
   * - promptTemplate: New template content (optional)
   * - promptName: New name (optional)
   * - promptDescription: New description (optional)
   * - variables: New variables array (optional)
   *
   * Output: Updated PromptTemplate (new version)
   *
   * @example
   * ```typescript
   * const updated = await trpc.pipelineAdmin.updatePromptTemplate.mutate({
   *   id: 'prompt-uuid',
   *   promptTemplate: '<prompt>...</prompt>',
   *   promptName: 'Updated Name',
   * });
   * ```
   */
  updatePromptTemplate: superadminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        promptTemplate: z.string().optional(),
        promptName: z.string().optional(),
        promptDescription: z.string().nullable().optional(),
        variables: z
          .array(
            z.object({
              name: z.string(),
              description: z.string(),
              required: z.boolean(),
              example: z.string().optional(),
            })
          )
          .optional(),
        expectedVersion: z.number().int().positive().optional(), // Optimistic locking
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // 1. Get current prompt
        const { data: currentPrompt, error: fetchError } = await supabase
          .from('prompt_templates')
          .select('*')
          .eq('id', input.id)
          .single();

        if (fetchError || !currentPrompt) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Prompt template not found',
          });
        }

        // 2. Optimistic locking: check version
        if (input.expectedVersion !== undefined && currentPrompt.version !== input.expectedVersion) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Prompt template was modified by another user. Expected version ${input.expectedVersion}, but current version is ${currentPrompt.version}. Please refresh and try again.`,
          });
        }

        // 3. Validate XML if promptTemplate changed
        if (input.promptTemplate && input.promptTemplate !== currentPrompt.prompt_template) {
          // Import fast-xml-parser dynamically
          const { XMLValidator } = await import('fast-xml-parser');

          // Wrap in root element for validation (prompts may not have single root)
          const wrapped = `<root>${input.promptTemplate}</root>`;
          const validationResult = XMLValidator.validate(wrapped);

          if (validationResult !== true) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Invalid XML structure: ${validationResult.err?.msg || 'Unknown error'}`,
            });
          }
        }

        // 4. Deactivate current version
        const { error: deactivateError } = await supabase
          .from('prompt_templates')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', input.id);

        if (deactivateError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to deactivate current prompt: ${deactivateError.message}`,
          });
        }

        // 5. Insert new version
        const newVersion = currentPrompt.version + 1;
        const newPrompt = {
          stage: currentPrompt.stage,
          prompt_key: currentPrompt.prompt_key,
          prompt_name: input.promptName || currentPrompt.prompt_name,
          prompt_description:
            input.promptDescription !== undefined ? input.promptDescription : currentPrompt.prompt_description,
          prompt_template: input.promptTemplate || currentPrompt.prompt_template,
          variables: input.variables || currentPrompt.variables,
          version: newVersion,
          is_active: true,
          created_by: ctx.user.id,
        };

        const { data: insertedPrompt, error: insertError } = await supabase
          .from('prompt_templates')
          .insert(newPrompt)
          .select('*, users:created_by(email)')
          .single();

        if (insertError || !insertedPrompt) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to insert new prompt version: ${insertError?.message}`,
          });
        }

        // 6. Audit log
        await logPipelineAction(ctx.user.id, 'update_prompt_template', 'prompt_template', insertedPrompt.id, {
          stage: currentPrompt.stage,
          promptKey: currentPrompt.prompt_key,
          oldVersion: currentPrompt.version,
          newVersion,
        }, { failOnError: true });

        logger.info(
          {
            userId: ctx.user.id,
            promptId: insertedPrompt.id,
            stage: insertedPrompt.stage,
            promptKey: insertedPrompt.prompt_key,
            version: newVersion,
          },
          'Prompt template updated'
        );

        // Return formatted response
        return {
          id: insertedPrompt.id,
          stage: insertedPrompt.stage as PromptTemplate['stage'],
          promptKey: insertedPrompt.prompt_key,
          promptName: insertedPrompt.prompt_name,
          promptDescription: insertedPrompt.prompt_description,
          promptTemplate: insertedPrompt.prompt_template,
          variables: (insertedPrompt.variables || []) as PromptTemplate['variables'],
          version: insertedPrompt.version,
          isActive: insertedPrompt.is_active,
          createdAt: insertedPrompt.created_at ?? new Date().toISOString(),
          updatedAt: insertedPrompt.updated_at ?? new Date().toISOString(),
          createdBy: insertedPrompt.created_by,
          createdByEmail: (insertedPrompt.users as { email: string } | null)?.email || null,
        };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in updatePromptTemplate'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update prompt template',
        });
      }
    }),

  /**
   * Get prompt history (all versions) (T041)
   *
   * Retrieves all versions for a specific prompt, ordered by version DESC.
   * Shows complete version history including deactivated prompts.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - stage: Stage identifier (stage_3, stage_4, stage_5, stage_6)
   * - promptKey: Prompt key identifier
   *
   * Output: Array of PromptHistoryItem objects
   *
   * @example
   * ```typescript
   * const history = await trpc.pipelineAdmin.getPromptHistory.query({
   *   stage: 'stage_3',
   *   promptKey: 'stage_3_comparative',
   * });
   * // [{ version: 3, promptName: '...', createdAt: '...', ... }, ...]
   * ```
   */
  getPromptHistory: superadminProcedure
    .input(
      z.object({
        stage: z.enum(['stage_3', 'stage_4', 'stage_5', 'stage_6']),
        promptKey: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase
          .from('prompt_templates')
          .select('id, version, prompt_name, prompt_template, variables, created_at, created_by, users:created_by(email)')
          .eq('stage', input.stage)
          .eq('prompt_key', input.promptKey)
          .order('version', { ascending: false });

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch prompt history: ${error.message}`,
          });
        }

        return (data || []).map((item) => ({
          id: item.id,
          version: item.version,
          promptName: item.prompt_name,
          promptTemplate: item.prompt_template,
          variables: (item.variables || []) as PromptTemplate['variables'],
          createdAt: item.created_at ?? new Date().toISOString(),
          createdBy: item.created_by,
          createdByEmail: (item.users as { email: string } | null)?.email || null,
        }));
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in getPromptHistory'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch prompt history',
        });
      }
    }),

  /**
   * Revert prompt to specific version (T042)
   *
   * Deactivates current active prompt and creates a new version
   * by copying settings from the target version.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - stage: Stage identifier (stage_3, stage_4, stage_5, stage_6)
   * - promptKey: Prompt key identifier
   * - targetVersion: Version number to revert to
   *
   * Output: New active PromptTemplate
   *
   * @example
   * ```typescript
   * const reverted = await trpc.pipelineAdmin.revertPromptToVersion.mutate({
   *   stage: 'stage_3',
   *   promptKey: 'stage_3_comparative',
   *   targetVersion: 2,
   * });
   * ```
   */
  revertPromptToVersion: superadminProcedure
    .input(
      z.object({
        stage: z.enum(['stage_3', 'stage_4', 'stage_5', 'stage_6']),
        promptKey: z.string(),
        targetVersion: z.number().int().positive(),
        expectedCurrentVersion: z.number().int().positive().optional(), // Optimistic locking
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // 1. Find target version
        const { data: targetPrompt, error: fetchError } = await supabase
          .from('prompt_templates')
          .select('*')
          .eq('stage', input.stage)
          .eq('prompt_key', input.promptKey)
          .eq('version', input.targetVersion)
          .single();

        if (fetchError || !targetPrompt) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Version ${input.targetVersion} not found for ${input.stage}/${input.promptKey}`,
          });
        }

        // 2. Get current active to deactivate
        const { data: currentActive, error: currentError } = await supabase
          .from('prompt_templates')
          .select('id, version')
          .eq('stage', input.stage)
          .eq('prompt_key', input.promptKey)
          .eq('is_active', true)
          .single();

        if (currentError || !currentActive) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No active prompt found to deactivate',
          });
        }

        // 3. Optimistic locking: check current version
        if (input.expectedCurrentVersion !== undefined && currentActive.version !== input.expectedCurrentVersion) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Prompt template was modified by another user. Expected version ${input.expectedCurrentVersion}, but current version is ${currentActive.version}. Please refresh and try again.`,
          });
        }

        // 4. Deactivate current
        const { error: deactivateError } = await supabase
          .from('prompt_templates')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', currentActive.id);

        if (deactivateError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to deactivate current prompt: ${deactivateError.message}`,
          });
        }

        // 5. Insert copy as new version
        const newVersion = currentActive.version + 1;
        const newPrompt = {
          stage: targetPrompt.stage,
          prompt_key: targetPrompt.prompt_key,
          prompt_name: targetPrompt.prompt_name,
          prompt_description: targetPrompt.prompt_description,
          prompt_template: targetPrompt.prompt_template,
          variables: targetPrompt.variables,
          version: newVersion,
          is_active: true,
          created_by: ctx.user.id,
        };

        const { data: insertedPrompt, error: insertError } = await supabase
          .from('prompt_templates')
          .insert(newPrompt)
          .select('*, users:created_by(email)')
          .single();

        if (insertError || !insertedPrompt) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to insert reverted prompt: ${insertError?.message}`,
          });
        }

        // 6. Audit log
        await logPipelineAction(ctx.user.id, 'update_prompt_template', 'prompt_template', insertedPrompt.id, {
          action: 'revert',
          stage: input.stage,
          promptKey: input.promptKey,
          targetVersion: input.targetVersion,
          newVersion,
        }, { failOnError: true });

        logger.info(
          {
            userId: ctx.user.id,
            stage: input.stage,
            promptKey: input.promptKey,
            targetVersion: input.targetVersion,
            newVersion,
          },
          'Prompt template reverted to version'
        );

        // Return formatted response
        return {
          id: insertedPrompt.id,
          stage: insertedPrompt.stage as PromptTemplate['stage'],
          promptKey: insertedPrompt.prompt_key,
          promptName: insertedPrompt.prompt_name,
          promptDescription: insertedPrompt.prompt_description,
          promptTemplate: insertedPrompt.prompt_template,
          variables: (insertedPrompt.variables || []) as PromptTemplate['variables'],
          version: insertedPrompt.version,
          isActive: insertedPrompt.is_active,
          createdAt: insertedPrompt.created_at,
          updatedAt: insertedPrompt.updated_at,
          createdBy: insertedPrompt.created_by,
          createdByEmail: (insertedPrompt.users as { email: string } | null)?.email || null,
        };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in revertPromptToVersion'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revert prompt template',
        });
      }
    }),
});
