/**
 * Unified Regenerator - Production Implementation
 *
 * Complete 5-layer JSON regeneration system extracted from Analyze stage
 * and made reusable for all stages.
 *
 * Implemented layers:
 * - Layer 1: Auto-repair (jsonrepair + field-name-fix, FREE, 95-98% success)
 * - Layer 2: Critique-revise (LLM-based feedback loop, refactored from revision-chain.ts)
 * - Layer 3: Partial regeneration (field-level atomic repair, refactored from partial-regenerator.ts)
 * - Layer 4: Model escalation (20B → 120B, extracted from phase-2-scope.ts)
 * - Layer 5: Emergency fallback (Gemini, extracted from phase-2-scope.ts)
 *
 * @module shared/regeneration/unified-regenerator
 * @see .tmp/current/plans/.a31-production-implementation-requirements.md
 */

import { z } from 'zod';
import type { ChatOpenAI } from '@langchain/openai';
import { safeJSONParse } from '@/shared/utils/json-repair';
import { fixFieldNames } from '@/shared/utils/field-name-fix';
import { critiqueAndRevise } from './layers/layer-2-critique-revise';
import { regeneratePartialFields } from './layers/layer-3-partial-regen';
import { escalateToLargerModel, getEscalationChain } from './layers/layer-4-model-escalation';
import { qualityFallback, shouldAttemptQualityFallback } from './layers/layer-5-emergency';
import logger from '@/shared/logger';

/**
 * Regeneration layer types
 */
export type RegenerationLayer =
  | 'auto-repair' // jsonrepair + field-name-fix (FREE, 95-98%)
  | 'critique-revise' // LLM critique → revise (IMPLEMENTED)
  | 'partial-regen' // Field-level atomic repair (IMPLEMENTED)
  | 'model-escalation' // Larger model (IMPLEMENTED)
  | 'emergency'; // Emergency fallback (IMPLEMENTED)

/**
 * Stage types
 */
export type RegenerationStage = 'analyze' | 'generation' | 'lesson' | 'other';

/**
 * Quality validation function
 */
export type QualityValidator<T = any> = (
  data: T,
  input: RegenerationInput
) => boolean | Promise<boolean>;

/**
 * Structure normalizer function type
 * Transforms raw LLM output into expected schema structure (algorithmic, no model calls)
 */
export type StructureNormalizer = (
  data: unknown,
  context?: { topic?: string; courseId?: string }
) => Record<string, unknown>;

/**
 * Regeneration configuration
 */
export interface RegenerationConfig {
  /** Enabled repair layers (ALL layers now supported) */
  enabledLayers: RegenerationLayer[];

  /** Maximum retry attempts */
  maxRetries?: number;

  /** Quality validator function (optional) */
  qualityValidator?: QualityValidator;

  /** Enable metrics tracking */
  metricsTracking: boolean;

  /** Stage name for logging */
  stage: RegenerationStage;

  /** Course ID (required for Layers 2-5) */
  courseId?: string;

  /** Phase/component ID */
  phaseId?: string;

  /** Zod schema for Layer 3 (partial regeneration) AND Layer 1 validation */
  schema?: z.ZodSchema;

  /** Model instance for Layers 2-3 (if not provided, will use escalation chain) */
  model?: ChatOpenAI;

  /**
   * Structure normalizer function (algorithmic transformation)
   * Applied BEFORE Zod validation in Layer 1
   * Transforms flat LLM output to expected nested structure
   */
  structureNormalizer?: StructureNormalizer;

  /**
   * Context for structure normalizer (e.g., original topic for fallback values)
   */
  normalizerContext?: { topic?: string; courseId?: string };

  /**
   * Validate against Zod schema in Layer 1 (enables partial-regen trigger)
   * Default: true when schema is provided
   */
  validateSchemaInLayer1?: boolean;

  /**
   * Allow warning-based fallback when all layers fail
   *
   * - Stage 4 (advisory): true (accept with warning)
   * - Stage 5 (database): false (must throw error)
   *
   * When enabled, accepts invalid values with WARNING log after all layers exhausted
   */
  allowWarningFallback?: boolean;
}

/**
 * Regeneration input
 */
