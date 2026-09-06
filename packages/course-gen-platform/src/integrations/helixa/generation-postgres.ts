// Split out of `generation-commands.ts` on 2026-09-05. Prettier reformatting the
// densely-authored original took it from 854 to 1258 lines, past the repository's
// 800-line `max-lines` rule, so the file that had only ever been lint-clean because
// it was unformatted had to become several files that are both. Nothing here changed
// behaviour: these are the original declarations, moved. `generation-commands.ts`
// re-exports every one of them, so no import anywhere else had to change.

import { QUEUE_NAME } from '@/orchestrator/queue';

import type {
  HelixaGenerationObjectKind,
  HelixaGenerationOperation,
} from './generation-command-schema';
import type {
  GenerationRpcClient,
  GenerationStatus,
  HelixaGenerationBindingAuthority,
  HelixaGenerationNativeDependencies,
  HelixaGenerationRepository,
  HelixaGenerationRow,
} from './generation-types';

/**
 * `targetQueue` defaults to the same `QUEUE_NAME` the FSM initialization handler passes to
 * `initialize_fsm_with_outbox`. The RPC used to write the queue name as a literal, which
 * meant every dev row was addressed to a queue no dev worker claims.
 */
export function createPostgresHelixaCourseFromRoleGuideScheduler(
  client: GenerationRpcClient,
  targetQueue: string = QUEUE_NAME
): HelixaGenerationNativeDependencies['scheduleCourseFromRoleGuide'] {
  return async input => {
    const result = await client.rpc<boolean>('schedule_helixa_course_from_role_guide', {
      p_binding_id: input.originBindingId,
      p_command_id: input.originCommandId,
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_user_id: input.userId,
      p_course: input.course,
      p_source_job_instruction: input.sourceJobInstruction,
      p_lease_token: input.leaseToken,
      p_claim_generation: input.claimGeneration,
      p_target_queue: targetQueue,
    });
    if (result.error) throw new Error(result.error.message);
    if (result.data !== true) throw new Error('ROLE_GUIDE_SOURCE_UNAVAILABLE');
  };
}

export function createPostgresHelixaCourseScheduler(
  client: GenerationRpcClient,
  targetQueue: string = QUEUE_NAME
): HelixaGenerationNativeDependencies['scheduleCourse'] {
  return async input => {
    const result = await client.rpc<boolean>('schedule_helixa_course', {
      p_binding_id: input.originBindingId,
      p_command_id: input.originCommandId,
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_user_id: input.userId,
      p_course: input.course,
      p_selected_sources: input.selectedSources,
      p_lease_token: input.leaseToken,
      p_claim_generation: input.claimGeneration,
      p_target_queue: targetQueue,
    });
    if (result.error) throw new Error(result.error.message);
    if (result.data !== true) throw new Error('COURSE_GENERATION_SCHEDULING_FAILED');
  };
}

type NativeObservationRow = {
  outcome: 'missing' | 'running' | 'succeeded_awaiting_signed_import' | 'completed' | 'failed';
  native_completed_at: string | null;
  outbox_event_id: string | null;
};
export function createPostgresHelixaNativeObserver(
  client: GenerationRpcClient
): NonNullable<HelixaGenerationNativeDependencies['observe']> {
  return async input => {
    const result = await client.rpc<NativeObservationRow[]>('observe_helixa_native_generation', {
      p_binding_id: input.bindingId,
      p_organization_id: input.organizationId,
      p_object_kind: input.objectKind,
      p_object_id: input.objectId,
    });
    if (result.error) throw new Error('Failed to observe native MegaCampus generation');
    const row = result.data?.[0];
    if (!row || row.outcome === 'missing' || row.outcome === 'running') return 'running';
    if (row.outcome === 'failed') return { kind: 'failed' };
    if (row.outcome === 'succeeded_awaiting_signed_import')
      return 'succeeded_awaiting_signed_import';
    if (!row.native_completed_at || !row.outbox_event_id)
      throw new Error('Native completion observation omitted proof');
    return {
      kind: 'completed',
      nativeCompletedAt: row.native_completed_at,
      outboxEventId: row.outbox_event_id,
    };
  };
}

