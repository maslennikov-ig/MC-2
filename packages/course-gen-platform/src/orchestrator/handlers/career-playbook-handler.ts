import type { Job } from 'bullmq';
import { z } from 'zod';
import {
  CareerPlaybookBlockIdSchema,
  CareerPlaybookBlockStateSchema,
  CareerPlaybookQADataSchema,
  CareerPlaybookRoleProfileSpecSchema,
  languageSchema,
} from '@megacampus/shared-types';
import type { JobResult } from './base-handler';
import { getCareerPlaybookGraph } from '@/stages/stage-career-playbook/graph';
import { generateCareerPlaybookFollowups } from '@/stages/stage-career-playbook/nodes/followup-questions';
import { regenerateCareerPlaybookBlock } from '@/stages/stage-career-playbook/nodes/block-regenerator';

export const CareerPlaybookJobTypeSchema = z.enum([
  'GENERATE_FOLLOWUPS',
  'GENERATE_PLAYBOOK',
  'REGENERATE_BLOCK',
]);
export type CareerPlaybookJobType = z.infer<typeof CareerPlaybookJobTypeSchema>;

const CareerPlaybookBaseJobDataSchema = z.object({
  jobType: CareerPlaybookJobTypeSchema,
  playbookId: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  language: languageSchema.default('ru'),
});

export const CareerPlaybookGenerateFollowupsJobDataSchema = CareerPlaybookBaseJobDataSchema.extend({
  jobType: z.literal('GENERATE_FOLLOWUPS'),
  qaData: CareerPlaybookQADataSchema,
});

export const CareerPlaybookGeneratePlaybookJobDataSchema = CareerPlaybookBaseJobDataSchema.extend({
  jobType: z.literal('GENERATE_PLAYBOOK'),
  qaData: CareerPlaybookQADataSchema,
});

export const CareerPlaybookRegenerateBlockJobDataSchema = CareerPlaybookBaseJobDataSchema.extend({
  jobType: z.literal('REGENERATE_BLOCK'),
  blockId: CareerPlaybookBlockIdSchema,
  instruction: z.string().min(1).max(1000),
  roleProfileSpec: CareerPlaybookRoleProfileSpecSchema,
  originalBlock: CareerPlaybookBlockStateSchema,
  generatedBlocks: z.record(CareerPlaybookBlockStateSchema).optional(),
});

export const CareerPlaybookJobDataSchema = z.discriminatedUnion('jobType', [
  CareerPlaybookGenerateFollowupsJobDataSchema,
  CareerPlaybookGeneratePlaybookJobDataSchema,
  CareerPlaybookRegenerateBlockJobDataSchema,
]);
export type CareerPlaybookJobData = z.infer<typeof CareerPlaybookJobDataSchema>;

export class CareerPlaybookHandler {
  async process(job: Job<CareerPlaybookJobData>): Promise<JobResult> {
    const jobData = CareerPlaybookJobDataSchema.parse(job.data);

    if (jobData.jobType === 'GENERATE_FOLLOWUPS') {
      return this.generateFollowups(jobData);
    }

    if (jobData.jobType === 'GENERATE_PLAYBOOK') {
      return this.generatePlaybook(jobData);
    }

    return this.regenerateBlock(jobData);
  }

  private async generateFollowups(
    jobData: z.infer<typeof CareerPlaybookGenerateFollowupsJobDataSchema>
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
    jobData: z.infer<typeof CareerPlaybookGeneratePlaybookJobDataSchema>
  ): Promise<JobResult> {
    const graph = getCareerPlaybookGraph();
    const result = await graph.invoke({
      playbookId: jobData.playbookId,
      userId: jobData.userId,
      organizationId: jobData.organizationId,
      language: jobData.language,
      qaData: jobData.qaData,
      currentNode: 'specBuilder',
    });
    const errors = result.errors ?? [];
    const success = errors.length === 0;

    return {
      success,
      message: success
        ? 'Career Playbook generated'
        : `Career Playbook generation failed: ${errors.join('; ')}`,
      data: result,
      error: errors[0],
    };
  }

  private async regenerateBlock(
    jobData: z.infer<typeof CareerPlaybookRegenerateBlockJobDataSchema>
  ): Promise<JobResult> {
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
}

export const careerPlaybookHandler = new CareerPlaybookHandler();