export interface RegenerationInput {
  /** Raw output from LLM (may be malformed JSON) */
  rawOutput: string;

  /** Original prompt sent to LLM */
  originalPrompt: string;

  /** Parse error message (if available) */
  parseError?: string;
}

/**
 * Regeneration result metadata
 */
export interface RegenerationMetadata {
  /** Layer that succeeded */
  layerUsed: RegenerationLayer | 'failed' | 'warning_fallback';

  /** Token cost (0 for auto-repair) */
  tokenCost: number;

  /** Number of retry attempts */
  retryCount: number;

  /** Quality passed flag */
  qualityPassed?: boolean;

  /** Models tried (for Layers 2-5) */
  modelsUsed?: string[];

  /** Successful fields (for Layer 3) */
  successfulFields?: string[];

  /** Regenerated fields (for Layer 3) */
  regeneratedFields?: string[];

  /** Whether the output was validated successfully (false for warning fallback) */
  validated?: boolean;
}

/**
 * Regeneration result
 */
export interface RegenerationResult<T = any> {
  /** Success flag */
  success: boolean;

  /** Parsed data (if successful) */
  data?: T;

  /** Metadata about regeneration */
  metadata: RegenerationMetadata;

  /** Error message (if failed) */
  error?: string;
}

/**
 * UnifiedRegenerator - Production Implementation
 *
 * All 5 layers implemented:
 * - Layer 1: Auto-repair (jsonrepair + field-name-fix)
 * - Layer 2: Critique-revise (LLM feedback loop)
 * - Layer 3: Partial regeneration (field-level atomic repair)
 * - Layer 4: Model escalation (20B → 120B)
 * - Layer 5: Emergency fallback (Gemini)
 *
 * @example
 * ```typescript
 * // Analyze stage: All 5 layers
 * const regenerator = new UnifiedRegenerator({
 *   enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
 *   maxRetries: 2,
 *   schema: Phase2OutputSchema,
 *   model: model,
 *   metricsTracking: true,
 *   stage: 'analyze',
 *   courseId: 'uuid',
 *   phaseId: 'stage_4_scope',
 * });
 *
 * const result = await regenerator.regenerate({
 *   rawOutput: malformedJSON,
 *   originalPrompt: prompt,
 *   parseError: error.message,
 * });
 *
 * if (result.success) {
 *   console.log('Repaired:', result.data);
 *   console.log('Layer used:', result.metadata.layerUsed);
 * }
 * ```
 */
export class UnifiedRegenerator<T = any> {
  private config: RegenerationConfig;

  constructor(config: RegenerationConfig) {
    this.config = {
      maxRetries: 1,
      ...config,
    };

    // Validate configuration for Layers 2-5
    const requiresModel = config.enabledLayers.some((layer) =>
      ['critique-revise', 'partial-regen', 'model-escalation', 'emergency'].includes(layer)
    );

    if (requiresModel && !config.model && !config.courseId) {
      logger.warn(
        { enabledLayers: config.enabledLayers },
        'UnifiedRegenerator: Layers 2-5 require either model or courseId. Some layers may fail.'
      );
    }

    if (config.enabledLayers.includes('partial-regen') && !config.schema) {
      logger.warn('UnifiedRegenerator: Layer 3 (partial-regen) requires schema. Layer will be skipped.');
    }
  }

