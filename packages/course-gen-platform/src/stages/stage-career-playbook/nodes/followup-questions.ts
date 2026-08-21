import { extractJSON, safeJSONParse } from '@/shared/workspace-utils';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CareerPlaybookFollowupResponseSchema,
  getLanguageName,
  normalizeCareerPlaybookFollowupResponseReadiness,
  validateLanguageCode,
  type CareerPlaybookFollowupResponse,
  type CareerPlaybookNodeCost,
  type CareerPlaybookQAData,
} from '@megacampus/shared-types';
import {
  formatCareerPlaybookBusinessContextDigest,
  formatCareerPlaybookBusinessContextMissingSignals,
  getCareerPlaybookBusinessContext,
  loadCareerPlaybookBusinessContextSourceExcerpts,
} from './business-context';
import { getTargetLanguageTextViolations } from './language-consistency';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './runtime';

export const FOLLOWUP_GENERATOR_PROMPT_KEY = 'career_playbook_followup_generator';
export const FOLLOWUP_GENERATOR_PHASE = 'stage_career_playbook_followup';

export interface GenerateCareerPlaybookFollowupsInput {
  playbookId?: string;
  qaData: CareerPlaybookQAData;
  language: string;
  businessContextSourceExcerpts?: string;
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
  contentLanguage: string,
  businessContextSourceExcerpts = '- none'
): Record<string, string> {
  const businessContext = getCareerPlaybookBusinessContext(qaData);
  const validatedLanguage = validateLanguageCode(contentLanguage);

  return {
    position: getAnswer(qaData, 'position'),
    department: getAnswer(qaData, 'department'),
    level: getAnswer(qaData, 'level'),
    team_size: getAnswer(qaData, 'team_size'),
    company_stage: getAnswer(qaData, 'company_stage'),
    reporting: getAnswer(qaData, 'reporting'),
    content_language: validatedLanguage,
    content_language_name: getLanguageName(validatedLanguage),
    freeform_text: getFreeformText(qaData),
    business_context_mode: businessContext.mode,
    business_context_digest: formatCareerPlaybookBusinessContextDigest(businessContext),
    business_context_source_excerpts: businessContextSourceExcerpts,
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

export function getFollowupLanguageViolations(
  response: CareerPlaybookFollowupResponse,
  contentLanguage: string
): string[] {
  const language = validateLanguageCode(contentLanguage);

  if (language !== 'ru') {
    return [];
  }

  const violations: string[] = [];

  response.questions.forEach((question, questionIndex) => {
    violations.push(
      ...getTargetLanguageTextViolations(
        question.question_text,
        language,
        `questions[${questionIndex}].question_text`
      )
    );
    violations.push(
      ...getTargetLanguageTextViolations(
        question.rationale,
        language,
        `questions[${questionIndex}].rationale`
      )
    );

    question.options?.forEach((option, optionIndex) => {
      violations.push(
        ...getTargetLanguageTextViolations(
          option.label,
          language,
          `questions[${questionIndex}].options[${optionIndex}].label`
        )
      );
    });
  });

  return violations;
}

const LLMParseFollowupQuestionSchema = CareerPlaybookFollowupResponseSchema.shape.questions.element
  .omit({ question_id: true })
  .extend({
    question_id: z.string().uuid().optional().catch(undefined),
  });

const LLMFollowupResponseSchema = CareerPlaybookFollowupResponseSchema.extend({
  questions: z.array(LLMParseFollowupQuestionSchema).min(0).max(7),
});

const LLMStructuredFollowupOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

const LLMStructuredFollowupQuestionSchema = z.object({
  question_id: z.string().uuid(),
  question_text: z.string().min(1),
  question_type: z.enum(['open', 'single_choice', 'multi_choice']),
  options: z.array(LLMStructuredFollowupOptionSchema).min(1).nullable(),
  rationale: z.string().min(1),
});

const LLMStructuredFollowupResponseSchema = z.object({
  questions: z.array(LLMStructuredFollowupQuestionSchema).min(0).max(7),
  completeness_score: z.number().min(0).max(1),
  stop_recommendation: z.enum(['ask_more', 'ready_to_generate']),
});

function buildNodeCost(result: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs?: number;
  attemptCount?: number;
  generationId?: string;
}): CareerPlaybookNodeCost {
  return {
    node: 'followupGenerator',
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
    duration_ms: result.durationMs,
    attempts: result.attemptCount,
    // Carried so `settleCareerPlaybookNodeCosts` can replace the estimate above
    // with what OpenRouter actually charged.
    ...(result.generationId ? { generation_id: result.generationId } : {}),
  };
}

function buildAggregatedNodeCost(
  results: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    durationMs?: number;
  }[]
): CareerPlaybookNodeCost {
  const finalResult = results.at(-1);
  if (!finalResult) {
    throw new Error('Cannot build Career Playbook follow-up cost without LLM results');
  }

  // Aggregate wall-clock over the retry chain; attempts are per-call and not
  // meaningful once folded together, so they are omitted for the aggregate row.
  const durationValues = results
    .map(result => result.durationMs)
    .filter((value): value is number => typeof value === 'number');

  return {
    node: 'followupGenerator',
    model: finalResult.model,
    input_tokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
    output_tokens: results.reduce((sum, result) => sum + result.outputTokens, 0),
    cost_usd: results.reduce((sum, result) => sum + result.costUsd, 0),
    ...(durationValues.length > 0
      ? { duration_ms: durationValues.reduce((sum, value) => sum + value, 0) }
      : {}),
  };
}

