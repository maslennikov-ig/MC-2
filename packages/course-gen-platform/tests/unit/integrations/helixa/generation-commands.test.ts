import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  createInMemoryHelixaGenerationRepository,
  createHelixaGenerationNativePort,
  createPostgresHelixaGenerationBindingAuthority,
  createPostgresHelixaGenerationRepository,
  createPostgresHelixaNativeObserver,
  createPostgresHelixaNativeReconciler,
  dispatchHelixaGenerationCommand,
  generationCommandHash,
  lookupHelixaGenerationCommand,
  observeHelixaScheduledGenerationCommand,
  parseHelixaGenerationCommand,
  parseHelixaGenerationLookupQuery,
  readHelixaGenerationMode,
  type HelixaGenerationBindingAuthority,
  type HelixaGenerationNativePort,
} from '@/integrations/helixa/generation-commands';
import { canonicalGenerationJsonV1 } from '@/integrations/helixa/generation-canonical-json';

const jobCommand = {
  schemaVersion: 'helixa.megacampus-generation-command.v1',
  operation: 'CREATE_JOB_INSTRUCTION',
  commandId: 'megacampus_generation_command:create_job_instruction:v1:5be564997f181c5e1e25f80a324070406718c6bffbf4440256467b0ec8f31467',
  proposalId: 'proposal-a',
  approvedRevision: 3,
  payloadHash: '8daa4156a9241d22eb9c943b3ea5641f589e75086e301995014312c81b4945ee',
  jobInstruction: {
    roleTitle: 'Sales Manager',
    businessGoal: 'Increase predictable revenue while preserving customer trust.',
    context: 'The role owns the B2B sales process for a growing software company.',
    language: 'en',
  },
  selectedSources: [{
    documentId: 'document-a',
    sourceRevisionHash: 'a'.repeat(64),
    citationId: 'citation-a',
  }],
} as const;

const courseCommand = {
  schemaVersion: 'helixa.megacampus-generation-command.v1',
  operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION',
  commandId: 'megacampus_generation_command:create_course_from_job_instruction:v1:9065164d6a76f728e501e154c880cae0dd33e634513f061cb2aafae8d3cf9836',
  proposalId: 'proposal-b',
  approvedRevision: 4,
  payloadHash: 'dea01684025c290e36f876d33edb08c89be0ddf490595ef6e080b53a5e44290c',
  course: {
    title: 'Sales Manager Onboarding',
    courseDescription: 'A practical onboarding course derived from the approved Job Instruction.',
    targetAudience: 'New and transitioning Sales Managers',
    learningOutcomes: ['Run the approved sales process', "Apply the role's decision rights"],
    language: 'en',
    courseSize: 'mini',
    style: 'practical',
  },
  sourceJobInstruction: {
    kind: 'ROLE_GUIDE',
    id: '22222222-2222-4222-8222-222222222222',
    sourceVersion: '2026-08-23T10:15:30.000Z',
    contentHash: 'b'.repeat(64),
  },
} as const;

const binding = {
  bindingId: 'binding-a',
  organizationId: '11111111-1111-4111-8111-111111111111',
  environment: 'test',
  destinationBindingId: 'destination-a',
  servicePrincipalUserId: '99999999-9999-4999-8999-999999999999',
  jobInstructionCreationEnabled: true,
  courseFromJobInstructionCreationEnabled: true,
} as const;

function authority(overrides: Record<string, unknown> = {}): HelixaGenerationBindingAuthority {
  return {
    resolve: vi.fn(async () => ({
      ...binding,
      principal: {
        existsInAuth: true,
        existsInPublic: true,
        organizationId: binding.organizationId,
        role: 'instructor' as const,
        kind: 'service_principal' as const,
        interactiveLoginAllowed: false,
      },
      ...overrides,
    })),
  };
}