  /**
   * Execute regeneration with configured layers
   *
   * Production Implementation: Executes all enabled layers in sequence.
   * Stops at first successful layer.
   *
   * @param input - Regeneration input
   * @returns Regeneration result
   */
  async regenerate(input: RegenerationInput): Promise<RegenerationResult<T>> {
    logger.info(
      { enabledLayers: this.config.enabledLayers, stage: this.config.stage },
      'UnifiedRegenerator: Starting regeneration'
    );

    const modelsUsed: string[] = [];

    // Try each layer in sequence
    for (const layer of this.config.enabledLayers) {
      try {
        logger.debug({ layer }, 'Trying regeneration layer');

        let result: RegenerationResult<T>;

        switch (layer) {
          case 'auto-repair':
            result = await this.executeLayer1(input);
            break;

          case 'critique-revise':
            result = await this.executeLayer2(input, modelsUsed);
            break;

          case 'partial-regen':
            result = await this.executeLayer3(input, modelsUsed);
            break;

          case 'model-escalation':
            result = await this.executeLayer4(input, modelsUsed);
            break;

          case 'emergency':
            result = await this.executeLayer5(input, modelsUsed);
            break;

          default:
            logger.warn({ layer }, 'Unknown layer, skipping');
            continue;
        }

        // If successful, return
        if (result.success) {
          logger.info(
            { layer, success: true },
            'UnifiedRegenerator: Layer succeeded'
          );

          // Track metrics
          if (this.config.metricsTracking) {
            this.trackMetrics(result);
          }

          return result;
        }
      } catch (error) {
        logger.warn(
          {
            layer,
            error: error instanceof Error ? error.message : String(error),
          },
          'Layer failed, trying next'
        );
        // Continue to next layer
        continue;
      }
    }

    // All layers exhausted - check for warning fallback
    logger.error('UnifiedRegenerator: All layers exhausted');

    // Tier 3: Warning fallback (Stage 4 only)
    if (this.config.allowWarningFallback) {
      logger.warn(
        {
          rawOutput: input.rawOutput,
          enabledLayers: this.config.enabledLayers,
          stage: this.config.stage,
          phaseId: this.config.phaseId,
        },
        '[Warning Fallback] All layers exhausted, accepting with warning'
      );

      // Try to parse as-is, even if invalid
      try {
        const parsed = JSON.parse(input.rawOutput);
        const result: RegenerationResult<T> = {
          success: true,
          data: parsed,
          metadata: {
            layerUsed: 'warning_fallback',
            tokenCost: 0,
            retryCount: this.config.maxRetries || 1,
            validated: false, // Mark as not validated
            modelsUsed,
          },
        };

        // Track metrics
        if (this.config.metricsTracking) {
          this.trackMetrics(result);
        }

        return result;
      } catch (error) {
        // Even warning fallback failed (JSON parse error)
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          '[Warning Fallback] Failed to parse JSON even with warning fallback'
        );
      }
    }

    // Stage 5 or warning fallback also failed - return failure
    const result: RegenerationResult<T> = {
      success: false,
      metadata: {
        layerUsed: 'failed',
        tokenCost: 0,
        retryCount: 0,
        modelsUsed,
        validated: false,
      },
      error: 'All regeneration layers exhausted',
    };

    // Track metrics
    if (this.config.metricsTracking) {
      this.trackMetrics(result);
    }

