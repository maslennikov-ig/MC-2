import { CareerPlaybookQADataSchema } from '@megacampus/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  createHelixaGenerationNativePort,
  createInMemoryHelixaGenerationRepository,
  dispatchHelixaGenerationCommand,
  parseHelixaGenerationCommand,
  type HelixaGenerationBindingAuthority,
} from '@/integrations/helixa/generation-commands';
import { createPostgresHelixaRoleGuideScheduler } from '@/integrations/helixa/generation-role-guide';

import { HelixaDispatchResultSchema } from './fixtures/helixa-result-schemas';

const PLAYBOOK_ID = '33333333-3333-4333-8333-333333333333';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL_ID = '99999999-9999-4999-8999-999999999999';

const jobCommand = {
  schemaVersion: 'helixa.megacampus-generation-command.v1',
  operation: 'CREATE_JOB_INSTRUCTION',
  commandId:
    'megacampus_generation_command:create_job_instruction:v1:5be564997f181c5e1e25f80a324070406718c6bffbf4440256467b0ec8f31467',
  proposalId: 'proposal-a',
  approvedRevision: 3,
  payloadHash: '8daa4156a9241d22eb9c943b3ea5641f589e75086e301995014312c81b4945ee',
  jobInstruction: {
    roleTitle: 'Sales Manager',
    businessGoal: 'Increase predictable revenue while preserving customer trust.',
    context: 'The role owns the B2B sales process for a growing software company.',
    language: 'en',
  },
  selectedSources: [
    { documentId: 'document-a', sourceRevisionHash: 'a'.repeat(64), citationId: 'citation-a' },
  ],
} as const;

const binding = {
  bindingId: 'binding-a',
  organizationId: ORGANIZATION_ID,
  environment: 'test',
  destinationBindingId: 'destination-a',
  servicePrincipalUserId: PRINCIPAL_ID,
  jobInstructionCreationEnabled: true,
  courseFromJobInstructionCreationEnabled: true,
  principal: {
    existsInAuth: true,
    existsInPublic: true,
    organizationId: ORGANIZATION_ID,
    role: 'instructor',
    kind: 'service_principal',
    interactiveLoginAllowed: false,
  },
} as const;

function authority(): HelixaGenerationBindingAuthority {
  return { resolve: vi.fn(() => Promise.resolve({ ...binding })) };
}

const schedulerInput = {
  playbookId: PLAYBOOK_ID,
  organizationId: ORGANIZATION_ID,
  userId: PRINCIPAL_ID,
  positionTitle: jobCommand.jobInstruction.roleTitle,
  language: 'en' as const,
  commandOwnedTextSource: '# Business goal\nGrow\n\n# Context\nB2B',
  selectedSources: jobCommand.selectedSources,
  qAData: {
    fixed: [
      { question_key: 'position', value: 'Sales Manager' },
      { question_key: 'content_language', value: 'en' },
    ],
    followups: [],
    freeform: [{ text: '# Business goal\nGrow\n\n# Context\nB2B' }],
    business_context: {
      mode: 'company_specific',
      status: 'collecting',
      digest: null,
      source_ids: [],
    },
    generation_warnings: [],
    quality_issues: [],
  },
  jobInstruction: jobCommand.jobInstruction,
  leaseToken: '66666666-6666-4666-8666-666666666666',
  claimGeneration: 1,
  originBindingId: binding.bindingId,
  originCommandId: jobCommand.commandId,
};

describe('Helixa role guide scheduler', () => {
  it('sends the command, the lease and the parsed Q&A record to the scheduling RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const enqueue = vi.fn(() => Promise.resolve());
    await createPostgresHelixaRoleGuideScheduler({ rpc }, enqueue)(schedulerInput);

    expect(rpc).toHaveBeenCalledOnce();
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('schedule_helixa_role_guide');
    expect(args).toMatchObject({
      p_binding_id: binding.bindingId,
      p_command_id: jobCommand.commandId,
      p_playbook_id: PLAYBOOK_ID,
      p_organization_id: ORGANIZATION_ID,
      p_user_id: PRINCIPAL_ID,
      p_job_instruction: jobCommand.jobInstruction,
      p_selected_sources: jobCommand.selectedSources,
      p_lease_token: schedulerInput.leaseToken,
      p_claim_generation: 1,
    });
    // No interactive identity reaches the database: the row is written as the binding's
    // own service principal and nothing else.
    expect(args).not.toHaveProperty('p_actor_id');
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('refuses a Q&A record the generation worker would reject', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const enqueue = vi.fn(() => Promise.resolve());
    const scheduler = createPostgresHelixaRoleGuideScheduler({ rpc }, enqueue);
    await expect(
      scheduler({
        ...schedulerInput,
        // A string where the schema wants a structured digest. This is the shape the
        // native port used to build, and it would have failed inside the paid job.
        qAData: {
          ...schedulerInput.qAData,
          business_context: {
            mode: 'company_specific',
            status: 'ready',
            digest: 'business goal and context as prose',
            source_ids: [],
          },
        },
      })
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when an earlier claim already moved the playbook on', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const enqueue = vi.fn(() => Promise.resolve());
    await createPostgresHelixaRoleGuideScheduler({ rpc }, enqueue)(schedulerInput);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('compensates the playbook row when the enqueue throws', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const enqueue = vi.fn(() => Promise.reject(new Error('redis is unreachable')));
    await expect(
      createPostgresHelixaRoleGuideScheduler({ rpc }, enqueue)(schedulerInput)
    ).rejects.toThrow(/ROLE_GUIDE_GENERATION_ENQUEUE_FAILED/u);
    expect(rpc.mock.calls[1]?.[0]).toBe('fail_helixa_role_guide_generation');
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_playbook_id: PLAYBOOK_ID,
      p_lease_token: schedulerInput.leaseToken,
      p_claim_generation: 1,
      p_reason: 'redis is unreachable',
    });
  });
});

