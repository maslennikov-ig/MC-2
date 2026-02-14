/**
 * Block Regeneration Job Handler
 *
 * Handles BLOCK_REGENERATION jobs queued by the cascadeUpdate endpoint.
 * Regenerates a single block in the course structure using the same LLM flow
 * as the inline regenerateBlock endpoint (regeneration.router.ts).
 *
 * Flow:
 * 1. Fetch course data (analysis_result + course_structure) from Supabase
 * 2. Detect context tier based on instruction
 * 3. Assemble static + dynamic context
 * 4. Call LLM to regenerate the block
 * 5. Parse and validate response
 * 6. Generate semantic diff
 * 7. Update course data in database
 * 8. Save edit history to course_edits table
 *
 * @module orchestrator/handlers/block-regeneration-handler
 */

import { Job } from 'bullmq';
import {
  BlockRegenerationJobData,
  JobType,
  Json,
  AnalysisResult,
  CourseStructure,
} from '@megacampus/shared-types';
import { regenerationResponseSchema } from '@megacampus/shared-types/regeneration-types';
import { BaseJobHandler } from './base-handler.js';
import type { JobResult } from './base-handler.js';
import { getSupabaseAdmin } from '../../shared/supabase/admin.js';
import { llmClient } from '../../shared/llm/client.js';
import { captureError } from '../../shared/sentry/init.js';
import { getModelConfigBunker } from '../../shared/llm/model-config-bunker.js';
import logger from '../../shared/logger/index.js';
import {
  detectContextTier,
  generateSemanticDiff,
  assembleStaticContext,
  assembleDynamicContext,
  getFieldValue,
} from '../../shared/regeneration/index.js';
import { setNestedValue } from '../../shared/utils/nested-value.js';
import { resolveStructure } from '../../shared/course-nodes/structure-resolver.js';
import { writeCourseNodes } from '../../shared/course-nodes/writer.js';
import { assertStableIds } from '../../shared/course-nodes/feature-flags.js';
import { ensureStableIdsAndSchemaVersionInMemory } from '../../stages/stage5-generation/utils/course-structure-editor.js';

const PROGRESS = {
  FETCH_COURSE: 10,
  DETECT_TIER: 20,
  ASSEMBLE_CONTEXT: 30,
  CALL_LLM: 50,
  PARSE_RESPONSE: 70,
  GENERATE_DIFF: 80,
  SAVE_CONTENT: 90,
  COMPLETE: 100,
} as const;

/**
 * Block regeneration handler
 *
 * Processes BLOCK_REGENERATION jobs by:
 * - Fetching course data from Supabase
 * - Detecting context tier from instruction
 * - Assembling LLM context (static + dynamic)
 * - Calling LLM to regenerate the block content
 * - Validating and applying the regenerated content
 * - Saving edit history for audit trail
 *
 * @extends BaseJobHandler<BlockRegenerationJobData>
 */
export class BlockRegenerationHandler extends BaseJobHandler<BlockRegenerationJobData> {
  constructor() {
    super(JobType.BLOCK_REGENERATION);
  }