    return result;
  }

  /**
   * Layer 1: Auto-repair (jsonrepair + field-name-fix + structure normalization + Zod validation)
   *
   * Enhanced to include:
   * 1. JSON parsing with jsonrepair
   * 2. Field name normalization (camelCase → snake_case)
   * 3. Structure normalization (flat → nested) - if normalizer provided
   * 4. Zod schema validation - if schema provided and validateSchemaInLayer1 enabled
   *
   * If Zod validation fails, Layer 1 fails and triggers Layer 2/3 (partial-regen)
   */
  private async executeLayer1(input: RegenerationInput): Promise<RegenerationResult<T>> {
    logger.debug('Executing Layer 1: Auto-repair');

    // Step 1: Parse JSON with jsonrepair
    const parsed = safeJSONParse(input.rawOutput);
    if (parsed === null) {
      throw new Error('Layer 1: safeJSONParse returned null');
    }

    // Step 2: Fix field names (camelCase → snake_case)
    let fixed = fixFieldNames<T>(parsed);

    // Step 3: Apply structure normalizer if provided (flat → nested transformation)
    if (this.config.structureNormalizer) {
      try {
        logger.debug('Layer 1: Applying structure normalizer');
        fixed = this.config.structureNormalizer(fixed, this.config.normalizerContext) as T;
        logger.debug({ normalizedKeys: Object.keys(fixed as object) }, 'Layer 1: Structure normalization complete');
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Layer 1: Structure normalizer failed'
        );
        // Continue with un-normalized data, Zod validation will catch issues
      }
    }

    // Step 4: Validate against Zod schema (if provided and enabled)
    const shouldValidateSchema = this.config.schema &&
      (this.config.validateSchemaInLayer1 !== false); // Default: true when schema provided

    if (shouldValidateSchema && this.config.schema) {
      logger.debug('Layer 1: Validating against Zod schema');
      const validation = this.config.schema.safeParse(fixed);

      if (!validation.success) {
        // Log validation errors for debugging
        const errors = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        logger.warn(
          {
            errorCount: errors.length,
            errors: errors.slice(0, 5), // First 5 errors
            phaseId: this.config.phaseId,
          },
          'Layer 1: Zod schema validation failed, will try Layer 2/3'
        );

        throw new Error(`Layer 1: Zod validation failed: ${errors.slice(0, 3).join('; ')}`);
      }

      // Use validated data (with defaults applied by Zod)
      fixed = validation.data as T;
      logger.debug('Layer 1: Zod schema validation passed');
    }

    // Step 5: Validate quality (if validator provided)
    let qualityPassed = true;
    if (this.config.qualityValidator) {
      qualityPassed = await this.config.qualityValidator(fixed, input);
    }

    if (!qualityPassed) {
      throw new Error('Layer 1: Quality validation failed');
    }

    return {
      success: true,
      data: fixed,
      metadata: {
        layerUsed: 'auto-repair',
        tokenCost: 0,
        retryCount: 0,
        qualityPassed: true,
      },
    };
  }

  /**
   * Layer 2: Critique-revise (LLM feedback loop)
   */
  private async executeLayer2(
    input: RegenerationInput,
    modelsUsed: string[]
  ): Promise<RegenerationResult<T>> {
    logger.debug('Executing Layer 2: Critique-revise');

    if (!this.config.model) {
      throw new Error('Layer 2: Model instance required');
    }

    const maxRetries = this.config.maxRetries || 2;

    const result = await critiqueAndRevise(
      input.originalPrompt,
      input.rawOutput,
      input.parseError || 'JSON parse failed',
      this.config.model,
      maxRetries
    );

    modelsUsed.push(this.config.model.model || 'unknown');

    // Fix field names
    const fixed = fixFieldNames<T>(result.data);

    // Validate quality (if validator provided)
    let qualityPassed = true;
    if (this.config.qualityValidator) {
      qualityPassed = await this.config.qualityValidator(fixed, input);
    }

    if (!qualityPassed) {
      throw new Error('Layer 2: Quality validation failed');
    }

    return {
      success: true,
      data: fixed,
      metadata: {
        layerUsed: 'critique-revise',
        tokenCost: 1000, // Estimate
        retryCount: result.attempts,
        qualityPassed: true,
        modelsUsed: [this.config.model.model || 'unknown'],
      },
    };
  }

  /**
   * Layer 3: Partial regeneration (field-level atomic repair)
   */
  private async executeLayer3(
    input: RegenerationInput,
    modelsUsed: string[]
  ): Promise<RegenerationResult<T>> {
    logger.debug('Executing Layer 3: Partial regeneration');

    if (!this.config.schema) {
      throw new Error('Layer 3: Zod schema required');
    }

    if (!this.config.model) {
      throw new Error('Layer 3: Model instance required');
    }

    // Try parsing with auto-repair first
    const parsed = safeJSONParse(input.rawOutput);
    if (parsed === null) {
      throw new Error('Layer 3: Cannot parse partial data');
    }

    const result = await regeneratePartialFields(
      this.config.schema,
      parsed,
      input.originalPrompt,
      this.config.model
    );

    modelsUsed.push(this.config.model.model || 'unknown');

    // Fix field names
    const fixed = fixFieldNames<T>(result.data);

    // Validate quality (if validator provided)
    let qualityPassed = true;
    if (this.config.qualityValidator) {
      qualityPassed = await this.config.qualityValidator(fixed, input);
    }

    if (!qualityPassed) {
      throw new Error('Layer 3: Quality validation failed');
    }

    return {
      success: true,
      data: fixed,
      metadata: {
        layerUsed: 'partial-regen',
        tokenCost: 1500, // Estimate
        retryCount: result.attempts,
        qualityPassed: true,
        modelsUsed: [this.config.model.model || 'unknown'],
        successfulFields: result.successfulFields,
        regeneratedFields: result.regeneratedFields,
      },
    };
  }

  /**
   * Layer 4: Model escalation (20B → 120B)
   */
  private async executeLayer4(
    input: RegenerationInput,
    modelsUsed: string[]
  ): Promise<RegenerationResult<T>> {
    logger.debug('Executing Layer 4: Model escalation');

    if (!this.config.courseId) {
      throw new Error('Layer 4: Course ID required');
    }

    const escalationChain = getEscalationChain(this.config.stage, this.config.phaseId);

    if (escalationChain.length === 0) {
      throw new Error('Layer 4: No escalation chain available');
    }

    const result = await escalateToLargerModel(
      input.originalPrompt,
      this.config.courseId,
      escalationChain
    );

    modelsUsed.push(result.modelUsed);

    // Parse output
    const parsed = JSON.parse(result.output);
    const fixed = fixFieldNames<T>(parsed);

    // Validate quality (if validator provided)
    let qualityPassed = true;
    if (this.config.qualityValidator) {
      qualityPassed = await this.config.qualityValidator(fixed, input);
    }

    if (!qualityPassed) {
      throw new Error('Layer 4: Quality validation failed');
    }

    return {
      success: true,
      data: fixed,
      metadata: {
        layerUsed: 'model-escalation',
        tokenCost: 5000, // Estimate (120B model)
        retryCount: 0,
        qualityPassed: true,
        modelsUsed: [result.modelUsed],
      },
    };
  }

  /**
   * Layer 5: Emergency fallback (Gemini)
   */
  private async executeLayer5(
    input: RegenerationInput,
    modelsUsed: string[]
  ): Promise<RegenerationResult<T>> {
    logger.debug('Executing Layer 5: Emergency fallback');

    if (!this.config.courseId) {
      throw new Error('Layer 5: Course ID required');
    }

    if (!shouldAttemptQualityFallback(this.config.stage)) {
      throw new Error('Layer 5: Quality fallback disabled for this stage');
    }

    const result = await qualityFallback(input.originalPrompt, this.config.courseId);

    modelsUsed.push(result.modelUsed);

    // Parse output
    const parsed = JSON.parse(result.output);
    const fixed = fixFieldNames<T>(parsed);

    // Validate quality (if validator provided)
    let qualityPassed = true;
    if (this.config.qualityValidator) {
      qualityPassed = await this.config.qualityValidator(fixed, input);
    }

    if (!qualityPassed) {
      throw new Error('Layer 5: Quality validation failed');
    }

    return {
      success: true,
      data: fixed,
      metadata: {
        layerUsed: 'emergency',
        tokenCost: 3000, // Estimate (Gemini)
        retryCount: 0,
        qualityPassed: true,
        modelsUsed: [result.modelUsed],
      },
    };
  }

  /**
   * Track metrics (currently logs to console, future: Supabase)
   */
  private trackMetrics(result: RegenerationResult<T>): void {
    logger.info(
      {
        stage: this.config.stage,
        phaseId: this.config.phaseId,
        courseId: this.config.courseId,
        layerUsed: result.metadata.layerUsed,
        success: result.success,
        tokenCost: result.metadata.tokenCost,
        retryCount: result.metadata.retryCount,
        qualityPassed: result.metadata.qualityPassed,
      },
      'Regeneration metrics'
    );

    // Future: Insert into system_metrics table
    // await supabase.from('system_metrics').insert({
    //   metric_type: 'json_regeneration',
    //   ...metrics
    // });
  }
}

/**
 * Helper: Create quality validator from thresholds
 *
 * @param thresholds - Quality thresholds (0-1 scale)
 * @returns Quality validator function
 */
export function createQualityValidator<T = any>(thresholds: {
  completeness?: number;
  coherence?: number;
}): QualityValidator<T> {
  return (data: T) => {
    // Simple heuristic: Check if data has content
    if (!data || typeof data !== 'object') {
      return false;
    }

    const keys = Object.keys(data);
    const completeness = keys.length > 0 ? 1.0 : 0.0;

    return completeness >= (thresholds.completeness || 0.85);
  };
}
