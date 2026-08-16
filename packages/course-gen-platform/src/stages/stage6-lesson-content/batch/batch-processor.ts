import { requiresReasoningNow } from '@/shared/llm/mandatory-reasoning-recovery';
import { DelayedError, type Job } from 'bullmq';
import { logger } from '@/shared/logger';
import type { PhaseReasoningConfig } from '@/shared/llm/model-config-service';
import { buildReasoningPayload } from '@/shared/llm/client-helpers';
import { getModelCapabilities, MANDATORY_REASONING_RESERVE_TOKENS } from '@megacampus/shared-types';
import { estimateTokensFromText } from '../nodes/generator/generator-helpers';
import type { Stage6JobInput, Stage6PrefetchedGeneratorResponse } from '../types';
import type {
  BatchCompatibilityRequirements,
  BatchEligibilityDecision,
} from '@/shared/llm/openrouter-batch-eligibility';
import type {
  OpenRouterBatch,
  OpenRouterBatchClient,
  OpenRouterBatchStatus,
  OpenRouterChatBatchRequest,
  PositionedBatchResult,
} from '@/shared/llm/openrouter-batch-client';
import { mapCompletedBatchResultsByPosition } from '@/shared/llm/openrouter-batch-client';

export interface Stage6BatchLessonJob {
  position: number;
  lessonJobId: string;
  jobData: Stage6JobInput;
}

export interface PreparedStage6BatchLesson extends Stage6BatchLessonJob {
  prompt: string;
  baseModelId: string;
  maxTokens: number;
  temperature?: number;
  reasoning: PhaseReasoningConfig;
}

export interface Stage6BatchGroupItem extends PreparedStage6BatchLesson {
  customId: string;
}

export interface Stage6BatchGroupState {
  baseModelId: string;
  batchModelId: string;
  batchId: string | null;
  status: OpenRouterBatchStatus | 'pending_submission';
  supportedParameters?: string[];
  submissionAttempts?: number;
  items: Stage6BatchGroupItem[];
  resolved?: boolean;
}

export interface Stage6BatchCoordinatorState {
  startedAt: number;
  groups: Stage6BatchGroupState[];
}

export interface Stage6BatchCoordinatorInput {
  kind: 'stage6_batch_coordinator';
  courseId: string;
  language: string;
  lessonJobs: Stage6BatchLessonJob[];
  state: Stage6BatchCoordinatorState | null;
}

export interface Stage6BatchProcessorResult {
  success: true;
  releasedLessons: number;
  syncFallbacks: number;
}

interface DelayedLessonJob {
  data: Stage6JobInput;
  updateData(data: Stage6JobInput): Promise<void>;
  promote(): Promise<void>;
  getState(): Promise<string>;
}

interface EligibilityResolver {
  resolve(
    baseModelId: string,
    requirements: BatchCompatibilityRequirements
  ): Promise<BatchEligibilityDecision>;
}

interface BatchClientContract {
  submitChatBatch: OpenRouterBatchClient['submitChatBatch'];
  getBatch: OpenRouterBatchClient['getBatch'];
}

export interface Stage6BatchProcessorDependencies {
  prepareLesson(item: Stage6BatchLessonJob): Promise<PreparedStage6BatchLesson>;
  eligibilityResolver: EligibilityResolver;
  createClient(): Promise<BatchClientContract>;
  getLessonJob(jobId: string): Promise<DelayedLessonJob | null>;
  now?: () => number;
  pollIntervalMs: number;
  maxWaitMs: number;
}

interface ReleaseCounts {
  releasedLessons: number;
  syncFallbacks: number;
}

function requiredParameters(item: PreparedStage6BatchLesson): string[] {
  return item.reasoning.enabled ? ['max_tokens', 'reasoning'] : ['max_tokens'];
}

function buildRequest(
  item: Stage6BatchGroupItem,
  supportedParameters: ReadonlySet<string>,
  modelId: string
): OpenRouterChatBatchRequest {
  const body: OpenRouterChatBatchRequest['body'] = {
    messages: [{ role: 'user', content: item.prompt }],
    max_tokens: item.maxTokens + (item.reasoning.enabled ? (item.reasoning.maxTokens ?? 0) : 0),
  };

  if (supportedParameters.has('reasoning')) {
    if (item.reasoning.enabled) {
      body.reasoning = buildReasoningPayload(item.reasoning);
    } else if (requiresReasoningNow(modelId)) {
      // A model that refuses to stop deliberating rejects the whole request,
      // and here that would waste a 24h batch window rather than one call.
      body.reasoning = { effort: 'low' };
      const ceiling = getModelCapabilities(modelId)?.maxOutputTokens ?? null;
      const grown = (body.max_tokens ?? 0) + MANDATORY_REASONING_RESERVE_TOKENS;
      body.max_tokens = ceiling === null ? grown : Math.min(grown, ceiling);
    } else {
      body.reasoning = { enabled: false };
    }
  }
  if (supportedParameters.has('temperature') && typeof item.temperature === 'number') {
    body.temperature = item.temperature;
  }

  return { customId: item.customId, body };
}

