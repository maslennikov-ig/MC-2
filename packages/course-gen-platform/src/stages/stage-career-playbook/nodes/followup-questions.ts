import { extractJSON, safeJSONParse } from '@megacampus/shared-utils';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CareerPlaybookFollowupResponseSchema,
  normalizeCareerPlaybookFollowupResponseReadiness,
  type CareerPlaybookFollowupResponse,
  type CareerPlaybookNodeCost,
  type CareerPlaybookQAData,
} from '@megacampus/shared-types';
import {
  formatCareerPlaybookBusinessContextDigest,
  formatCareerPlaybookBusinessContextMissingSignals,
  getCareerPlaybookBusinessContext,
} from './business-context';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './runtime';

export const FOLLOWUP_GENERATOR_PROMPT_KEY = 'career_playbook_followup_generator';
export const FOLLOWUP_GENERATOR_PHASE = 'stage_career_playbook_followup';

export interface GenerateCareerPlaybookFollowupsInput {
  qaData: CareerPlaybookQAData;
  language: string;
}

export interface GenerateCareerPlaybookFollowupsResult {
  response: CareerPlaybookFollowupResponse;
  nodeCost: CareerPlaybookNodeCost;
}

function getAnswer(qaData: CareerPlaybookQAData, key: string): string {
  const answer = qaData.fixed.find(item => item.question_key === key);
  if (!answer) return 'not provided';
  return Array.isArray(answer.value) ? answer.value.join(', ') : answer.value;
}

function getFreeformText(qaData: CareerPlaybookQAData): string {
  return qaData.freeform.map(item => item.text).join('\n\n') || 'none';
}

export function buildFollowupPromptVariables(
  qaData: CareerPlaybookQAData,
  contentLanguage: string
): Record<string, string> {
  const businessContext = getCareerPlaybookBusinessContext(qaData);

  return {
    position: getAnswer(qaData, 'position'),
    department: getAnswer(qaData, 'department'),
    level: getAnswer(qaData, 'level'),
    team_size: getAnswer(qaData, 'team_size'),
    company_stage: getAnswer(qaData, 'company_stage'),
    reporting: getAnswer(qaData, 'reporting'),
    content_language: contentLanguage,
    freeform_text: getFreeformText(qaData),
    business_context_mode: businessContext.mode,
    business_context_digest: formatCareerPlaybookBusinessContextDigest(businessContext),
    business_context_missing_signals:
      formatCareerPlaybookBusinessContextMissingSignals(businessContext),
    previous_followups_json: JSON.stringify(qaData.followups, null, 2),
  };
}

export function parseFollowupResponseFromLLM(rawContent: string): CareerPlaybookFollowupResponse {
  const extractedJson = extractJSON(rawContent);
  const parsed = LLMFollowupResponseSchema.parse(safeJSONParse(extractedJson));
  return normalizeCareerPlaybookFollowupResponseReadiness(
    CareerPlaybookFollowupResponseSchema.parse({
      ...parsed,
      questions: parsed.questions.map(question => ({
        ...question,
        question_id: question.question_id ?? randomUUID(),
      })),
    })
  );
}

const LLMFollowupQuestionSchema = CareerPlaybookFollowupResponseSchema.shape.questions.element
  .omit({ question_id: true })
  .extend({
    question_id: z.string().uuid().optional().catch(undefined),
  });

const LLMFollowupResponseSchema = CareerPlaybookFollowupResponseSchema.extend({
  questions: z.array(LLMFollowupQuestionSchema).min(0).max(7),
});

function buildNodeCost(result: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}): CareerPlaybookNodeCost {
  return {
    node: 'followupGenerator',
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
  };
}

export async function generateCareerPlaybookFollowups(
  input: GenerateCareerPlaybookFollowupsInput,
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
): Promise<GenerateCareerPlaybookFollowupsResult> {
  const prompt = await runtime.renderPrompt(
    FOLLOWUP_GENERATOR_PROMPT_KEY,
    buildFollowupPromptVariables(input.qaData, input.language)
  );
  const llmResult = await runtime.invokeLLM(prompt, {
    phaseName: FOLLOWUP_GENERATOR_PHASE,
    promptKey: FOLLOWUP_GENERATOR_PROMPT_KEY,
    node: 'followupGenerator',
    temperature: 0.4,
    maxTokens: 4_000,
  });

  return {
    response: parseFollowupResponseFromLLM(llmResult.content),
    nodeCost: buildNodeCost(llmResult),
  };
}

export function createFollowupQuestionsNode(
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
) {
  return function followupQuestionsNode(input: GenerateCareerPlaybookFollowupsInput) {
    return generateCareerPlaybookFollowups(input, runtime);
  };
}