export function createPostgresHelixaNativeReconciler(
  client: GenerationRpcClient
): HelixaGenerationNativeDependencies['reconcile'] {
  return async input => {
    const result = await client.rpc<NativeObservationRow[]>('observe_helixa_native_generation', {
      p_binding_id: input.bindingId,
      p_organization_id: input.organizationId,
      p_object_kind: input.objectKind,
      p_object_id: input.objectId,
    });
    if (result.error) throw new Error('Failed to reconcile native MegaCampus generation');
    const row = result.data?.[0];
    if (!row || row.outcome === 'missing') return 'missing';
    if (row.outcome !== 'completed') return 'uncertain';
    if (!row.native_completed_at || !row.outbox_event_id) return 'uncertain';
    return {
      kind: 'completed',
      nativeCompletedAt: row.native_completed_at,
      outboxEventId: row.outbox_event_id,
    };
  };
}

type ResolvedBindingRow = {
  binding_id: string;
  organization_id: string;
  environment: string;
  destination_binding_id: string;
  service_principal_user_id: string;
  job_instruction_creation_enabled: boolean;
  course_from_job_instruction_creation_enabled: boolean;
  course_creation_enabled: boolean;
  principal_exists_in_auth: boolean;
  principal_exists_in_public: boolean;
  principal_organization_id: string;
  principal_role: string;
  principal_kind: string;
  interactive_login_allowed: boolean;
};

export function createPostgresHelixaGenerationBindingAuthority(
  client: GenerationRpcClient
): HelixaGenerationBindingAuthority {
  return {
    async resolve(bindingId) {
      const result = await client.rpc<ResolvedBindingRow[]>('resolve_helixa_generation_binding', {
        p_binding_id: bindingId,
      });
      if (result.error) throw new Error('Failed to resolve MegaCampus generation binding');
      const row = result.data?.[0];
      if (!row) return null;
      return {
        bindingId: row.binding_id,
        organizationId: row.organization_id,
        environment: row.environment,
        destinationBindingId: row.destination_binding_id,
        servicePrincipalUserId: row.service_principal_user_id,
        jobInstructionCreationEnabled: row.job_instruction_creation_enabled,
        courseFromJobInstructionCreationEnabled: row.course_from_job_instruction_creation_enabled,
        courseCreationEnabled: row.course_creation_enabled,
        principal: {
          existsInAuth: row.principal_exists_in_auth,
          existsInPublic: row.principal_exists_in_public,
          organizationId: row.principal_organization_id,
          role: row.principal_role,
          kind: row.principal_kind,
          interactiveLoginAllowed: row.interactive_login_allowed,
        },
      };
    },
  };
}

type GenerationCommandRow = {
  command_id: string;
  command_hash: string;
  proposal_payload_hash: string;
  object_kind: HelixaGenerationObjectKind;
  object_id: string;
  status: GenerationStatus;
  accepted_at: string | null;
  updated_at: string;
  conflict?: boolean;
  mutation_owner?: boolean;
  lease_token: string | null;
  claim_generation: number;
  command_kind: HelixaGenerationOperation;
  proposal_id: string;
  approved_revision: number;
  safe_error_code?: string | null;
  native_completed_at?: string | null;
  outbox_event_id?: string | null;
};

function mapCommandRow(row: GenerationCommandRow, bindingId: string): HelixaGenerationRow {
  return {
    bindingId,
    commandId: row.command_id,
    commandHash: row.command_hash,
    operation: row.command_kind,
    payloadHash: row.proposal_payload_hash,
    proposalId: row.proposal_id,
    approvedRevision: row.approved_revision,
    objectKind: row.object_kind,
    objectId: row.object_id,
    status: row.status,
    acceptedAt: row.accepted_at,
    updatedAt: row.updated_at,
    claimGeneration: row.claim_generation,
    leaseToken: row.lease_token,
    ...(row.safe_error_code ? { safeErrorCode: row.safe_error_code } : {}),
    ...(row.native_completed_at ? { nativeCompletedAt: row.native_completed_at } : {}),
    ...(row.outbox_event_id ? { outboxEventId: row.outbox_event_id } : {}),
  };
}

