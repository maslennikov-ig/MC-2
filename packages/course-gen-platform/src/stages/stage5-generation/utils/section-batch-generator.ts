/**
 * Section Batch Generator - Tiered Model Routing for Lesson Generation
 *
 * Implements RT-001 Phase 3 tiered model routing strategy:
 * - Tier 1 (OSS 120B): 70-75% of sections, quality gate ≥0.75, escalate if fails
 * - Tier 2 (qwen3-max): 20-25% of sections, pre-route if complexity ≥0.75 OR criticality ≥0.80
 * - Tier 3 (Gemini 2.5 Flash): 5% overflow, trigger if context >108K tokens
 *
 * Expands section-level structure from Analyze into 3-5 detailed lessons with exercises.
 *
 * @module services/stage5/section-batch-generator
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md (Phase 3)
 * @see specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md
 * @see .tmp/current/plans/.t020-section-batch-generator-plan.json
 */

import { ChatOpenAI } from '@langchain/openai';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type {
  GenerationJobInput,
  Section,
} from '@megacampus/shared-types';
import {
  SectionSchema,
  SectionWithoutInjectedFieldsSchema
} from '@megacampus/shared-types/generation-result';
import type { SectionBreakdown } from '@megacampus/shared-types/analysis-schemas';
import { getStylePrompt } from '@megacampus/shared-types/style-prompts';
import type {
  LessonSpecificationV2,
  BloomLevelV2,
  ExerciseTypeV2,
  ExerciseDifficultyV2,
  LessonRAGContextV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { preprocessObject } from '@/shared/validation/preprocessing';
import { z } from 'zod';
import {
  getDifficultyFromAnalysis,
  formatCourseCategoryForPrompt,
  formatPedagogicalStrategyForPrompt,
  formatPedagogicalPatternsForPrompt,
  formatGenerationGuidanceForPrompt,
} from './analysis-formatters';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import { inferSemanticScaffolding } from './semantic-scaffolding';
import logger from '@/shared/logger';
import { createModelConfigService } from '../../../shared/llm/model-config-service';
import { getRagTokenBudget } from '../../../services/global-settings-service';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * OpenRouter API base URL
 */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Model configurations for tiered routing (Updated 2025-11-19)
 * Based on quality testing results (DEEPSEEK-V31-TERMINUS-QUALITY-REPORT.md)
 *
 * Using regular model (not -thinking variant) for performance (INV-2025-11-19-003)
 * Regular: 15-29s, Thinking: 30-110s (test), 521s (production context)
 * Both achieve 100% success rate, no quality difference for structured generation
 */
const MODELS = {
  tier1_oss120b: 'openai/gpt-oss-120b',          // Baseline model (unchanged)

  // RU Lessons: Qwen3 235B A22B-2507 (9.2/10 - Gold!)
  // NOTE: Using regular model (not -thinking) for 17-35x performance improvement
  ru_lessons_primary: 'qwen/qwen3-235b-a22b-2507',

  // EN Lessons: DeepSeek v3.1 Terminus (8.8/10 - Silver, 100% stability)
  en_lessons_primary: 'deepseek/deepseek-v3.1-terminus',

  // Fallback for all languages: Kimi K2-0905 (8.7 RU / 8.8 EN)
  lessons_fallback: 'moonshotai/kimi-k2-0905',

  tier3_gemini: 'google/gemini-2.5-flash',       // Overflow (unchanged)
} as const;

/**
 * Token budget constants (RT-003)
 * Note: RAG_MAX_TOKENS is now fetched dynamically from database via getRagTokenBudget()
 */
const TOKEN_BUDGET = {
  INPUT_BUDGET_MAX: 90000,      // 90K input tokens per batch
  RAG_MAX_TOKENS: 40000,        // Fallback 40K max for RAG context (if DB fetch fails)
  GEMINI_TRIGGER_INPUT: 108000, // 108K tokens triggers Gemini
  BASE_PROMPT: 5000,            // ~5K for base prompt
  STYLE_PROMPT: 1000,           // ~1K for style integration
  SECTION_CONTEXT: 3000,        // ~3K per section context
} as const;

/**
 * Quality thresholds for tiered routing (RT-001)
 */
const QUALITY_THRESHOLDS = {
  tier1_similarity: 0.75,  // OSS 120B must achieve ≥0.75 similarity
  tier2_similarity: 0.80,  // qwen3-max target ≥0.80 similarity
  complexity: 0.75,        // Pre-route to qwen3-max if complexity ≥0.75
  criticality: 0.80,       // Pre-route to qwen3-max if criticality ≥0.80
} as const;

/**
 * Per-batch architecture (FR-016)
 */
const SECTIONS_PER_BATCH = 1; // Fixed: 1 section per batch

// ============================================================================
// TYPES
// ============================================================================

/**
 * Model tier selection result
 */
export interface ModelTier {
  model: string;
  tier: 'tier1_oss120b' | 'tier2_ru_lessons' | 'tier2_en_lessons' | 'fallback_kimi' | 'tier3_gemini';
  reason: string;
}

/**
 * Section batch generation result
 */
export interface SectionBatchResult {
  sections: Section[];
  modelUsed: string;
  tier: string;
  tokensUsed: number;
  retryCount: number;
  complexityScore: number;
  criticalityScore: number;
  /** Regeneration metrics from UnifiedRegenerator (RT-005) */
  regenerationMetrics?: {
    layerUsed: string;
    repairSuccessRate: number;
    tokensSaved: number;
    qualityPassed: boolean;
  };
}

/**
 * Section batch generation result with V2 LessonSpecification output
 *
 * Used for Stage 6 lesson content generation with Semantic Scaffolding.
 * Converts Section[] output to LessonSpecificationV2[] for compatibility
 * with the new generation pipeline.
 *
 * @see specs/010-stages-456-pipeline/data-model.md
 */
export interface SectionBatchResultV2 {
  lessonSpecs: LessonSpecificationV2[];
  modelUsed: string;
  tier: string;
  tokensUsed: number;
  retryCount: number;
  complexityScore: number;
  criticalityScore: number;
  /** Regeneration metrics from UnifiedRegenerator (RT-005) */
  regenerationMetrics?: {
    layerUsed: string;
    repairSuccessRate: number;
    tokensSaved: number;
    qualityPassed: boolean;
  };
}

// ============================================================================
// SECTION BATCH GENERATOR CLASS
// ============================================================================

/**
 * SectionBatchGenerator - Generate lessons from section-level structure
 *
 * Expands Analyze section breakdown into 3-5 detailed lessons per section
 * using tiered model routing for cost optimization.
 *
 * @example
 * ```typescript
 * const generator = new SectionBatchGenerator();
 * const result = await generator.generateBatch(
 *   1,        // batchNum
 *   0,        // startSection
 *   1,        // endSection
 *   jobInput, // GenerationJobInput
 *   qdrantClient // optional RAG
 * );
 * console.log(result.sections.length); // 1 section with 3-5 lessons
 * ```
 */
export class SectionBatchGenerator {
  /**
   * Generate batch of sections with tiered model routing
   *
   * Implements RT-001 Phase 3 tiered routing + RT-005 JSON repair:
   * 1. Extract section from analysis_result
   * 2. Calculate complexity score (pre-routing)
   * 3. Assess criticality (pre-routing)
   * 4. Select model tier
   * 5. Build prompt via buildBatchPrompt()
   * 6. Invoke ChatOpenAI
   * 7. Parse with UnifiedRegenerator (Layers 1-2: auto-repair + critique-revise)
   * 8. Validate with SectionSchema
   * 9. If quality gate fails: retry with higher tier
   * 10. Return Section[] with regeneration metrics
   *
   * @param batchNum - Batch number (for tracking)
   * @param startSection - Start section index (inclusive)
   * @param endSection - End section index (exclusive)
   * @param input - Generation job input
   * @param qdrantClient - Optional RAG client for document search
   * @returns Section batch result with metrics
   *
   * @throws Error if section generation fails after all retries
   */
  async generateBatch(
    batchNum: number,
    startSection: number,
    endSection: number,
    input: GenerationJobInput,
    qdrantClient?: QdrantClient
  ): Promise<SectionBatchResult> {
    // Validate batch parameters
    if (endSection - startSection !== SECTIONS_PER_BATCH) {
      throw new Error(
        `Invalid batch size: expected ${SECTIONS_PER_BATCH} section(s), got ${endSection - startSection}`
      );
    }

    // Step 1: Extract section from analysis_result
    const sectionIndex = startSection;
    const section = this.extractSection(input, sectionIndex);

    // Step 2: Calculate complexity score (pre-routing)
    const complexityScore = this.calculateComplexityScore(section);

    // Step 3: Assess criticality (pre-routing)
    const criticalityScore = this.assessCriticality(section);

    // FR-027: Extract language
    // Note: contextual_language is now an object, not a string - use only frontend_parameters
    const language = input.frontend_parameters.language || 'en';

    logger.info({
      msg: 'Section batch generation: language detected',
      language,
      batchNum,
      courseId: input.course_id,
    });

    // Step 4: Select model tier with language awareness
    const modelTier = await this.selectModelTier(
      complexityScore,
      criticalityScore,
      input,
      qdrantClient,
      language  // NEW PARAMETER
    );

    logger.info({
      msg: 'Model tier selected for section batch',
      batchNum,
      sectionIndex,
      tier: modelTier.tier,
      model: modelTier.model,
      reason: modelTier.reason,
      complexityScore: complexityScore.toFixed(2),
      criticalityScore: criticalityScore.toFixed(2),
    });

    // Step 5-10: Generate with retry logic
    return await this.generateWithRetry(
      batchNum,
      sectionIndex,
      input,
      modelTier,
      qdrantClient,
      complexityScore,
      criticalityScore,
      language  // Pass language for escalation
    );
  }

  /**
   * Extract section from analysis_result
   *
   * @param input - Generation job input
   * @param sectionIndex - Section index (0-based)
   * @returns Section breakdown from analysis
   *
   * @throws Error if analysis_result is null or section index out of bounds
   */
  private extractSection(input: GenerationJobInput, sectionIndex: number): SectionBreakdown {
    if (!input.analysis_result) {
      throw new Error('Cannot generate sections: analysis_result is null (title-only scenario not supported for section generation)');
    }

    const sections = input.analysis_result.recommended_structure.sections_breakdown;

    if (sectionIndex < 0 || sectionIndex >= sections.length) {
      throw new Error(
        `Section index ${sectionIndex} out of bounds (0-${sections.length - 1})`
      );
    }

    return sections[sectionIndex];
  }

  /**
   * Calculate complexity score for pre-routing (RT-001)
   *
   * Heuristic-based complexity assessment:
   * - Topic breadth: More key_topics = higher complexity
   * - Learning objectives count: More objectives = higher complexity
   * - Estimated lessons: More lessons = higher complexity
   *
   * @param section - Section breakdown from analysis
   * @returns Complexity score (0-1 scale, ≥0.75 triggers qwen3-max)
   */
  private calculateComplexityScore(section: SectionBreakdown): number {
    let score = 0;

    // Factor 1: Topic breadth (0-0.4)
    const topicCount = section.key_topics?.length || 0;
    if (topicCount >= 8) {
      score += 0.4; // Many topics = high complexity
    } else if (topicCount >= 5) {
      score += 0.25; // Medium topics
    } else {
      score += 0.1; // Few topics
    }

    // Factor 2: Learning objectives count (0-0.3)
    const objectiveCount = section.learning_objectives?.length || 0;
    if (objectiveCount >= 5) {
      score += 0.3; // Many objectives = high complexity
    } else if (objectiveCount >= 3) {
      score += 0.2; // Medium objectives
    } else {
      score += 0.1; // Few objectives
    }

    // Factor 3: Estimated lessons (0-0.3)
    const estimatedLessons = section.estimated_lessons || 0;
    if (estimatedLessons >= 5) {
      score += 0.3; // Many lessons = high complexity
    } else if (estimatedLessons >= 3) {
      score += 0.2; // Medium lessons
    } else {
      score += 0.1; // Few lessons
    }

    return Math.min(1.0, score);
  }

  /**
   * Assess criticality for pre-routing (RT-001)
   *
   * Heuristic-based criticality assessment:
   * - Importance: 'core' sections are critical
   * - Position: First sections are foundational (critical)
   *
   * @param section - Section breakdown from analysis
   * @returns Criticality score (0-1 scale, ≥0.80 triggers qwen3-max)
   */
  private assessCriticality(section: SectionBreakdown): number {
    let score = 0;

    // Factor 1: Importance (0-0.6)
    const importance = section.importance || 'optional';
    if (importance === 'core') {
      score += 0.6; // Core sections are critical
    } else if (importance === 'important') {
      score += 0.3; // Important sections
    } else {
      score += 0.1; // Optional sections
    }

    // Factor 2: Foundational position (0-0.4)
    // Note: We don't have section index here, so we check if it's explicitly marked
    // In a real implementation, you'd pass section index to this method
    // For now, assume sections with "introduction" or "fundamentals" are foundational
    const sectionName = section.area?.toLowerCase() || '';
    if (
      sectionName.includes('introduction') ||
      sectionName.includes('fundamental') ||
      sectionName.includes('basics') ||
      sectionName.includes('getting started')
    ) {
      score += 0.4; // Foundational sections are critical
    } else {
      score += 0.2; // Non-foundational
    }

    return Math.min(1.0, score);
  }

  /**
   * Select model tier based on complexity, criticality, and language
   *
   * Updated 2025-11-14: Added language-aware routing with ModelConfigService
   * - Primary: Uses ModelConfigService with database lookup + hardcoded fallback
   * - RU fallback: Qwen3 235B A22B-2507 (9.2/10 - Gold for RU Lessons!)
   * - EN fallback: DeepSeek v3.1 Terminus (8.8/10 - Silver, 100% stability)
   * - Emergency fallback: Kimi K2-0905 (8.7 RU / 8.8 EN)
   *
   * @param complexityScore - Complexity score (0-1)
   * @param criticalityScore - Criticality score (0-1)
   * @param input - Generation job input
   * @param qdrantClient - Optional RAG client
   * @param language - Target language (ru/en/etc)
   * @returns Model tier selection
   */
  private async selectModelTier(
    complexityScore: number,
    criticalityScore: number,
    input: GenerationJobInput,
    qdrantClient: QdrantClient | undefined,
    language: string
  ): Promise<ModelTier> {
    // Estimate context length (now async to fetch dynamic RAG budget)
    const estimatedContextLength = await this.estimateContextLength(input, qdrantClient);

    // Tier 3: Context overflow (>108K tokens)
    if (estimatedContextLength > TOKEN_BUDGET.GEMINI_TRIGGER_INPUT) {
      return {
        model: MODELS.tier3_gemini,
        tier: 'tier3_gemini',
        reason: `Context overflow: ${estimatedContextLength} tokens > ${TOKEN_BUDGET.GEMINI_TRIGGER_INPUT} threshold`,
      };
    }

    // Tier 2: Language-aware premium model selection with ModelConfigService
    if (
      complexityScore >= QUALITY_THRESHOLDS.complexity ||
      criticalityScore >= QUALITY_THRESHOLDS.criticality
    ) {
      try {
        const service = createModelConfigService();
        const langCode = (language === 'ru' || language === 'russian') ? 'ru' : 'en';
        const config = await service.getModelForStage(5, langCode, estimatedContextLength);

        const isRussian = langCode === 'ru';
        const tierName = isRussian ? 'tier2_ru_lessons' : 'tier2_en_lessons';

        logger.info({
          msg: 'Tier 2 model selection via ModelConfigService',
          language: langCode,
          primary: config.primary,
          source: config.source,
          tier: config.tier,
          complexityScore,
          criticalityScore,
        });

        return {
          model: config.primary,
          tier: tierName,
          reason: `High complexity (${complexityScore.toFixed(2)}) or criticality (${criticalityScore.toFixed(2)}) - using ${language}-optimized model (${config.primary}, source: ${config.source})`,
        };
      } catch (error) {
        logger.warn({
          msg: 'ModelConfigService failed for tier2, using hardcoded fallback',
          language,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Fallback to MODELS constant (safety net)
        const isRussian = language === 'ru' || language === 'russian';
        const model = isRussian ? MODELS.ru_lessons_primary : MODELS.en_lessons_primary;
        const tierName = isRussian ? 'tier2_ru_lessons' : 'tier2_en_lessons';

        return {
          model,
          tier: tierName,
          reason: `High complexity (${complexityScore.toFixed(2)}) or criticality (${criticalityScore.toFixed(2)}) - using ${language}-optimized model (${model}, hardcoded fallback)`,
        };
      }
    }

    // Tier 1: Default OSS 120B (70-75% of sections)
    return {
      model: MODELS.tier1_oss120b,
      tier: 'tier1_oss120b',
      reason: `Standard section: complexity=${complexityScore.toFixed(2)} <${QUALITY_THRESHOLDS.complexity}, criticality=${criticalityScore.toFixed(2)} <${QUALITY_THRESHOLDS.criticality}`,
    };
  }

  /**
   * Estimate context length for Tier 3 routing
   *
   * @param input - Generation job input
   * @param qdrantClient - Optional RAG client
   * @returns Estimated input tokens
   */
  private async estimateContextLength(
    input: GenerationJobInput,
    qdrantClient?: QdrantClient
  ): Promise<number> {
    // Base prompt + style + section context
    let estimatedTokens =
      TOKEN_BUDGET.BASE_PROMPT +
      TOKEN_BUDGET.STYLE_PROMPT +
      TOKEN_BUDGET.SECTION_CONTEXT;

    // Add RAG context if enabled (fetch dynamic budget from database)
    if (qdrantClient && input.vectorized_documents) {
      const ragMaxTokens = await getRagTokenBudget();
      estimatedTokens += ragMaxTokens;
    }

    return estimatedTokens;
  }

  /**
   * Generate section with retry logic and quality gate validation
   *
   * Implements 2-attempt retry with progressive strictness:
   * - Attempt 1: Standard prompt with examples
   * - Attempt 2: Minimal valid JSON with strict schema rules
   * - Reactive escalation: If Tier 1 fails quality gate, retry with Tier 2
   *
   * @param batchNum - Batch number
   * @param sectionIndex - Section index
   * @param input - Generation job input
   * @param modelTier - Selected model tier
   * @param qdrantClient - Optional RAG client
   * @param complexityScore - Complexity score
   * @param criticalityScore - Criticality score
   * @param language - Target language (ru/en/etc)
   * @returns Section batch result
   *
   * @throws Error if all retry attempts fail
   */
  private async generateWithRetry(
    batchNum: number,
    sectionIndex: number,
    input: GenerationJobInput,
    modelTier: ModelTier,
    qdrantClient: QdrantClient | undefined,
    complexityScore: number,
    criticalityScore: number,
    language: string
  ): Promise<SectionBatchResult> {
    const maxAttempts = 2;
    let retryCount = 0;
    let currentModelTier = modelTier;

    while (retryCount < maxAttempts) {
      try {
        // Step 5: Build prompt
        const prompt = this.buildBatchPrompt(
          input,
          sectionIndex,
          qdrantClient,
          retryCount + 1 // Progressive strictness
        );

        // Step 6: Invoke ChatOpenAI
        const model = this.createModel(currentModelTier.model);
        const response = await model.invoke(prompt);
        
        // Fix: safely handle message content
        let rawContent: string;
        if (typeof response.content === 'string') {
          rawContent = response.content;
        } else {
          // Handle MessageContentComplex[] by concatenating text parts
          rawContent = response.content
            .map(c => (typeof c === 'string' ? c : 'text' in c ? c.text : ''))
            .join('');
        }

        // TIER 1: PREPROCESSING (before UnifiedRegenerator)
        // Stage 5: NO warning fallback - database must be strict
        const preprocessedContent = this.preprocessResponse(rawContent);

        // Step 7: Parse response with UnifiedRegenerator (all 5 layers)
        const regenerator = new UnifiedRegenerator<{ sections: Section[] } | Section | Section[]>({
          enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
          maxRetries: 3, // Increased to allow Layer 4 (escalation) + Layer 5 (fallback)
          model: model, // Required for Layers 2-4
          qualityValidator: (data) => {
            // Accept single section object, sections array, or wrapped format
            // FIX: INV-2025-11-17-007 - LLMs often return single section objects
            if (Array.isArray(data)) {
              return data.length > 0; // Array of sections
            }
            if ('sections' in data && Array.isArray((data as { sections: Section[] }).sections)) {
              return (data as { sections: Section[] }).sections.length > 0; // Wrapped in { sections: [...] }
            }
            // Check if it's a single section object
            const section = data as Partial<Section>;
            if (section.section_number !== undefined && section.lessons) {
              return true; // Single section object (most common)
            }
            return false;
          },
          metricsTracking: true,
          stage: 'generation',
          courseId: input.course_id,
          phaseId: `section_batch_generation_${batchNum}`,
        });

        const result = await regenerator.regenerate({
          rawOutput: preprocessedContent,
          originalPrompt: prompt,
        });

        if (!result.success || !result.data) {
          throw new Error(`Failed to parse sections: ${result.error}`);
        }

        // RT-006: Normalize result.data to array and validate
        const sections = this.validateAndInjectDuration(result.data, input, batchNum, sectionIndex);

        // Step 9: Calculate regeneration metrics
        const regenerationMetrics = {
          layerUsed: result.metadata.layerUsed,
          repairSuccessRate: result.metadata.layerUsed === 'failed' ? 0 : 1,
          tokensSaved: result.metadata.layerUsed === 'auto-repair'
            ? this.estimateTokens(prompt, rawContent) * 0.3 // 30% savings for Layer 1
            : 0,
          qualityPassed: result.metadata.qualityPassed || false,
        };

        logger.info({
          msg: 'Section batch generation succeeded with UnifiedRegenerator',
          batchNum,
          sectionIndex,
          layerUsed: result.metadata.layerUsed,
          retryCount: result.metadata.retryCount,
          repairSuccessRate: regenerationMetrics.repairSuccessRate,
          tokensSaved: regenerationMetrics.tokensSaved,
        });

        // Success!
        return {
          sections,
          modelUsed: currentModelTier.model,
          tier: currentModelTier.tier,
          tokensUsed: this.estimateTokens(prompt, rawContent),
          retryCount,
          complexityScore,
          criticalityScore,
          regenerationMetrics,
        };
      } catch (error) {
        retryCount++;

        // If Tier 1 (OSS 120B) failed, escalate to Tier 2 with language awareness
        if (
          currentModelTier.tier === 'tier1_oss120b' &&
          retryCount < maxAttempts
        ) {
          console.warn(
            JSON.stringify({
              msg: 'Tier 1 (OSS 120B) failed, attempting escalation to Tier 2',
              batchNum,
              sectionIndex,
              attempt: retryCount,
              error: error instanceof Error ? error.message : 'Unknown error',
              level: 'warn',
            })
          );

          // Tier 2 escalation with language awareness
          const isRussian = language === 'ru' || language === 'russian';
          const escalationModel = isRussian
            ? MODELS.ru_lessons_primary   // Qwen3 235B for RU (9.2/10)
            : MODELS.en_lessons_primary;  // DeepSeek Terminus for EN (8.8/10)

          currentModelTier = {
            model: escalationModel,
            tier: isRussian ? 'tier2_ru_lessons' : 'tier2_en_lessons',
            reason: `Quality escalation from tier1 - using ${language}-optimized model`,
          };

          logger.info({
            msg: 'Escalating to tier2 after quality failure',
            language,
            model: escalationModel,
            tier: currentModelTier.tier,
            batchNum,
          });

          continue; // Retry with language-optimized Tier 2
        }

        // Log retry
        if (retryCount < maxAttempts) {
          console.warn(
            JSON.stringify({
              msg: 'Section generation failed, retrying with stricter prompt',
              batchNum,
              sectionIndex,
              attempt: retryCount,
              tier: currentModelTier.tier,
              error: error instanceof Error ? error.message : 'Unknown error',
              level: 'warn',
            })
          );

          // Exponential backoff
          const delay = 1000 * retryCount;
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Max retries exceeded
          throw new Error(
            `Failed to generate section batch ${batchNum} (section ${sectionIndex}) after ${maxAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }

    // Should never reach here due to loop logic
    throw new Error('Section generation failed unexpectedly');
  }

  /**
   * Preprocess response content
   * @param rawContent - Raw JSON string
   * @returns Preprocessed JSON string
   */
  private preprocessResponse(rawContent: string): string {
    try {
      const parsedRaw = JSON.parse(rawContent) as Record<string, unknown> | Record<string, unknown>[];
      // Handle both {sections: [...]} and direct array formats
      let sectionsArray: Record<string, unknown>[] | undefined;
      
      if (Array.isArray(parsedRaw)) {
        sectionsArray = parsedRaw;
      } else if ('sections' in parsedRaw && Array.isArray(parsedRaw.sections)) {
        sectionsArray = parsedRaw.sections as Record<string, unknown>[];
      }

      if (sectionsArray) {
        sectionsArray = sectionsArray.map((section) => {
          // Preprocess section-level enum fields
          const preprocessedSection = preprocessObject(section, {
            difficulty_level: 'enum',
          });

          // Preprocess lessons array if present
          if (preprocessedSection.lessons && Array.isArray(preprocessedSection.lessons)) {
            preprocessedSection.lessons = (preprocessedSection.lessons as Record<string, unknown>[]).map((lesson) => {
              const preprocessedLesson = preprocessObject(lesson, {
                difficulty_level: 'enum',
              });

              // Preprocess practical_exercises array if present (FR-010)
              if (preprocessedLesson.practical_exercises && Array.isArray(preprocessedLesson.practical_exercises)) {
                preprocessedLesson.practical_exercises = (preprocessedLesson.practical_exercises as Record<string, unknown>[]).map((exercise) =>
                  preprocessObject(exercise, {
                    difficulty_level: 'enum',
                    // exercise_type removed - now freeform text field
                  })
                );
              }

              return preprocessedLesson;
            });
          }

          return preprocessedSection;
        });

        // Reconstruct original format
        const result = Array.isArray(parsedRaw) ? sectionsArray : { sections: sectionsArray };
        return JSON.stringify(result);
      }
    } catch (error) {
      // If preprocessing fails, continue with raw output
      console.warn('[Section Batch Generator] Preprocessing failed, using raw output:', error);
    }
    return rawContent;
  }

  /**
   * Validate sections and inject duration
   * @param data - Raw data from regenerator
   * @param input - Generation job input
   * @param batchNum - Batch number
   * @param sectionIndex - Section index
   * @returns Validated Section array
   */
  private validateAndInjectDuration(
    data: { sections: Section[] } | Section | Section[], 
    input: GenerationJobInput,
    batchNum: number, 
    sectionIndex: number
  ): Section[] {
    // RT-006: Normalize result.data to array before validation
    let sectionsToValidate: unknown[];
    
    if (Array.isArray(data)) {
      sectionsToValidate = data as unknown[];
    } else if (typeof data === 'object' && data !== null && 'sections' in data && Array.isArray((data as { sections: Section[] }).sections)) {
      sectionsToValidate = (data as { sections: Section[] }).sections as unknown[];
    } else {
      // Single section object
      sectionsToValidate = [data];
    }

    // CRITICAL: Inject estimated_duration_minutes AFTER generation, BEFORE validation
    const lessonDuration = input.frontend_parameters.lesson_duration_minutes || 15;

    logger.info({
      msg: 'Injecting lesson duration from frontend_parameters',
      lessonDuration,
      batchNum,
      sectionIndex,
      courseId: input.course_id,
    });

    sectionsToValidate = sectionsToValidate.map((section) => {
      const sectionObj = section as Record<string, unknown>;
      if (sectionObj.lessons && Array.isArray(sectionObj.lessons)) {
        return {
          ...sectionObj,
          lessons: sectionObj.lessons.map((lesson) => {
            const lessonObj = lesson as Record<string, unknown>;
            return {
              ...lessonObj,
              estimated_duration_minutes: lessonDuration, // Inject from frontend_parameters
            };
          }),
        };
      }
      return sectionObj;
    });

    // RT-006: Validate sections with Bloom's Taxonomy validators
    try {
      return z.array(SectionSchema).parse(sectionsToValidate);
      // ✅ RT-006 validators executed for all lessons in sections
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        console.error(
          JSON.stringify({
            msg: 'RT-006 validation failed in section generation',
            batchNum,
            sectionIndex,
            issues,
            level: 'error',
          })
        );
        throw new Error(`RT-006 validation failed: ${issues}`);
      }
      throw error;
    }
  }

  /**
   * Build batch prompt with RT-002 prompt engineering (T021)
   *
   * RT-002 Guidelines:
   * - Let reasoning models reason - provide constraints, NOT instructions
   * - Avoid over-specification (reduces quality by 15-30%)
   * - Request: Lesson breakdown (3-5 lessons), SMART objectives, Bloom's taxonomy,
   *   topic hierarchies, exercises
   *
   * Integrations:
   * - FR-028: Style integration via getStylePrompt()
   * - FR-027: Language extraction
   * - FR-030: Explicitly instruct style for lesson_objectives/key_topics
   * - FR-011: Include lesson specs (lesson_objectives, key_topics, duration)
   * - FR-010: Include 3-5 exercises per lesson
   * - RAG: If qdrantClient provided, include search tool instruction
   *
   * @param input - Generation job input
   * @param sectionIndex - Section index
   * @param qdrantClient - Optional RAG client
   * @param attemptNumber - Attempt number (1 or 2, for progressive strictness)
   * @returns Complete batch prompt
   */
  private buildBatchPrompt(
    input: GenerationJobInput,
    sectionIndex: number,
    qdrantClient: QdrantClient | undefined,
    attemptNumber: number
  ): string {
    // FR-027: Extract language
    // Note: contextual_language is now an object, not a string - use only frontend_parameters
    const language = input.frontend_parameters.language || 'en';

    // FR-028: Get style prompt
    const style = input.frontend_parameters.style || 'conversational';
    const stylePrompt = getStylePrompt(style);

    // Extract section from analysis
    const section = this.extractSection(input, sectionIndex);
    const sectionTitle = section.area || 'Untitled Section';
    const learningObjectives = section.learning_objectives || [];
    const keyTopics = section.key_topics || [];
    const estimatedLessons = section.estimated_lessons || 3;

    // Base prompt structure (RT-002: constraints, not instructions)
    let prompt = `You are an expert course designer expanding section-level structure into detailed lessons.

**Course Context**:
- Course Title: ${input.frontend_parameters.course_title}
- Target Language: ${language}
- Content Style: ${stylePrompt}

**Section to Expand** (Section ${sectionIndex + 1}):
- Section Title: ${sectionTitle}
- Learning Objectives (section-level): ${learningObjectives.join('; ')}
- Key Topics: ${keyTopics.join(', ')}
- Estimated Lessons: ${estimatedLessons}

`;

    // Add analysis context if available
    if (input.analysis_result) {
      const difficulty = getDifficultyFromAnalysis(input.analysis_result);
      const category = formatCourseCategoryForPrompt(input.analysis_result.course_category);
      const strategy = formatPedagogicalStrategyForPrompt(input.analysis_result.pedagogical_strategy);
      const patterns = formatPedagogicalPatternsForPrompt(input.analysis_result.pedagogical_patterns);
      const guidance = formatGenerationGuidanceForPrompt(input.analysis_result.generation_guidance);

      prompt += `**Analysis Context** (from Stage 4):
- Difficulty: ${difficulty}
- Category: ${category}
- Topic: ${input.analysis_result.topic_analysis.determined_topic}

**Pedagogical Strategy**:
${strategy}

**Pedagogical Patterns**:
${patterns}

**Generation Guidance**:
${guidance}

`;
    }

    // RT-002: Add Zod schema description for clear structure
    // Note: Using SectionWithoutInjectedFieldsSchema - duration will be injected after generation
    const schemaDescription = zodToPromptSchema(SectionWithoutInjectedFieldsSchema);

    prompt += `**Your Task**: Expand this section into 3-5 detailed lessons.

**CRITICAL: You MUST respond with valid JSON matching this EXACT schema**:

${schemaDescription}

**Constraints**:
1. **Lesson Breakdown**: Generate ${estimatedLessons} lessons (can be 3-5 if pedagogically justified)
2. **Learning Objectives** (FR-011): Each lesson must have 1-5 SMART objectives using Bloom's taxonomy action verbs
   - FR-030: Apply ${style} style to objectives (e.g., storytelling: "explore", "discover"; academic: "analyze", "evaluate")
3. **Key Topics** (FR-011): Each lesson must have 2-10 specific key topics
   - FR-030: Frame topics in ${style} style (e.g., conversational: "Let's learn about...", professional: "Core competency:")
4. **Practical Exercises** (FR-010): Each lesson must have 3-5 exercises with descriptive exercise_type text
   - Use brief labels (10-30 chars) or detailed multi-step instructions (50-150+ chars)
   - Examples: "case study analysis", "role-play scenario", "hands-on lab", "group discussion with peer feedback"
5. **Coherence**: Lessons must follow logical progression, build on prerequisites
6. **Language**: All content in ${language}

**NOTE**: Duration fields are managed by the system and not part of the schema you need to generate.

`;

    // RAG instruction (if enabled)
    if (qdrantClient) {
      prompt += `**RAG Search Tool Available**: You have access to search uploaded documents.
- Use SPARINGLY - only for exact formulas, legal text, code examples, or domain-specific facts
- Do NOT query for generic concepts or creative elaboration
- Example queries: "Python asyncio syntax", "GDPR Article 6", "React useState hook"

`;
    }

    // Progressive strictness (attempt 2 is stricter)
    if (attemptNumber === 1) {
      // Attempt 1: Trust zodToPromptSchema output (lines 762-768) as single source of truth
      prompt += `**Output Format**: Valid JSON matching the schema above (1 section with 3-5 lessons).

**CRITICAL Field Type Requirements** (common mistakes to avoid):
- \`learning_objectives\`: Must be array of STRINGS (NOT objects with id/text/language/cognitiveLevel)
- \`lesson_objectives\`: Must be array of STRINGS (NOT objects)
- \`exercise_type\`: Descriptive text (min 3 chars) explaining exercise format and activities. Be specific about interaction model and learning activities.
- \`section_number\`: Integer (${sectionIndex + 1})
- \`section_title\`: String ("${sectionTitle}")

**Quality Requirements**:
- Objectives: Measurable action verbs (analyze, create, implement, evaluate - NOT "understand", "know")
- Topics: Specific, concrete (NOT generic like "Introduction", "Overview")
- Exercises: Actionable with clear, detailed instructions

**Output**: Valid JSON only, no markdown, no code blocks, no explanations.
`;
    } else {
      // Attempt 2: Minimal valid JSON with strict schema rules
      prompt += `**CRITICAL - RETRY ATTEMPT ${attemptNumber}**: Previous attempt failed. Follow these strict rules:

1. **JSON ONLY**: No markdown, no code blocks, no explanations
2. **Valid Schema**: Match exact structure above
3. **Section/Lesson Numbers**: Use sequential integers starting from 1
4. **Enum Values**: Use exact cognitive levels (optional): remember, understand, apply, analyze, evaluate, create
5. **Array Lengths**: 1-5 learning_objectives per section, 3-5 lessons, 1-5 lesson_objectives per lesson, 3-5 practical_exercises per lesson
6. **String Lengths**: Respect min/max character limits

**Output Format**: Single JSON object starting with { and ending with }. No extra text.
`;
    }

    return prompt;
  }

  /**
   * Create ChatOpenAI model instance for OpenRouter
   *
   * @param modelId - OpenRouter model identifier
   * @param temperature - Optional temperature override (default: 0.7)
   * @param maxTokens - Optional maxTokens override (default: 30000)
   * @returns Configured ChatOpenAI instance
   */
  private createModel(
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 30000
  ): ChatOpenAI {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY environment variable is required for section generation'
      );
    }

    return new ChatOpenAI({
      modelName: modelId,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
      },
      apiKey: apiKey,  // Updated for @langchain/openai v1.x (openAIApiKey deprecated)
      temperature, // From ModelConfigService or default
      maxTokens,   // From ModelConfigService or default
      timeout: 300000, // 5 minutes - prevent indefinite hangs on slow API responses
    });
  }

  /**
   * Estimate token usage (simplified approximation)
   *
   * @param prompt - Input prompt
   * @param response - Model response
   * @returns Estimated total tokens
   */
  private estimateTokens(prompt: string, response: string): number {
    // Rough approximation: 4 chars ≈ 1 token (English)
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(response.length / 4);
    return inputTokens + outputTokens;
  }

  /**
   * Generate batch of lessons as V2 LessonSpecifications
   *
   * Uses existing section generation with V2 output formatting.
   * Converts Section[] to LessonSpecificationV2[] for Stage 6 compatibility.
   *
   * @param batchNum - Batch number (for tracking)
   * @param startSection - Start section index (inclusive)
   * @param endSection - End section index (exclusive)
   * @param input - Generation job input
   * @param qdrantClient - Optional RAG client for document search
   * @returns Section batch result with V2 lesson specifications
   *
   * @throws Error if section generation fails after all retries
   *
   * @example
   * ```typescript
   * const generator = new SectionBatchGenerator();
   * const result = await generator.generateBatchV2(
   *   1,        // batchNum
   *   0,        // startSection
   *   1,        // endSection
   *   jobInput, // GenerationJobInput
   *   qdrantClient // optional RAG
   * );
   * console.log(result.lessonSpecs.length); // LessonSpecificationV2[]
   * ```
   */
  async generateBatchV2(
    batchNum: number,
    startSection: number,
    endSection: number,
    input: GenerationJobInput,
    qdrantClient?: QdrantClient
  ): Promise<SectionBatchResultV2> {
    logger.info({
      msg: 'Starting V2 batch generation',
      batchNum,
      startSection,
      endSection,
      courseId: input.course_id,
    });

    // Step 1: Use existing generateBatch() to produce Section[]
    const sectionResult = await this.generateBatch(
      batchNum,
      startSection,
      endSection,
      input,
      qdrantClient
    );

    // Step 2: Convert Section[] to LessonSpecificationV2[]
    const lessonSpecs: LessonSpecificationV2[] = [];

    for (let i = 0; i < sectionResult.sections.length; i++) {
      const section = sectionResult.sections[i];
      const sectionIndex = startSection + i;

      const specs = this.convertSectionToV2Specs(
        section,
        sectionIndex,
        input
      );

      lessonSpecs.push(...specs);
    }

    logger.info({
      msg: 'V2 batch generation complete',
      batchNum,
      sectionsProcessed: sectionResult.sections.length,
      lessonSpecsGenerated: lessonSpecs.length,
      modelUsed: sectionResult.modelUsed,
    });

    return {
      lessonSpecs,
      modelUsed: sectionResult.modelUsed,
      tier: sectionResult.tier,
      tokensUsed: sectionResult.tokensUsed,
      retryCount: sectionResult.retryCount,
      complexityScore: sectionResult.complexityScore,
      criticalityScore: sectionResult.criticalityScore,
      regenerationMetrics: sectionResult.regenerationMetrics,
    };
  }

  /**
   * Convert a Section to LessonSpecificationV2[] output
   *
   * Transforms Section with lessons into V2 format with semantic scaffolding
   * for Stage 6 content generation.
   *
   * @param section - Section from generateBatch() output
   * @param sectionIndex - Section index (0-based)
   * @param input - Generation job input for analysis result access
   * @returns Array of LessonSpecificationV2 for each lesson in the section
   */
  private convertSectionToV2Specs(
    section: Section,
    sectionIndex: number,
    input: GenerationJobInput
  ): LessonSpecificationV2[] {
    const analysisResult = input.analysis_result;

    // Get section breakdown from analysis for semantic scaffolding
    const sectionBreakdown = analysisResult?.recommended_structure?.sections_breakdown?.[sectionIndex];

    // Infer semantic scaffolding properties
    const scaffolding = sectionBreakdown
      ? inferSemanticScaffolding(sectionBreakdown, analysisResult)
      : null;

    logger.debug({
      msg: 'Converting section to V2 specs',
      sectionNumber: section.section_number,
      lessonCount: section.lessons?.length || 0,
      scaffolding: scaffolding ? {
        archetype: scaffolding.contentArchetype,
        hookStrategy: scaffolding.hookStrategy,
        depth: scaffolding.depth,
        targetAudience: scaffolding.targetAudience,
      } : 'unavailable',
    });

    return (section.lessons || []).map((lesson, lessonIndex) => {
      const lessonId = `${sectionIndex + 1}.${lessonIndex + 1}`;

      // Build learning objectives with Bloom's levels
      const learningObjectives = (lesson.lesson_objectives || []).map((obj, i) => ({
        id: `LO-${lessonId}.${i + 1}`,
        objective: obj,
        bloom_level: inferBloomLevel(obj),
      }));

      // Build sections from key_topics
      const sections = (lesson.key_topics || []).map((topic) => ({
        title: topic,
        content_archetype: (scaffolding?.contentArchetype || 'concept_explainer'),
        rag_context_id: `${sectionIndex + 1}`,
        constraints: {
          depth: scaffolding?.depth || 'detailed_analysis',
          required_keywords: [] as string[],
          prohibited_terms: [] as string[],
        },
        key_points_to_cover: [topic],
      }));

      // Build exercises from practical_exercises
      // PracticalExercise has: exercise_type, exercise_title, exercise_description
      const exercises = (lesson.practical_exercises || []).slice(0, 2).map((ex) => ({
        type: mapExerciseType(ex.exercise_type || ''),
        difficulty: mapDifficulty(lesson.difficulty_level || 'intermediate'),
        learning_objective_id: learningObjectives[0]?.id || `LO-${lessonId}.1`,
        structure_template: ex.exercise_description || ex.exercise_title || 'Complete the exercise as described.',
        rubric_criteria: [{ criteria: ['Completeness', 'Correctness'], weight: 100 }],
      }));

      // Build RAG context from analysis result
      const ragContext = buildRAGContext(sectionIndex + 1, analysisResult);

      // Build description from lesson objectives
      const description = (lesson.lesson_objectives || []).slice(0, 2).join('. ') ||
        `Learn about ${lesson.lesson_title}`;

      const lessonSpec: LessonSpecificationV2 = {
        lesson_id: lessonId,
        title: lesson.lesson_title,
        description: description.length >= 20 ? description : `This lesson covers ${lesson.lesson_title} through practical examples and exercises.`,
        metadata: {
          target_audience: scaffolding?.targetAudience || 'practitioner',
          tone: 'conversational-professional',
          compliance_level: 'standard',
          content_archetype: (scaffolding?.contentArchetype || 'concept_explainer'),
        },
        learning_objectives: learningObjectives,
        intro_blueprint: {
          hook_strategy: scaffolding?.hookStrategy || 'question',
          hook_topic: (lesson.key_topics || [])[0] || lesson.lesson_title,
          key_learning_objectives: (lesson.lesson_objectives || []).slice(0, 3).join(', ') || lesson.lesson_title,
        },
        sections: sections.length > 0 ? sections : [{
          title: lesson.lesson_title,
          content_archetype: (scaffolding?.contentArchetype || 'concept_explainer'),
          rag_context_id: `${sectionIndex + 1}`,
          constraints: {
            depth: scaffolding?.depth || 'detailed_analysis',
            required_keywords: [],
            prohibited_terms: [],
          },
          key_points_to_cover: lesson.lesson_objectives?.slice(0, 2) || [lesson.lesson_title],
        }],
        exercises: exercises,
        rag_context: ragContext,
        estimated_duration_minutes: lesson.estimated_duration_minutes || 15,
        difficulty_level: (lesson.difficulty_level || 'intermediate'),
      };

      logger.debug({
        msg: 'Created V2 lesson specification',
        lessonId,
        title: lessonSpec.title,
        sectionsCount: lessonSpec.sections.length,
        exercisesCount: lessonSpec.exercises.length,
        learningObjectivesCount: lessonSpec.learning_objectives.length,
      });

      return lessonSpec;
    });
  }
}

// ============================================================================
// V2 CONVERSION HELPER FUNCTIONS
// ============================================================================

const BLOOM_KEYWORDS: Record<BloomLevelV2, string[]> = {
  create: ['create', 'design', 'build', 'develop', 'construct', 'compose', 'invent', 'formulate'],
  evaluate: ['evaluate', 'assess', 'judge', 'critique', 'justify', 'recommend', 'defend', 'argue'],
  analyze: ['analyze', 'compare', 'contrast', 'differentiate', 'examine', 'investigate', 'distinguish', 'organize'],
  apply: ['apply', 'implement', 'use', 'execute', 'solve', 'demonstrate', 'calculate', 'operate'],
  understand: ['explain', 'describe', 'summarize', 'interpret', 'classify', 'discuss', 'illustrate', 'paraphrase'],
  remember: [] // Default fallback
};

/**
 * Infer Bloom's Taxonomy level from learning objective text
 *
 * Analyzes the action verb in the objective to determine cognitive level.
 *
 * @param objective - Learning objective text
 * @returns Bloom's Taxonomy level
 */
function inferBloomLevel(objective: string): BloomLevelV2 {
  const text = objective.toLowerCase();
  
  // Check levels in descending order of complexity
  const levels: BloomLevelV2[] = ['create', 'evaluate', 'analyze', 'apply', 'understand'];
  
  for (const level of levels) {
    if (BLOOM_KEYWORDS[level].some(keyword => text.includes(keyword))) {
      return level;
    }
  }

  // Default to remember for basic objectives
  return 'remember';
}

/**
 * Map exercise type string to ExerciseTypeV2 enum
 *
 * @param type - Exercise type string from Section format
 * @returns V2 exercise type enum value
 */
function mapExerciseType(type: string): ExerciseTypeV2 {
  const t = (type || '').toLowerCase();

  if (t.includes('code') || t.includes('coding') || t.includes('programming') ||
      t.includes('implement')) {
    return 'coding';
  }

  if (t.includes('debug') || t.includes('debugging') || t.includes('troubleshoot') ||
      t.includes('fix')) {
    return 'debugging';
  }

  if (t.includes('design') || t.includes('architect') || t.includes('plan') ||
      t.includes('blueprint')) {
    return 'design';
  }

  if (t.includes('case') || t.includes('study') || t.includes('scenario') ||
      t.includes('real-world') || t.includes('practical')) {
    return 'case_study';
  }

  // Default to conceptual
  return 'conceptual';
}

/**
 * Map difficulty level to ExerciseDifficultyV2
 *
 * @param diff - Difficulty level string
 * @returns V2 exercise difficulty enum value
 */
function mapDifficulty(diff: string): ExerciseDifficultyV2 {
  const d = (diff || '').toLowerCase();

  if (d === 'beginner' || d === 'easy' || d === 'basic') {
    return 'easy';
  }

  if (d === 'advanced' || d === 'hard' || d === 'expert') {
    return 'hard';
  }

  return 'medium';
}

/**
 * Build RAG context from analysis result document relevance mapping
 *
 * @param sectionId - Section ID (1-based)
 * @param analysisResult - Analysis result with document_relevance_mapping
 * @returns RAG context for lesson generation
 */
function buildRAGContext(
  sectionId: number,
  analysisResult: GenerationJobInput['analysis_result']
): LessonRAGContextV2 {
  const ragPlan = analysisResult?.document_relevance_mapping?.[String(sectionId)];

  // Default RAG context if no mapping exists
  if (!ragPlan) {
    return {
      primary_documents: ['default'],
      search_queries: ['course content'],
      expected_chunks: 7,
    };
  }

  return {
    primary_documents: ragPlan.primary_documents?.length > 0
      ? ragPlan.primary_documents
      : ['default'],
    search_queries: ragPlan.search_queries?.length > 0
      ? ragPlan.search_queries
      : (ragPlan.key_search_terms || ['course content']), // Fallback to legacy field
    expected_chunks: ragPlan.confidence === 'high' ? 10 : 7,
  };
}