describe('Helixa CREATE_JOB_INSTRUCTION through the native port', () => {
  function nativePort(scheduleRoleGuide: ReturnType<typeof vi.fn>) {
    return createHelixaGenerationNativePort({
      scheduleRoleGuide,
      scheduleCourseFromRoleGuide: vi.fn(),
      reconcile: vi.fn(() => Promise.resolve('missing' as const)),
      observe: vi.fn(() => Promise.resolve('running' as const)),
    });
  }

  it('builds a Q&A record the career playbook worker accepts', async () => {
    const scheduleRoleGuide = vi.fn(() => Promise.resolve());
    await nativePort(scheduleRoleGuide).schedule({
      binding: { ...binding },
      command: parseHelixaGenerationCommand(jobCommand),
      objectKind: 'ROLE_GUIDE',
      objectId: PLAYBOOK_ID,
      servicePrincipalUserId: PRINCIPAL_ID,
      leaseToken: schedulerInput.leaseToken,
      claimGeneration: 1,
      includeWebResearch: false,
      includeBusinessContextSources: false,
    });

    const passed = scheduleRoleGuide.mock.calls[0]?.[0] as {
      qAData: unknown;
      leaseToken: string;
      originCommandId: string;
    };
    const qaData = CareerPlaybookQADataSchema.parse(passed.qAData);
    // The command-owned text is the free-form answer, which is what reaches the prompt.
    expect(qaData.freeform[0]?.text).toContain(jobCommand.jobInstruction.businessGoal);
    expect(qaData.freeform[0]?.text).toContain(jobCommand.jobInstruction.context);
    expect(qaData.fixed).toContainEqual({ question_key: 'position', value: 'Sales Manager' });
    expect(qaData.business_context.digest).toBeNull();
    expect(passed.leaseToken).toBe(schedulerInput.leaseToken);
    expect(passed.originCommandId).toBe(jobCommand.commandId);
  });

  it('ends a live dispatch in a reservation, not action_required', async () => {
    const scheduleRoleGuide = vi.fn(() => Promise.resolve());
    const result = await dispatchHelixaGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId },
      command: jobCommand,
      mode: 'live',
      authority: authority(),
      repository: createInMemoryHelixaGenerationRepository({ objectId: () => PLAYBOOK_ID }),
      nativePort: nativePort(scheduleRoleGuide),
    });
    expect(result.state).toBe('accepted');
    expect(HelixaDispatchResultSchema.parse(result)).toMatchObject({
      state: 'accepted',
      object: { kind: 'ROLE_GUIDE', id: PLAYBOOK_ID },
    });
    expect(scheduleRoleGuide).toHaveBeenCalledOnce();
  });

  it('records a terminal failure when the enqueue could not be made to happen', async () => {
    const repository = createInMemoryHelixaGenerationRepository({ objectId: () => PLAYBOOK_ID });
    const scheduleRoleGuide = vi.fn(() =>
      Promise.reject(new Error('ROLE_GUIDE_GENERATION_ENQUEUE_FAILED: redis is unreachable'))
    );
    await expect(
      dispatchHelixaGenerationCommand({
        bindingLocator: { bindingId: binding.bindingId },
        command: jobCommand,
        mode: 'live',
        authority: authority(),
        repository,
        nativePort: nativePort(scheduleRoleGuide),
      })
    ).rejects.toThrow(/native failed/iu);
    const row = await repository.lookup(binding.bindingId, jobCommand.commandId);
    expect(row).toMatchObject({
      status: 'action_required',
      safeErrorCode: 'megacampus_generation_native_failed',
    });
  });
});