  /**
   * Execute block regeneration job
   *
   * @param jobData - Block regeneration job data
   * @param job - BullMQ job instance
   * @returns Job execution result with regeneration details
   */
  async execute(
    jobData: BlockRegenerationJobData,
    job: Job<BlockRegenerationJobData>
  ): Promise<JobResult> {
    const { courseId, userId, blockPath, instruction, stageId, parentJobId } = jobData;
    const supabase = getSupabaseAdmin();

    this.log(job, 'info', 'BlockRegeneration: Starting', {
      blockPath,
      stageId,
      parentJobId,
      instruction: instruction.slice(0, 100),
    });

    // Step 1: Fetch course data
    await this.updateProgress(job, PROGRESS.FETCH_COURSE, 'Fetching course data');

    const { data: courseData, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id, organization_id, analysis_result, course_structure, updated_at')
      .eq('id', courseId)
      .single();

    type CourseSelect = {
      id: string;
      user_id: string;
      organization_id: string;
      analysis_result: Json;
      course_structure: Json;
      updated_at: string | null;
    };

    const course = courseData as CourseSelect | null;

    if (courseError || !course) {
      this.log(job, 'error', 'BlockRegeneration: Course not found', {
        courseId,
        error: courseError?.message,
      });
      return {
        success: false,
        message: `Course not found: ${courseId}`,
        error: courseError?.message || 'Course not found',
      };
    }

    if (course.user_id !== userId) {
      this.log(job, 'error', 'BlockRegeneration: Ownership violation', {
        courseId,
        jobUserId: userId,
        courseOwnerId: course.user_id,
      });
      return {
        success: false,
        message: 'Unauthorized: user does not own this course',
        error: 'Ownership violation',
      };
    }

    const currentData =
      stageId === 'stage_4'
        ? course.analysis_result
        : await resolveStructure(courseId, course.course_structure, supabase);

    if (!currentData) {
      this.log(job, 'error', 'BlockRegeneration: Target data is null', {
        courseId,
        stageId,
      });
      return {
        success: false,
        message: `Cannot regenerate: ${stageId === 'stage_4' ? 'analysis_result' : 'course_structure'} is empty`,
        error: 'Target data not available',
      };
    }

    // Step 2: Check for cancellation
    await this.checkCancellation(job);

    // Step 3: Detect context tier
    await this.updateProgress(job, PROGRESS.DETECT_TIER, 'Detecting context tier');
    const tier = detectContextTier(instruction);

    this.log(job, 'info', 'BlockRegeneration: Context tier detected', {
      blockPath,
      tier,
    });

    // Step 4: Assemble static context
    await this.updateProgress(job, PROGRESS.ASSEMBLE_CONTEXT, 'Assembling context');

    const staticContext = assembleStaticContext({
      courseId,
      stageId,
      blockPath,
      tier,
      analysisResult: course.analysis_result as unknown as AnalysisResult,
      courseStructure: (stageId === 'stage_5'
        ? currentData
        : course.course_structure) as unknown as CourseStructure,
    });

    // Step 5: Assemble dynamic context
    const dynamicContext = assembleDynamicContext({
      courseId,
      stageId,
      blockPath,
      tier,
      analysisResult: course.analysis_result as unknown as AnalysisResult,
      courseStructure: (stageId === 'stage_5'
        ? currentData
        : course.course_structure) as unknown as CourseStructure,
    });

    this.log(job, 'info', 'BlockRegeneration: Context assembled', {
      blockPath,
      tier,
      staticTokens: staticContext.tokenEstimate,
      dynamicTokens: dynamicContext.tokenEstimate,
      totalTokens: staticContext.tokenEstimate + dynamicContext.tokenEstimate,
    });

    // Step 6: Check for cancellation before LLM call
    await this.checkCancellation(job);

    // Step 7: Call LLM
    await this.updateProgress(job, PROGRESS.CALL_LLM, 'Calling LLM for regeneration');

    const systemPrompt = `You are an expert instructional designer. Generate valid JSON only, no markdown or explanations.

<static_context>
${staticContext.content}
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
  <instruction>${instruction}</instruction>
  <target_field>${blockPath}</target_field>

  <dynamic_context>
${dynamicContext.content}
  </dynamic_context>
</regeneration_task>`;

    // Get model config from bunker (with fallback)
    let modelId = 'xiaomi/mimo-v2-flash';
    let temperature = 0.7;
    let maxTokens = 2000;

    try {
      const bunker = getModelConfigBunker();
      if (bunker.isInitialized()) {
        const bunkerTier = tier === 'structural' || tier === 'global' ? 'extended' : 'standard';
        const config = bunker.get('inline_block_regeneration', bunkerTier) as {
          model_id: string;
          temperature: number;
          max_tokens: number;
        };
        modelId = config.model_id;
        temperature = config.temperature;
        maxTokens = config.max_tokens;
      }
    } catch {
      // Fallback to defaults if bunker not available
      this.log(job, 'warn', 'BlockRegeneration: ModelConfigBunker not available, using defaults');
    }

    this.log(job, 'info', 'BlockRegeneration: Calling LLM', {
      blockPath,
      model: modelId,
    });

    const llmResponse = await llmClient.generateCompletion(userPrompt, {
      model: modelId,
      temperature,
      maxTokens,
      systemPrompt,
      enableCaching: true,
    });

    // Step 8: Parse LLM response
    await this.updateProgress(job, PROGRESS.PARSE_RESPONSE, 'Parsing LLM response');

    let regenerationData;
    try {
      let cleanedContent = llmResponse.content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/```\n?/g, '').replace(/```\n?$/g, '');
      }

      const parsedResponse = JSON.parse(cleanedContent) as unknown;
      regenerationData = regenerationResponseSchema.parse(parsedResponse);
    } catch (parseError) {
      this.log(job, 'error', 'BlockRegeneration: Failed to parse LLM response', {
        blockPath,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawContent: llmResponse.content.slice(0, 500),
      });
      captureError(parseError, {
        tags: { component: 'block-regeneration', step: 'parse-llm-response' },
        extra: { courseId, blockPath },
        level: 'error',
      });
      return {
        success: false,
        message: 'AI generation failed: invalid JSON response',
        error: parseError instanceof Error ? parseError.message : String(parseError),
      };
    }

    this.log(job, 'info', 'BlockRegeneration: LLM response parsed', {
      blockPath,
      alignmentScore: regenerationData.alignment_score,
      bloomPreserved: regenerationData.bloom_level_preserved,
    });

