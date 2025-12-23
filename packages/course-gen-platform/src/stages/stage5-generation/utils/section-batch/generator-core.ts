import { ChatOpenAI } from '@langchain/openai';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput, Section } from '@megacampus/shared-types';
import { SectionSchema } from '@megacampus/shared-types/generation-result';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { preprocessObject } from '@/shared/validation/preprocessing';
import { z } from 'zod';
import logger from '@/shared/logger';
import { ModelTier, SectionBatchResult } from './types';
import { MODELS, OPENROUTER_BASE_URL } from './constants';
import { buildBatchPrompt } from './prompt-builder';
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
    throw new Error(
      'OPENROUTER_API_KEY environment variable is required for section generation'
    );
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
 * Preprocess response content
 */
function preprocessResponse(rawContent: string): string {
  try {
    const parsedRaw = JSON.parse(rawContent) as Record<string, unknown> | Record<string, unknown>[];
    let sectionsArray: Record<string, unknown>[] | undefined;
    
    if (Array.isArray(parsedRaw)) {
      sectionsArray = parsedRaw;
    } else if ('sections' in parsedRaw && Array.isArray(parsedRaw.sections)) {
      sectionsArray = parsedRaw.sections as Record<string, unknown>[];
    }

    if (sectionsArray) {
      sectionsArray = sectionsArray.map((section) => {
        const preprocessedSection = preprocessObject(section, {
          difficulty_level: 'enum',
        });

        if (preprocessedSection.lessons && Array.isArray(preprocessedSection.lessons)) {
          preprocessedSection.lessons = (preprocessedSection.lessons as Record<string, unknown>[]).map((lesson) => {
            const preprocessedLesson = preprocessObject(lesson, {
              difficulty_level: 'enum',
            });

            if (preprocessedLesson.practical_exercises && Array.isArray(preprocessedLesson.practical_exercises)) {
              preprocessedLesson.practical_exercises = (preprocessedLesson.practical_exercises as Record<string, unknown>[]).map((exercise) =>
                preprocessObject(exercise, {
                  difficulty_level: 'enum',
                })
              );
            }

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
  } else if (typeof data === 'object' && data !== null && 'sections' in data && Array.isArray((data as { sections: Section[] }).sections)) {
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

  sectionsToValidate = sectionsToValidate.map((section) => {
    const sectionObj = section as Record<string, unknown>;
    if (sectionObj.lessons && Array.isArray(sectionObj.lessons)) {
      return {
        ...sectionObj,
        lessons: sectionObj.lessons.map((lesson) => {
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
  complexityScore: number,
  criticalityScore: number,
  language: string
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
        retryCount + 1
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
        enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
        maxRetries: 3,
        model: model,
        qualityValidator: (data) => {
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
        tokensSaved: result.metadata.layerUsed === 'auto-repair'
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
        complexityScore,
        criticalityScore,
        regenerationMetrics,
      };
    } catch (error) {
      retryCount++;

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

        const isRussian = language === 'ru' || language === 'russian';
        const escalationModel = isRussian
          ? MODELS.ru_lessons_primary
          : MODELS.en_lessons_primary;

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
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(
          `Failed to generate section batch ${batchNum} (section ${sectionIndex}) after ${maxAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  throw new Error('Section generation failed unexpectedly');
}
