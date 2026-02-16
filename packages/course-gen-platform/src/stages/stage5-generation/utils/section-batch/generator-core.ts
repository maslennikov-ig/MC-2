import { ChatOpenAI } from '@langchain/openai';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput, Section } from '@megacampus/shared-types';
import { SectionSchema } from '@megacampus/shared-types/generation-result';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { safeJSONParse } from '@/shared/utils/json-repair';
import { preprocessObject } from '@/shared/validation/preprocessing';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import { normalizeLanguageCode } from '@megacampus/shared-utils';
import { z } from 'zod';
import logger from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { ModelTier, SectionBatchResult } from './types';
import { MODELS, OPENROUTER_BASE_URL } from './constants';
import { buildBatchPrompt, CourseConstraints } from './prompt-builder';
import { estimateTokens } from './utils';

/**
 * Create ChatOpenAI model instance for OpenRouter
 */
function createModel(
  modelId: string,
  temperature: number = 0.7,
  maxTokens: number = 30000
): ChatOpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required for section generation');
  }

  return new ChatOpenAI({
    modelName: modelId,
    configuration: {
      baseURL: OPENROUTER_BASE_URL,
    },
    apiKey: apiKey,
    temperature,
    maxTokens,
    timeout: 300000,
  });
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

  sectionsToValidate = sectionsToValidate.map(section => {
    const sectionObj = section as Record<string, unknown>;
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

  while (retryCount < maxAttempts) {
    try {
      const prompt = buildBatchPrompt(
        input,
        sectionIndex,
        qdrantClient,
        retryCount + 1,
        constraints,
        overlapFeedback,
        previousSectionsDigest
      );

      const model = createModel(currentModelTier.model);
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

      return {
        sections,
        modelUsed: currentModelTier.model,
        tier: currentModelTier.tier,
        tokensUsed: estimateTokens(prompt, rawContent),
        retryCount,
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