export function createPostgresHelixaGenerationRepository(
  client: GenerationRpcClient
): HelixaGenerationRepository {
  const booleanRpc = async (name: string, args: Record<string, unknown>, label: string) => {
    const result = await client.rpc<boolean>(name, args);
    if (result.error) throw new Error(label);
    return result.data === true;
  };
  return {
    async reserve(input) {
      const result = await client.rpc<GenerationCommandRow[]>('reserve_helixa_generation_command', {
        p_binding_id: input.binding.bindingId,
        p_command_id: input.command.commandId,
        p_command_kind: input.command.operation,
        p_proposal_id: input.command.proposalId,
        p_approved_revision: input.command.approvedRevision,
        p_proposal_payload_hash: input.command.payloadHash,
        p_command_hash: input.commandHash,
        p_command_payload: input.command,
        p_object_kind: input.objectKind,
      });
      if (result.error || !result.data?.[0])
        throw new Error('Failed to reserve MegaCampus generation command');
      const row = result.data[0];
      if (row.conflict) return { kind: 'conflict' };
      const mutationOwner = row.mutation_owner === true;
      return {
        kind: 'reserved',
        row: mapCommandRow(row, input.binding.bindingId),
        mutationOwner,
        newlyReserved: mutationOwner && row.claim_generation === 1 && row.accepted_at === null,
      };
    },
    renew(input) {
      return booleanRpc(
        'renew_helixa_generation_command',
        {
          p_binding_id: input.bindingId,
          p_command_id: input.commandId,
          p_object_id: input.objectId,
          p_lease_token: input.leaseToken,
          p_claim_generation: input.claimGeneration,
        },
        'Failed to renew MegaCampus generation lease'
      );
    },
    async markScheduled(input) {
      const result = await client.rpc<GenerationCommandRow[]>(
        'schedule_helixa_generation_command',
        {
          p_binding_id: input.bindingId,
          p_command_id: input.commandId,
          p_object_id: input.objectId,
          p_lease_token: input.leaseToken,
          p_claim_generation: input.claimGeneration,
        }
      );
      if (result.error) throw new Error('Failed to schedule MegaCampus generation command');
      const row = result.data?.[0];
      return row ? mapCommandRow(row, input.bindingId) : null;
    },
    async reconcileCompleted(input) {
      const result = await client.rpc<GenerationCommandRow[]>(
        'reconcile_completed_helixa_generation_command',
        {
          p_binding_id: input.bindingId,
          p_command_id: input.commandId,
          p_object_id: input.objectId,
          p_lease_token: input.leaseToken,
          p_claim_generation: input.claimGeneration,
          p_native_completed_at: input.nativeCompletedAt,
          p_outbox_event_id: input.outboxEventId,
        }
      );
      if (result.error) throw new Error('Failed to reconcile MegaCampus generation completion');
      const row = result.data?.[0];
      return row ? mapCommandRow(row, input.bindingId) : null;
    },
    actionRequired(input) {
      return booleanRpc(
        'action_required_helixa_generation_command',
        {
          p_binding_id: input.bindingId,
          p_command_id: input.commandId,
          p_object_id: input.objectId,
          p_safe_error_code: input.safeErrorCode,
          p_lease_token: input.leaseToken,
          p_claim_generation: input.claimGeneration,
        },
        'Failed to record MegaCampus generation failure'
      );
    },
    async lookup(bindingId, commandId) {
      const result = await client.rpc<GenerationCommandRow[]>('lookup_helixa_generation_command', {
        p_binding_id: bindingId,
        p_command_id: commandId,
      });
      if (result.error) throw new Error('Failed to look up MegaCampus generation command');
      const row = result.data?.[0];
      return row ? mapCommandRow(row, bindingId) : null;
    },
    async claimScheduled(input) {
      const result = await client.rpc<GenerationCommandRow[]>(
        'claim_scheduled_helixa_generation_command',
        {
          p_binding_id: input.bindingId,
          p_command_id: input.commandId,
        }
      );
      if (result.error) throw new Error('Failed to claim scheduled MegaCampus generation command');
      const row = result.data?.[0];
      return row ? mapCommandRow(row, input.bindingId) : null;
    },
    returnScheduled(input) {
      return booleanRpc(
        'return_scheduled_helixa_generation_command',
        {
          p_binding_id: input.bindingId,
          p_command_id: input.commandId,
          p_object_id: input.objectId,
          p_lease_token: input.leaseToken,
          p_claim_generation: input.claimGeneration,
        },
        'Failed to return MegaCampus generation command to scheduled'
      );
    },
    failObserved(input) {
      return booleanRpc(
        'fail_observed_helixa_generation_command',
        {
          p_binding_id: input.bindingId,
          p_command_id: input.commandId,
          p_object_id: input.objectId,
          p_lease_token: input.leaseToken,
          p_observation_generation: input.claimGeneration,
        },
        'Failed to record observed MegaCampus generation failure'
      );
    },
    completeObserved(input) {
      return booleanRpc(
        'complete_observed_helixa_generation_command',
        {
          p_binding_id: input.bindingId,
          p_command_id: input.commandId,
          p_object_id: input.objectId,
          p_lease_token: input.leaseToken,
          p_observation_generation: input.claimGeneration,
          p_native_completed_at: input.nativeCompletedAt,
          p_outbox_event_id: input.outboxEventId,
        },
        'Failed to record observed MegaCampus generation completion'
      );
    },
  };
}
