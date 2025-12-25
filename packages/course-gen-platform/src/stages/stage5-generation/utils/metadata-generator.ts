/**
 * Metadata Generator - Course-Level Metadata Generation with Hybrid Model Routing
 *
 * Implements RT-001 Phase 2 hybrid model routing strategy:
 * - Critical fields → qwen3-max ALWAYS (learning_outcomes, learning_objectives,
 *   pedagogical_strategy, course_structure, domain_taxonomy)
 * - Non-critical fields → openai/gpt-oss-120b first, escalate to qwen3-max if quality < 0.85
 *
 * Cost savings: 25-40% vs always using qwen3-max ($0.126-0.144 per course)
 *
 * @module services/stage5/metadata-generator
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md (Phase 2)
 * @see specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md
 * @see .tmp/current/plans/.t019-metadata-generator-plan.json
 */

import { ChatOpenAI } from '@langchain/openai';
import type {
  GenerationJobInput,
  CourseStructure,
} from '@megacampus/shared-types';
import {
  CourseMetadataSchema,
  CourseMetadataWithoutInjectedFieldsSchema,
} from '@megacampus/shared-types/generation-result';
import { getStylePrompt } from '@megacampus/shared-types/style-prompts';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { z } from 'zod';
import {
  getDifficultyFromAnalysis,
  getCategoryFromAnalysis,
  formatPedagogicalStrategyForPrompt,
} from './analysis-formatters';
import { validateQwen3MaxContext, estimateTokenCount } from '../../../shared/llm/cost-calculator';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import { preprocessObject } from '@/shared/validation/preprocessing';
import logger from '@/shared/logger';
import { createModelConfigService } from '../../../shared/llm/model-config-service';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * OpenRouter API base URL
 */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Quality thresholds for metadata validation (RT-001)
 */
const QUALITY_THRESHOLDS = {
  critical: {
    completeness: 0.85,
    coherence: 0.90,
    alignment: 0.85,
  },
  nonCritical: {
    completeness: 0.75,
    coherence: 0.80,
  },
} as const;

/**
 * Model configurations for metadata generation (Updated 2025-11-19)
 * Based on quality testing results (DEEPSEEK-V31-TERMINUS-QUALITY-REPORT.md)
 *
 * Using regular model (not -thinking variant) for performance (INV-2025-11-19-003)
 * Regular: 15-29s, Thinking: 30-110s (test), 521s (production context)
 * Both achieve 100% success rate, no quality difference for structured generation
 */
