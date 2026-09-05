import {
  parseHelixaGenerationCommand,
  parseHelixaGenerationLookupQuery,
  generationCommandHash,
  type HelixaGenerationCommand,
  type HelixaGenerationMode,
} from './generation-command-schema';
import type {
  HelixaGenerationBindingAuthority,
  HelixaGenerationNativeDependencies,
  HelixaGenerationNativePort,
  HelixaGenerationRepository,
  HelixaGenerationRow,
  ResolvedHelixaGenerationBinding,
} from './generation-types';

// The public surface of this module is unchanged: everything that used to be
// declared here is still exported from here.
export * from './generation-command-schema';
export * from './generation-types';
export * from './generation-postgres';
export * from './generation-in-memory-repository';

export class HelixaGenerationPreMutationError extends Error {
  constructor(
    readonly safeErrorCode:
      | 'megacampus_generation_service_principal_invalid'
      | 'megacampus_generation_source_unavailable'
      | 'megacampus_generation_source_stale'
      | 'megacampus_generation_native_failed'
  ) {
    super(safeErrorCode.replaceAll('_', ' '));
    this.name = 'HelixaGenerationPreMutationError';
  }
}

/**
 * The Q&A record a Helixa command stands in for.
 *
 * A command carries a role title, a language, a business goal and a context paragraph.
 * The product's own equivalent of "the requester wrote this down" is a free-form answer,
 * and free-form text is what reaches the spec-builder prompt, so the command-owned text
 * goes there verbatim.
 *
 * It used to go into `business_context.digest`, which cannot hold it:
 * `CareerPlaybookBusinessContextDigestSchema` is a structured object of signal arrays, not
 * a string, so the worker's own `CareerPlaybookQADataSchema.parse` would have thrown on
 * every command. Nothing caught it because nothing ever called this seam. The context stays
 * `company_specific` with no digest, which is a state the formatter handles by telling the
 * model to use the explicit free-form context and invent nothing.
 */
function careerPlaybookQADataForCommand(
  roleTitle: string,
  language: 'ru' | 'en',
  commandOwnedTextSource: string
): Record<string, unknown> {
  return {
    fixed: [
      { question_key: 'position', value: roleTitle },
      { question_key: 'content_language', value: language },
    ],
    followups: [],
    freeform: [{ text: commandOwnedTextSource }],
    business_context: {
      mode: 'company_specific',
      status: 'collecting',
      digest: null,
      source_ids: [],
    },
    generation_warnings: [],
    quality_issues: [],
  };
}

/** The scheduling RPCs signal their refusals by message; each maps to one safe error code. */
function asPreMutationError(error: unknown): unknown {
  if (error instanceof HelixaGenerationPreMutationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('ROLE_GUIDE_SOURCE_UNAVAILABLE'))
    return new HelixaGenerationPreMutationError('megacampus_generation_source_unavailable');
  if (message.includes('ROLE_GUIDE_SOURCE_STALE'))
    return new HelixaGenerationPreMutationError('megacampus_generation_source_stale');
  if (message.includes('GENERATION_SERVICE_PRINCIPAL_INVALID'))
    return new HelixaGenerationPreMutationError('megacampus_generation_service_principal_invalid');
  // The row was written and the job was not. Recording it terminally is better than
  // leaving a reservation whose lease will expire into an uncertain outcome.
  if (message.includes('ROLE_GUIDE_GENERATION_ENQUEUE_FAILED'))
    return new HelixaGenerationPreMutationError('megacampus_generation_native_failed');
  return error;
}

/** Internal native service. Its injected functions are lower-level persistence/queue seams, never interactive routers. */
export function createHelixaGenerationNativePort(
  dependencies: HelixaGenerationNativeDependencies
): HelixaGenerationNativePort {
  return {
    reconcile(input) {
      return dependencies.reconcile({
        objectKind: input.objectKind,
        objectId: input.objectId,
        organizationId: input.binding.organizationId,
      });
    },
    observe(input) {
      return (
        dependencies.observe?.({
          objectKind: input.objectKind,
          objectId: input.objectId,
          organizationId: input.binding.organizationId,
        }) ?? Promise.resolve('running')
      );
    },
    async schedule(input) {
      if (input.command.operation === 'CREATE_JOB_INSTRUCTION') {
        const guide = input.command.jobInstruction;
        const commandOwnedTextSource = `# Business goal\n${guide.businessGoal}\n\n# Context\n${guide.context}`;
        try {
          await dependencies.scheduleRoleGuide({
            playbookId: input.objectId,
            organizationId: input.binding.organizationId,
            userId: input.servicePrincipalUserId,
            positionTitle: guide.roleTitle,
            language: guide.language,
            commandOwnedTextSource,
            selectedSources: input.command.selectedSources,
            qAData: careerPlaybookQADataForCommand(
              guide.roleTitle,
              guide.language,
              commandOwnedTextSource
            ),
            jobInstruction: guide,
            leaseToken: input.leaseToken,
            claimGeneration: input.claimGeneration,
            originBindingId: input.binding.bindingId,
            originCommandId: input.command.commandId,
          });
        } catch (error) {
          throw asPreMutationError(error);
        }
        return { objectId: input.objectId };
      }

      const source = input.command.sourceJobInstruction;
      try {
        await dependencies.scheduleCourseFromRoleGuide({
          courseId: input.objectId,
          organizationId: input.binding.organizationId,
          userId: input.servicePrincipalUserId,
          leaseToken: input.leaseToken,
          claimGeneration: input.claimGeneration,
          course: input.command.course,
          sourceJobInstruction: source,
          originBindingId: input.binding.bindingId,
          originCommandId: input.command.commandId,
          includeWebResearch: false,
          includeBusinessContextSources: false,
        });
      } catch (error) {
        throw asPreMutationError(error);
      }
      return { objectId: input.objectId };
    },
  };
}

