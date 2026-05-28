import { extractJSON, safeJSONParse } from '@megacampus/shared-utils';
import { z } from 'zod';
import {
  CareerPlaybookDepartmentCandidateSchema,
  CareerPlaybookDepartmentResolutionSchema,
  type CareerPlaybookDepartmentResolution,
  type CareerPlaybookFixedQuestionLanguage,
} from '@megacampus/shared-types';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './runtime';

export const DEPARTMENT_CLASSIFIER_PROMPT_KEY = 'career_playbook_department_classifier';
export const DEPARTMENT_CLASSIFIER_PHASE = 'stage_career_playbook_department_classifier';

export interface ResolveCareerPlaybookDepartmentOptionsInput {
  title: string;
  language: CareerPlaybookFixedQuestionLanguage;
}

const LLMDepartmentClassifierResponseSchema = z.object({
  candidates: z.array(z.unknown()).min(1).max(5),
});

export function buildDepartmentClassifierPromptVariables(
  input: ResolveCareerPlaybookDepartmentOptionsInput
): Record<string, string> {
  return {
    title: input.title,
    ui_language: input.language,
    allowed_departments_json: JSON.stringify(
      [
        'sales',
        'marketing',
        'product',
        'engineering',
        'design',
        'data',
        'operations',
        'hr',
        'finance',
        'support',
        'legal',
        'other',
      ],
      null,
      2
    ),
  };
}

export function parseDepartmentResolutionFromLLM(
  rawContent: string
): CareerPlaybookDepartmentResolution {
  const parsed = LLMDepartmentClassifierResponseSchema.parse(
    safeJSONParse(extractJSON(rawContent))
  );
  const candidates = parsed.candidates
    .map(candidate => CareerPlaybookDepartmentCandidateSchema.safeParse(candidate))
    .filter(result => result.success)
    .map(result => result.data)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);

  if (candidates.length === 0) {
    throw new Error('Department classifier returned no valid candidates');
  }

  const topCandidate = candidates[0];
  const resolution =
    candidates.length === 1 && topCandidate.confidence >= 0.86
      ? {
          status: 'resolved' as const,
          source: 'llm' as const,
          candidates,
          selectedDepartment: topCandidate.value,
          confidence: topCandidate.confidence,
        }
      : {
          status: 'needs_user_choice' as const,
          source: 'llm' as const,
          candidates,
          confidence: topCandidate.confidence,
        };

  return CareerPlaybookDepartmentResolutionSchema.parse(resolution);
}

export async function resolveCareerPlaybookDepartmentOptions(
  input: ResolveCareerPlaybookDepartmentOptionsInput,
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
): Promise<CareerPlaybookDepartmentResolution> {
  const prompt = await runtime.renderPrompt(
    DEPARTMENT_CLASSIFIER_PROMPT_KEY,
    buildDepartmentClassifierPromptVariables(input)
  );
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const llmResult = await runtime.invokeLLM(prompt, {
      phaseName: DEPARTMENT_CLASSIFIER_PHASE,
      promptKey: DEPARTMENT_CLASSIFIER_PROMPT_KEY,
      node: 'departmentClassifier',
      temperature: 0.2,
      maxTokens: 1_200,
      preferFallbackModel: attempt > 0,
      maxTokensMultiplier: attempt > 0 ? 1.25 : 1,
    });

    try {
      return parseDepartmentResolutionFromLLM(llmResult.content);
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : 'Department classifier returned invalid JSON';
  throw new Error(message);
}
