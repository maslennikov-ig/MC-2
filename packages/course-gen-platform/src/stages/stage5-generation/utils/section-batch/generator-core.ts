import { ChatOpenAI } from '@langchain/openai';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput, Section } from '@megacampus/shared-types';
import { SectionSchema } from '@megacampus/shared-types/generation-result';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { safeJSONParse } from '@/shared/workspace-utils';
import { preprocessObject } from '@/shared/validation/preprocessing';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import { createCostRecordingModelAsync } from '@/shared/llm/langchain-models';
import { normalizeLanguageCode } from '@/shared/workspace-utils';
import { z } from 'zod';
import logger from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { ModelTier, SectionBatchResult } from './types';
import { MODELS } from './constants';
import { buildBatchPrompt, CourseConstraints } from './prompt-builder';
import { estimateTokens } from './utils';
import { SectionCallCostCollector } from './call-cost-collector';

/** How long a section batch is allowed to take. */
const SECTION_BATCH_TIMEOUT_MS = 300_000;

/**
 * The catalogue phase a tier is billed under.
 *
 * Written out rather than built from the tier name, so the phases a trace row
 * can carry are greppable: a phase assembled at runtime has twice been declared
 * dead while it was live (mc2-tp61k). `tier3_gemini` is the context-overflow
 * escalation, which is what `stage_5_escalation` is.
 */
const PHASE_BY_TIER: Record<ModelTier['tier'], string> = {
  simple: 'stage_5_simple',
  normal: 'stage_5_normal',
  complex: 'stage_5_complex',
  tier3_gemini: 'stage_5_escalation',
};

/**
 * Build the model for a section batch.
 *
 * Goes through the shared factory rather than assembling its own `ChatOpenAI`.
 * That decides three things this file used to get wrong on its own: the key
 * comes from the admin panel instead of `process.env`, the transport is the
 * instrumented one, and the call records its own price — this is Stage 5 section
 * generation, which is paid for (mc2-me7nx).
 *
 * `temperature` and `maxTokens` still travel through `buildProviderParams`
 * inside the factory, because two provider facts decide whether the numbers the
 * configuration carries are the numbers the request carries: GPT-5.6 ignores
 * `temperature`, and OpenRouter bills reasoning tokens against `max_tokens`.
 *
 * `onCostRecorded` is the read-back of that recording. The price is still made
 * once, at the call; this only carries the recorded figure out to a caller that
 * has to report it.
 */
async function createModel(
  tier: ModelTier,
  courseId?: string,
  onCostRecorded?: (costUsd: number | undefined) => void
): Promise<ChatOpenAI> {
  return createCostRecordingModelAsync(
    tier.model,
    tier.temperature,
    tier.maxTokens,
    PHASE_BY_TIER[tier.tier],
    courseId,
    tier.reasoning,
    SECTION_BATCH_TIMEOUT_MS,
    onCostRecorded
  );
}

/**
 * Cleanup placeholder patterns in generated content
 * This is a safety net for LLMs that occasionally generate placeholder text
 */
