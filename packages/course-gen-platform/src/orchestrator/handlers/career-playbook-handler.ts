import type { Job } from 'bullmq';
import { z } from 'zod';
import {
  CareerPlaybookGenerateFollowupsJobDataSchema,
  CareerPlaybookGeneratePlaybookJobDataSchema,
  CareerPlaybookJobDataSchema,
  CareerPlaybookRegenerateBlockJobDataSchema,
} from '@megacampus/shared-types';
import type { CareerPlaybookJobData } from '@megacampus/shared-types';
import type { JobResult } from './base-handler';
import { getCareerPlaybookGraph } from '@/stages/stage-career-playbook/graph';
import { generateCareerPlaybookFollowups } from '@/stages/stage-career-playbook/nodes/followup-questions';
import { regenerateCareerPlaybookBlock } from '@/stages/stage-career-playbook/nodes/block-regenerator';

export class CareerPlaybookHandler {
  async process(job: Job<CareerPlaybookJobData>): Promise<JobResult> {
    const parsedJobData = CareerPlaybookJobDataSchema.parse(job.data);

    if (parsedJobData.action === 'GENERATE_FOLLOWUPS') {
      const jobData = CareerPlaybookGenerateFollowupsJobDataSchema.parse(parsedJobData);
      return this.generateFollowups(jobData);
    }

    if (parsedJobData.action === 'GENERATE_PLAYBOOK') {
      const jobData = CareerPlaybookGeneratePlaybookJobDataSchema.parse(parsedJobData);
      return this.generatePlaybook(jobData);
    }

    const jobData = CareerPlaybookRegenerateBlockJobDataSchema.parse(parsedJobData);
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
    if (errors.length > 0) {
      throw new Error(`Career Playbook generation failed: ${errors.join('; ')}`);
    }

    return {
      success: true,
      message: 'Career Playbook generated',
      data: result,
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
