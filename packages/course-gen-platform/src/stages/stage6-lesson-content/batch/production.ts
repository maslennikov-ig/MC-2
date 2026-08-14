import type { Queue } from 'bullmq';
import { logger } from '@/shared/logger';
import { getApiKey } from '@/shared/services/api-key-service';
import { RequiredRagUnavailableError } from '@/shared/rag/document-availability';
import { createModelConfigService, REASONING_DISABLED } from '@/shared/llm/model-config-service';
import { OpenRouterBatchClient } from '@/shared/llm/openrouter-batch-client';
import { OpenRouterBatchEligibilityResolver } from '@/shared/llm/openrouter-batch-eligibility';
import { Stage6EvidenceScopeError } from '../rag/evidence-context';
import { loadStage6EvidenceForCourse } from '../rag/evidence-loader';
import { retrieveLessonContext } from '../utils/lesson-rag-retriever';
import { selectStage6ModelTier } from '../nodes/generator/model-selector';
import { prepareLessonSingleCallRequest } from '../nodes/generator/generator-request';
import { enrichSummaryPreviewFromDB } from '../services/job-processor';
import {
  createStage6BatchProcessor,
  type PreparedStage6BatchLesson,
  type Stage6BatchCoordinatorInput,
  type Stage6BatchLessonJob,
} from './batch-processor';
import { getStage6BatchMaxWaitMs, getStage6BatchPollIntervalMs } from './config';
import type { Stage6JobInput, Stage6JobResult } from '../types';

type Stage6QueueData = Stage6JobInput | Stage6BatchCoordinatorInput;

const eligibilityResolver = new OpenRouterBatchEligibilityResolver();

function createProductionLessonPreparer() {
  const evidenceByCourse = new Map<string, ReturnType<typeof loadStage6EvidenceForCourse>>();

  return async function prepareLesson(
    item: Stage6BatchLessonJob
  ): Promise<PreparedStage6BatchLesson> {
    const { jobData } = item;
    let evidencePromise = evidenceByCourse.get(jobData.courseId);
    if (!evidencePromise) {
      evidencePromise = loadStage6EvidenceForCourse({
        courseId: jobData.courseId,
        requestedOrganizationId: jobData.organizationId,
        providedAnalysisResult: jobData.analysisResult,
      }).finally(() => evidenceByCourse.delete(jobData.courseId));
      evidenceByCourse.set(jobData.courseId, evidencePromise);
    }
    const evidence = await evidencePromise;

    let ragChunks: Awaited<ReturnType<typeof retrieveLessonContext>>['chunks'] = [];
    try {
      const rag = await retrieveLessonContext({
        courseId: jobData.courseId,
        organizationId: evidence.organizationId,
        lessonSpec: jobData.lessonSpec,
        evidenceContext: evidence.evidenceContext,
      });
      ragChunks = rag.chunks;
    } catch (error) {
      if (
        error instanceof RequiredRagUnavailableError ||
        error instanceof Stage6EvidenceScopeError
      ) {
        throw error;
      }
      logger.warn(
        {
          courseId: jobData.courseId,
          lessonId: jobData.lessonSpec.lesson_id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Batch preparation could not retrieve optional RAG context; continuing without it'
      );
    }

    await enrichSummaryPreviewFromDB(jobData.courseId, jobData.lessonSpec);
    const selectedTier = await selectStage6ModelTier(jobData.lessonSpec, jobData.courseId);
    const phaseConfig = await createModelConfigService().getModelForPhase(
      selectedTier.phaseName,
      jobData.courseId,
      undefined,
      jobData.language
    );
    const baseModelId = phaseConfig.modelId;
    const prepared = await prepareLessonSingleCallRequest(
      jobData.lessonSpec,
      ragChunks,
      jobData.language,
      baseModelId,
      jobData.style ?? null,
      jobData.analysisResult ?? null,
      jobData.courseId,
      phaseConfig.maxTokens ?? undefined
    );

    return {
      ...item,
      prompt: prepared.prompt,
      baseModelId,
      maxTokens: prepared.maxTokens,
      temperature: prepared.temperature,
      reasoning: phaseConfig.reasoning ?? REASONING_DISABLED,
    };
  };
}

export function createProductionStage6BatchProcessor(
  queue: Queue<Stage6QueueData, Stage6JobResult>
) {
  return createStage6BatchProcessor({
    prepareLesson: createProductionLessonPreparer(),
    eligibilityResolver,
    createClient: async () => {
      const apiKey = await getApiKey('openrouter');
      if (!apiKey) throw new Error('OpenRouter API key is not configured for Stage 6 Batch API');
      return new OpenRouterBatchClient({ apiKey });
    },
    getLessonJob: async jobId => {
      const job = await queue.getJob(jobId);
      return job as never;
    },
    pollIntervalMs: getStage6BatchPollIntervalMs(),
    maxWaitMs: getStage6BatchMaxWaitMs(),
  });
}