function assertBinding(
  binding: ResolvedHelixaGenerationBinding | null,
  command: HelixaGenerationCommand
): asserts binding is ResolvedHelixaGenerationBinding {
  assertPrincipalBinding(binding);
  const enabled =
    command.operation === 'CREATE_JOB_INSTRUCTION'
      ? binding.jobInstructionCreationEnabled
      : binding.courseFromJobInstructionCreationEnabled;
  if (!enabled) throw new Error('MegaCampus generation binding unavailable');
}

function assertPrincipalBinding(
  binding: ResolvedHelixaGenerationBinding | null
): asserts binding is ResolvedHelixaGenerationBinding {
  if (!binding) throw new Error('MegaCampus generation binding unavailable');
  const principal = binding.principal;
  if (
    !principal.existsInAuth ||
    !principal.existsInPublic ||
    principal.organizationId !== binding.organizationId ||
    !['owner', 'admin', 'instructor'].includes(principal.role) ||
    principal.kind !== 'service_principal' ||
    principal.interactiveLoginAllowed
  ) {
    throw new Error('MegaCampus generation service principal invalid');
  }
}

function accepted(row: HelixaGenerationRow) {
  return {
    schemaVersion: 'helixa.megacampus-generation-result.v1' as const,
    operation: row.operation,
    commandId: row.commandId,
    payloadHash: row.payloadHash,
    state: 'accepted' as const,
    object: { kind: row.objectKind, id: row.objectId },
    acceptedAt: row.acceptedAt!,
  };
}

function nativeCompleted(row: HelixaGenerationRow) {
  return {
    schemaVersion: 'helixa.megacampus-generation-result.v1' as const,
    operation: row.operation,
    commandId: row.commandId,
    payloadHash: row.payloadHash,
    state: 'native_completed' as const,
    object: { kind: row.objectKind, id: row.objectId },
    outboxEventId: row.outboxEventId!,
    nativeCompletedAt: row.nativeCompletedAt!,
  };
}

function actionRequiredResult(row: HelixaGenerationRow) {
  return {
    schemaVersion: 'helixa.megacampus-generation-result.v1' as const,
    operation: row.operation,
    commandId: row.commandId,
    payloadHash: row.payloadHash,
    state: 'action_required' as const,
    object: { kind: row.objectKind, id: row.objectId },
    error: { code: row.safeErrorCode!, retryable: false as const },
  };
}

async function observeScheduledDispatchReplay(input: {
  bindingLocator: { bindingId: string };
  commandId: string;
  mode: HelixaGenerationMode;
  authority: HelixaGenerationBindingAuthority;
  repository: HelixaGenerationRepository;
  nativePort: HelixaGenerationNativePort;
}): Promise<ReturnType<typeof accepted> | ReturnType<typeof actionRequiredResult>> {
  await observeHelixaScheduledGenerationCommand(input);
  const row = await input.repository.lookup(input.bindingLocator.bindingId, input.commandId);
  if (!row) throw new Error('MegaCampus generation command disappeared during replay observation');
  if (row.status === 'action_required') return actionRequiredResult(row);
  return accepted(row);
}