async function releaseSeedSync(
  getLessonJob: Stage6BatchProcessorDependencies['getLessonJob'],
  item: Stage6BatchLessonJob
): Promise<ReleaseCounts> {
  const lessonJob = await getLessonJob(item.lessonJobId);
  if (!lessonJob || (await lessonJob.getState()) !== 'delayed') {
    return { releasedLessons: 0, syncFallbacks: 1 };
  }
  await lessonJob.promote();
  return { releasedLessons: 1, syncFallbacks: 1 };
}

async function releaseLesson(
  getLessonJob: Stage6BatchProcessorDependencies['getLessonJob'],
  item: Stage6BatchGroupItem,
  result: PositionedBatchResult | null,
  baseModelId: string,
  batchModelId: string
): Promise<{ released: boolean; syncFallback: boolean }> {
  const lessonJob = await getLessonJob(item.lessonJobId);
  if (!lessonJob || (await lessonJob.getState()) !== 'delayed') {
    return { released: false, syncFallback: result?.ok !== true };
  }

  if (result?.ok) {
    const prefetchedGeneratorResponse: Stage6PrefetchedGeneratorResponse = {
      content: result.content,
      prompt: item.prompt,
      tokensUsed: result.totalTokens,
      modelUsed: batchModelId,
      baseModelUsed: baseModelId,
      costUsd: result.costUsd,
    };
    await lessonJob.updateData({ ...lessonJob.data, prefetchedGeneratorResponse });
  }

  await lessonJob.promote();
  return { released: true, syncFallback: result?.ok !== true };
}

async function releaseGroup(
  dependencies: Stage6BatchProcessorDependencies,
  group: Stage6BatchGroupState,
  batch: OpenRouterBatch | null
): Promise<ReleaseCounts> {
  const mapped = batch
    ? mapCompletedBatchResultsByPosition(
        batch,
        group.items.map(item => item.customId)
      )
    : group.items.map(() => null);

  const released = await Promise.all(
    group.items.map((item, index) =>
      releaseLesson(
        lessonJobId => dependencies.getLessonJob(lessonJobId),
        item,
        mapped[index],
        group.baseModelId,
        group.batchModelId
      )
    )
  );
  return released.reduce<ReleaseCounts>(
    (counts, item) => ({
      releasedLessons: counts.releasedLessons + (item.released ? 1 : 0),
      syncFallbacks: counts.syncFallbacks + (item.syncFallback ? 1 : 0),
    }),
    { releasedLessons: 0, syncFallbacks: 0 }
  );
}

function addCounts(left: ReleaseCounts, right: ReleaseCounts): ReleaseCounts {
  return {
    releasedLessons: left.releasedLessons + right.releasedLessons,
    syncFallbacks: left.syncFallbacks + right.syncFallbacks,
  };
}

async function delayCoordinator(
  job: Job<Stage6BatchCoordinatorInput>,
  token: string | undefined,
  at: number
): Promise<never> {
  if (!token) throw new Error('Stage 6 Batch coordinator requires a BullMQ lock token');
  await job.moveToDelayed(at, token);
  throw new DelayedError();
}