    // Step 9: Generate semantic diff
    await this.updateProgress(job, PROGRESS.GENERATE_DIFF, 'Generating semantic diff');

    const targetContent = getFieldValue(currentData as Record<string, unknown>, blockPath) as
      | string
      | Record<string, unknown>;

    const semanticDiff = generateSemanticDiff({
      original: targetContent,
      regenerated: regenerationData.regenerated_content,
      fieldPath: blockPath,
      blockType: blockPath.split('.').pop() || blockPath,
      llmChangeLog: regenerationData.pedagogical_change_log,
    });

    this.log(job, 'info', 'BlockRegeneration: Semantic diff generated', {
      blockPath,
      changeType: semanticDiff.changeType,
      alignmentScore: semanticDiff.alignmentScore,
    });

    // Step 10: Apply changes to course data
    await this.updateProgress(job, PROGRESS.SAVE_CONTENT, 'Saving regenerated content');

    const updatedData = structuredClone(currentData);
    try {
      setNestedValue(updatedData, blockPath, regenerationData.regenerated_content);
    } catch (error) {
      this.log(job, 'error', 'BlockRegeneration: Failed to set nested value', {
        blockPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Invalid field path: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Step 11: Update database with optimistic locking
    // Include updated_at in WHERE clause to detect concurrent modifications
    const updateColumn = stageId === 'stage_4' ? 'analysis_result' : 'course_structure';
    const now = new Date().toISOString();
    let dataToPersist: unknown = updatedData;

    if (stageId === 'stage_5') {
      const normalizedStructure = ensureStableIdsAndSchemaVersionInMemory(
        updatedData as CourseStructure
      );
      assertStableIds(normalizedStructure);
      dataToPersist = normalizedStructure;
    }

    const { data: updateResult, error: updateError } = await supabase
      .from('courses')
      .update({
        [updateColumn]: dataToPersist,
        updated_at: now,
      })
      .eq('id', courseId)
      .eq('updated_at', course.updated_at!)
      .select('id');

    if (updateError) {
      this.log(job, 'error', 'BlockRegeneration: Database update failed', {
        blockPath,
        stageId,
        error: updateError.message,
      });
      captureError(new Error(`DB update failed: ${updateError.message}`), {
        tags: { component: 'block-regeneration', step: 'db-update' },
        extra: { courseId, blockPath, stageId },
        level: 'error',
      });
      return {
        success: false,
        message: 'Failed to update regenerated content',
        error: updateError.message,
      };
    }

    // Optimistic lock check: if no rows matched, another job modified the course
    if (!updateResult || updateResult.length === 0) {
      this.log(job, 'warn', 'BlockRegeneration: Optimistic lock conflict — retrying', {
        blockPath,
        stageId,
        courseUpdatedAt: course.updated_at,
      });
      // Throw to trigger BullMQ retry with exponential backoff
      throw new Error(
        `Optimistic lock conflict: course ${courseId} was modified by another process`
      );
    }

    // Step 12: Save edit history (non-blocking)
    const { error: editHistoryError } = await supabase.from('course_edits').insert({
      course_id: courseId,
      edited_by: userId,
      stage: stageId,
      field_path: blockPath,
      previous_value: targetContent as Json,
      new_value: regenerationData.regenerated_content as Json,
      semantic_diff: semanticDiff as unknown as Json,
      user_instruction: instruction,
    });

    if (editHistoryError) {
      // Non-blocking: log error but don't fail the regeneration
      this.log(job, 'warn', 'BlockRegeneration: Failed to save edit history (non-blocking)', {
        blockPath,
        error: editHistoryError.message,
      });
    }

    // Phase 4: Dual-write to course_nodes (non-blocking, non-fatal)
    if (stageId === 'stage_5') {
      const structureForNodes = dataToPersist as CourseStructure;
      await writeCourseNodes(courseId, structureForNodes, supabase, logger).catch(err =>
        this.log(job, 'warn', 'BlockRegeneration: course_nodes dual-write failed (non-fatal)', {
          courseId,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    this.log(job, 'info', 'BlockRegeneration: Completed successfully', {
      blockPath,
      stageId,
      tier,
      parentJobId,
      changeType: semanticDiff.changeType,
      inputTokens: llmResponse.inputTokens,
      outputTokens: llmResponse.outputTokens,
    });

    return {
      success: true,
      message: 'Block regenerated successfully',
      data: {
        blockPath,
        changeType: semanticDiff.changeType,
        alignmentScore: regenerationData.alignment_score,
        bloomPreserved: regenerationData.bloom_level_preserved,
        parentJobId,
      },
    };
  }
}

/**
 * Singleton handler instance for use in processor registry
 */
export const blockRegenerationHandler = new BlockRegenerationHandler();

export default blockRegenerationHandler;
