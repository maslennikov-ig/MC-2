import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import {
  regenerateBlockInputSchema,
  regenerationResponseSchema,
} from '@megacampus/shared-types/regeneration-types';
import type {
  RegenerationResponse,
} from '@megacampus/shared-types/regeneration-types';
import { llmClient } from '../../../../shared/llm/client';
import {
  detectContextTier,
  generateSemanticDiff,
  assembleStaticContext,
  assembleDynamicContext,
  getFieldValue,
} from '../../../../shared/regeneration';
import { contextCacheManager } from '../../../../shared/regeneration/context-cache-manager';
import {
  setNestedValue,
} from '../_shared/helpers';

export const regenerationRouter = {
  regenerateBlock: instructorProcedure
    .input(regenerateBlockInputSchema)
    .mutation(async ({ ctx, input }: { ctx: any, input: any }): Promise<RegenerationResponse> => {
      const { courseId, stageId, blockPath, userInstruction } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, analysis_result, course_structure')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        if (course.user_id !== userId) {
          logger.warn({
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation in regenerateBlock');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        const currentData = stageId === 'stage_4'
          ? course.analysis_result
          : course.course_structure;

        if (!currentData) {
          logger.warn({ requestId, courseId, stageId }, 'Target data is null or undefined');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot regenerate: ${stageId === 'stage_4' ? 'analysis_result' : 'course_structure'} is empty`,
          });
        }

        const tier = detectContextTier(userInstruction);

        logger.info({
          requestId,
          courseId,
          stageId,
          blockPath,
          tier,
          instruction: userInstruction.slice(0, 100),
        }, 'RegenerateBlock: Context tier detected');

        const cacheKey = contextCacheManager.getCacheKey(courseId, tier);
        let staticContextContent: string;
        let staticTokenEstimate: number;
        let cacheHit = false;

        const cachedStatic = contextCacheManager.get(cacheKey);
        if (cachedStatic) {
          staticContextContent = cachedStatic.content;
          staticTokenEstimate = cachedStatic.tokenEstimate;
          cacheHit = true;

          logger.info({
            requestId,
            courseId,
            tier,
            cacheKey,
            tokenEstimate: staticTokenEstimate,
          }, 'RegenerateBlock: Static context cache hit');
        } else {
          const staticContext = await assembleStaticContext({
            courseId,
            stageId,
            blockPath,
            tier,
            analysisResult: course.analysis_result as any,
            courseStructure: course.course_structure as any,
          });

          staticContextContent = staticContext.content;
          staticTokenEstimate = staticContext.tokenEstimate;

          contextCacheManager.set(cacheKey, staticContextContent, staticTokenEstimate);

          logger.info({
            requestId,
            courseId,
            tier,
            cacheKey,
            tokenEstimate: staticTokenEstimate,
          }, 'RegenerateBlock: Static context assembled and cached');
        }

        const dynamicContext = await assembleDynamicContext({
          courseId,
          stageId,
          blockPath,
          tier,
          analysisResult: course.analysis_result as any,
          courseStructure: course.course_structure as any,
        });

        const dynamicContextContent = dynamicContext.content;
        const dynamicTokenEstimate = dynamicContext.tokenEstimate;

        logger.info({
          requestId,
          courseId,
          blockPath,
          tier,
          staticTokens: staticTokenEstimate,
          dynamicTokens: dynamicTokenEstimate,
          totalTokens: staticTokenEstimate + dynamicTokenEstimate,
          cacheHit,
        }, 'RegenerateBlock: Context assembled (static + dynamic)');

        const systemPrompt = `You are an expert instructional designer. Generate valid JSON only, no markdown or explanations.

<static_context>
${staticContextContent}
</static_context>

<requirements>
  - Preserve the pedagogical intent and Bloom's taxonomy level
  - Maintain consistency with surrounding content
  - Return ONLY valid JSON with the following structure:
  {
    "regenerated_content": <the new field value>,
    "pedagogical_change_log": "<explanation of changes>",
    "alignment_score": <1-5>,
    "bloom_level_preserved": <true/false>,
    "concepts_added": ["..."],
    "concepts_removed": ["..."]
  }
</requirements>`;

        const userPrompt = `<regeneration_task>
  <instruction>${userInstruction}</instruction>
  <target_field>${blockPath}</target_field>

  <dynamic_context>
${dynamicContextContent}
  </dynamic_context>
</regeneration_task>`;

        logger.info({
          requestId,
          courseId,
          blockPath,
          model: 'openai/gpt-4o-mini',
          enableCaching: true,
        }, 'RegenerateBlock: Calling LLM with cache control');

        const llmResponse = await llmClient.generateCompletion(userPrompt, {
          model: 'openai/gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 2000,
          systemPrompt,
          enableCaching: true,
        });

        let regenerationData: RegenerationResponse;
        try {
          let cleanedContent = llmResponse.content.trim();
          if (cleanedContent.startsWith('```json')) {
            cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
          } else if (cleanedContent.startsWith('```')) {
            cleanedContent = cleanedContent.replace(/```\n?/g, '').replace(/```\n?$/g, '');
          }

          const parsedResponse = JSON.parse(cleanedContent);
          regenerationData = regenerationResponseSchema.parse(parsedResponse);
        } catch (parseError) {
          logger.error({
            requestId,
            courseId,
            blockPath,
            error: parseError,
            content: llmResponse.content,
          }, 'Failed to parse LLM response for regenerateBlock');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'AI generation failed: invalid JSON response',
          });
        }

        logger.info({
          requestId,
          courseId,
          blockPath,
          alignmentScore: regenerationData.alignment_score,
          bloomPreserved: regenerationData.bloom_level_preserved,
        }, 'RegenerateBlock: LLM response parsed and validated');

        const sourceData = stageId === 'stage_4' ? currentData : currentData;
        const targetContent = getFieldValue(sourceData, blockPath);

        const semanticDiff = await generateSemanticDiff({
          original: targetContent,
          regenerated: regenerationData.regenerated_content,
          fieldPath: blockPath,
          blockType: blockPath.split('.').pop() || blockPath,
          llmChangeLog: regenerationData.pedagogical_change_log,
        });

        logger.info({
          requestId,
          courseId,
          blockPath,
          changeType: semanticDiff.changeType,
          alignmentScore: semanticDiff.alignmentScore,
        }, 'RegenerateBlock: Semantic diff generated');

        const updatedData = structuredClone(currentData);
        try {
          setNestedValue(updatedData, blockPath, regenerationData.regenerated_content);
        } catch (error) {
          logger.warn({
            requestId,
            courseId,
            blockPath,
            error: error instanceof Error ? error.message : String(error),
          }, 'Invalid field path in regenerateBlock');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid field path: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }

        const updateColumn = stageId === 'stage_4' ? 'analysis_result' : 'course_structure';
        const now = new Date().toISOString();

        const { error: updateError } = await supabase
          .from('courses')
          .update({
            [updateColumn]: updatedData,
            updated_at: now,
          })
          .eq('id', courseId);

        if (updateError) {
          logger.error({
            requestId,
            courseId,
            stageId,
            blockPath,
            error: updateError,
          }, 'Database update failed in regenerateBlock');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update regenerated content',
          });
        }

        logger.info({
          requestId,
          courseId,
          stageId,
          blockPath,
          tier,
          staticTokens: staticTokenEstimate,
          dynamicTokens: dynamicTokenEstimate,
          totalTokens: staticTokenEstimate + dynamicTokenEstimate,
          inputTokens: llmResponse.inputTokens,
          outputTokens: llmResponse.outputTokens,
        }, 'RegenerateBlock: Completed successfully');

        return {
          regenerated_content: regenerationData.regenerated_content,
          pedagogical_change_log: regenerationData.pedagogical_change_log,
          alignment_score: regenerationData.alignment_score,
          bloom_level_preserved: regenerationData.bloom_level_preserved,
          concepts_added: regenerationData.concepts_added,
          concepts_removed: regenerationData.concepts_removed,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in regenerateBlock');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),
};