function cleanupPlaceholders(
  obj: Record<string, unknown>,
  context: { lessonTitle?: string; topicHint?: string } = {}
): Record<string, unknown> {
  const placeholderPatterns = [
    /\[название[^\]]*\]/gi,
    /\[описание[^\]]*\]/gi,
    /\[текст[^\]]*\]/gi,
    /\[insert[^\]]*\]/gi,
    /\[TBD[^\]]*\]/gi,
    /\[TODO[^\]]*\]/gi,
    /\[placeholder[^\]]*\]/gi,
    /\[пример[^\]]*\]/gi,
    /\[добавить[^\]]*\]/gi,
  ];

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      let cleaned = value;
      let hasPlaceholder = false;

      for (const pattern of placeholderPatterns) {
        if (pattern.test(cleaned)) {
          hasPlaceholder = true;
          // Generate replacement based on field type and context
          const replacement = generatePlaceholderReplacement(key, context);
          cleaned = cleaned.replace(pattern, replacement);
        }
      }

      if (hasPlaceholder) {
        logger.warn({
          msg: 'Cleaned placeholder in field',
          field: key,
          original: value.substring(0, 100),
          cleaned: cleaned.substring(0, 100),
        });
      }

      result[key] = cleaned;
    } else if (Array.isArray(value)) {
      result[key] = (value as unknown[]).map((item): unknown => {
        if (typeof item === 'object' && item !== null) {
          return cleanupPlaceholders(item as Record<string, unknown>, context);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      result[key] = cleanupPlaceholders(value as Record<string, unknown>, context);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Generate contextual replacement for placeholder text
 */
function generatePlaceholderReplacement(
  fieldName: string,
  context: { lessonTitle?: string; topicHint?: string }
): string {
  const lessonTitle = context.lessonTitle || 'this topic';
  const topicHint = context.topicHint || 'the material';

  const replacements: Record<string, string> = {
    exercise_title: `Practice activity for ${lessonTitle}`,
    exercise_description: `Apply the concepts learned in this lesson by working through a hands-on activity. Focus on understanding ${topicHint} through practical application. Complete the exercise step by step, reflecting on your approach and the results achieved.`,
    exercise_type: 'practical exercise',
    lesson_title: `Understanding ${lessonTitle}`,
    lesson_description: `In this lesson, we explore ${topicHint} in detail, building practical skills and theoretical understanding.`,
  };

  return replacements[fieldName] || `Content for ${fieldName.replace(/_/g, ' ')}`;
}

/**
 * Preprocess response content
 */
function preprocessResponse(rawContent: string): string {
  try {
    const parsedRaw = safeJSONParse(rawContent) as
      | Record<string, unknown>
      | Record<string, unknown>[];
    let sectionsArray: Record<string, unknown>[] | undefined;

    if (Array.isArray(parsedRaw)) {
      sectionsArray = parsedRaw;
    } else if ('sections' in parsedRaw && Array.isArray(parsedRaw.sections)) {
      sectionsArray = parsedRaw.sections as Record<string, unknown>[];
    }

    if (sectionsArray) {
      sectionsArray = sectionsArray.map(section => {
        const preprocessedSection = preprocessObject(section, {
          difficulty_level: 'enum',
        });

        const sectionTitle = (preprocessedSection.section_title as string) || '';

        if (preprocessedSection.lessons && Array.isArray(preprocessedSection.lessons)) {
          preprocessedSection.lessons = (
            preprocessedSection.lessons as Record<string, unknown>[]
          ).map(lesson => {
            let preprocessedLesson = preprocessObject(lesson, {
              difficulty_level: 'enum',
            });

            const lessonTitle = (preprocessedLesson.lesson_title as string) || sectionTitle;
            const context = { lessonTitle, topicHint: sectionTitle };

            // practical_exercises preprocessing REMOVED — Stage 6 generates exercises independently

            // Cleanup placeholders in lesson fields
            preprocessedLesson = cleanupPlaceholders(preprocessedLesson, context);
            return preprocessedLesson;
          });
        }

        return preprocessedSection;
      });

      const result = Array.isArray(parsedRaw) ? sectionsArray : { sections: sectionsArray };
      return JSON.stringify(result);
    }
  } catch (error) {
    console.warn('[Section Batch Generator] Preprocessing failed, using raw output:', error);
  }
  return rawContent;
}

/**
 * Validate sections and inject duration
 */
function validateAndInjectDuration(
  data: { sections: Section[] } | Section | Section[],
  input: GenerationJobInput,
  batchNum: number,
  sectionIndex: number
): Section[] {
  let sectionsToValidate: unknown[];

  if (Array.isArray(data)) {
    sectionsToValidate = data as unknown[];
  } else if (
    typeof data === 'object' &&
    data !== null &&
    'sections' in data &&
    Array.isArray((data as { sections: Section[] }).sections)
  ) {
    sectionsToValidate = (data as { sections: Section[] }).sections as unknown[];
  } else {
    sectionsToValidate = [data];
  }

  const lessonDuration = input.frontend_parameters.lesson_duration_minutes || 15;

  logger.info({
    msg: 'Injecting lesson duration from frontend_parameters',
    lessonDuration,
    batchNum,
    sectionIndex,
    courseId: input.course_id,
  });

  const WARN_LEARNING_OBJECTIVES_THRESHOLD = 8;

  sectionsToValidate = sectionsToValidate.map(section => {
    const sectionObj = section as Record<string, unknown>;

    // Warn if too many learning_objectives, but don't block or truncate
    if (
      sectionObj.learning_objectives &&
      Array.isArray(sectionObj.learning_objectives) &&
      sectionObj.learning_objectives.length > WARN_LEARNING_OBJECTIVES_THRESHOLD
    ) {
      logger.warn({
        msg: 'Section has many learning_objectives',
        batchNum,
        sectionIndex,
        count: sectionObj.learning_objectives.length,
        threshold: WARN_LEARNING_OBJECTIVES_THRESHOLD,
        courseId: input.course_id,
      });
    }

    if (sectionObj.lessons && Array.isArray(sectionObj.lessons)) {
      return {
        ...sectionObj,
        lessons: sectionObj.lessons.map(lesson => {
          const lessonObj = lesson as Record<string, unknown>;
          return {
            ...lessonObj,
            estimated_duration_minutes: lessonDuration,
          };
        }),
      };
    }
    return sectionObj;
  });

  try {
    return z.array(SectionSchema).parse(sectionsToValidate);
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
      // Fire-and-forget: track RT-006 retries in generation_trace for telemetry
      void logTrace({
        courseId: input.course_id,
        stage: 'stage_5',
        phase: 'generate_sections',
        stepName: 'rt006_validation_failed',
        errorData: { batchNum, sectionIndex, issues },
        durationMs: 0,
      });
      throw new Error(`RT-006 validation failed: ${issues}`);
    }
    throw error;
  }
}

/**
 * Generate section with retry logic and quality gate validation
 */
export async function generateWithRetry(
  batchNum: number,
  sectionIndex: number,
  input: GenerationJobInput,
  modelTier: ModelTier,
  qdrantClient: QdrantClient | undefined,
  language: string,
  constraints?: CourseConstraints,
  overlapFeedback?: string,
  previousSectionsDigest?: string
): Promise<SectionBatchResult> {
  const maxAttempts = 2;
  let retryCount = 0;
  let currentModelTier = modelTier;
  // One collector for the whole attempt, so an escalated tier, a retry, and the
  // UnifiedRegenerator's own calls all land in the figure this batch reports.
  const costCollector = new SectionCallCostCollector();

  while (retryCount < maxAttempts) {
    try {
      const prompt = await buildBatchPrompt(
        input,
        sectionIndex,
        qdrantClient,
        retryCount + 1,
        constraints,
        overlapFeedback,
        previousSectionsDigest
      );

      const model = await createModel(currentModelTier, input.course_id, costCollector.record);
      const response = await model.invoke(prompt);

      let rawContent: string;
      if (typeof response.content === 'string') {
        rawContent = response.content;
      } else {
        rawContent = response.content
          .map(c => (typeof c === 'string' ? c : 'text' in c ? c.text : ''))
          .join('');
      }

      const preprocessedContent = preprocessResponse(rawContent);

      const regenerator = new UnifiedRegenerator<{ sections: Section[] } | Section | Section[]>({
        // Note: 'partial-regen' removed - requires typed Zod schema which is complex for Section union type
        enabledLayers: ['auto-repair', 'critique-revise', 'model-escalation', 'emergency'],
        maxRetries: 3,
        model: model,
        qualityValidator: data => {
          if (Array.isArray(data)) {
            return data.length > 0;
          }
          if ('sections' in data && Array.isArray((data as { sections: Section[] }).sections)) {
            return (data as { sections: Section[] }).sections.length > 0;
          }
          const section = data as Partial<Section>;
          if (section.section_number !== undefined && section.lessons) {
            return true;
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

      const sections = validateAndInjectDuration(result.data, input, batchNum, sectionIndex);

      const regenerationMetrics = {
        layerUsed: result.metadata.layerUsed,
        repairSuccessRate: result.metadata.layerUsed === 'failed' ? 0 : 1,
        tokensSaved:
          result.metadata.layerUsed === 'auto-repair'
            ? estimateTokens(prompt, rawContent) * 0.3
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

      // The cost callbacks are queued, not awaited, by @langchain/core, so the
      // total is only readable once that queue has drained — see
      // `SectionCallCostCollector`.
      const costUsd = await costCollector.settle();

      return {
        sections,
        modelUsed: currentModelTier.model,
        tier: currentModelTier.tier,
        tokensUsed: estimateTokens(prompt, rawContent),
        retryCount,
        ...(costUsd === undefined ? {} : { costUsd }),
        regenerationMetrics,
      };
    } catch (error) {
      retryCount++;

      if (currentModelTier.tier === 'simple' && retryCount < maxAttempts) {
        console.warn(
          JSON.stringify({
            msg: 'Simple tier failed, escalating to complex tier',
            batchNum,
            sectionIndex,
            attempt: retryCount,
            error: error instanceof Error ? error.message : 'Unknown error',
            level: 'warn',
          })
        );

        // Escalate simple → complex: get model from database with language-specific fallback
        const langCode = normalizeLanguageCode(language, 'en');
        let escalationModel: string;
        let escalationSource = 'database';
        // The escalated phase brings its own sampling settings; falling back to
        // the tier the escalation is leaving would carry the simple tier's
        // budget into a model chosen because that budget was not enough.
        let escalationSampling: Pick<ModelTier, 'temperature' | 'maxTokens' | 'reasoning'> = {
          temperature: currentModelTier.temperature,
          maxTokens: currentModelTier.maxTokens,
          reasoning: currentModelTier.reasoning,
        };

        try {
          const modelConfigService = createModelConfigService();
          const escalationConfig = await modelConfigService.getModelForPhase(
            'stage_5_complex',
            undefined,
            undefined,
            langCode
          );
          escalationModel = escalationConfig.modelId || MODELS.complex;
          escalationSource = escalationConfig.source;
          escalationSampling = {
            temperature: escalationConfig.temperature,
            maxTokens: escalationConfig.maxTokens,
            reasoning: escalationConfig.reasoning,
          };
        } catch (configError) {
          logger.warn({
            msg: 'getModelForPhase failed for escalation, using hardcoded fallback',
            error: configError instanceof Error ? configError.message : 'Unknown error',
          });
          escalationModel = MODELS.complex;
          escalationSource = 'hardcoded';
        }

        currentModelTier = {
          model: escalationModel,
          tier: 'complex',
          reason: `Quality escalation from simple tier - using complex model (${escalationSource})`,
          ...escalationSampling,
        };

        logger.info({
          msg: 'Escalating to complex tier after simple tier failure',
          language,
          model: escalationModel,
          tier: currentModelTier.tier,
          batchNum,
        });

        continue;
      }

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

        const delay = 1000 * retryCount;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(
          `Failed to generate section batch ${batchNum} (section ${sectionIndex}) after ${maxAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  throw new Error('Section generation failed unexpectedly');
}
