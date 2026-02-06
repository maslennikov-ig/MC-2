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
import { BlockRegenerationJobData, JobType } from '@megacampus/shared-types';
import { regenerationResponseSchema } from '@megacampus/shared-types/regeneration-types';
import { BaseJobHandler } from './base-handler.js';
import type { JobResult } from './base-handler.js';
import { getSupabaseAdmin } from '../../shared/supabase/admin.js';
import { llmClient } from '../../shared/llm/client.js';
import {
  detectContextTier,
  generateSemanticDiff,
  assembleStaticContext,
  assembleDynamicContext,
  getFieldValue,
} from '../../shared/regeneration/index.js';

/**
 * Helper function to set a nested value in an object using a dot-delimited path.
 * Supports array index notation like sections[0].lessons[1].
 *
 * Inlined here to avoid importing from router-specific helpers
 * (the server router path is not appropriate for sandboxed processor context).
 */
function setNestedValue(obj: unknown, path: string, value: unknown): void {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid object: must be a non-null object');
  }

  // Split on dots but handle array indices: "sections[0].lessons[1].title"
  // becomes ["sections", "0", "lessons", "1", "title"]
  const keys = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(k => k !== '');

  if (keys.length === 0) {
    throw new Error('Invalid path: path cannot be empty');
  }

  let current = obj as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (!(key in current)) {
      current[key] = {};
    }

    if (typeof current[key] !== 'object' || current[key] === null) {
      throw new Error(`Cannot traverse path: "${key}" is not an object`);
    }

    current = current[key] as Record<string, unknown>;
  }

  const finalKey = keys[keys.length - 1];
  current[finalKey] = value;
}

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
    await this.updateProgress(job, 10, 'Fetching course data');

    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id, organization_id, analysis_result, course_structure')
      .eq('id', courseId)
      .single();

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

    const currentData = stageId === 'stage_4' ? course.analysis_result : course.course_structure;

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
    await this.updateProgress(job, 20, 'Detecting context tier');
    const tier = detectContextTier(instruction);

    this.log(job, 'info', 'BlockRegeneration: Context tier detected', {
      blockPath,
      tier,
    });

    // Step 4: Assemble static context
    await this.updateProgress(job, 30, 'Assembling context');

    const staticContext = await assembleStaticContext({
      courseId,
      stageId,
      blockPath,
      tier,
      analysisResult: course.analysis_result as any,
      courseStructure: course.course_structure as any,
    });

    // Step 5: Assemble dynamic context
    const dynamicContext = await assembleDynamicContext({
      courseId,
      stageId,
      blockPath,
      tier,
      analysisResult: course.analysis_result as any,
      courseStructure: course.course_structure as any,
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
    await this.updateProgress(job, 50, 'Calling LLM for regeneration');

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

    this.log(job, 'info', 'BlockRegeneration: Calling LLM', {
      blockPath,
      model: 'openai/gpt-4o-mini',
    });

    const llmResponse = await llmClient.generateCompletion(userPrompt, {
      model: 'openai/gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt,
      enableCaching: true,
    });

    // Step 8: Parse LLM response
    await this.updateProgress(job, 70, 'Parsing LLM response');

    let regenerationData;
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
      this.log(job, 'error', 'BlockRegeneration: Failed to parse LLM response', {
        blockPath,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawContent: llmResponse.content.slice(0, 500),
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
    await this.updateProgress(job, 80, 'Generating semantic diff');

    const targetContent = getFieldValue(currentData, blockPath);

    const semanticDiff = await generateSemanticDiff({
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
    await this.updateProgress(job, 90, 'Saving regenerated content');

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

    // Step 11: Update database
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
      this.log(job, 'error', 'BlockRegeneration: Database update failed', {
        blockPath,
        stageId,
        error: updateError.message,
      });
      return {
        success: false,
        message: 'Failed to update regenerated content',
        error: updateError.message,
      };
    }

    // Step 12: Save edit history (non-blocking)
    const { error: editHistoryError } = await supabase.from('course_edits').insert({
      course_id: courseId,
      edited_by: userId,
      stage: stageId,
      field_path: blockPath,
      previous_value: targetContent as any,
      new_value: regenerationData.regenerated_content as any,
      semantic_diff: semanticDiff as any,
      user_instruction: instruction,
    });

    if (editHistoryError) {
      // Non-blocking: log error but don't fail the regeneration
      this.log(job, 'warn', 'BlockRegeneration: Failed to save edit history (non-blocking)', {
        blockPath,
        error: editHistoryError.message,
      });
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
