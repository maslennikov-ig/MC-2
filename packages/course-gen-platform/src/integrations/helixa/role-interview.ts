import {
  CareerPlaybookQADataSchema,
  isCareerPlaybookFollowupResponseReady,
  type CareerPlaybookFixedQuestion,
  type CareerPlaybookFollowupQuestion,
  type CareerPlaybookFollowupAnswer,
} from '@megacampus/shared-types';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { loadCareerPlaybookFixedQuestions } from '@/shared/career-playbook/fixed-questions';
import {
  buildFollowupPromptVariables,
  generateCareerPlaybookFollowups,
  FOLLOWUP_GENERATOR_PROMPT_KEY,
} from '@/stages/stage-career-playbook/nodes/followup-questions';
import {
  createCareerPlaybookRuntime,
  type CareerPlaybookRuntime,
} from '@/stages/stage-career-playbook/nodes/runtime';
import { sha256 } from './canonical-json';
import { canonicalGenerationJsonV1 } from './generation-canonical-json';
import { assertPrincipalBinding } from './generation-commands';
import type { HelixaGenerationBindingAuthority } from './generation-types';
import {
  RoleInterviewError,
  RoleInterviewFollowupsResultSchema,
  ROLE_INTERVIEW_LIMITS,
  type RoleInterviewFollowupsRequest,
} from './role-interview-schema';

export const interviewCanonical = canonicalGenerationJsonV1;
export interface InterviewMethodology {
  hash: string;
  questions: CareerPlaybookFixedQuestion[];
  template: string;
}
export interface InterviewKey {
  bindingId: string;
  interviewId: string;
  revision: number;
  round: number;
}
export interface InterviewResult {
  schemaVersion: 'helixa.role-interview-followups-result.v1';
  interviewId: string;
  revision: number;
  round: number;
  requestHash: string;
  methodologyHash: string;
  state: 'pending' | 'completed' | 'uncertain' | 'action_required';
  resultHash?: string;
  result?: {
    questions: CareerPlaybookFollowupQuestion[];
    completenessScoreBps: number;
    stopRecommendation: 'ask_more' | 'ready_to_generate';
    readyToGenerate: boolean;
  };
  error?: { code: string; retryable: false };
}
export interface InterviewRow {
  request_hash: string;
  request_payload: RoleInterviewFollowupsRequest;
  status: 'in_progress' | 'completed' | 'uncertain' | 'action_required';
  claim_token: string;
  response_body: string | null;
}
export interface InterviewRepository {
  read(key: InterviewKey): Promise<InterviewRow | null>;
  claim(input: {
    key: InterviewKey;
    requestHash: string;
    request: RoleInterviewFollowupsRequest;
    renderedPrompt: string;
    promptHash: string;
  }): Promise<{ owner: boolean; row: InterviewRow }>;
  finish(key: InterviewKey, token: string, responseBody: string, costs: unknown[]): Promise<void>;
  uncertain(key: InterviewKey, token: string, costs: unknown[]): Promise<void>;
}
export interface InterviewDependencies {
  authority: HelixaGenerationBindingAuthority;
  repository: InterviewRepository;
  methodology?: (language: 'ru' | 'en') => Promise<InterviewMethodology>;
  runtime?: () => CareerPlaybookRuntime;
}

/** Include both UI catalogs so content language need not equal the UI language. */
export async function loadInterviewMethodology(
  language: 'ru' | 'en'
): Promise<InterviewMethodology> {
  const [ru, en, prompt] = await Promise.all([
    loadCareerPlaybookFixedQuestions('ru'),
    loadCareerPlaybookFixedQuestions('en'),
    createPromptService().getPrompt(FOLLOWUP_GENERATOR_PROMPT_KEY),
  ]);
  if (!prompt) throw new Error('Role interview prompt unavailable');
  return {
    questions: language === 'ru' ? ru : en,
    template: prompt.promptTemplate,
    hash: sha256(
      interviewCanonical({
        ru,
        en,
        template: prompt.promptTemplate,
        promptVersion: prompt.version,
        limits: ROLE_INTERVIEW_LIMITS,
      })
    ),
  };
}

function assertCompatibleCompletion(response: InterviewResult, language: 'ru' | 'en'): void {
  RoleInterviewFollowupsResultSchema.parse(response);
  if (response.state !== 'completed' || !response.result || !response.resultHash)
    throw new Error('Invalid role interview completion');
  for (const question of response.result.questions) {
    // Match Helixa's actual localized display composition; individual field bounds
    // alone do not bound the aggregate. Preserve the full model output or refuse it.
    const prompt = [
      question.question_text,
      ...(question.options?.length
        ? [
            `${language === 'ru' ? 'Варианты' : 'Options'}: ${question.options
              .map(option => `${option.label} [${option.value}]`)
              .join('; ')}`,
          ]
        : []),
    ].join('\n');
    if (prompt.length > 3000) throw new Error('Role interview display prompt too large');
  }
  // Option helpers are transported even though they do not enter the display
  // prompt. Bound their aggregate UTF-8 bytes to the v1 consumer's 2 MiB limit.
  if (Buffer.byteLength(interviewCanonical(response), 'utf8') > 2 * 1024 * 1024)
    throw new Error('Role interview response too large');
}