export async function dispatchHelixaGenerationCommand(input: {
  bindingLocator: { bindingId: string };
  command: unknown;
  mode: HelixaGenerationMode;
  authority: HelixaGenerationBindingAuthority;
  repository: HelixaGenerationRepository;
  nativePort: HelixaGenerationNativePort;
}) {
  if (input.mode === 'disabled') throw new Error('MegaCampus generation is disabled');
  const command = parseHelixaGenerationCommand(input.command);
  const binding = await input.authority.resolve(input.bindingLocator.bindingId);
  assertBinding(binding, command);
  if (binding.bindingId !== input.bindingLocator.bindingId)
    throw new Error('MegaCampus generation binding unavailable');
  const objectKind = command.operation === 'CREATE_JOB_INSTRUCTION' ? 'ROLE_GUIDE' : 'COURSE';
  const reservation = await input.repository.reserve({
    binding,
    command,
    commandHash: generationCommandHash(command),
    objectKind,
  });
  if (reservation.kind === 'conflict')
    return {
      schemaVersion: 'helixa.megacampus-generation-result.v1' as const,
      operation: command.operation,
      commandId: command.commandId,
      payloadHash: command.payloadHash,
      state: 'conflict' as const,
      error: { code: 'megacampus_generation_command_conflict' as const, retryable: false as const },
    };
  if (reservation.row.status === 'scheduled')
    return observeScheduledDispatchReplay({
      bindingLocator: input.bindingLocator,
      commandId: command.commandId,
      mode: input.mode,
      authority: input.authority,
      repository: input.repository,
      nativePort: input.nativePort,
    });
  if (reservation.row.status === 'native_completed') return accepted(reservation.row);
  if (reservation.row.status === 'action_required') return actionRequiredResult(reservation.row);
  if (!reservation.mutationOwner) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1));
      const replay = await input.repository.lookup(binding.bindingId, command.commandId);
      if (replay?.status === 'scheduled')
        return observeScheduledDispatchReplay({
          bindingLocator: input.bindingLocator,
          commandId: command.commandId,
          mode: input.mode,
          authority: input.authority,
          repository: input.repository,
          nativePort: input.nativePort,
        });
      if (replay?.status === 'native_completed') return accepted(replay);
      if (replay?.status === 'action_required') return actionRequiredResult(replay);
    }
    throw new Error('MegaCampus generation is still reserving');
  }
  const row = reservation.row;
  if (row.leaseToken == null) throw new Error('MegaCampus generation reservation omitted lease');
  const fence = {
    bindingId: binding.bindingId,
    commandId: command.commandId,
    objectId: row.objectId,
    leaseToken: row.leaseToken,
    claimGeneration: row.claimGeneration,
  };
  try {
    if (row.claimGeneration > 1) {
      const reconciliation =
        (await input.nativePort.reconcile?.({
          binding,
          command,
          objectKind,
          objectId: row.objectId,
        })) ?? 'uncertain';
      if (typeof reconciliation === 'object' && reconciliation.kind === 'completed') {
        const completed = await input.repository.reconcileCompleted({
          ...fence,
          nativeCompletedAt: reconciliation.nativeCompletedAt,
          outboxEventId: reconciliation.outboxEventId,
        });
        if (!completed) throw new Error('MegaCampus generation lease lost during reconciliation');
        // `accepted`, not `native_completed`. Helixa's dispatch schema has three states and
        // this is not one of them, and its worker does the right thing with `accepted`: it
        // polls lookup and waits for the signed import, which is exactly the state a
        // reclaimed reservation over a finished native object is in. `native_completed`
        // stays a lookup-only answer, where Helixa's schema does accept it.
        return accepted(completed);
      }
      if (reconciliation === 'uncertain') {
        const recorded = await input.repository.actionRequired({
          ...fence,
          safeErrorCode: 'megacampus_generation_outcome_uncertain',
        });
        if (!recorded) throw new Error('MegaCampus generation lease lost during reconciliation');
        throw new Error('MegaCampus generation outcome uncertain');
      }
    }
    if (!(await input.repository.renew(fence)))
      throw new Error('MegaCampus generation lease lost before scheduling');
    const result = await input.nativePort.schedule({
      binding,
      command,
      objectKind,
      objectId: row.objectId,
      servicePrincipalUserId: binding.servicePrincipalUserId,
      leaseToken: row.leaseToken,
      claimGeneration: row.claimGeneration,
      ...(command.operation === 'CREATE_JOB_INSTRUCTION'
        ? { jobInstruction: command.jobInstruction, selectedSources: command.selectedSources }
        : { course: command.course, sourceJobInstruction: command.sourceJobInstruction }),
      includeWebResearch: false,
      includeBusinessContextSources: false,
    });
    if (result.objectId !== row.objectId)
      throw new Error('Native generation returned a different object ID');
    const scheduled = await input.repository.markScheduled(fence);
    if (!scheduled) throw new Error('MegaCampus generation lease lost while scheduling');
    return accepted(scheduled);
  } catch (error) {
    if (error instanceof HelixaGenerationPreMutationError) {
      await input.repository.actionRequired({ ...fence, safeErrorCode: error.safeErrorCode });
    }
    throw error;
  }
}