function buildFollowupRepairPrompt(params: {
  originalPrompt: string;
  rawContent: string;
  contentLanguage: string;
  violations: string[];
}): string {
  const validatedLanguage = validateLanguageCode(params.contentLanguage);
  const languageName = getLanguageName(validatedLanguage);

  return `${params.originalPrompt}

SYSTEM REPAIR:
Previous follow-up response failed target-language validation.
Target language: ${languageName} (${validatedLanguage}).

Failed fields:
${params.violations.map(item => `- ${item}`).join('\n')}

Previous response:
${params.rawContent}

Return the same JSON shape. Write every user-facing string in questions[].question_text, questions[].options[].label, and questions[].rationale in ${languageName}. Keep question_id and options[].value stable machine-readable identifiers when possible.`;
}

async function invokeFollowupsWithLanguageRepair(
  runtime: CareerPlaybookRuntime,
  prompt: string,
  contentLanguage: string
): Promise<{
  response: CareerPlaybookFollowupResponse;
  llmResults: Awaited<ReturnType<CareerPlaybookRuntime['invokeLLM']>>[];
}> {
  const validatedLanguage = validateLanguageCode(contentLanguage);
  const baseOptions = {
    phaseName: FOLLOWUP_GENERATOR_PHASE,
    promptKey: FOLLOWUP_GENERATOR_PROMPT_KEY,
    node: 'followupGenerator',
    language: validatedLanguage,
    temperature: 0.4,
    maxTokens: 4_000,
    structuredOutputSchema: LLMStructuredFollowupResponseSchema,
    structuredOutputName: 'career_playbook_followups',
    structuredOutputMethod: 'jsonSchema' as const,
    structuredOutputStrict: true,
  };

  const firstResult = await runtime.invokeLLM(prompt, baseOptions);
  const firstResponse = parseFollowupResponseFromLLM(firstResult.content);
  const firstViolations = getFollowupLanguageViolations(firstResponse, validatedLanguage);

  if (firstViolations.length === 0) {
    return { response: firstResponse, llmResults: [firstResult] };
  }

  const repairPrompt = buildFollowupRepairPrompt({
    originalPrompt: prompt,
    rawContent: firstResult.content,
    contentLanguage: validatedLanguage,
    violations: firstViolations,
  });
  const repairResult = await runtime.invokeLLM(repairPrompt, {
    ...baseOptions,
    temperature: 0.2,
    preferFallbackModel: true,
    maxTokensMultiplier: 1.1,
  });
  const repairedResponse = parseFollowupResponseFromLLM(repairResult.content);
  const remainingViolations = getFollowupLanguageViolations(repairedResponse, validatedLanguage);

  if (remainingViolations.length > 0) {
    throw new Error(
      `Career Playbook follow-up response failed target-language validation after repair: ${remainingViolations.join('; ')}`
    );
  }

  return { response: repairedResponse, llmResults: [firstResult, repairResult] };
}

export async function generateCareerPlaybookFollowups(
  input: GenerateCareerPlaybookFollowupsInput,
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
): Promise<GenerateCareerPlaybookFollowupsResult> {
  const businessContext = getCareerPlaybookBusinessContext(input.qaData);
  const businessContextSourceExcerpts =
    input.businessContextSourceExcerpts ??
    (await loadCareerPlaybookBusinessContextSourceExcerpts({
      playbookId: input.playbookId,
      context: businessContext,
    }));
  const prompt = await runtime.renderPrompt(
    FOLLOWUP_GENERATOR_PROMPT_KEY,
    buildFollowupPromptVariables(input.qaData, input.language, businessContextSourceExcerpts)
  );
  const { response, llmResults } = await invokeFollowupsWithLanguageRepair(
    runtime,
    prompt,
    input.language
  );

  return {
    response,
    nodeCost:
      llmResults.length === 1 ? buildNodeCost(llmResults[0]) : buildAggregatedNodeCost(llmResults),
  };
}

export function createFollowupQuestionsNode(
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
) {
  return function followupQuestionsNode(input: GenerateCareerPlaybookFollowupsInput) {
    return generateCareerPlaybookFollowups(input, runtime);
  };
}