export function createStage6BatchProcessor(dependencies: Stage6BatchProcessorDependencies) {
  const now = dependencies.now ?? Date.now;
  const maxSubmissionAttempts = 3;

  return async function processStage6Batch(
    job: Job<Stage6BatchCoordinatorInput>,
    token?: string
  ): Promise<Stage6BatchProcessorResult> {
    let state = job.data.state;
    let counts: ReleaseCounts = { releasedLessons: 0, syncFallbacks: 0 };

    if (!state) {
      const preparationResults = await Promise.allSettled(
        job.data.lessonJobs.map(item => dependencies.prepareLesson(item))
      );
      const groups = new Map<
        string,
        {
          decision: Extract<BatchEligibilityDecision, { eligible: true }>;
          items: Stage6BatchGroupItem[];
        }
      >();

      const prepared: PreparedStage6BatchLesson[] = [];
      for (let index = 0; index < preparationResults.length; index++) {
        const result = preparationResults[index];
        if (result.status === 'fulfilled') prepared.push(result.value);
        else {
          logger.warn(
            {
              courseId: job.data.courseId,
              lessonJobId: job.data.lessonJobs[index].lessonJobId,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            },
            'Stage 6 Batch preparation failed; promoting lesson to synchronous generation'
          );
          counts = addCounts(
            counts,
            await releaseSeedSync(
              lessonJobId => dependencies.getLessonJob(lessonJobId),
              job.data.lessonJobs[index]
            )
          );
        }
      }

      for (const item of prepared) {
        const outputTokens =
          item.maxTokens + (item.reasoning.enabled ? (item.reasoning.maxTokens ?? 0) : 0);
        const decision = await dependencies.eligibilityResolver.resolve(item.baseModelId, {
          requiredContextTokens: estimateTokensFromText(item.prompt, job.data.language),
          requiredOutputTokens: outputTokens,
          requiredParameters: requiredParameters(item),
        });

        const batchItem: Stage6BatchGroupItem = {
          ...item,
          customId: `lesson-${item.position}`,
        };
        if (!decision.eligible) {
          logger.info(
            {
              courseId: job.data.courseId,
              lessonId: item.jobData.lessonSpec.lesson_id,
              baseModelId: item.baseModelId,
              reason: decision.reason,
            },
            'Stage 6 model is not eligible for discounted Batch API; using synchronous generation'
          );
          counts = addCounts(
            counts,
            await releaseGroup(
              dependencies,
              {
                baseModelId: item.baseModelId,
                batchModelId: `${item.baseModelId}:batch`,
                batchId: null,
                status: 'pending_submission',
                items: [batchItem],
              },
              null
            )
          );
          continue;
        }

        const existing = groups.get(decision.batchModelId);
        if (existing) existing.items.push(batchItem);
        else groups.set(decision.batchModelId, { decision, items: [batchItem] });
      }

      state = {
        startedAt: now(),
        groups: [...groups.values()].map(({ decision, items }) => ({
          baseModelId: decision.baseModelId,
          batchModelId: decision.batchModelId,
          batchId: null,
          status: 'pending_submission',
          supportedParameters: [...decision.supportedParameters],
          submissionAttempts: 0,
          items,
        })),
      };
      await job.updateData({ ...job.data, state });
    }

    const deadlineReached = now() - state.startedAt >= dependencies.maxWaitMs;
    if (deadlineReached) {
      for (const group of state.groups) {
        if (group.resolved) continue;
        counts = addCounts(counts, await releaseGroup(dependencies, group, null));
        group.resolved = true;
      }
      await job.updateData({ ...job.data, state });
      return { success: true, ...counts };
    }

    if (state.groups.length === 0) return { success: true, ...counts };

    let client: BatchClientContract;
    try {
      client = await dependencies.createClient();
    } catch {
      for (const group of state.groups) {
        if (group.resolved) continue;
        counts = addCounts(counts, await releaseGroup(dependencies, group, null));
        group.resolved = true;
      }
      await job.updateData({ ...job.data, state });
      return { success: true, ...counts };
    }

    let submittedThisTurn = false;
    let needsSubmissionRetry = false;
    for (const group of state.groups) {
      if (group.resolved || group.batchId) continue;
      group.submissionAttempts = (group.submissionAttempts ?? 0) + 1;
      try {
        const submitted = await client.submitChatBatch({
          // OpenRouter exposes a separate `:batch` catalog entry for pricing,
          // but its Batch API examples submit the ordinary model slug.
          model: group.baseModelId,
          requests: group.items.map(item =>
            buildRequest(
              item,
              new Set(group.supportedParameters ?? ['max_tokens', 'reasoning']),
              group.baseModelId
            )
          ),
        });
        group.batchId = submitted.id;
        group.status = submitted.status;
        submittedThisTurn = true;
      } catch {
        group.status = 'pending_submission';
        const willRetry = group.submissionAttempts < maxSubmissionAttempts;
        logger.warn(
          {
            courseId: job.data.courseId,
            batchModelId: group.batchModelId,
            submissionAttempts: group.submissionAttempts,
            duplicateChargePossible: true,
            willRetry,
          },
          willRetry
            ? 'Stage 6 Batch submission outcome is ambiguous; scheduling automatic retry'
            : 'Stage 6 Batch submission remained ambiguous; resuming synchronous generation'
        );
        if (!willRetry) {
          counts = addCounts(counts, await releaseGroup(dependencies, group, null));
          group.resolved = true;
        } else {
          needsSubmissionRetry = true;
        }
      }
      await job.updateData({ ...job.data, state });
    }

    if (submittedThisTurn || needsSubmissionRetry) {
      return delayCoordinator(job, token, now() + dependencies.pollIntervalMs);
    }

    let hasPendingGroup = false;
    for (const group of state.groups) {
      if (group.resolved) continue;

      if (!group.batchId) {
        counts = addCounts(counts, await releaseGroup(dependencies, group, null));
        group.resolved = true;
        continue;
      }

      let batch: OpenRouterBatch;
      try {
        batch = await client.getBatch(group.batchId);
      } catch (error) {
        logger.warn(
          {
            courseId: job.data.courseId,
            batchId: group.batchId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Stage 6 Batch status poll failed; keeping coordinator delayed'
        );
        hasPendingGroup = true;
        continue;
      }
      group.status = batch.status;
      if (batch.status === 'completed') {
        counts = addCounts(counts, await releaseGroup(dependencies, group, batch));
        group.resolved = true;
      } else if (['failed', 'expired', 'cancelled'].includes(batch.status)) {
        counts = addCounts(counts, await releaseGroup(dependencies, group, null));
        group.resolved = true;
      } else {
        hasPendingGroup = true;
      }
    }
    await job.updateData({ ...job.data, state });

    if (hasPendingGroup) {
      return delayCoordinator(job, token, now() + dependencies.pollIntervalMs);
    }
    return { success: true, ...counts };
  };
}
