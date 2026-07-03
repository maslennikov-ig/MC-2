import type { Job } from 'bullmq';
import {
  CareerPlaybookGenerationProgressSchema,
  CareerPlaybookQADataSchema,
  CareerPlaybookOperationJobDataSchema,
  JobType,
  CareerPlaybookBlockIdSchema,
  CareerPlaybookQualityIssueSchema,
  dedupeCareerPlaybookQualityIssues,
  isInternalCareerPlaybookGenerationWarning,
  type CareerPlaybookBlockId,
  type CareerPlaybookBlockState,
  type CareerPlaybookCostBreakdown,
  type CareerPlaybookGenerateImageJobData,
  type CareerPlaybookGenerationProgress,
  type CareerPlaybookGenerateFollowupsJobData,
  type CareerPlaybookGeneratePlaybookJobData,
  type CareerPlaybookJobData,
  type CareerPlaybookQualityIssue,
  type CareerPlaybookProcessSourceJobData,
  type CareerPlaybookRegenerateBlockJobData,
} from '@megacampus/shared-types';
import type { JobResult } from './base-handler';
import { logger } from '../../shared/logger';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import type {
  CareerPlaybookRow,
  CareerPlaybookSupabase,
} from '../../server/routers/career-playbook/service-mappers';
import { sumCareerPlaybookNodeCosts } from '../../server/routers/career-playbook/cost-breakdown';
import {
  getCareerPlaybookGraph,
  getCareerPlaybookGraphRecursionLimit,
} from '@/stages/stage-career-playbook/graph';
import {
  remediateCareerPlaybookFinalMarkdown,
  remediateCareerPlaybookMermaidBlocks,
} from '@/stages/stage-career-playbook/nodes/mermaid-quality';
import { generateCareerPlaybookFollowups } from '@/stages/stage-career-playbook/nodes/followup-questions';
import { regenerateCareerPlaybookBlock } from '@/stages/stage-career-playbook/nodes/block-regenerator';
import { processCareerPlaybookSource } from '@/stages/stage-career-playbook/source-processing';
import { generateCareerPlaybookImage } from '@/stages/stage-career-playbook/image-generation';
import { addJob } from '@/orchestrator/queue';

export type { CareerPlaybookJobData };

type CareerPlaybookGraphResult = {
  errors?: string[];
  generatedBlocks?: unknown;
  finalMarkdown?: string | null;
  roleProfileSpec?: unknown;
  webResearch?: unknown;
  costBreakdown?: CareerPlaybookCostBreakdown | null;
  nodeCosts?: CareerPlaybookCostBreakdown['nodeCosts'];
  blockRegenerationAttempts?: Partial<Record<CareerPlaybookBlockId, number>>;
  warnings?: string[];
  qualityIssues?: unknown;
};

function toJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function normalizeRegenerationAttempts(
  attempts: CareerPlaybookGraphResult['blockRegenerationAttempts']
): Record<string, number> | undefined {
  if (!attempts || typeof attempts !== 'object') return undefined;

  const entries = Object.entries(attempts).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function buildCostBreakdown(result: CareerPlaybookGraphResult) {
  const regenerationAttempts = normalizeRegenerationAttempts(result.blockRegenerationAttempts);

  if (result.costBreakdown) {
    return regenerationAttempts
      ? { ...result.costBreakdown, regeneration_attempts: regenerationAttempts }
      : result.costBreakdown;
  }
  if (!Array.isArray(result.nodeCosts)) return undefined;

  return {
    nodeCosts: result.nodeCosts,
    total_cost_usd: sumCareerPlaybookNodeCosts(result.nodeCosts),
    ...(regenerationAttempts ? { regeneration_attempts: regenerationAttempts } : {}),
  };
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeGenerationWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return [];

  return Array.from(
    new Set(
      warnings
        .filter((warning): warning is string => typeof warning === 'string')
        .map(warning => warning.trim())
        .filter(Boolean)
    )
  );
}

function normalizeQualityIssues(issues: unknown): CareerPlaybookQualityIssue[] {
  if (!Array.isArray(issues)) return [];

  const normalized: CareerPlaybookQualityIssue[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    const parsed = CareerPlaybookQualityIssueSchema.safeParse(issue);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    normalized.push(parsed.data);
    seen.add(parsed.data.id);
  }

  return normalized;
}

function maybeBlockId(value: unknown): CareerPlaybookBlockId | undefined {
  const parsed = CareerPlaybookBlockIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function asGeneratedBlocks(
  value: unknown
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> = {};
  for (const [rawBlockId, rawBlock] of Object.entries(value)) {
    const blockId = maybeBlockId(rawBlockId);
    if (!blockId || !rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) continue;
    result[blockId] = rawBlock as CareerPlaybookBlockState;
  }

  return result;
}

function qualityIssueTitleForSeverity(severity: CareerPlaybookQualityIssue['severity']): string {
  if (severity === 'critical') return 'Проблема качества блока';
  if (severity === 'warning') return 'Замечание к качеству блока';
  return 'Информационное замечание';
}

function issueId(
  source: string,
  blockId: CareerPlaybookBlockId | undefined,
  index: number
): string {
  return `${source}:${blockId ?? 'system'}:${index}`;
}

function judgeIssueId(
  carrierBlockId: CareerPlaybookBlockId,
  targetBlockId: CareerPlaybookBlockId,
  index: number
): string {
  return `cross_block_judge:${carrierBlockId}:${targetBlockId}:${index}`;
}

function collectJudgeQualityIssues(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): CareerPlaybookQualityIssue[] {
  const issues: CareerPlaybookQualityIssue[] = [];

  for (const [rawCarrierBlockId, block] of Object.entries(generatedBlocks)) {
    const carrierBlockId = rawCarrierBlockId;
    const verdictIssues = block?.judge_verdict?.issues ?? [];
    for (const [index, issue] of verdictIssues.entries()) {
      issues.push({
        id: judgeIssueId(carrierBlockId, issue.block_id, index),
        source: 'cross_block_judge',
        severity: issue.severity,
        blockId: issue.block_id,
        title: qualityIssueTitleForSeverity(issue.severity),
        message: issue.description,
        ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
        action: issue.severity === 'info' ? 'review' : 'regenerate',
      });
    }
  }

  return issues;
}

function extractWarningBlockIds(warning: string): CareerPlaybookBlockId[] {
  const forMatch = warning.match(/\bfor\s+([^;]+);/i);
  if (!forMatch) return [];

  return forMatch[1]
    .split(',')
    .map(part => maybeBlockId(part.trim()))
    .filter((blockId): blockId is CareerPlaybookBlockId => Boolean(blockId));
}

function collectWarningQualityIssues(warnings: string[]): CareerPlaybookQualityIssue[] {
  const issues: CareerPlaybookQualityIssue[] = [];

  for (const [index, warning] of warnings.entries()) {
    if (isInternalCareerPlaybookGenerationWarning(warning)) continue;

    const blockIds = extractWarningBlockIds(warning);
    if (blockIds.length === 0) {
      issues.push({
        id: issueId('system', undefined, index),
        source: 'system',
        severity: 'warning',
        title: 'Системное предупреждение',
        message: warning,
        suggestion: 'Проверьте должностную инструкцию вручную перед публикацией.',
        action: 'review',
      });
      continue;
    }

    for (const blockId of blockIds) {
      issues.push({
        id: issueId('system', blockId, index),
        source: 'system',
        severity: 'warning',
        blockId,
        title: 'Системное предупреждение',
        message: warning,
        suggestion: 'Проверьте блок вручную или запустите регенерацию блока.',
        action: 'regenerate',
      });
    }
  }

  return issues;
}

function mergeQualityIssues(
  ...groups: CareerPlaybookQualityIssue[][]
): CareerPlaybookQualityIssue[] {
  return dedupeCareerPlaybookQualityIssues(groups.flat());
}

function buildCareerPlaybookQualityIssues(
  result: CareerPlaybookGraphResult,
  warnings: string[]
): CareerPlaybookQualityIssue[] {
  return mergeQualityIssues(
    normalizeQualityIssues(result.qualityIssues),
    collectJudgeQualityIssues(asGeneratedBlocks(result.generatedBlocks)),
    collectWarningQualityIssues(warnings)
  );
}

function hasGeneratedBlocks(
  value: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
) {
  return Object.keys(value).length > 0;
}

function isTerminalGenerationStage(stage: CareerPlaybookGenerationProgress['stage']): boolean {
  return stage === 'completed' || stage === 'failed';
}

export class CareerPlaybookHandler {
  async process(job: Job<CareerPlaybookJobData>): Promise<JobResult> {
    const jobData = CareerPlaybookOperationJobDataSchema.parse(job.data);

    switch (jobData.operation) {
      case 'GENERATE_FOLLOWUPS':
        return this.generateFollowups(jobData);
      case 'GENERATE_PLAYBOOK':
        return this.generatePlaybook(jobData, job);
      case 'PROCESS_SOURCE':
        return this.processSource(jobData, job);
      case 'GENERATE_IMAGE':
        return this.generateImage(jobData);
      case 'REGENERATE_BLOCK':
        return this.regenerateBlock(jobData);
    }
  }

  private async generateFollowups(
    jobData: CareerPlaybookGenerateFollowupsJobData
  ): Promise<JobResult> {
    const result = await generateCareerPlaybookFollowups({
      qaData: jobData.qaData,
      language: jobData.language,
    });

    return {
      success: true,
      message: `Generated ${result.response.questions.length} Career Playbook follow-up questions`,
      data: result.response,
    };
  }

  private async generatePlaybook(
    jobData: CareerPlaybookGeneratePlaybookJobData,
    job: Job<CareerPlaybookJobData>
  ): Promise<JobResult> {
    const graph = getCareerPlaybookGraph({
      progressReporter: async progress => {
        await this.persistGenerationProgressBestEffort(jobData, progress);
      },
    });
    let result: CareerPlaybookGraphResult;

    await this.persistGenerationProgressBestEffort(jobData, {
      stage: 'preparing_context',
      percent: 70,
    });

    try {
      result = (await graph.invoke(
        {
          playbookId: jobData.playbookId,
          userId: jobData.userId,
          organizationId: jobData.organizationId,
          language: jobData.language,
          qaData: jobData.qaData,
          currentNode: 'specBuilder',
        },
        { recursionLimit: getCareerPlaybookGraphRecursionLimit() }
      )) as CareerPlaybookGraphResult;
    } catch (error) {
      await this.throwAfterGenerationFailure(jobData, job, errorMessageFrom(error), error);
      throw error;
    }

    // Regeneration attempts are the ground truth for the judge<->regenerator loop:
    // the regenerator's catch path increments attempts without emitting a nodeCost,
    // so node costs alone under-report the loop. Log the summary for A/B analysis.
    const regenerationAttempts = normalizeRegenerationAttempts(result.blockRegenerationAttempts);
    logger.info(
      {
        playbookId: jobData.playbookId,
        regenerationAttempts: regenerationAttempts ?? {},
        totalRegenerationAttempts: regenerationAttempts
          ? Object.values(regenerationAttempts).reduce((sum, value) => sum + value, 0)
          : 0,
        nodeCostCount: Array.isArray(result.nodeCosts) ? result.nodeCosts.length : 0,
      },
      'Career Playbook generation graph completed'
    );

    const errors = result.errors ?? [];
    if (errors.length > 0) {
      const message = errors.join('; ') || 'Career Playbook generation failed';
      await this.throwAfterGenerationFailure(jobData, job, message, new Error(message));
    }

    await this.persistCompleted(jobData, result);

    return {
      success: true,
      message: 'Career Playbook generated',
      data: result,
    };
  }

  private async regenerateBlock(jobData: CareerPlaybookRegenerateBlockJobData): Promise<JobResult> {
    const result = await regenerateCareerPlaybookBlock({
      blockId: jobData.blockId,
      roleProfileSpec: jobData.roleProfileSpec,
      language: jobData.language,
      originalBlock: jobData.originalBlock,
      issue: {
        description: jobData.instruction,
        suggestion: 'Apply the user instruction while preserving the block format contract.',
      },
      userInstruction: jobData.instruction,
      otherBlocks: jobData.generatedBlocks,
    });

    return {
      success: true,
      message: `Regenerated Career Playbook block ${jobData.blockId}`,
      data: result,
    };
  }

  private async processSource(
    jobData: CareerPlaybookProcessSourceJobData,
    job: Job<CareerPlaybookJobData>
  ): Promise<JobResult> {
    const result = await processCareerPlaybookSource({
      playbookId: jobData.playbookId,
      sourceId: jobData.sourceId,
      fileId: jobData.fileId,
      filePath: jobData.filePath,
      mimeType: jobData.mimeType,
      organizationId: jobData.organizationId,
      language: jobData.language,
      job,
    });

    return {
      success: true,
      message: 'Processed Career Playbook business context source',
      data: result,
    };
  }

  private async generateImage(jobData: CareerPlaybookGenerateImageJobData): Promise<JobResult> {
    const result = await generateCareerPlaybookImage(jobData);

    return {
      success: true,
      message: 'Generated Career Playbook image',
      data: result,
    };
  }

  private async persistCompleted(
    jobData: CareerPlaybookGeneratePlaybookJobData,
    result: CareerPlaybookGraphResult
  ) {
    const safeResult = await this.remediateMermaidBeforePersist(result);
    const costBreakdown = buildCostBreakdown(result);
    const storedQAData = await this.loadStoredQAData(jobData);
    const { generation_error: _generationError, ...qaDataWithoutGenerationError } = storedQAData;
    const generationWarnings = normalizeGenerationWarnings(safeResult.warnings);
    const qualityIssues = buildCareerPlaybookQualityIssues(safeResult, generationWarnings);
    const completedProgress = this.buildGenerationProgress(
      jobData,
      { stage: 'completed', percent: 100 },
      qaDataWithoutGenerationError
    );
    const updatePayload: Partial<CareerPlaybookRow> = {
      status: 'completed',
      generated_blocks: toJson(
        safeResult.generatedBlocks ?? {}
      ) as CareerPlaybookRow['generated_blocks'],
      final_markdown: safeResult.finalMarkdown ?? null,
      q_a_data: toJson({
        ...qaDataWithoutGenerationError,
        generation_progress: completedProgress,
        generation_warnings: generationWarnings,
        quality_issues: qualityIssues,
      }) as CareerPlaybookRow['q_a_data'],
      completed_at: new Date().toISOString(),
    };

    if (result.roleProfileSpec) {
      updatePayload.role_profile_spec = toJson(
        result.roleProfileSpec
      ) as CareerPlaybookRow['role_profile_spec'];
    }
    if (result.webResearch) {
      updatePayload.web_research = toJson(result.webResearch) as CareerPlaybookRow['web_research'];
    }
    if (costBreakdown) {
      updatePayload.cost_breakdown = toJson(costBreakdown) as CareerPlaybookRow['cost_breakdown'];
    }

    await this.updatePlaybook(jobData.playbookId, updatePayload);
    await this.enqueueImageGenerationBestEffort(jobData);
  }

  private async enqueueImageGenerationBestEffort(jobData: CareerPlaybookGeneratePlaybookJobData) {
    const now = new Date().toISOString();
    const imageJobData: CareerPlaybookGenerateImageJobData = {
      jobType: JobType.CAREER_PLAYBOOK,
      operation: 'GENERATE_IMAGE',
      playbookId: jobData.playbookId,
      userId: jobData.userId,
      organizationId: jobData.organizationId,
      language: jobData.language,
      locale: jobData.locale,
      createdAt: now,
      force: false,
    };

    try {
      await this.updatePlaybook(jobData.playbookId, {
        image_status: 'pending',
        image_error_message: null,
        image_updated_at: now,
      });

      await addJob(JobType.CAREER_PLAYBOOK, imageJobData, {
        jobId: `career-playbook-image-${jobData.playbookId}`,
        priority: 4,
      });
    } catch (error) {
      const message = errorMessageFrom(error);
      logger.warn(
        {
          playbookId: jobData.playbookId,
          error: message,
        },
        'Failed to enqueue Career Playbook image generation'
      );

      try {
        await this.updatePlaybook(jobData.playbookId, {
          image_status: 'failed',
          image_error_message: message,
          image_updated_at: new Date().toISOString(),
        });
      } catch (updateError) {
        logger.warn(
          {
            playbookId: jobData.playbookId,
            error: errorMessageFrom(updateError),
          },
          'Failed to persist Career Playbook image enqueue failure'
        );
      }
    }
  }

  private async remediateMermaidBeforePersist(
    result: CareerPlaybookGraphResult
  ): Promise<CareerPlaybookGraphResult> {
    const generatedBlocks = asGeneratedBlocks(result.generatedBlocks);
    const blockRemediation = await remediateCareerPlaybookMermaidBlocks(generatedBlocks);
    const markdownRemediation = await remediateCareerPlaybookFinalMarkdown(result.finalMarkdown);
    const qualityIssues = mergeQualityIssues(
      normalizeQualityIssues(result.qualityIssues),
      blockRemediation.qualityIssues
    );

    return {
      ...result,
      generatedBlocks: hasGeneratedBlocks(generatedBlocks)
        ? blockRemediation.generatedBlocks
        : result.generatedBlocks,
      finalMarkdown: markdownRemediation.modified
        ? markdownRemediation.content
        : result.finalMarkdown,
      qualityIssues,
    };
  }

  private async persistFailed(jobData: CareerPlaybookGeneratePlaybookJobData, error: string) {
    const storedQAData = await this.loadStoredQAData(jobData);
    const failedProgress = this.buildGenerationProgress(
      jobData,
      { stage: 'failed', percent: 100 },
      storedQAData
    );

    await this.updatePlaybook(jobData.playbookId, {
      status: 'failed',
      q_a_data: toJson({
        ...storedQAData,
        generation_error: error,
        generation_progress: failedProgress,
      }) as CareerPlaybookRow['q_a_data'],
    });
  }

  private async persistGenerationProgressBestEffort(
    jobData: CareerPlaybookGeneratePlaybookJobData,
    progress: Pick<CareerPlaybookGenerationProgress, 'stage' | 'percent'>
  ) {
    try {
      const storedQAData = await this.loadStoredQAData(jobData);
      const previousProgress = CareerPlaybookGenerationProgressSchema.safeParse(
        storedQAData.generation_progress
      );
      if (
        previousProgress.success &&
        !isTerminalGenerationStage(previousProgress.data.stage) &&
        !isTerminalGenerationStage(progress.stage) &&
        previousProgress.data.percent > progress.percent
      ) {
        logger.debug(
          {
            playbookId: jobData.playbookId,
            previousProgress: previousProgress.data,
            nextProgress: progress,
          },
          'Skipping stale Career Playbook generation progress update'
        );
        return;
      }

      const { generation_error: _generationError, ...qaDataWithoutGenerationError } = storedQAData;
      const generationProgress = this.buildGenerationProgress(
        jobData,
        progress,
        qaDataWithoutGenerationError
      );

      await this.updatePlaybook(jobData.playbookId, {
        status: 'generating',
        q_a_data: toJson({
          ...qaDataWithoutGenerationError,
          generation_progress: generationProgress,
        }) as CareerPlaybookRow['q_a_data'],
      });
    } catch (error) {
      logger.warn(
        {
          playbookId: jobData.playbookId,
          progress,
          error: errorMessageFrom(error),
        },
        'Career Playbook generation progress update failed'
      );
    }
  }

  private buildGenerationProgress(
    jobData: CareerPlaybookGeneratePlaybookJobData,
    progress: Pick<CareerPlaybookGenerationProgress, 'stage' | 'percent'>,
    storedQAData: Record<string, unknown>
  ): CareerPlaybookGenerationProgress {
    const previous = CareerPlaybookGenerationProgressSchema.safeParse(
      storedQAData.generation_progress
    );
    const now = new Date().toISOString();

    return CareerPlaybookGenerationProgressSchema.parse({
      stage: progress.stage,
      percent: progress.percent,
      started_at:
        previous.success && !isTerminalGenerationStage(previous.data.stage)
          ? previous.data.started_at
          : jobData.createdAt || now,
      updated_at: now,
    });
  }

  private async loadStoredQAData(
    jobData: CareerPlaybookGeneratePlaybookJobData
  ): Promise<Record<string, unknown>> {
    const supabase = this.getCareerPlaybookSupabase();
    const { data } = await supabase
      .from('career_playbooks')
      .select('q_a_data')
      .eq('id', jobData.playbookId)
      .single();
    const rawQAData = data?.q_a_data as unknown;
    const fallbackQAData = toJson(CareerPlaybookQADataSchema.parse(jobData.qaData)) as Record<
      string,
      unknown
    >;
    const storedQAData: Record<string, unknown> =
      rawQAData && typeof rawQAData === 'object' && !Array.isArray(rawQAData)
        ? (rawQAData as Record<string, unknown>)
        : fallbackQAData;

    return storedQAData;
  }

  private async throwAfterGenerationFailure(
    jobData: CareerPlaybookGeneratePlaybookJobData,
    job: Job<CareerPlaybookJobData>,
    message: string,
    error: unknown
  ): Promise<never> {
    if (this.isFinalAttempt(job)) {
      await this.persistFailed(jobData, message);
    }

    throw error instanceof Error ? error : new Error(message);
  }

  private isFinalAttempt(job: Job<CareerPlaybookJobData>): boolean {
    const maxAttempts = typeof job.opts?.attempts === 'number' ? job.opts.attempts : 1;
    return job.attemptsMade + 1 >= maxAttempts;
  }

  private async updatePlaybook(playbookId: string, payload: Partial<CareerPlaybookRow>) {
    const supabase = this.getCareerPlaybookSupabase();
    const { error } = await supabase
      .from('career_playbooks')
      .update(payload)
      .eq('id', playbookId)
      .select('id')
      .single();

    if (error) {
      throw new Error(
        `Failed to persist Career Playbook generation status: ${errorMessageFrom(error)}`
      );
    }
  }

  private getCareerPlaybookSupabase(): CareerPlaybookSupabase {
    return getSupabaseAdmin() as unknown as CareerPlaybookSupabase;
  }
}

export const careerPlaybookHandler = new CareerPlaybookHandler();