function view(row: InterviewRow, requestHash: string): InterviewResult {
  if (row.request_hash !== requestHash)
    throw new RoleInterviewError(409, 'interview_request_conflict');
  const input = row.request_payload;
  let state: InterviewResult['state'] = row.status === 'in_progress' ? 'pending' : row.status;
  if (row.response_body) {
    try {
      const response = JSON.parse(row.response_body) as InterviewResult;
      assertCompatibleCompletion(response, input.contentLanguage);
      return response;
    } catch {
      // Preserve historical bytes/claims, but never advertise an unusable result
      // as completed or authorize another model attempt for this identity.
      state = 'uncertain';
    }
  } else if (state === 'completed') {
    state = 'uncertain';
  }
  return {
    schemaVersion: 'helixa.role-interview-followups-result.v1',
    interviewId: input.interviewId,
    revision: input.revision,
    round: input.round,
    requestHash,
    methodologyHash: input.methodologyHash,
    state,
    ...(state === 'uncertain'
      ? { error: { code: 'interview_outcome_uncertain', retryable: false as const } }
      : {}),
  };
}

function validValue(
  question: Pick<CareerPlaybookFixedQuestion, 'question_type' | 'options'>,
  value: string | string[]
) {
  const values = Array.isArray(value) ? value : [value];
  return (
    (question.question_type === 'multi_choice'
      ? Array.isArray(value)
      : typeof value === 'string') &&
    values.every(v => v.trim().length > 0 && v.length <= 12000) &&
    new Set(values).size === values.length &&
    (!question.options?.length || values.every(v => question.options!.some(o => o.value === v)))
  );
}

function buildQA(
  input: RoleInterviewFollowupsRequest,
  method: InterviewMethodology,
  previous?: InterviewResult
) {
  const fixed = [...input.fixedAnswers];
  if (!fixed.some(a => a.question_key === 'content_language'))
    fixed.push({ question_key: 'content_language', value: input.contentLanguage });
  const keys = new Set(fixed.map(a => a.question_key));
  if (keys.size !== fixed.length)
    throw new RoleInterviewError(422, 'interview_invalid_fixed_answers');
  for (const a of fixed) {
    const question = method.questions.find(q => q.question_key === a.question_key);
    if (
      !question ||
      !validValue(question, a.value) ||
      (a.question_key === 'content_language' && a.value !== input.contentLanguage)
    )
      throw new RoleInterviewError(422, 'interview_invalid_fixed_answers');
  }
  if (method.questions.some(q => q.is_required && !keys.has(q.question_key)))
    throw new RoleInterviewError(422, 'interview_missing_fixed_answers');
  const priorQuestions = previous?.result?.questions ?? [];
  if (
    input.followupAnswers.length !== priorQuestions.length ||
    new Set(input.followupAnswers.map(a => a.question_id)).size !== input.followupAnswers.length
  )
    throw new RoleInterviewError(422, 'interview_invalid_followup_answers');
  const followups: CareerPlaybookFollowupAnswer[] = input.followupAnswers.map(answer => {
    const question = priorQuestions.find(q => q.question_id === answer.question_id);
    if (
      !question ||
      (!answer.skipped && (answer.value === undefined || !validValue(question, answer.value)))
    )
      throw new RoleInterviewError(422, 'interview_invalid_followup_answers');
    return {
      ...answer,
      question_text: question.question_text,
      question_type: question.question_type,
    };
  });
  return CareerPlaybookQADataSchema.parse({
    fixed,
    followups,
    freeform: [{ text: input.context.text }],
    business_context: {
      mode: 'company_specific',
      status: 'collecting',
      digest: null,
      source_ids: [],
    },
  });
}

