import type { Job } from 'bullmq';
import { z } from 'zod';
import {
  CareerPlaybookBlockIdSchema,
  CareerPlaybookFollowupResponseSchema,
  CareerPlaybookQADataSchema,
  languageSchema,
} from '@megacampus/shared-types';
import { extractJSON, safeJSONParse } from '@megacampus/shared-utils';
import type { JobResult } from './base-handler';
import { getCareerPlaybookGraph } from '@/stages/stage-career-playbook/graph';
import { createCareerPlaybookRuntime } from '@/stages/stage-career-playbook/nodes/runtime';

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
});

export const CareerPlaybookJobDataSchema = z.discriminatedUnion('jobType', [
  CareerPlaybookGenerateFollowupsJobDataSchema,
  CareerPlaybookGeneratePlaybookJobDataSchema,
  CareerPlaybookRegenerateBlockJobDataSchema,
]);
export type CareerPlaybookJobData = z.infer<typeof CareerPlaybookJobDataSchema>;

function getAnswer(qaData: z.infer<typeof CareerPlaybookQADataSchema>, key: string): string {
  const answer = qaData.fixed.find(item => item.question_key === key);
  if (!answer) return 'not provided';
  return Array.isArray(answer.value) ? answer.value.join(', ') : answer.value;
}

function getFreeformText(qaData: z.infer<typeof CareerPlaybookQADataSchema>): string {
  return qaData.freeform.map(item => item.text).join('\n\n') || 'none';
}

export class CareerPlaybookHandler {
  private runtime = createCareerPlaybookRuntime();

  async process(job: Job<CareerPlaybookJobData>): Promise<JobResult> {
    const jobData = CareerPlaybookJobDataSchema.parse(job.data);

    if (jobData.jobType === 'GENERATE_FOLLOWUPS') {
      return this.generateFollowups(jobData);
    }

    if (jobData.jobType === 'GENERATE_PLAYBOOK') {
      return this.generatePlaybook(jobData);
    }

    return {
      success: false,
      message: 'Career Playbook block regeneration is scheduled for Phase 3',
      error: `Unsupported in Phase 2: ${jobData.blockId}`,
    };
  }

  private async generateFollowups(
    jobData: z.infer<typeof CareerPlaybookGenerateFollowupsJobDataSchema>
  ): Promise<JobResult> {
    const prompt = await this.runtime.renderPrompt('career_playbook_followup_generator', {
      position: getAnswer(jobData.qaData, 'position'),
      department: getAnswer(jobData.qaData, 'department'),
      level: getAnswer(jobData.qaData, 'level'),
      team_size: getAnswer(jobData.qaData, 'team_size'),
      company_stage: getAnswer(jobData.qaData, 'company_stage'),
      reporting: getAnswer(jobData.qaData, 'reporting'),
      content_language: jobData.language,
      freeform_text: getFreeformText(jobData.qaData),
      previous_followups_json: JSON.stringify(jobData.qaData.followups, null, 2),
    });
    const result = await this.runtime.invokeLLM(prompt, {
      phaseName: 'stage_career_playbook_followup',
      promptKey: 'career_playbook_followup_generator',
      node: 'followupGenerator',
      temperature: 0.4,
      maxTokens: 4_000,
    });
    const parsed = CareerPlaybookFollowupResponseSchema.parse(
      safeJSONParse(extractJSON(result.content))
    );

    return {
      success: true,
      message: `Generated ${parsed.questions.length} Career Playbook follow-up questions`,
      data: parsed,
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

    return {
      success: errors.length === 0,
      message:
        errors.length === 0
          ? 'Career Playbook groups 1-2 generated'
          : `Career Playbook generation failed: ${errors.join('; ')}`,
      data: result,
      error: errors[0],
    };
  }
}

export const careerPlaybookHandler = new CareerPlaybookHandler();