export async function lookupHelixaGenerationCommand(input: {
  bindingLocator: { bindingId: string };
  query: unknown;
  mode: HelixaGenerationMode;
  authority: HelixaGenerationBindingAuthority;
  repository: HelixaGenerationRepository;
  nativePort: HelixaGenerationNativePort;
}) {
  if (input.mode === 'disabled') throw new Error('MegaCampus generation is disabled');
  const query = parseHelixaGenerationLookupQuery(input.query);
  const binding = await input.authority.resolve(input.bindingLocator.bindingId);
  assertPrincipalBinding(binding);
  if (binding.bindingId !== input.bindingLocator.bindingId)
    throw new Error('MegaCampus generation binding unavailable');
  let row = await input.repository.lookup(binding.bindingId, query.commandId);
  const common = {
    schemaVersion: 'helixa.megacampus-generation-result.v1' as const,
    commandId: query.commandId,
    payloadHash: query.payloadHash,
  };
  if (!row) return { ...common, state: 'not_found' as const };
  if (row.payloadHash !== query.payloadHash)
    return {
      ...common,
      state: 'conflict' as const,
      error: { code: 'megacampus_generation_command_conflict' as const, retryable: false as const },
    };
  if (row.status === 'scheduled') {
    await observeHelixaScheduledGenerationCommand({
      bindingLocator: input.bindingLocator,
      commandId: query.commandId,
      mode: input.mode,
      authority: input.authority,
      repository: input.repository,
      nativePort: input.nativePort,
    });
    row = await input.repository.lookup(binding.bindingId, query.commandId);
    if (!row) throw new Error('MegaCampus generation command disappeared during observation');
  }
  if (row.status === 'native_completed') return nativeCompleted(row);
  if (row.status === 'action_required')
    return {
      ...common,
      operation: row.operation,
      state: 'action_required' as const,
      object: { kind: row.objectKind, id: row.objectId },
      error: { code: row.safeErrorCode!, retryable: false as const },
    };
  return {
    ...common,
    operation: row.operation,
    state: row.status === 'scheduled' ? ('scheduled' as const) : ('executing' as const),
    object: { kind: row.objectKind, id: row.objectId },
    updatedAt: row.updatedAt,
  };
}

export async function observeHelixaScheduledGenerationCommand(input: {
  bindingLocator: { bindingId: string };
  commandId: string;
  mode: HelixaGenerationMode;
  authority: HelixaGenerationBindingAuthority;
  repository: HelixaGenerationRepository;
  nativePort: HelixaGenerationNativePort;
}): Promise<'not_found' | 'busy' | 'scheduled' | 'native_completed' | 'action_required'> {
  if (input.mode === 'disabled') throw new Error('MegaCampus generation is disabled');
  const binding = await input.authority.resolve(input.bindingLocator.bindingId);
  assertPrincipalBinding(binding);
  if (binding.bindingId !== input.bindingLocator.bindingId)
    throw new Error('MegaCampus generation binding unavailable');
  if (
    !input.repository.claimScheduled ||
    !input.repository.returnScheduled ||
    !input.repository.failObserved ||
    !input.repository.completeObserved ||
    !input.nativePort.observe
  ) {
    throw new Error('MegaCampus generation observer unavailable');
  }
  const row = await input.repository.claimScheduled({
    bindingId: binding.bindingId,
    commandId: input.commandId,
  });
  if (!row) {
    const current = await input.repository.lookup(binding.bindingId, input.commandId);
    if (!current) return 'not_found';
    if (current.status === 'native_completed') return 'native_completed';
    if (current.status === 'action_required') return 'action_required';
    return 'busy';
  }
  if (!row.leaseToken) throw new Error('MegaCampus generation observer claim omitted lease');
  const fence = {
    bindingId: binding.bindingId,
    commandId: row.commandId,
    objectId: row.objectId,
    leaseToken: row.leaseToken,
    claimGeneration: row.claimGeneration,
  };
  const observed = await input.nativePort.observe({
    binding,
    objectKind: row.objectKind,
    objectId: row.objectId,
  });
  if (typeof observed === 'object' && observed.kind === 'failed') {
    if (!(await input.repository.failObserved(fence))) {
      throw new Error('MegaCampus generation observer lease lost');
    }
    return 'action_required';
  }
  if (typeof observed === 'object' && observed.kind === 'completed') {
    const completed = await input.repository.completeObserved({
      ...fence,
      nativeCompletedAt: observed.nativeCompletedAt,
      outboxEventId: observed.outboxEventId,
    });
    if (!completed) throw new Error('MegaCampus generation observer lease lost');
    return 'native_completed';
  }
  if (!(await input.repository.returnScheduled(fence)))
    throw new Error('MegaCampus generation observer lease lost');
  return 'scheduled';
}
