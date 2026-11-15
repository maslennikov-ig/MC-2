import { describe, expect, it, vi } from 'vitest';
import {
  CareerPlaybookQADataSchema,
  CareerPlaybookFollowupResponseSchema,
  type CareerPlaybookFollowupQuestion,
} from '@megacampus/shared-types';
import { sha256 } from '@/integrations/helixa/canonical-json';
import {
  createRoleInterviewService,
  interviewCanonical,
} from '@/integrations/helixa/role-interview';
import { RoleInterviewFollowupsRequestSchema } from '@/integrations/helixa/role-interview-schema';
import {
  createHelixaGenerationNativePort,
  parseHelixaGenerationCommand,
} from '@/integrations/helixa/generation-commands';
import { buildSpecBuilderPromptVariables } from '@/stages/stage-career-playbook/nodes/spec-builder';
import {
  fixtureDependencies,
  fixtureRequest,
  fixtureBinding,
  distinctiveFact,
} from './fixtures/role-interview';

const qid = (i: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`;
function generated(count: number, offset = 0) {
  return JSON.stringify({
    questions: Array.from({ length: count }, (_, i) => ({
      question_id: qid(i + offset),
      question_text: `What is operational detail ${i + offset}?`,
      question_type: 'open',
      options: null,
      rationale: 'Close a specific operational gap',
    })),
    completeness_score: 0.65,
    stop_recommendation: 'ask_more',
  });
}

const question: CareerPlaybookFollowupQuestion = {
  question_id: qid(1),
  question_text: 'Which operational detail is missing?',
  question_type: 'single_choice',
  options: [{ value: 'a', label: 'Option A' }],
  rationale: 'Close a specific operational gap',
};
const oversizedQuestions: Array<{ name: string; question: CareerPlaybookFollowupQuestion }> = [
  { name: 'question text', question: { ...question, question_text: 'q'.repeat(3001) } },
  { name: 'rationale', question: { ...question, rationale: 'r'.repeat(3001) } },
  {
    name: 'option value',
    question: { ...question, options: [{ value: 'v'.repeat(1001), label: 'A' }] },
  },
  {
    name: 'option label',
    question: { ...question, options: [{ value: 'a', label: 'l'.repeat(1001) }] },
  },
  {
    name: 'option helper',
    question: { ...question, options: [{ value: 'a', label: 'A', helper: 'h'.repeat(3001) }] },
  },
  {
    name: 'option count',
    question: {
      ...question,
      options: Array.from({ length: 101 }, (_, i) => ({ value: String(i), label: 'A' })),
    },
  },
  {
    name: 'aggregate display prompt',
    question: {
      ...question,
      options: [
        { value: 'a'.repeat(750), label: 'A'.repeat(750) },
        { value: 'b'.repeat(750), label: 'B'.repeat(750) },
      ],
    },
  },
];

describe('signed native interview service', () => {
  it('uses the actual adaptive generator and frozen native prompt with bound distinctive text', async () => {
    const f = fixtureDependencies();
    const result = await createRoleInterviewService(f.dependencies).followups(fixtureRequest);
    expect(f.invoke).toHaveBeenCalledOnce();
    expect(f.invoke.mock.calls[0]).toBeDefined();
    expect(f.prompts[0]).toContain(distinctiveFact);
    expect(f.prompts[0]).toContain(fixtureRequest.context.source.citationId);
    expect(result.result).toMatchObject({ completenessScoreBps: 9000, readyToGenerate: true });
    expect(() => interviewCanonical(result)).not.toThrow();
  });
  it('claims before paid work and returns pending to a concurrent replay, then exact stored result', async () => {
    const f = fixtureDependencies();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => {
      release = resolve;
    });
    const original = f.invoke.getMockImplementation()!;
    f.invoke.mockImplementation(async () => {
      await waiting;
      return original();
    });
    const service = createRoleInterviewService(f.dependencies);
    const first = service.followups(fixtureRequest);
    await vi.waitFor(() => expect(f.invoke).toHaveBeenCalledOnce());
    expect(f.rows.size).toBe(1);
    expect((await service.followups(fixtureRequest)).state).toBe('pending');
    release();
    const result = await first;
    f.dependencies.methodology = vi.fn(async () => {
      throw new Error('method changed');
    });
    expect(await createRoleInterviewService(f.dependencies).followups(fixtureRequest)).toEqual(
      result
    );
    expect(f.invoke).toHaveBeenCalledOnce();
    await expect(
      service.followups({
        ...fixtureRequest,
        fixedAnswers: [...fixtureRequest.fixedAnswers].reverse(),
      })
    ).rejects.toMatchObject({ status: 409, code: 'interview_request_conflict' });
  });
  it('preserves an uncertain failure and never repays it on replay', async () => {
    const f = fixtureDependencies();
    f.invoke.mockRejectedValue(new Error('response lost'));
    const service = createRoleInterviewService(f.dependencies);
    expect((await service.followups(fixtureRequest)).state).toBe('uncertain');
    expect((await service.followups(fixtureRequest)).state).toBe('uncertain');
    expect(f.invoke).toHaveBeenCalledOnce();
  });
  it.each(oversizedQuestions)(
    'keeps oversized $name uncertain through replay and lookup without paid retry',
    async ({ question }) => {
      const f = fixtureDependencies();
      const output = {
        questions: [question],
        completeness_score: 0.65,
        stop_recommendation: 'ask_more',
      };
      // This is valid native output: only the Helixa facade has the tighter display contract.
      expect(CareerPlaybookFollowupResponseSchema.safeParse(output).success).toBe(true);
      const original = f.invoke.getMockImplementation()!;
      f.invoke.mockImplementation(async () => ({
        ...(await original()),
        content: JSON.stringify(output),
      }));
      const finish = vi.spyOn(f.dependencies.repository, 'finish');
      const service = createRoleInterviewService(f.dependencies);
      const first = await service.followups(fixtureRequest);
      expect(first).toMatchObject({ state: 'uncertain', error: { retryable: false } });
      expect(first.result).toBeUndefined();
      expect(first.resultHash).toBeUndefined();
      expect(await service.followups(fixtureRequest)).toEqual(first);
      expect(
        await service.lookup({
          bindingId: fixtureRequest.binding.bindingId,
          interviewId: fixtureRequest.interviewId,
          revision: 1,
          round: 1,
          requestHash: first.requestHash,
          methodologyHash: fixtureRequest.methodologyHash,
        })
      ).toEqual(first);
      expect(finish).not.toHaveBeenCalled();
      expect([...f.rows.values()][0]).toMatchObject({ status: 'uncertain', response_body: null });
      expect(f.invoke).toHaveBeenCalledOnce();
    }
  );
  it.each(['en', 'ru'] as const)(
    'preserves exact 3000-character %s display prompts and field bounds without truncation',
    async language => {
      const f = fixtureDependencies();
      const suffix = `\n${language === 'ru' ? 'Варианты' : 'Options'}: A [a]`;
      const bounded = {
        ...question,
        question_text: 'q'.repeat(3000 - suffix.length),
        rationale: 'r'.repeat(3000),
        options: [{ value: 'a', label: 'A', helper: 'h'.repeat(3000) }],
      };
      const original = f.invoke.getMockImplementation()!;
      f.invoke.mockImplementation(async () => ({
        ...(await original()),
        content: JSON.stringify({
          questions: [bounded],
          completeness_score: 0.65,
          stop_recommendation: 'ask_more',
        }),
      }));
      const response = await createRoleInterviewService(f.dependencies).followups({
        ...fixtureRequest,
        contentLanguage: language,
      });
      expect(response.state).toBe('completed');
      expect(response.result!.questions).toEqual([bounded]);
    }
  );
  it('refuses aggregate UTF-8 option helpers above the consumer response limit without replaying the model', async () => {
    const f = fixtureDependencies();
    const questions = Array.from({ length: 7 }, (_, i) => ({
      ...question,
      question_id: qid(i),
      options: Array.from({ length: 100 }, (_, j) => ({
        value: String(j),
        label: 'A',
        helper: 'я'.repeat(3000),
      })),
    }));
    const original = f.invoke.getMockImplementation()!;
    f.invoke.mockImplementation(async () => ({
      ...(await original()),
      content: JSON.stringify({
        questions,
        completeness_score: 0.65,
        stop_recommendation: 'ask_more',
      }),
    }));
    const service = createRoleInterviewService(f.dependencies);
    const first = await service.followups(fixtureRequest);
    expect(first.state).toBe('uncertain');
    expect(first.result).toBeUndefined();
    expect(await service.followups(fixtureRequest)).toEqual(first);
    expect(f.invoke).toHaveBeenCalledOnce();
  });
  it('withholds a poisoned historical completion on lookup/replay without rewriting it or calling the model', async () => {
    const f = fixtureDependencies();
    const service = createRoleInterviewService(f.dependencies);
    const completed = await service.followups(fixtureRequest);
    const result = { ...completed.result!, questions: [oversizedQuestions[0].question] };
    const poisoned = interviewCanonical({
      ...completed,
      result,
      resultHash: sha256(interviewCanonical(result)),
    });
    const row = [...f.rows.values()][0];
    row.response_body = poisoned;
    f.invoke.mockClear();
    const response = await service.lookup({
      bindingId: fixtureRequest.binding.bindingId,
      interviewId: fixtureRequest.interviewId,
      revision: 1,
      round: 1,
      requestHash: completed.requestHash,
      methodologyHash: fixtureRequest.methodologyHash,
    });
    expect(response).toMatchObject({ state: 'uncertain', error: { retryable: false } });
    expect(response.result).toBeUndefined();
    expect(await service.followups(fixtureRequest)).toEqual(response);
    await expect(
      service.followups({
        ...fixtureRequest,
        round: 2,
        previousResultHash: sha256(interviewCanonical(result)),
        followupAnswers: [{ question_id: question.question_id, skipped: true }],
      })
    ).rejects.toMatchObject({ code: 'interview_previous_round_incomplete' });
    expect(f.rows.size).toBe(1);
    expect(row).toMatchObject({ status: 'completed', response_body: poisoned });
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it('rejects stale methodology, foreign context hashes, unknown input and injected source ids before payment', async () => {
    const f = fixtureDependencies();
    const service = createRoleInterviewService(f.dependencies);
    await expect(
      service.followups({ ...fixtureRequest, methodologyHash: 'b'.repeat(64) })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.followups({
        ...fixtureRequest,
        context: { ...fixtureRequest.context, text: 'changed' },
      })
    ).rejects.toMatchObject({ code: 'interview_context_hash_mismatch' });
    expect(
      RoleInterviewFollowupsRequestSchema.safeParse({ ...fixtureRequest, playbookId: 'foreign' })
        .success
    ).toBe(false);
    expect(
      RoleInterviewFollowupsRequestSchema.safeParse({ ...fixtureRequest, completeness_score: 0.75 })
        .success
    ).toBe(false);
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it('uses server-owned prior questions and caps both rounds at seven questions', async () => {
    const f = fixtureDependencies();
    const original = f.invoke.getMockImplementation()!;
    f.invoke.mockImplementationOnce(async () => ({ ...(await original()), content: generated(5) }));
    f.invoke.mockImplementationOnce(async () => ({
      ...(await original()),
      content: generated(7, 10),
    }));
    const service = createRoleInterviewService(f.dependencies);
    const first = await service.followups(fixtureRequest);
    const second = {
      ...fixtureRequest,
      round: 2 as const,
      previousResultHash: first.resultHash!,
      followupAnswers: first.result!.questions.map(q => ({
        question_id: q.question_id,
        value: 'Confirmed detail',
        skipped: false,
      })),
    };
    await expect(
      service.followups({
        ...second,
        followupAnswers: [{ question_id: qid(999), value: 'forged', skipped: false }],
      })
    ).rejects.toMatchObject({ status: 422 });
    const result = await service.followups(second);
    expect(result.result!.questions).toHaveLength(2);
    expect(f.prompts[1]).toContain(first.result!.questions[0].question_text);
    expect(f.invoke).toHaveBeenCalledTimes(2);
  });
  it('keeps generation v1 unchanged: actual native mapping and spec-builder receive full transcript', async () => {
    const scheduleRoleGuide = vi.fn(async () => {});
    const command = parseHelixaGenerationCommand({
      schemaVersion: 'helixa.megacampus-generation-command.v1',
      operation: 'CREATE_JOB_INSTRUCTION',
      commandId: `megacampus_generation_command:create_job_instruction:v1:${'1'.repeat(64)}`,
      proposalId: 'confirmed-proposal',
      approvedRevision: 1,
      payloadHash: '2'.repeat(64),
      jobInstruction: {
        roleTitle: 'Operations lead',
        businessGoal: 'Reliable handover',
        context: distinctiveFact,
        language: 'en',
      },
      selectedSources: [fixtureRequest.context.source],
    });
    await createHelixaGenerationNativePort({
      scheduleRoleGuide,
      scheduleCourse: vi.fn(),
      scheduleCourseFromRoleGuide: vi.fn(),
      reconcile: async () => 'missing',
    }).schedule({
      binding: fixtureBinding,
      command,
      objectKind: 'ROLE_GUIDE',
      objectId: '33333333-3333-4333-8333-333333333333',
      servicePrincipalUserId: fixtureBinding.servicePrincipalUserId,
      leaseToken: '66666666-6666-4666-8666-666666666666',
      claimGeneration: 1,
      includeWebResearch: false,
      includeBusinessContextSources: false,
    });
    const passed = scheduleRoleGuide.mock.calls[0] as unknown as [{ qAData: unknown }];
    const qaData = CareerPlaybookQADataSchema.parse(passed[0].qAData);
    expect(qaData.freeform[0].text).toContain(distinctiveFact);
    const prompt = buildSpecBuilderPromptVariables(
      qaData,
      { kpis_insights: [], trends_insights: [], onboarding_insights: [], sources: [] },
      'en'
    );
    expect(JSON.parse(prompt.qa_data_json).freeform[0].text).toContain(distinctiveFact);
  });
});