function scheduledObserverRepository(claimGeneration: number) {
  return {
    claimScheduled: vi.fn(async () => ({
      bindingId: binding.bindingId, commandId: courseCommand.commandId,
      commandHash: generationCommandHash(parseHelixaGenerationCommand(courseCommand)),
      operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' as const, payloadHash: courseCommand.payloadHash,
      proposalId: courseCommand.proposalId, approvedRevision: courseCommand.approvedRevision,
      objectKind: 'COURSE' as const, objectId: '44444444-4444-4444-8444-444444444444',
      status: 'executing' as const, acceptedAt: '2026-08-23T10:16:00.000Z',
      updatedAt: '2026-08-23T10:20:00.000Z', claimGeneration,
      leaseToken: '77777777-7777-4777-8777-777777777777',
    })),
    actionRequired: vi.fn(async () => true), reconcileCompleted: vi.fn(),
    failObserved: vi.fn(async () => true), completeObserved: vi.fn(async () => true),
    returnScheduled: vi.fn(async () => true), lookup: vi.fn(),
  };
}

describe('server-only Helixa generation commands', () => {
  it('canonicalizes keys by unsigned UTF-8 bytes and rejects non-safe-integer numbers', () => {
    const supplementary = '\u{10000}';
    const bmp = '\uE000';
    expect(canonicalGenerationJsonV1({ [supplementary]: 1, [bmp]: 2 })).toBe(`{"${bmp}":2,"${supplementary}":1}`);
    expect(() => canonicalGenerationJsonV1(1.5)).toThrow(/safe integers/i);
    expect(() => canonicalGenerationJsonV1(-0)).toThrow(/safe integers/i);
  });
  it('matches both accepted golden command hashes', () => {
    expect(generationCommandHash(parseHelixaGenerationCommand(jobCommand))).toBe(
      '123b969a686c8db53a5b576e10ac895d1f79ac1570411efce3e08f5084c45d60'
    );
    expect(generationCommandHash(parseHelixaGenerationCommand(courseCommand))).toBe(
      'd061be1974e806f98721ef9cbf23d518db55133f20e58229273a7e81d8b5d51b'
    );
  });

  it('rejects identity injection, unknown fields, bad namespace, duplicates, and source order', () => {
    for (const extra of ['userId', 'actorId', 'tenantId', 'organizationId', 'bindingId', 'credential']) {
      expect(() => parseHelixaGenerationCommand({ ...jobCommand, [extra]: 'attacker' })).toThrow();
    }
    expect(() => parseHelixaGenerationCommand({ ...jobCommand, commandId: courseCommand.commandId })).toThrow();
    expect(() => parseHelixaGenerationCommand({
      ...jobCommand,
      selectedSources: [
        { documentId: 'z', sourceRevisionHash: 'a'.repeat(64), citationId: 'a' },
        { documentId: 'a', sourceRevisionHash: 'b'.repeat(64), citationId: 'b' },
      ],
    })).toThrow();
    expect(() => parseHelixaGenerationCommand({
      ...jobCommand,
      selectedSources: [jobCommand.selectedSources[0], jobCommand.selectedSources[0]],
    })).toThrow();
  });

  it('strictly parses lookup without binding or identity injection', () => {
    const query = { schemaVersion: 'helixa.megacampus-generation-lookup.v1', commandId: jobCommand.commandId, payloadHash: jobCommand.payloadHash };
    expect(parseHelixaGenerationLookupQuery(query)).toEqual(query);
    expect(() => parseHelixaGenerationLookupQuery({ ...query, bindingId: 'attacker' })).toThrow();
    expect(() => parseHelixaGenerationLookupQuery({ ...query, actorId: 'attacker' })).toThrow();
  });

  it('is disabled by default and has no public Career Playbook router dependency', async () => {
    expect(readHelixaGenerationMode({})).toBe('disabled');
    expect(readHelixaGenerationMode({ HELIXA_MEGACAMPUS_GENERATION_MODE: 'fake' })).toBe('fake');
    const source = await readFile(
      new URL('../../../../src/integrations/helixa/generation-commands.ts', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/server\/routers\/career-playbook/);
  });

  it('keeps migration additive, disabled, immutable, and separate from the legacy ledger', async () => {
    const sql = await readFile(
      new URL('../../../../supabase/migrations/20260823120000_helixa_generation_commands.sql', import.meta.url),
      'utf8'
    );
    expect(sql).toContain('job_instruction_creation_enabled BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('course_from_job_instruction_creation_enabled BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('CREATE TABLE helixa_generation_commands');
    expect(sql).toContain('CREATE TABLE role_guide_generation_proofs');
    expect(sql).toContain('CREATE TABLE course_job_instruction_sources');
    expect(sql.match(/prevent_helixa_generation_proof_mutation/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).not.toMatch(/DROP TABLE helixa_course_creation_commands|ALTER TABLE helixa_course_creation_commands/);
    const nativeSql = await readFile(
      new URL('../../../../supabase/migrations/20260823130000_helixa_generation_native_transactions.sql', import.meta.url),
      'utf8'
    );
    expect(nativeSql).toContain('schedule_helixa_course_from_role_guide');
    expect(nativeSql).toContain('FOR SHARE');
    expect(nativeSql).toContain('INSERT INTO course_job_instruction_sources');
    expect(nativeSql).toContain('INSERT INTO job_outbox');
    expect(nativeSql).toContain('observation_lease_token');
    const sourceSql = await readFile(
      new URL('../../../../supabase/migrations/20260823140000_helixa_generation_course_source.sql', import.meta.url),
      'utf8'
    );
    expect(sourceSql).toContain('CREATE TABLE course_job_instruction_native_sources');
    expect(sourceSql).toContain('INSERT INTO file_catalog');
    expect(sourceSql).toContain('processed_content');
  });

  it('closes binding scope in Postgres adapters and never accepts caller identity', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{
        binding_id: binding.bindingId, organization_id: binding.organizationId,
        environment: binding.environment, destination_binding_id: binding.destinationBindingId,
        service_principal_user_id: binding.servicePrincipalUserId,
        job_instruction_creation_enabled: true,
        course_from_job_instruction_creation_enabled: true,
        principal_exists_in_auth: true, principal_exists_in_public: true,
        principal_organization_id: binding.organizationId, principal_role: 'admin',
        principal_kind: 'service_principal', interactive_login_allowed: false,
      }], error: null })
      .mockResolvedValueOnce({ data: [{
        command_id: jobCommand.commandId, command_hash: generationCommandHash(parseHelixaGenerationCommand(jobCommand)),
        proposal_payload_hash: jobCommand.payloadHash, object_kind: 'ROLE_GUIDE',
        object_id: '33333333-3333-4333-8333-333333333333', status: 'reserved',
        accepted_at: null, updated_at: '2026-08-23T10:16:00.000Z', conflict: false,
        mutation_owner: true, lease_token: '77777777-7777-4777-8777-777777777777', claim_generation: 1,
        command_kind: 'CREATE_JOB_INSTRUCTION', proposal_id: 'proposal-a', approved_revision: 3,
      }], error: null });
    const client = { rpc } as never;
    const resolved = await createPostgresHelixaGenerationBindingAuthority(client).resolve(binding.bindingId);
    expect(resolved).toMatchObject({ organizationId: binding.organizationId, principal: { kind: 'service_principal' } });
    const repository = createPostgresHelixaGenerationRepository(client);
    await repository.reserve({ binding: resolved!, command: parseHelixaGenerationCommand(jobCommand), commandHash: generationCommandHash(parseHelixaGenerationCommand(jobCommand)), objectKind: 'ROLE_GUIDE' });
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_binding_id: binding.bindingId,
      p_command_id: jobCommand.commandId,
      p_command_kind: 'CREATE_JOB_INSTRUCTION',
      p_command_payload: jobCommand,
    });
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty('p_user_id');
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty('p_organization_id');
  });

  it('looks up a durable command from a fresh repository instance after restart', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      command_id: jobCommand.commandId,
      command_hash: '123b969a686c8db53a5b576e10ac895d1f79ac1570411efce3e08f5084c45d60',
      proposal_payload_hash: jobCommand.payloadHash, object_kind: 'ROLE_GUIDE',
      object_id: '33333333-3333-4333-8333-333333333333', status: 'native_completed',
      accepted_at: '2026-08-23T10:16:00.000Z', updated_at: '2026-08-23T10:20:00.000Z',
      lease_token: null, claim_generation: 2, command_kind: 'CREATE_JOB_INSTRUCTION',
      proposal_id: 'proposal-a', approved_revision: 3, safe_error_code: null,
      native_completed_at: '2026-08-23T10:20:00.000Z', outbox_event_id: 'mc2:ROLE_GUIDE:event',
    }], error: null });
    const freshRepository = createPostgresHelixaGenerationRepository({ rpc } as never);
    await expect(freshRepository.lookup(binding.bindingId, jobCommand.commandId)).resolves.toMatchObject({
      status: 'native_completed', operation: 'CREATE_JOB_INSTRUCTION', proposalId: 'proposal-a',
      outboxEventId: 'mc2:ROLE_GUIDE:event',
    });
  });

  it('maps concrete native observation to uncertain takeover or signed completion proof', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ outcome: 'running', native_completed_at: null, outbox_event_id: null }], error: null })
      .mockResolvedValueOnce({ data: [{ outcome: 'completed', native_completed_at: '2026-08-23T10:30:00.000Z', outbox_event_id: 'mc2:COURSE:event' }], error: null });
    const reconciler = createPostgresHelixaNativeReconciler({ rpc });
    const observer = createPostgresHelixaNativeObserver({ rpc });
    await expect(reconciler({ objectKind: 'COURSE', objectId: '44444444-4444-4444-8444-444444444444', organizationId: binding.organizationId })).resolves.toBe('uncertain');
    await expect(observer({ objectKind: 'COURSE', objectId: '44444444-4444-4444-8444-444444444444', organizationId: binding.organizationId })).resolves.toEqual({ kind: 'completed', nativeCompletedAt: '2026-08-23T10:30:00.000Z', outboxEventId: 'mc2:COURSE:event' });
  });

  it.each([
    ['missing auth row', { principal: { existsInAuth: false, existsInPublic: true, organizationId: binding.organizationId, role: 'admin', kind: 'service_principal', interactiveLoginAllowed: false } }],
    ['foreign organization', { principal: { existsInAuth: true, existsInPublic: true, organizationId: 'other', role: 'admin', kind: 'service_principal', interactiveLoginAllowed: false } }],
    ['student', { principal: { existsInAuth: true, existsInPublic: true, organizationId: binding.organizationId, role: 'student', kind: 'service_principal', interactiveLoginAllowed: false } }],
    ['interactive', { principal: { existsInAuth: true, existsInPublic: true, organizationId: binding.organizationId, role: 'admin', kind: 'service_principal', interactiveLoginAllowed: true } }],
    ['ordinary user', { principal: { existsInAuth: true, existsInPublic: true, organizationId: binding.organizationId, role: 'admin', kind: 'user', interactiveLoginAllowed: false } }],
  ])('fails %s principal before reservation', async (_label, overrides) => {
    const repository = createInMemoryHelixaGenerationRepository();
    const reserve = vi.spyOn(repository, 'reserve');
    await expect(dispatchHelixaGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId },
      command: jobCommand,
      mode: 'fake', authority: authority(overrides), repository,
      nativePort: { schedule: vi.fn() } as never,
    })).rejects.toThrow(/service principal/i);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('reserves one object, schedules once, exact-replays stably, and conflicts on a changed hash', async () => {
    const repository = createInMemoryHelixaGenerationRepository({
      objectId: () => '33333333-3333-4333-8333-333333333333',
      now: () => new Date('2026-08-23T10:16:00.000Z'),
    });
    const nativePort: HelixaGenerationNativePort = {
      schedule: vi.fn(async input => ({ objectId: input.objectId })),
      reconcile: vi.fn(async () => 'missing'),
      observe: vi.fn(async () => 'running'),
    };
    const input = { bindingLocator: { bindingId: binding.bindingId }, command: jobCommand, mode: 'fake' as const, authority: authority(), repository, nativePort };
    const [first, replay] = await Promise.all([
      dispatchHelixaGenerationCommand(input),
      dispatchHelixaGenerationCommand(input),
    ]);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({ state: 'accepted', object: { kind: 'ROLE_GUIDE', id: '33333333-3333-4333-8333-333333333333' } });
    expect(nativePort.schedule).toHaveBeenCalledTimes(1);
    const changed = structuredClone(jobCommand) as Record<string, unknown>;
    changed.jobInstruction = { ...jobCommand.jobInstruction, context: 'changed' };
    await expect(dispatchHelixaGenerationCommand({ ...input, command: changed })).resolves.toMatchObject({
      state: 'conflict', error: { code: 'megacampus_generation_command_conflict' },
    });
    expect(nativePort.schedule).toHaveBeenCalledTimes(1);
  });

  it('maps every native field and binds Course to the exact ROLE_GUIDE triple', async () => {
    const repository = createInMemoryHelixaGenerationRepository({ objectId: () => '44444444-4444-4444-8444-444444444444' });
    const schedule = vi.fn(async input => ({ objectId: input.objectId }));
    await dispatchHelixaGenerationCommand({ bindingLocator: { bindingId: binding.bindingId }, command: courseCommand, mode: 'fake', authority: authority(), repository, nativePort: { schedule } });
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({
      objectKind: 'COURSE', objectId: '44444444-4444-4444-8444-444444444444',
      servicePrincipalUserId: binding.servicePrincipalUserId,
      leaseToken: expect.any(String), claimGeneration: 1,
      course: courseCommand.course,
      sourceJobInstruction: courseCommand.sourceJobInstruction,
      includeWebResearch: false,
      includeBusinessContextSources: false,
    }));
  });

  it('builds the native ROLE_GUIDE queue input without dropping pane fields', async () => {
    const scheduleRoleGuide = vi.fn(async () => undefined);
    const port = createHelixaGenerationNativePort({
      scheduleRoleGuide,
      scheduleCourseFromRoleGuide: vi.fn(),
      reconcile: vi.fn(async () => 'missing'),
    });
    await port.schedule({
      binding: { ...binding, principal: { existsInAuth: true, existsInPublic: true, organizationId: binding.organizationId, role: 'admin', kind: 'service_principal', interactiveLoginAllowed: false } },
      command: parseHelixaGenerationCommand(jobCommand), objectKind: 'ROLE_GUIDE',
      objectId: '33333333-3333-4333-8333-333333333333',
      servicePrincipalUserId: binding.servicePrincipalUserId,
      leaseToken: '66666666-6666-4666-8666-666666666666', claimGeneration: 1,
      jobInstruction: jobCommand.jobInstruction, selectedSources: jobCommand.selectedSources,
      includeWebResearch: false, includeBusinessContextSources: false,
    });
    expect(scheduleRoleGuide).toHaveBeenCalledWith(expect.objectContaining({
      playbookId: '33333333-3333-4333-8333-333333333333',
      positionTitle: jobCommand.jobInstruction.roleTitle,
      language: 'en',
      commandOwnedTextSource: '# Business goal\nIncrease predictable revenue while preserving customer trust.\n\n# Context\nThe role owns the B2B sales process for a growing software company.',
      selectedSources: jobCommand.selectedSources,
      qAData: expect.objectContaining({ fixed: expect.arrayContaining([
        expect.objectContaining({ question_key: 'position', value: 'Sales Manager' }),
        expect.objectContaining({ question_key: 'content_language', value: 'en' }),
      ]) }),
    }));
  });

  it('uses one atomic native Course transaction and maps a stale current ROLE_GUIDE before mutation', async () => {
    const scheduleCourseFromRoleGuide = vi.fn(async () => { throw new Error('ROLE_GUIDE_SOURCE_STALE'); });
    const port = createHelixaGenerationNativePort({
      scheduleRoleGuide: vi.fn(), scheduleCourseFromRoleGuide,
      reconcile: vi.fn(async () => 'missing'),
      observe: vi.fn(async () => 'running'),
    });
    await expect(port.schedule({
      binding: { ...binding, principal: { existsInAuth: true, existsInPublic: true, organizationId: binding.organizationId, role: 'admin', kind: 'service_principal', interactiveLoginAllowed: false } },
      command: parseHelixaGenerationCommand(courseCommand), objectKind: 'COURSE',
      objectId: '44444444-4444-4444-8444-444444444444', servicePrincipalUserId: binding.servicePrincipalUserId,
      leaseToken: '66666666-6666-4666-8666-666666666666', claimGeneration: 1,
      course: courseCommand.course, sourceJobInstruction: courseCommand.sourceJobInstruction,
      includeWebResearch: false, includeBusinessContextSources: false,
    })).rejects.toThrow(/source stale/i);
    expect(scheduleCourseFromRoleGuide).toHaveBeenCalledOnce();
    expect(scheduleCourseFromRoleGuide).toHaveBeenCalledWith(expect.objectContaining({
      courseId: '44444444-4444-4444-8444-444444444444',
      sourceJobInstruction: courseCommand.sourceJobInstruction,
      originBindingId: binding.bindingId,
      originCommandId: courseCommand.commandId,
    }));
  });

  it('observes a fenced scheduled terminal failure without replaying native mutation', async () => {
    const schedule = vi.fn();
    const repository = scheduledObserverRepository(2);
    const result = await observeHelixaScheduledGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId }, commandId: courseCommand.commandId,
      mode: 'fake', authority: authority(), repository: repository as never,
      nativePort: { schedule, observe: vi.fn(async () => ({ kind: 'failed' as const })) },
    });
    expect(result).toBe('action_required');
    expect(repository.failObserved).toHaveBeenCalledWith(expect.objectContaining({ claimGeneration: 2 }));
    expect(schedule).not.toHaveBeenCalled();
  });

  it('returns native success to scheduled while waiting for signed completion proof', async () => {
    const repository = scheduledObserverRepository(3);
    const result = await observeHelixaScheduledGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId }, commandId: courseCommand.commandId,
      mode: 'fake', authority: authority(), repository: repository as never,
      nativePort: { schedule: vi.fn(), observe: vi.fn(async () => 'succeeded_awaiting_signed_import' as const) },
    });
    expect(result).toBe('scheduled');
    expect(repository.returnScheduled).toHaveBeenCalledOnce();
    expect(repository.reconcileCompleted).not.toHaveBeenCalled();
  });

  it('runs fenced native failure observation through the server lookup entrypoint', async () => {
    const repository = scheduledObserverRepository(6);
    repository.lookup
      .mockResolvedValueOnce({
        ...(await repository.claimScheduled()), status: 'scheduled', leaseToken: null,
      })
      .mockResolvedValueOnce({
        ...(await repository.claimScheduled()), status: 'action_required', leaseToken: null,
        safeErrorCode: 'megacampus_generation_native_failed',
      });
    repository.claimScheduled.mockClear();
    const result = await lookupHelixaGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId },
      query: { schemaVersion: 'helixa.megacampus-generation-lookup.v1', commandId: courseCommand.commandId, payloadHash: courseCommand.payloadHash },
      mode: 'fake', authority: authority(), repository: repository as never,
      nativePort: { schedule: vi.fn(), observe: vi.fn(async () => ({ kind: 'failed' as const })) },
    });
    expect(result).toMatchObject({ state: 'action_required', error: { code: 'megacampus_generation_native_failed' } });
    expect(repository.failObserved).toHaveBeenCalledOnce();
  });

  it('keeps lookup scheduled when native succeeded but signed import proof is absent', async () => {
    const repository = scheduledObserverRepository(7);
    const scheduled = { ...(await repository.claimScheduled()), status: 'scheduled' as const, leaseToken: null };
    repository.claimScheduled.mockClear();
    repository.lookup.mockResolvedValue(scheduled);
    const result = await lookupHelixaGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId },
      query: { schemaVersion: 'helixa.megacampus-generation-lookup.v1', commandId: courseCommand.commandId, payloadHash: courseCommand.payloadHash },
      mode: 'fake', authority: authority(), repository: repository as never,
      nativePort: { schedule: vi.fn(), observe: vi.fn(async () => 'succeeded_awaiting_signed_import' as const) },
    });
    expect(result).toMatchObject({ state: 'scheduled' });
    expect(repository.returnScheduled).toHaveBeenCalledOnce();
  });

  it('observes through lookup with the in-memory contract repository used by cross-repository proof', async () => {
    const repository = createInMemoryHelixaGenerationRepository({
      objectId: () => '44444444-4444-4444-8444-444444444444',
      now: () => new Date('2026-08-23T10:20:00.000Z'),
    });
    await dispatchHelixaGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId }, command: courseCommand,
      mode: 'fake', authority: authority(), repository,
      nativePort: { schedule: vi.fn(async input => ({ objectId: input.objectId })) },
    });
    const result = await lookupHelixaGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId },
      query: { schemaVersion: 'helixa.megacampus-generation-lookup.v1', commandId: courseCommand.commandId, payloadHash: courseCommand.payloadHash },
      mode: 'fake', authority: authority(), repository,
      nativePort: { schedule: vi.fn(), observe: vi.fn(async () => ({ kind: 'failed' as const })) },
    });
    expect(result).toMatchObject({ state: 'action_required', error: { code: 'megacampus_generation_native_failed' } });
  });

  it('observes native failure on exact dispatch replay and never schedules a second mutation', async () => {
    const repository = createInMemoryHelixaGenerationRepository({
      objectId: () => '44444444-4444-4444-8444-444444444444',
      now: () => new Date('2026-08-23T10:20:00.000Z'),
    });
    const schedule = vi.fn(async input => ({ objectId: input.objectId }));
    const nativePort: HelixaGenerationNativePort = {
      schedule,
      observe: vi.fn(async () => ({ kind: 'failed' as const })),
    };
    const dispatch = () => dispatchHelixaGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId }, command: courseCommand,
      mode: 'fake', authority: authority(), repository, nativePort,
    });

    await expect(dispatch()).resolves.toMatchObject({ state: 'accepted' });
    await expect(dispatch()).resolves.toMatchObject({
      state: 'action_required',
      error: { code: 'megacampus_generation_native_failed', retryable: false },
    });
    expect(schedule).toHaveBeenCalledOnce();
    expect(nativePort.observe).toHaveBeenCalledOnce();
  });

  it.each(['running', 'succeeded_awaiting_signed_import'] as const)(
    'keeps exact dispatch replay accepted when native observation is %s',
    async observed => {
      const repository = createInMemoryHelixaGenerationRepository({
        objectId: () => '44444444-4444-4444-8444-444444444444',
        now: () => new Date('2026-08-23T10:20:00.000Z'),
      });
      const schedule = vi.fn(async input => ({ objectId: input.objectId }));
      const nativePort: HelixaGenerationNativePort = {
        schedule,
        observe: vi.fn(async () => observed),
      };
      const input = {
        bindingLocator: { bindingId: binding.bindingId }, command: courseCommand,
        mode: 'fake' as const, authority: authority(), repository, nativePort,
      };
      await dispatchHelixaGenerationCommand(input);

      await expect(dispatchHelixaGenerationCommand(input)).resolves.toMatchObject({ state: 'accepted' });
      expect(schedule).toHaveBeenCalledOnce();
      expect(nativePort.observe).toHaveBeenCalledOnce();
    }
  );

  it('leaves a lost observer response fenced and reconciles on lease takeover without scheduling again', async () => {
    const first = scheduledObserverRepository(4);
    const schedule = vi.fn();
    await expect(observeHelixaScheduledGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId }, commandId: courseCommand.commandId,
      mode: 'fake', authority: authority(), repository: first as never,
      nativePort: { schedule, observe: vi.fn(async () => { throw new Error('observer response lost'); }) },
    })).rejects.toThrow(/response lost/i);
    expect(first.returnScheduled).not.toHaveBeenCalled();
    expect(first.failObserved).not.toHaveBeenCalled();

    const takeover = scheduledObserverRepository(5);
    const result = await observeHelixaScheduledGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId }, commandId: courseCommand.commandId,
      mode: 'fake', authority: authority(), repository: takeover as never,
      nativePort: { schedule, observe: vi.fn(async () => ({ kind: 'completed' as const, nativeCompletedAt: '2026-08-23T10:30:00.000Z', outboxEventId: 'mc2:COURSE:event' })) },
    });
    expect(result).toBe('native_completed');
    expect(takeover.completeObserved).toHaveBeenCalledOnce();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('preserves an ambiguous lost response for takeover reconciliation without a second native mutation', async () => {
    const row = {
      bindingId: binding.bindingId, commandId: jobCommand.commandId,
      commandHash: generationCommandHash(parseHelixaGenerationCommand(jobCommand)),
      operation: 'CREATE_JOB_INSTRUCTION' as const, payloadHash: jobCommand.payloadHash,
      proposalId: 'proposal-a', approvedRevision: 3, objectKind: 'ROLE_GUIDE' as const,
      objectId: '33333333-3333-4333-8333-333333333333', status: 'reserved' as const,
      acceptedAt: null, updatedAt: '2026-08-23T10:16:00.000Z', claimGeneration: 1,
      leaseToken: '66666666-6666-4666-8666-666666666666',
    };
    const actionRequired = vi.fn(async () => true);
    const repository = {
      reserve: vi.fn()
        .mockResolvedValueOnce({ kind: 'reserved', row, mutationOwner: true })
        .mockResolvedValueOnce({ kind: 'reserved', row: { ...row, status: 'executing', claimGeneration: 2, leaseToken: '77777777-7777-4777-8777-777777777777' }, mutationOwner: true }),
      renew: vi.fn(async () => true), markScheduled: vi.fn(), actionRequired,
      lookup: vi.fn(),
      reconcileCompleted: vi.fn(async input => ({ ...row, status: 'native_completed', claimGeneration: 2, leaseToken: null, nativeCompletedAt: input.nativeCompletedAt, outboxEventId: input.outboxEventId })),
    };
    const schedule = vi.fn().mockImplementationOnce(async () => { throw new Error('response lost after native commit'); });
    const nativePort = { schedule, reconcile: vi.fn(async () => ({ kind: 'completed' as const, nativeCompletedAt: '2026-08-23T10:20:00.000Z', outboxEventId: 'mc2:ROLE_GUIDE:event' })) };
    const dispatch = () => dispatchHelixaGenerationCommand({
      bindingLocator: { bindingId: binding.bindingId }, command: jobCommand, mode: 'fake', authority: authority(),
      repository, nativePort,
    });
    await expect(dispatch()).rejects.toThrow(/response lost/i);
    expect(actionRequired).not.toHaveBeenCalled();
    const result = await dispatch();
    expect(result).toMatchObject({ state: 'native_completed', outboxEventId: 'mc2:ROLE_GUIDE:event' });
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
