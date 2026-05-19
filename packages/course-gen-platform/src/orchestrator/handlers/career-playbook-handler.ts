import type { Job } from 'bullmq';
import { z } from 'zod';
import {
  CareerPlaybookGenerateFollowupsJobDataSchema,
  CareerPlaybookGeneratePlaybookJobDataSchema,
  CareerPlaybookJobDataSchema,
  CareerPlaybookFollowupResponseSchema,
} from '@megacampus/shared-types';
import type { CareerPlaybookJobData } from '@megacampus/shared-types';
import { extractJSON, safeJSONParse } from '@megacampus/shared-utils';
import { randomUUID } from 'node:crypto';
import type { JobResult } from './base-handler';
import { getCareerPlaybookGraph } from '@/stages/stage-career-playbook/graph';
import { createCareerPlaybookRuntime } from '@/stages/stage-career-playbook/nodes/runtime';

type CareerPlaybookQAJobData =
  | z.infer<typeof CareerPlaybookGenerateFollowupsJobDataSchema>
  | z.infer<typeof CareerPlaybookGeneratePlaybookJobDataSchema>;

function getAnswer(qaData: CareerPlaybookQAJobData['qaData'], key: string): string {
  const answer = qaData.fixed.find(item => item.question_key === key);
  if (!answer) return 'not provided';
  return Array.isArray(answer.value) ? answer.value.join(', ') : answer.value;
}

function getFreeformText(qaData: CareerPlaybookQAJobData['qaData']): string {
  return qaData.freeform.map(item => item.text).join('\n\n') || 'none';
}

const LLMFollowupQuestionSchema = CareerPlaybookFollowupResponseSchema.shape.questions.element
  .omit({ question_id: true })
  .extend({
    question_id: z.string().uuid().optional().catch(undefined),
  });

const LLMFollowupResponseSchema = CareerPlaybookFollowupResponseSchema.extend({
  questions: z.array(LLMFollowupQuestionSchema).min(0).max(7),
});

function parseFollowupResponse(rawContent: string) {
  const parsed = LLMFollowupResponseSchema.parse(safeJSONParse(extractJSON(rawContent)));
  return CareerPlaybookFollowupResponseSchema.parse({
    ...parsed,
    questions: parsed.questions.map(question => ({
      ...question,
      question_id: question.question_id ?? randomUUID(),
    })),
  });
}

export class CareerPlaybookHandler {
  private runtime = createCareerPlaybookRuntime();

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

    throw new Error(
      `Career Playbook block regeneration is scheduled for Phase 3: ${parsedJobData.blockId}`
    );
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
    const parsed = parseFollowupResponse(result.content);

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
    if (errors.length > 0) {
      throw new Error(`Career Playbook generation failed: ${errors.join('; ')}`);
    }

    return {
      success: true,
      message: 'Career Playbook groups 1-2 generated',
      data: result,
    };
  }
}

export const careerPlaybookHandler = new CareerPlaybookHandler();