const MODELS = {
  // RU Metadata: Qwen3 235B A22B-2507 (9.0/10 - Silver)
  // NOTE: Using regular model (not -thinking) for 17-35x performance improvement
  ru_metadata_primary: 'qwen/qwen3-235b-a22b-2507',

  // EN Metadata: DeepSeek v3.1 Terminus (9.0/10 - Silver, -0.2 from leader)
  en_metadata_primary: 'deepseek/deepseek-v3.1-terminus',

  // Fallback for all languages: Kimi K2-0905 (9.2 EN / 9.5 RU - Gold)
  metadata_fallback: 'moonshotai/kimi-k2-0905',

  // Legacy (for emergency cases)
  oss120b: 'openai/gpt-oss-120b',
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Quality metrics for metadata validation
 */
export interface QualityMetrics {
  /** Field presence and content length (0-1) */
  completeness: number;
  /** Consistency across fields (0-1) */
  coherence: number;
  /** Match with input requirements (0-1) */
  alignment: number;
}

/**
 * Metadata generation result with quality tracking
 */
export interface MetadataGenerationResult {
  /** Generated course metadata (subset of CourseStructure) */
  metadata: Partial<CourseStructure>;
  /** Quality scores for validation */
  quality: QualityMetrics;
  /** Model used for generation */
  modelUsed: string;
  /** Number of retry attempts */
  retryCount: number;
  /** Tokens consumed */
  tokensUsed: number;
}

// ============================================================================
// METADATA GENERATOR CLASS
// ============================================================================

/**
 * MetadataGenerator - Course-level metadata generation with hybrid routing
 *
 * Generates course metadata from analysis results or title-only input using
 * hybrid model routing strategy for cost optimization.
 *
 * @example
 * ```typescript
 * const generator = new MetadataGenerator();
 * const result = await generator.generate(jobInput);
 * console.log(result.metadata.course_title);
 * ```
 */
export class MetadataGenerator {
  /**
   * Generate course-level metadata from GenerationJobInput
   *
   * Implements RT-001 Phase 2 hybrid routing:
   * 1. Extract language (FR-027)
   * 2. Get style prompt (FR-028)
   * 3. Build prompt with style integration (FR-005)
   * 4. Handle title-only scenario (FR-003)
   * 5. Invoke ChatOpenAI with hybrid routing
   * 6. Parse and validate response
   * 7. Apply quality validation and escalation
   *
   * @param input - Generation job input
   * @returns Metadata generation result with quality metrics
   *
   * @throws Error if all retry attempts fail
   */
  async generate(input: GenerationJobInput): Promise<MetadataGenerationResult> {
    // Step 1: Extract language (FR-027)
    const language = this.extractLanguage(input);

    // Step 2: Get style prompt (FR-028)
    const style = input.frontend_parameters.style || 'conversational';
    const stylePrompt = getStylePrompt(style);

    // Step 3: Build metadata prompt
    const prompt = this.buildMetadataPrompt(input, stylePrompt, language);

    // Step 3.5: Validate Qwen 3 Max context length (128K limit check)
    // CRITICAL: Qwen 3 Max costs 2.5x more above 128K tokens
    const estimatedInputTokens = estimateTokenCount(prompt);
    try {
      validateQwen3MaxContext(estimatedInputTokens);
    } catch (error) {
      // If context exceeds 128K, log warning but proceed (metadata is typically safe at ~40-50K)
      console.warn(
        JSON.stringify({
          msg: 'Qwen 3 Max context validation warning in metadata generation',
          estimatedTokens: estimatedInputTokens,
          limit: 128000,
          error: error instanceof Error ? error.message : 'Unknown error',
          level: 'warn',
        })
      );
      // Re-throw to prevent unexpected cost increase
      throw error;
    }

    // Step 4: Generate metadata with hybrid routing
    // Updated 2025-11-14: Language-aware model selection based on quality testing
    // Now uses ModelConfigService with database lookup + hardcoded fallback
    const primaryModelId = await this.selectModelForLanguage(language, false, estimatedInputTokens);
    const model = this.createModel(primaryModelId);

    logger.info({
      msg: 'Metadata generation: selected model',
      language,
      model: primaryModelId,
      courseId: input.course_id,
    });

    // Use UnifiedRegenerator with all 5 layers for maximum reliability
    // CRITICAL: Validate with CourseMetadataWithoutInjectedFieldsSchema BEFORE UUID/language injection
    const regenerator = new UnifiedRegenerator<Partial<CourseStructure>>({
      enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
      maxRetries: 3, // Increased to allow Layer 4 (escalation) + Layer 5 (fallback)
      schema: CourseMetadataWithoutInjectedFieldsSchema, // Validate WITHOUT id/language fields
      qualityValidator: (data, _input) => {
        const metadataFields = this.extractMetadataFields(data);
        const quality = this.validateMetadataQuality(metadataFields, input, language);

        const passed =
          quality.completeness >= QUALITY_THRESHOLDS.critical.completeness &&
          quality.coherence >= QUALITY_THRESHOLDS.critical.coherence &&
          quality.alignment >= QUALITY_THRESHOLDS.critical.alignment;

        // FIX: Log quality scores for debugging (INV-2025-11-19-006)
        logger.info({
          msg: 'Metadata quality validation',
          completeness: quality.completeness,
          coherence: quality.coherence,
          alignment: quality.alignment,
          thresholds: QUALITY_THRESHOLDS.critical,
          passed,
          courseId: input.course_id,
        });

        return passed;
      },
      metricsTracking: true,
      stage: 'generation',
      courseId: input.course_id,
      phaseId: 'metadata_generation',
      model: model, // FIX: Required for Layers 2-3 (critique-revise, partial-regen)
    });

    // Invoke model
    const response = await model.invoke(prompt);
    const rawContent = response.content.toString();

    // TIER 1: PREPROCESSING (before UnifiedRegenerator)
    // Stage 5: NO warning fallback - database must be strict
    let preprocessedContent = rawContent;
    try {
      const parsedRaw = JSON.parse(rawContent) as Record<string, unknown>;
      // Preprocess learning_outcomes if present
      if (parsedRaw.learning_outcomes && Array.isArray(parsedRaw.learning_outcomes)) {
        parsedRaw.learning_outcomes = parsedRaw.learning_outcomes.map((outcome: unknown) =>
          preprocessObject(outcome as Record<string, unknown>, {
            cognitiveLevel: 'enum',
            difficulty_level: 'enum',
          })
        );
      }
      // Preprocess pedagogical_strategy if present
      if (parsedRaw.pedagogical_strategy) {
        parsedRaw.pedagogical_strategy = preprocessObject(parsedRaw.pedagogical_strategy as Record<string, unknown>, {
          primary_strategy: 'enum',
        });
      }
      preprocessedContent = JSON.stringify(parsedRaw);
    } catch (error) {
      // If preprocessing fails, continue with raw output
      console.warn('[Metadata Generator] Preprocessing failed, using raw output:', error);
    }

    const result = await regenerator.regenerate({
      rawOutput: preprocessedContent,
      originalPrompt: prompt,
    });

    if (result.success && result.data) {
      // Post-process learning_outcomes: inject id (UUID) and language (from frontend_parameters)
      // CRITICAL: LLM should NOT generate these fields - they are architectural data
      // Frontend MUST provide language in ISO 639-1 format (ru, en, etc.)
      if (result.data.learning_outcomes && Array.isArray(result.data.learning_outcomes)) {
        result.data.learning_outcomes = result.data.learning_outcomes.map((outcome) => ({
          ...outcome,
          id: crypto.randomUUID(), // Generate proper UUID
          language: language as CourseStructure['learning_outcomes'][number]['language'], // Inject language from frontend_parameters (ISO 639-1)
        }));
      }

      // RT-006: Validate with Bloom's Taxonomy validators before extracting fields
      // Note: We validate only the metadata subset (no sections field)
      // This triggers RT-006 validators for learning_outcomes which checks Bloom's taxonomy
      let validated: Partial<CourseStructure>;
      try {
        // ✅ BEST PRACTICE: Use CourseMetadataSchema (public Zod API)
        // Instead of CourseStructureSchema._def.schema.pick() (private API)
        validated = CourseMetadataSchema.parse(result.data);
        // ✅ RT-006 validators executed: non-measurable verbs, placeholders, Bloom's taxonomy
      } catch (error) {
        if (error instanceof z.ZodError) {
          const issues = error.errors.map(e => e.message).join('; ');
          console.error(
            JSON.stringify({
              msg: 'RT-006 validation failed in metadata generation',
              issues,
              courseId: input.course_id,
              level: 'error',
            })
          );
          throw new Error(`RT-006 validation failed: ${issues}`);
        }
        throw error;
      }

      const metadataFields = this.extractMetadataFields(validated);
      const quality = this.validateMetadataQuality(metadataFields, input, language);

      // Check if quality passed after retries
      if (!result.metadata.qualityPassed) {
        console.warn(
          JSON.stringify({
            msg: 'Critical metadata quality below threshold after max retries',
            quality,
            retryCount: result.metadata.retryCount,
            level: 'warn',
          })
        );
      }

      return {
        metadata: metadataFields,
        quality,
        modelUsed: primaryModelId, // Language-aware: RU=Qwen3 235B, EN=DeepSeek Terminus
        retryCount: result.metadata.retryCount,
        tokensUsed: this.estimateTokens(prompt, rawContent),
      };
    } else {
      throw new Error(
        `Failed to generate metadata: ${result.error || 'Unknown error'}`
      );
    }
  }

  /**
   * Extract language from input (FR-027)
   * Priority: frontend_parameters.language > analysis_result contextual language > 'en'
   *
   * Note: contextual_language is now an object with 6 fields (why_matters_context, motivators, etc.)
   * We use the 'summary' strategy to extract language hints if needed
   *
   * Supports both ISO 639-1 codes (ru, en) and full language names (Russian, English)
   * for backward compatibility with database records that store full names.
   */
  private extractLanguage(input: GenerationJobInput): string {
    // Helper to convert language names to ISO 639-1 codes
    // Same mapping as Stage 4 handler for consistency
    const languageNameToCode: Record<string, string> = {
      'Russian': 'ru', 'English': 'en', 'Chinese': 'zh', 'Spanish': 'es',
      'French': 'fr', 'German': 'de', 'Japanese': 'ja', 'Korean': 'ko',
      'Arabic': 'ar', 'Portuguese': 'pt', 'Italian': 'it', 'Turkish': 'tr',
      'Vietnamese': 'vi', 'Thai': 'th', 'Indonesian': 'id', 'Malay': 'ms',
      'Hindi': 'hi', 'Polish': 'pl',
    };

    // Priority 1: Explicit frontend parameter
    if (input.frontend_parameters.language) {
      const rawLang = input.frontend_parameters.language;
      // If it's already a 2-char ISO code, use it; otherwise convert from name
      return rawLang.length === 2 ? rawLang : (languageNameToCode[rawLang] || 'en');
    }

    // Priority 2: Extract from contextual_language object (new schema)
    // For now, we default to 'en' since contextual_language provides context, not language code
    // TODO: Consider adding language detection from contextual_language content if needed

    return 'en';
  }

  /**
   * Select appropriate model based on content language
   *
   * Language-aware model routing strategy (2025-11-14):
   * - Primary: Uses ModelConfigService with database lookup + hardcoded fallback
   * - RU fallback: Qwen3 235B A22B-2507 (Gold for RU Lessons 9.2/10)
   * - EN fallback: DeepSeek v3.1 Terminus (Silver for EN Metadata 9.0/10)
   * - Emergency fallback: Kimi K2-0905 (Gold for both languages)
   *
   * @param language - Target language (ru/en/etc)
   * @param useFallback - Use fallback model instead of primary
   * @param estimatedTokens - Estimated token count for tier selection
   * @returns Model ID string
   */
  private async selectModelForLanguage(
    language: string,
    useFallback: boolean = false,
    estimatedTokens: number = 50000
  ): Promise<string> {
    if (useFallback) {
      return MODELS.metadata_fallback; // Kimi K2-0905 (Gold for both)
    }

    // Try ModelConfigService first (database + hardcoded fallback)
    try {
      const service = createModelConfigService();
      const langCode = (language === 'ru' || language === 'russian') ? 'ru' : 'en';
      const config = await service.getModelForStage(5, langCode, estimatedTokens);

      logger.info({
        msg: 'Model selection via ModelConfigService',
        language: langCode,
        primary: config.primary,
        source: config.source,
        tier: config.tier,
      });

      return config.primary;
    } catch (error) {
      logger.warn({
        msg: 'ModelConfigService failed, using hardcoded fallback',
        language,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fallback to MODELS constant (safety net)
      if (language === 'ru' || language === 'russian') {
        return MODELS.ru_metadata_primary;
      }
      return MODELS.en_metadata_primary;
    }
  }

  /**
   * Build metadata generation prompt with style integration (FR-005, FR-028)
   *
   * Handles both full Analyze and title-only scenarios:
   * - Full Analyze: Use analysis_result for context (~10-15K tokens)
   * - Title-only (FR-003): Synthesize from qwen3-max knowledge base
   *
   * @param input - Generation job input
   * @param stylePrompt - Style prompt from getStylePrompt()
   * @param language - Target language (en/ru/etc)
   * @returns Complete metadata generation prompt
   */
  private buildMetadataPrompt(
    input: GenerationJobInput,
    stylePrompt: string,
    language: string
  ): string {
    const isTitleOnly = input.analysis_result === null;
    const courseTitle = input.frontend_parameters.course_title;

    // Base prompt structure
    let prompt = `You are an expert course designer creating comprehensive metadata for an educational course.

**Course Title**: ${courseTitle}
**Target Language**: ${language}
**Content Style**: ${stylePrompt}

`;

    // Add context based on scenario
    if (isTitleOnly) {
      // Title-only scenario (FR-003): Synthesize from knowledge base
      prompt += `**Scenario**: Create course metadata from title only using your knowledge base.

**Instructions**:
1. Infer course scope, difficulty, and target audience from the title
2. Generate comprehensive metadata based on typical courses in this domain
3. Ensure pedagogical soundness and coherent structure
4. Use your expertise to create realistic, implementable course design

`;
    } else {
      // Full Analyze scenario (FR-001): Use analysis_result context
      const analysis = input.analysis_result!;

      // Extract values using helper functions (T055 Schema Unification)
      const category = getCategoryFromAnalysis(analysis);
      const difficulty = getDifficultyFromAnalysis(analysis);
      const pedagogicalStrategy = formatPedagogicalStrategyForPrompt(analysis.pedagogical_strategy);

      prompt += `**Analysis Context** (from Stage 4 Analyze):
- Category: ${category}
- Difficulty: ${difficulty}
- Recommended Structure: ${analysis.recommended_structure.total_sections} sections, ${analysis.recommended_structure.total_lessons} lessons
- Pedagogical Strategy:
${pedagogicalStrategy}
- Topic: ${analysis.topic_analysis.determined_topic}
- Key Concepts: ${analysis.topic_analysis.key_concepts.join(', ')}

**Instructions**:
1. Use the analysis context to inform metadata generation
2. Ensure metadata aligns with recommended structure and pedagogical strategy
3. Incorporate key concepts into learning outcomes and course overview
4. Maintain consistency with determined difficulty level

`;
    }

    // Add Zod schema description WITHOUT id/language fields
    // CRITICAL: Use schema without injected fields - id and language will be added by code after generation
    const schemaDescription = zodToPromptSchema(CourseMetadataWithoutInjectedFieldsSchema);

    prompt += `**Generate course metadata matching this EXACT schema**:

You MUST respond with valid JSON matching this schema:

${schemaDescription}

**Quality Requirements**:
1. Learning outcomes must be measurable and use action verbs (Bloom's taxonomy)
2. Course overview must comprehensively describe course content and value
3. Target audience must clearly define who will benefit from this course
4. Assessment strategy must align with pedagogical approach and learning outcomes
5. All text fields must be coherent and professionally written

**Output Format**: Valid JSON only, no markdown, no explanations.
`;

    return prompt;
  }

  /**
   * Validate metadata quality for escalation logic (RT-001)
   *
   * Computes quality metrics:
   * - Completeness: Field presence and content length
   * - Coherence: Consistency across fields
   * - Alignment: Match with input requirements
   *
   * @param metadata - Generated metadata
   * @param input - Original job input
   * @returns Quality metrics (0-1 scale)
   */
  private validateMetadataQuality(
    metadata: Partial<CourseStructure>,
    input: GenerationJobInput,
    language: string = 'en'
  ): QualityMetrics {
    // Completeness: Check required fields are present and have sufficient length
    const requiredFields = [
      'course_title',
      'course_description',
      'course_overview',
      'target_audience',
      'estimated_duration_hours',
      'difficulty_level',
      'learning_outcomes',
      'assessment_strategy',
      'course_tags',
    ];

    let completenessScore = 0;
    let fieldsChecked = 0;

    for (const field of requiredFields) {
      fieldsChecked++;
      const value = metadata[field as keyof CourseStructure];

      if (value === null || value === undefined) {
        continue;
      }

      // Check string length for text fields
      if (typeof value === 'string') {
        if (value.length >= 10) {
          completenessScore += 1;
        } else {
          completenessScore += 0.5; // Partial credit for short content
        }
      }
      // Check array length
      else if (Array.isArray(value)) {
        if (value.length >= 1) {
          completenessScore += 1;
        }
      }
      // Check object presence
      else if (typeof value === 'object') {
        completenessScore += 1;
      }
      // Check number validity
      else if (typeof value === 'number') {
        if (value > 0) {
          completenessScore += 1;
        }
      }
      // Other types get full credit if present
      else {
        completenessScore += 1;
      }
    }

    const completeness = fieldsChecked > 0 ? completenessScore / fieldsChecked : 0;

    // Coherence: Check consistency (simplified - checks if difficulty aligns with prerequisites)
    let coherenceScore = 1.0; // Start optimistic
    const coherencePenalties: string[] = [];

    if (metadata.difficulty_level && metadata.prerequisites) {
      const prereqCount = metadata.prerequisites.length;
      const difficulty = metadata.difficulty_level;

      // Beginner: 0-5 prerequisites (allows basic context prereqs like "computer access", "English skills")
      if (difficulty === 'beginner' && prereqCount > 5) {
        coherenceScore -= 0.2;
        coherencePenalties.push(`beginner with ${prereqCount} prereqs (-0.2)`);
      }
      // Advanced: should have prerequisites
      if (difficulty === 'advanced' && prereqCount === 0) {
        coherenceScore -= 0.2;
        coherencePenalties.push(`advanced with 0 prereqs (-0.2)`);
      }
    }

    // Check learning outcomes count aligns with course scope
    if (metadata.learning_outcomes && metadata.estimated_duration_hours) {
      const outcomeCount = metadata.learning_outcomes.length;
      const hours = metadata.estimated_duration_hours;

      // Realistic heuristic: 3-50 outcomes is valid (minimum 3 for any course, ~1-2 per hour max)
      // A 24h course with 10 outcomes is perfectly reasonable
      const minOutcomes = 3;
      const maxOutcomes = Math.max(50, hours * 2);
      if (outcomeCount < minOutcomes || outcomeCount > maxOutcomes) {
        coherenceScore -= 0.1;
        coherencePenalties.push(`${outcomeCount} outcomes for ${hours}h course, expected ${minOutcomes}-${maxOutcomes} (-0.1)`);
      }
    }

    // DEBUG: Log coherence calculation details
    if (coherencePenalties.length > 0) {
      logger.warn({
        msg: 'Coherence penalties applied',
        difficulty: metadata.difficulty_level,
        prereqCount: metadata.prerequisites?.length ?? 0,
        outcomesCount: metadata.learning_outcomes?.length ?? 0,
        hours: metadata.estimated_duration_hours,
        penalties: coherencePenalties,
        finalScore: coherenceScore,
      });
    }

    const coherence = Math.max(0, coherenceScore);

    // Alignment: Check match with input requirements
    let alignmentScore = 1.0; // Start optimistic

    // Check title matches - only for English content
    // For multilingual, the LLM legitimately generates localized titles
    // (e.g., input "E2E Test Course" with language="ru" → "Полный курс по...")
    if (
      language === 'en' &&
      metadata.course_title &&
      input.frontend_parameters.course_title &&
      !metadata.course_title.toLowerCase().includes(
        input.frontend_parameters.course_title.toLowerCase().substring(0, 10)
      )
    ) {
      alignmentScore -= 0.3;
    }

    // Check difficulty matches (if provided by analysis)
    const analysisDifficulty = input.analysis_result
      ? getDifficultyFromAnalysis(input.analysis_result)
      : null;

    if (
      analysisDifficulty &&
      metadata.difficulty_level &&
      analysisDifficulty !== metadata.difficulty_level
    ) {
      alignmentScore -= 0.2;
    }

    // Note: Course-level learning_outcomes are simple strings (no language field)
    // Language consistency is validated at section-level LearningOutcome objects

    const alignment = Math.max(0, alignmentScore);

    return {
      completeness,
      coherence,
      alignment,
    };
  }

  /**
   * Extract metadata-specific fields from parsed response
   *
   * @param parsed - Full parsed response
   * @returns Metadata fields only
   */
  private extractMetadataFields(parsed: Partial<CourseStructure>): Partial<CourseStructure> {
    return {
      course_title: parsed.course_title,
      course_description: parsed.course_description,
      course_overview: parsed.course_overview,
      target_audience: parsed.target_audience,
      estimated_duration_hours: parsed.estimated_duration_hours,
      difficulty_level: parsed.difficulty_level,
      prerequisites: parsed.prerequisites,
      learning_outcomes: parsed.learning_outcomes,
      assessment_strategy: parsed.assessment_strategy,
      course_tags: parsed.course_tags,
    };
  }

  /**
   * Create ChatOpenAI model instance for OpenRouter
   *
   * @param modelId - OpenRouter model identifier
   * @param temperature - Optional temperature override (default: 0.7)
   * @param maxTokens - Optional maxTokens override (default: 8000)
   * @returns Configured ChatOpenAI instance
   */
  private createModel(
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 8000
  ): ChatOpenAI {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY environment variable is required for metadata generation'
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
}
