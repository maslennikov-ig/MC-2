import type { Job } from 'bullmq';
import {
  CareerPlaybookGenerationProgressSchema,
  CareerPlaybookQADataSchema,
  CareerPlaybookOperationJobDataSchema,
  JobType,
  type CareerPlaybookCostBreakdown,
  type CareerPlaybookGenerateImageJobData,
  type CareerPlaybookGenerationProgress,
  type CareerPlaybookGenerateFollowupsJobData,
  type CareerPlaybookGeneratePlaybookJobData,
  type CareerPlaybookJobData,
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
import {
  getCareerPlaybookGraph,
  getCareerPlaybookGraphRecursionLimit,
} from '@/stages/stage-career-playbook/graph';
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
  warnings?: string[];
};

function toJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function buildCostBreakdown(result: CareerPlaybookGraphResult) {
  if (result.costBreakdown) return result.costBreakdown;
  if (!Array.isArray(result.nodeCosts)) return undefined;

  return {
    nodeCosts: result.nodeCosts,
    total_cost_usd: result.nodeCosts.reduce((sum, item) => sum + item.cost_usd, 0),
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
    const costBreakdown = buildCostBreakdown(result);
    const storedQAData = await this.loadStoredQAData(jobData);
    const { generation_error: _generationError, ...qaDataWithoutGenerationError } = storedQAData;
    const completedProgress = this.buildGenerationProgress(
      jobData,
      { stage: 'completed', percent: 100 },
      qaDataWithoutGenerationError
    );
    const updatePayload: Partial<CareerPlaybookRow> = {
      status: 'completed',
      generated_blocks: toJson(
        result.generatedBlocks ?? {}
      ) as CareerPlaybookRow['generated_blocks'],
      final_markdown: result.finalMarkdown ?? null,
      q_a_data: toJson({
        ...qaDataWithoutGenerationError,
        generation_progress: completedProgress,
        generation_warnings: normalizeGenerationWarnings(result.warnings),
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
      started_at: previous.success ? previous.data.started_at : jobData.createdAt || now,
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