export function createRoleInterviewService(deps: InterviewDependencies) {
  const methodology = deps.methodology ?? loadInterviewMethodology;
  async function authorize(bindingId: string) {
    const binding = await deps.authority.resolve(bindingId);
    assertPrincipalBinding(binding);
    if (binding.bindingId !== bindingId || !binding.jobInstructionCreationEnabled)
      throw new RoleInterviewError(403, 'binding_denied');
  }
  return {
    async lookup(
      input: InterviewKey & { requestHash: string; methodologyHash: string }
    ): Promise<InterviewResult> {
      await authorize(input.bindingId);
      const row = await deps.repository.read({
        bindingId: input.bindingId,
        interviewId: input.interviewId,
        revision: input.revision,
        round: input.round,
      });
      if (row) return view(row, input.requestHash);
      return {
        schemaVersion: 'helixa.role-interview-followups-result.v1',
        interviewId: input.interviewId,
        revision: input.revision,
        round: input.round,
        requestHash: input.requestHash,
        methodologyHash: input.methodologyHash,
        state: 'action_required',
        error: { code: 'interview_request_not_found', retryable: false },
      };
    },
    async questions(bindingId: string, language: 'ru' | 'en') {
      await authorize(bindingId);
      const method = await methodology(language);
      return {
        schemaVersion: 'helixa.role-interview-questions-result.v1' as const,
        methodologyHash: method.hash,
        questions: method.questions,
        limits: ROLE_INTERVIEW_LIMITS,
      };
    },
    async followups(input: RoleInterviewFollowupsRequest): Promise<InterviewResult> {
      await authorize(input.binding.bindingId);
      const key = {
        bindingId: input.binding.bindingId,
        interviewId: input.interviewId,
        revision: input.revision,
        round: input.round,
      };
      const requestHash = sha256(interviewCanonical(input));
      const existing = await deps.repository.read(key);
      if (existing) return view(existing, requestHash);
      if (
        sha256(Buffer.from(input.context.text, 'utf8')) !== input.context.source.sourceRevisionHash
      )
        throw new RoleInterviewError(422, 'interview_context_hash_mismatch');
      if ((input.round === 1) !== (input.previousResultHash === null))
        throw new RoleInterviewError(422, 'interview_invalid_previous_result');
      const method = await methodology(input.contentLanguage);
      if (method.hash !== input.methodologyHash)
        throw new RoleInterviewError(409, 'interview_methodology_stale');
      let previous: InterviewResult | undefined;
      if (input.round === 2) {
        const row = await deps.repository.read({ ...key, round: 1 });
        if (!row?.response_body)
          throw new RoleInterviewError(409, 'interview_previous_round_incomplete');
        previous = view(row, row.request_hash);
        if (previous.state !== 'completed')
          throw new RoleInterviewError(409, 'interview_previous_round_incomplete');
        const prior = row.request_payload;
        if (
          previous.resultHash !== input.previousResultHash ||
          previous.result?.readyToGenerate ||
          interviewCanonical([
            prior.fixedAnswers,
            prior.context,
            prior.contentLanguage,
            prior.methodologyHash,
          ]) !==
            interviewCanonical([
              input.fixedAnswers,
              input.context,
              input.contentLanguage,
              input.methodologyHash,
            ])
        )
          throw new RoleInterviewError(409, 'interview_invalid_previous_result');
      }
      const qaData = buildQA(input, method, previous);
      const source = input.context.source;
      const evidence = `[${source.citationId}] ${source.documentId}; sha256=${source.sourceRevisionHash}\n${input.context.text}`;
      const variables = buildFollowupPromptVariables(qaData, input.contentLanguage, evidence);
      const renderedPrompt = method.template.replace(
        /\{\{([a-z_]+)\}\}/gu,
        (placeholder, name: string) => variables[name] ?? placeholder
      );
      const claim = await deps.repository.claim({
        key,
        requestHash,
        request: input,
        renderedPrompt,
        promptHash: sha256(renderedPrompt),
      });
      if (!claim.owner) return view(claim.row, requestHash);
      const costs: unknown[] = [];
      try {
        const runtime = (deps.runtime ?? createCareerPlaybookRuntime)();
        const frozenRuntime: CareerPlaybookRuntime = {
          renderPrompt: () => Promise.resolve(renderedPrompt),
          invokeLLM: async (prompt, options) => {
            try {
              const result = await runtime.invokeLLM(prompt, options);
              const { content: _content, ...cost } = result;
              costs.push(cost);
              return result;
            } catch (error) {
              const attempts = (error as { abortedAttempts?: unknown[] }).abortedAttempts;
              costs.push({
                failed: true,
                ...(attempts ? { abortedAttempts: attempts } : { costUnknown: true }),
              });
              throw error;
            }
          },
        };
        const generated = await generateCareerPlaybookFollowups(
          { qaData, language: input.contentLanguage, businessContextSourceExcerpts: evidence },
          frozenRuntime
        );
        const priorIds = new Set(previous?.result?.questions.map(q => q.question_id) ?? []);
        const remaining = 7 - priorIds.size;
        const seen = new Set(priorIds);
        const questions = generated.response.questions
          .filter(q => {
            if (seen.has(q.question_id)) return false;
            seen.add(q.question_id);
            return true;
          })
          .slice(0, remaining);
        const ready = isCareerPlaybookFollowupResponseReady(generated.response);
        const result = {
          questions,
          completenessScoreBps: Math.floor(generated.response.completeness_score * 10000),
          stopRecommendation: ready ? ('ready_to_generate' as const) : ('ask_more' as const),
          readyToGenerate: ready,
        };
        const response: InterviewResult = {
          schemaVersion: 'helixa.role-interview-followups-result.v1',
          interviewId: input.interviewId,
          revision: input.revision,
          round: input.round,
          requestHash,
          methodologyHash: method.hash,
          state: 'completed',
          result,
          resultHash: sha256(interviewCanonical(result)),
        };
        assertCompatibleCompletion(response, input.contentLanguage);
        await deps.repository.finish(
          key,
          claim.row.claim_token,
          interviewCanonical(response),
          costs
        );
        return response;
      } catch {
        // A caller/proxy retry must not repay an attempt whose outcome is unknown.
        await deps.repository.uncertain(key, claim.row.claim_token, costs);
        const persisted = await deps.repository.read(key);
        return view(
          persisted ?? { ...claim.row, status: 'uncertain', response_body: null },
          requestHash
        );
      }
    },
  };
}
