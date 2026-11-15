import { vi } from 'vitest';
import type { CareerPlaybookFixedQuestion } from '@megacampus/shared-types';
import { careerPlaybookPrompts } from '@/shared/prompts/career-playbook-prompts';
import type {
  InterviewDependencies,
  InterviewKey,
  InterviewRow,
  InterviewRepository,
} from '@/integrations/helixa/role-interview';
import type { RoleInterviewFollowupsRequest } from '@/integrations/helixa/role-interview-schema';
import { sha256 } from '@/integrations/helixa/canonical-json';
export const fixtureBinding = {
  bindingId: 'binding-a',
  organizationId: '11111111-1111-4111-8111-111111111111',
  environment: 'test',
  destinationBindingId: 'destination-a',
  servicePrincipalUserId: '99999999-9999-4999-8999-999999999999',
  jobInstructionCreationEnabled: true,
  courseCreationEnabled: true,
  courseFromJobInstructionCreationEnabled: true,
  principal: {
    existsInAuth: true,
    existsInPublic: true,
    organizationId: '11111111-1111-4111-8111-111111111111',
    role: 'instructor',
    kind: 'service_principal',
    interactiveLoginAllowed: false,
  },
};
export const distinctiveFact = 'The role closes the CEDAR-47 register every Wednesday at 16:10.';
export const fixtureRequest: RoleInterviewFollowupsRequest = {
  schemaVersion: 'helixa.role-interview-followups.v1',
  binding: { bindingId: 'binding-a' },
  interviewId: 'helixa-interview:unit-a',
  revision: 1,
  round: 1,
  methodologyHash: 'a'.repeat(64),
  previousResultHash: null,
  contentLanguage: 'en',
  fixedAnswers: [
    { question_key: 'position', value: 'Operations lead' },
    { question_key: 'department', value: 'operations' },
    { question_key: 'level', value: 'lead' },
    { question_key: 'reporting', value: 'Reports to COO' },
    { question_key: 'team_size', value: '11-50' },
  ],
  followupAnswers: [],
  context: {
    text: distinctiveFact,
    source: {
      documentId: 'helixa-interview:unit-a',
      sourceRevisionHash: sha256(distinctiveFact),
      citationId: 'interview:unit-a:confirmed',
    },
  },
};
export function fixtureDependencies() {
  const rows = new Map<string, InterviewRow>();
  const keyOf = (key: InterviewKey) => JSON.stringify(key);
  const prompts: string[] = [];
  const repository: InterviewRepository = {
    read: async key => rows.get(keyOf(key)) ?? null,
    claim: async input => {
      const found = rows.get(keyOf(input.key));
      if (found) return { owner: false, row: found };
      const row: InterviewRow = {
        request_hash: input.requestHash,
        request_payload: input.request,
        status: 'in_progress',
        claim_token: '66666666-6666-4666-8666-666666666666',
        response_body: null,
      };
      rows.set(keyOf(input.key), row);
      prompts.push(input.renderedPrompt);
      return { owner: true, row };
    },
    finish: async (key, _token, body) => {
      Object.assign(rows.get(keyOf(key))!, { status: 'completed', response_body: body });
    },
    uncertain: async key => {
      Object.assign(rows.get(keyOf(key))!, { status: 'uncertain' });
    },
  };
  const invoke = vi.fn(async () => ({
    content: JSON.stringify({
      questions: [],
      completeness_score: 0.9,
      stop_recommendation: 'ready_to_generate',
    }),
    model: 'unit-model',
    inputTokens: 10,
    outputTokens: 20,
    costUsd: 0.001,
    durationMs: 1,
    attemptCount: 1,
    abortedAttempts: [],
  }));
  const dependencies: InterviewDependencies = {
    authority: { resolve: async () => fixtureBinding },
    repository,
    methodology: async () => ({
      hash: fixtureRequest.methodologyHash,
      template: careerPlaybookPrompts.find(
        p => p.promptKey === 'career_playbook_followup_generator'
      )!.promptTemplate,
      questions: [
        'position',
        'department',
        'level',
        'reporting',
        'team_size',
        'content_language',
      ].map((key, i) => ({
        language: 'en',
        position: i + 1,
        question_key: key,
        question_type: 'open',
        question_text: key,
        is_required: true,
      })) as CareerPlaybookFixedQuestion[],
    }),
    runtime: () => ({ renderPrompt: async () => 'unused', invokeLLM: invoke }),
  };
  return { dependencies, rows, prompts, invoke };
}
