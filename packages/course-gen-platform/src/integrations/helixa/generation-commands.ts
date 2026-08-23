import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { sha256 } from './canonical-json';
import { canonicalGenerationJsonV1 } from './generation-canonical-json';

const identifier = z.string().trim().min(1).max(300);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const selectedSource = z.object({
  documentId: identifier,
  sourceRevisionHash: hash,
  citationId: identifier,
}).strict();

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

const selectedSources = z.array(selectedSource).min(1).max(64).superRefine((sources, context) => {
  const documentIds = new Set<string>();
  const citationIds = new Set<string>();
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    if (documentIds.has(source.documentId) || citationIds.has(source.citationId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate selected source' });
    }
    documentIds.add(source.documentId);
    citationIds.add(source.citationId);
    if (index > 0) {
      const previous = sources[index - 1];
      const order = utf8Compare(previous.documentId, source.documentId)
        || utf8Compare(previous.citationId, source.citationId);
      if (order >= 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'selected sources are not canonical' });
    }
  }
}).readonly();

const common = {
  schemaVersion: z.literal('helixa.megacampus-generation-command.v1'),
  proposalId: identifier,
  approvedRevision: revision,
  payloadHash: hash,
};

const jobInstructionCommand = z.object({
  ...common,
  operation: z.literal('CREATE_JOB_INSTRUCTION'),
  commandId: z.string().regex(/^megacampus_generation_command:create_job_instruction:v1:[a-f0-9]{64}$/),
  jobInstruction: z.object({
    roleTitle: z.string().trim().min(1).max(160),
    businessGoal: z.string().trim().min(1).max(4000),
    context: z.string().trim().min(1).max(12000),
    language: z.enum(['ru', 'en']),
  }).strict().readonly(),
  selectedSources,
}).strict();

const courseCommand = z.object({
  ...common,
  operation: z.literal('CREATE_COURSE_FROM_JOB_INSTRUCTION'),
  commandId: z.string().regex(/^megacampus_generation_command:create_course_from_job_instruction:v1:[a-f0-9]{64}$/),
  course: z.object({
    title: z.string().trim().min(1).max(200),
    courseDescription: z.string().trim().min(1).max(7000),
    targetAudience: z.string().trim().min(1).max(2000),
    learningOutcomes: z.array(z.string().trim().min(1).max(500)).min(1).max(20).readonly(),
    language: z.enum(['ru', 'en']),
    courseSize: z.enum(['auto', 'micro', 'mini', 'compact', 'standard', 'comprehensive']),
    style: z.enum(['professional', 'practical', 'problem_based', 'analytical', 'conversational', 'storytelling', 'interactive', 'motivational', 'academic', 'technical', 'research', 'gamified']),
  }).strict().readonly(),
  sourceJobInstruction: z.object({
    kind: z.literal('ROLE_GUIDE'),
    id: identifier,
    sourceVersion: identifier,
    contentHash: hash,
  }).strict().readonly(),
}).strict();

export const HelixaGenerationCommandSchema = z.discriminatedUnion('operation', [
  jobInstructionCommand,
  courseCommand,
]);
export type HelixaGenerationCommand = z.infer<typeof HelixaGenerationCommandSchema>;
export type HelixaGenerationOperation = HelixaGenerationCommand['operation'];
export type HelixaGenerationObjectKind = 'ROLE_GUIDE' | 'COURSE';

export const HelixaGenerationLookupQuerySchema = z.object({
  schemaVersion: z.literal('helixa.megacampus-generation-lookup.v1'),
  commandId: z.string().max(180),
  payloadHash: hash,
}).strict().readonly();
export type HelixaGenerationLookupQuery = z.infer<typeof HelixaGenerationLookupQuerySchema>;

export function parseHelixaGenerationCommand(value: unknown): HelixaGenerationCommand {
  return HelixaGenerationCommandSchema.parse(value);
}

export function parseHelixaGenerationLookupQuery(value: unknown): HelixaGenerationLookupQuery {
  return HelixaGenerationLookupQuerySchema.parse(value);
}

export function generationCommandHash(command: HelixaGenerationCommand): string {
  return sha256(canonicalGenerationJsonV1(command));
}

export function readHelixaGenerationMode(environment: NodeJS.ProcessEnv = process.env): 'disabled' | 'fake' {
  const value = environment.HELIXA_MEGACAMPUS_GENERATION_MODE;
  if (value == null || value === '' || value === 'disabled') return 'disabled';
  if (value === 'fake') return 'fake';
  throw new Error('Invalid Helixa generation mode');
}

export interface ResolvedHelixaGenerationBinding {
  bindingId: string;
  organizationId: string;
  environment: string;
  destinationBindingId: string;
  servicePrincipalUserId: string;
  jobInstructionCreationEnabled: boolean;
  courseFromJobInstructionCreationEnabled: boolean;
  principal: {
    existsInAuth: boolean;
    existsInPublic: boolean;
    organizationId: string;
    role: string;
    kind: string;
    interactiveLoginAllowed: boolean;
  };
}

export interface HelixaGenerationBindingAuthority {
  resolve(bindingId: string): Promise<ResolvedHelixaGenerationBinding | null>;
}

export interface GenerationRpcClient {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }>;
}

export function createPostgresHelixaCourseFromRoleGuideScheduler(client: GenerationRpcClient): HelixaGenerationNativeDependencies['scheduleCourseFromRoleGuide'] {
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
    });
    if (result.error) throw new Error(result.error.message);
    if (result.data !== true) throw new Error('ROLE_GUIDE_SOURCE_UNAVAILABLE');
  };
}

type NativeObservationRow = { outcome: 'missing' | 'running' | 'succeeded_awaiting_signed_import' | 'completed' | 'failed'; native_completed_at: string | null; outbox_event_id: string | null };
export function createPostgresHelixaNativeObserver(client: GenerationRpcClient): NonNullable<HelixaGenerationNativeDependencies['observe']> {
  return async input => {
    const result = await client.rpc<NativeObservationRow[]>('observe_helixa_native_generation', {
      p_organization_id: input.organizationId, p_object_kind: input.objectKind, p_object_id: input.objectId,
    });
    if (result.error) throw new Error('Failed to observe native MegaCampus generation');
    const row = result.data?.[0];
    if (!row || row.outcome === 'missing' || row.outcome === 'running') return 'running';
    if (row.outcome === 'failed') return { kind: 'failed' };
    if (row.outcome === 'succeeded_awaiting_signed_import') return 'succeeded_awaiting_signed_import';
    if (!row.native_completed_at || !row.outbox_event_id) throw new Error('Native completion observation omitted proof');
    return { kind: 'completed', nativeCompletedAt: row.native_completed_at, outboxEventId: row.outbox_event_id };
  };
}

export function createPostgresHelixaNativeReconciler(client: GenerationRpcClient): HelixaGenerationNativeDependencies['reconcile'] {
  return async input => {
    const result = await client.rpc<NativeObservationRow[]>('observe_helixa_native_generation', {
      p_organization_id: input.organizationId, p_object_kind: input.objectKind, p_object_id: input.objectId,
    });
    if (result.error) throw new Error('Failed to reconcile native MegaCampus generation');
    const row = result.data?.[0];
    if (!row || row.outcome === 'missing') return 'missing';
    if (row.outcome !== 'completed') return 'uncertain';
    if (!row.native_completed_at || !row.outbox_event_id) return 'uncertain';
    return { kind: 'completed', nativeCompletedAt: row.native_completed_at, outboxEventId: row.outbox_event_id };
  };
}

type ResolvedBindingRow = {
  binding_id: string; organization_id: string; environment: string; destination_binding_id: string;
  service_principal_user_id: string; job_instruction_creation_enabled: boolean;
  course_from_job_instruction_creation_enabled: boolean; principal_exists_in_auth: boolean;
  principal_exists_in_public: boolean; principal_organization_id: string; principal_role: string;
  principal_kind: string; interactive_login_allowed: boolean;
};

export function createPostgresHelixaGenerationBindingAuthority(client: GenerationRpcClient): HelixaGenerationBindingAuthority {
  return {
    async resolve(bindingId) {
      const result = await client.rpc<ResolvedBindingRow[]>('resolve_helixa_generation_binding', { p_binding_id: bindingId });
      if (result.error) throw new Error('Failed to resolve MegaCampus generation binding');
      const row = result.data?.[0];
      if (!row) return null;
      return {
        bindingId: row.binding_id, organizationId: row.organization_id,
        environment: row.environment, destinationBindingId: row.destination_binding_id,
        servicePrincipalUserId: row.service_principal_user_id,
        jobInstructionCreationEnabled: row.job_instruction_creation_enabled,
        courseFromJobInstructionCreationEnabled: row.course_from_job_instruction_creation_enabled,
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

type GenerationStatus = 'reserved' | 'scheduled' | 'executing' | 'native_completed' | 'action_required';
export interface HelixaGenerationRow {
  bindingId: string;
  commandId: string;
  commandHash: string;
  operation: HelixaGenerationOperation;
  payloadHash: string;
  proposalId: string;
  approvedRevision: number;
  objectKind: HelixaGenerationObjectKind;
  objectId: string;
  status: GenerationStatus;
  acceptedAt: string | null;
  updatedAt: string;
  claimGeneration: number;
  leaseToken: string | null;
  safeErrorCode?: string;
  outboxEventId?: string;
  nativeCompletedAt?: string;
}

export interface HelixaGenerationRepository {
  reserve(input: { binding: ResolvedHelixaGenerationBinding; command: HelixaGenerationCommand; commandHash: string; objectKind: HelixaGenerationObjectKind }): Promise<{ kind: 'conflict' } | { kind: 'reserved'; row: HelixaGenerationRow; mutationOwner: boolean }>;
  renew(input: { bindingId: string; commandId: string; objectId: string; leaseToken: string; claimGeneration: number }): Promise<boolean>;
  markScheduled(input: { bindingId: string; commandId: string; objectId: string; leaseToken: string; claimGeneration: number }): Promise<HelixaGenerationRow | null>;
  reconcileCompleted(input: { bindingId: string; commandId: string; objectId: string; leaseToken: string; claimGeneration: number; nativeCompletedAt: string; outboxEventId: string }): Promise<HelixaGenerationRow | null>;
  actionRequired(input: { bindingId: string; commandId: string; objectId: string; leaseToken: string; claimGeneration: number; safeErrorCode: string }): Promise<boolean>;
  claimScheduled?(input: { bindingId: string; commandId: string }): Promise<HelixaGenerationRow | null>;
  returnScheduled?(input: { bindingId: string; commandId: string; objectId: string; leaseToken: string; claimGeneration: number }): Promise<boolean>;
  failObserved?(input: { bindingId: string; commandId: string; objectId: string; leaseToken: string; claimGeneration: number }): Promise<boolean>;
  completeObserved?(input: { bindingId: string; commandId: string; objectId: string; leaseToken: string; claimGeneration: number; nativeCompletedAt: string; outboxEventId: string }): Promise<boolean>;
  lookup(bindingId: string, commandId: string): Promise<HelixaGenerationRow | null>;
}

type GenerationCommandRow = {
  command_id: string; command_hash: string; proposal_payload_hash: string;
  object_kind: HelixaGenerationObjectKind; object_id: string; status: GenerationStatus;
  accepted_at: string | null; updated_at: string; conflict?: boolean; mutation_owner?: boolean;
  lease_token: string | null; claim_generation: number; command_kind: HelixaGenerationOperation;
  proposal_id: string; approved_revision: number; safe_error_code?: string | null;
  native_completed_at?: string | null; outbox_event_id?: string | null;
};

function mapCommandRow(row: GenerationCommandRow, bindingId: string): HelixaGenerationRow {
  return {
    bindingId, commandId: row.command_id, commandHash: row.command_hash,
    operation: row.command_kind, payloadHash: row.proposal_payload_hash,
    proposalId: row.proposal_id, approvedRevision: row.approved_revision,
    objectKind: row.object_kind, objectId: row.object_id, status: row.status,
    acceptedAt: row.accepted_at, updatedAt: row.updated_at,
    claimGeneration: row.claim_generation, leaseToken: row.lease_token,
    ...(row.safe_error_code ? { safeErrorCode: row.safe_error_code } : {}),
    ...(row.native_completed_at ? { nativeCompletedAt: row.native_completed_at } : {}),
    ...(row.outbox_event_id ? { outboxEventId: row.outbox_event_id } : {}),
  };
}

export function createPostgresHelixaGenerationRepository(client: GenerationRpcClient): HelixaGenerationRepository {
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
      if (result.error || !result.data?.[0]) throw new Error('Failed to reserve MegaCampus generation command');
      const row = result.data[0];
      if (row.conflict) return { kind: 'conflict' };
      return { kind: 'reserved', row: mapCommandRow(row, input.binding.bindingId), mutationOwner: row.mutation_owner === true };
    },
    renew(input) {
      return booleanRpc('renew_helixa_generation_command', {
        p_binding_id: input.bindingId, p_command_id: input.commandId, p_object_id: input.objectId,
        p_lease_token: input.leaseToken, p_claim_generation: input.claimGeneration,
      }, 'Failed to renew MegaCampus generation lease');
    },
    async markScheduled(input) {
      const result = await client.rpc<GenerationCommandRow[]>('schedule_helixa_generation_command', {
        p_binding_id: input.bindingId, p_command_id: input.commandId, p_object_id: input.objectId,
        p_lease_token: input.leaseToken, p_claim_generation: input.claimGeneration,
      });
      if (result.error) throw new Error('Failed to schedule MegaCampus generation command');
      const row = result.data?.[0];
      return row ? mapCommandRow(row, input.bindingId) : null;
    },
    async reconcileCompleted(input) {
      const result = await client.rpc<GenerationCommandRow[]>('reconcile_completed_helixa_generation_command', {
        p_binding_id: input.bindingId, p_command_id: input.commandId, p_object_id: input.objectId,
        p_lease_token: input.leaseToken, p_claim_generation: input.claimGeneration,
        p_native_completed_at: input.nativeCompletedAt, p_outbox_event_id: input.outboxEventId,
      });
      if (result.error) throw new Error('Failed to reconcile MegaCampus generation completion');
      const row = result.data?.[0];
      return row ? mapCommandRow(row, input.bindingId) : null;
    },
    actionRequired(input) {
      return booleanRpc('action_required_helixa_generation_command', {
        p_binding_id: input.bindingId, p_command_id: input.commandId, p_object_id: input.objectId,
        p_safe_error_code: input.safeErrorCode, p_lease_token: input.leaseToken,
        p_claim_generation: input.claimGeneration,
      }, 'Failed to record MegaCampus generation failure');
    },
    async lookup(bindingId, commandId) {
      const result = await client.rpc<GenerationCommandRow[]>('lookup_helixa_generation_command', {
        p_binding_id: bindingId, p_command_id: commandId,
      });
      if (result.error) throw new Error('Failed to look up MegaCampus generation command');
      const row = result.data?.[0];
      return row ? mapCommandRow(row, bindingId) : null;
    },
    async claimScheduled(input) {
      const result = await client.rpc<GenerationCommandRow[]>('claim_scheduled_helixa_generation_command', {
        p_binding_id: input.bindingId, p_command_id: input.commandId,
      });
      if (result.error) throw new Error('Failed to claim scheduled MegaCampus generation command');
      const row = result.data?.[0];
      return row ? mapCommandRow(row, input.bindingId) : null;
    },
    returnScheduled(input) {
      return booleanRpc('return_scheduled_helixa_generation_command', {
        p_binding_id: input.bindingId, p_command_id: input.commandId, p_object_id: input.objectId,
        p_lease_token: input.leaseToken, p_claim_generation: input.claimGeneration,
      }, 'Failed to return MegaCampus generation command to scheduled');
    },
    failObserved(input) {
      return booleanRpc('fail_observed_helixa_generation_command', {
        p_binding_id: input.bindingId, p_command_id: input.commandId, p_object_id: input.objectId,
        p_lease_token: input.leaseToken, p_observation_generation: input.claimGeneration,
      }, 'Failed to record observed MegaCampus generation failure');
    },
    completeObserved(input) {
      return booleanRpc('complete_observed_helixa_generation_command', {
        p_binding_id: input.bindingId, p_command_id: input.commandId, p_object_id: input.objectId,
        p_lease_token: input.leaseToken, p_observation_generation: input.claimGeneration,
        p_native_completed_at: input.nativeCompletedAt, p_outbox_event_id: input.outboxEventId,
      }, 'Failed to record observed MegaCampus generation completion');
    },
  };
}

export interface HelixaGenerationNativePort {
  reconcile?(input: { binding: ResolvedHelixaGenerationBinding; command: HelixaGenerationCommand; objectKind: HelixaGenerationObjectKind; objectId: string }): Promise<'missing' | 'uncertain' | { kind: 'completed'; nativeCompletedAt: string; outboxEventId: string }>;
  schedule(input: {
    binding: ResolvedHelixaGenerationBinding;
    command: HelixaGenerationCommand;
    objectKind: HelixaGenerationObjectKind;
    objectId: string;
    servicePrincipalUserId: string;
    leaseToken: string;
    claimGeneration: number;
    jobInstruction?: Extract<HelixaGenerationCommand, { operation: 'CREATE_JOB_INSTRUCTION' }>['jobInstruction'];
    selectedSources?: Extract<HelixaGenerationCommand, { operation: 'CREATE_JOB_INSTRUCTION' }>['selectedSources'];
    course?: Extract<HelixaGenerationCommand, { operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' }>['course'];
    sourceJobInstruction?: Extract<HelixaGenerationCommand, { operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' }>['sourceJobInstruction'];
    includeWebResearch: false;
    includeBusinessContextSources: false;
  }): Promise<{ objectId: string }>;
  observe?(input: { binding: ResolvedHelixaGenerationBinding; objectKind: HelixaGenerationObjectKind; objectId: string }): Promise<
    'running' | 'succeeded_awaiting_signed_import' | { kind: 'completed'; nativeCompletedAt: string; outboxEventId: string } | { kind: 'failed' }
  >;
}

export interface HelixaGenerationNativeDependencies {
  scheduleRoleGuide(input: {
    playbookId: string; organizationId: string; userId: string;
    positionTitle: string; language: 'ru' | 'en';
    commandOwnedTextSource: string;
    selectedSources: ReadonlyArray<{ documentId: string; sourceRevisionHash: string; citationId: string }>;
    qAData: Record<string, unknown>;
  }): Promise<void>;
  scheduleCourseFromRoleGuide(input: {
    courseId: string; organizationId: string; userId: string;
    leaseToken: string; claimGeneration: number;
    course: Extract<HelixaGenerationCommand, { operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' }>['course'];
    sourceJobInstruction: Extract<HelixaGenerationCommand, { operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' }>['sourceJobInstruction'];
    originBindingId: string; originCommandId: string;
    includeWebResearch: false; includeBusinessContextSources: false;
  }): Promise<void>;
  reconcile(input: { objectKind: HelixaGenerationObjectKind; objectId: string; organizationId: string }): Promise<'missing' | 'uncertain' | { kind: 'completed'; nativeCompletedAt: string; outboxEventId: string }>;
  observe?(input: { objectKind: HelixaGenerationObjectKind; objectId: string; organizationId: string }): Promise<'running' | 'succeeded_awaiting_signed_import' | { kind: 'completed'; nativeCompletedAt: string; outboxEventId: string } | { kind: 'failed' }>;
}

export class HelixaGenerationPreMutationError extends Error {
  constructor(readonly safeErrorCode: 'megacampus_generation_service_principal_invalid' | 'megacampus_generation_source_unavailable' | 'megacampus_generation_source_stale' | 'megacampus_generation_native_failed') {
    super(safeErrorCode.replaceAll('_', ' '));
    this.name = 'HelixaGenerationPreMutationError';
  }
}

/** Internal native service. Its injected functions are lower-level persistence/queue seams, never interactive routers. */
export function createHelixaGenerationNativePort(dependencies: HelixaGenerationNativeDependencies): HelixaGenerationNativePort {
  return {
    reconcile(input) {
      return dependencies.reconcile({ objectKind: input.objectKind, objectId: input.objectId, organizationId: input.binding.organizationId });
    },
    observe(input) {
      return dependencies.observe?.({ objectKind: input.objectKind, objectId: input.objectId, organizationId: input.binding.organizationId }) ?? Promise.resolve('running');
    },
    async schedule(input) {
      if (input.command.operation === 'CREATE_JOB_INSTRUCTION') {
        const guide = input.command.jobInstruction;
        const commandOwnedTextSource = `# Business goal\n${guide.businessGoal}\n\n# Context\n${guide.context}`;
        await dependencies.scheduleRoleGuide({
          playbookId: input.objectId,
          organizationId: input.binding.organizationId,
          userId: input.servicePrincipalUserId,
          positionTitle: guide.roleTitle,
          language: guide.language,
          commandOwnedTextSource,
          selectedSources: input.command.selectedSources,
          qAData: {
            fixed: [
              { question_key: 'position', value: guide.roleTitle },
              { question_key: 'content_language', value: guide.language },
            ],
            followups: [], freeform: [],
            business_context: { mode: 'company_specific', status: 'ready', digest: commandOwnedTextSource, source_ids: [] },
            followup_questions: [], followup_generation_count: 0,
          },
        });
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
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('ROLE_GUIDE_SOURCE_UNAVAILABLE')) throw new HelixaGenerationPreMutationError('megacampus_generation_source_unavailable');
        if (message.includes('ROLE_GUIDE_SOURCE_STALE')) throw new HelixaGenerationPreMutationError('megacampus_generation_source_stale');
        if (message.includes('GENERATION_SERVICE_PRINCIPAL_INVALID')) throw new HelixaGenerationPreMutationError('megacampus_generation_service_principal_invalid');
        throw error;
      }
      return { objectId: input.objectId };
    },
  };
}

function assertBinding(binding: ResolvedHelixaGenerationBinding | null, command: HelixaGenerationCommand): asserts binding is ResolvedHelixaGenerationBinding {
  assertPrincipalBinding(binding);
  const enabled = command.operation === 'CREATE_JOB_INSTRUCTION'
    ? binding.jobInstructionCreationEnabled
    : binding.courseFromJobInstructionCreationEnabled;
  if (!enabled) throw new Error('MegaCampus generation binding unavailable');
}

function assertPrincipalBinding(binding: ResolvedHelixaGenerationBinding | null): asserts binding is ResolvedHelixaGenerationBinding {
  if (!binding) throw new Error('MegaCampus generation binding unavailable');
  const principal = binding.principal;
  if (!principal.existsInAuth || !principal.existsInPublic
    || principal.organizationId !== binding.organizationId
    || !['owner', 'admin', 'instructor'].includes(principal.role)
    || principal.kind !== 'service_principal'
    || principal.interactiveLoginAllowed) {
    throw new Error('MegaCampus generation service principal invalid');
  }
}

export function createInMemoryHelixaGenerationRepository(options: { objectId?: () => string; now?: () => Date } = {}): HelixaGenerationRepository {
  const rows = new Map<string, HelixaGenerationRow>();
  const objectId = options.objectId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const key = (bindingId: string, commandId: string) => `${bindingId}\u0000${commandId}`;
  return {
    // In-memory contract fake intentionally conforms to the async repository surface.
    // eslint-disable-next-line @typescript-eslint/require-await
    async reserve(input) {
      const existing = rows.get(key(input.binding.bindingId, input.command.commandId));
      if (existing) {
        if (existing.commandHash !== input.commandHash) return { kind: 'conflict' };
        return { kind: 'reserved', row: { ...existing }, mutationOwner: false };
      }
      const timestamp = now().toISOString();
      const row: HelixaGenerationRow = {
        bindingId: input.binding.bindingId,
        commandId: input.command.commandId,
        commandHash: input.commandHash,
        operation: input.command.operation,
        payloadHash: input.command.payloadHash,
        proposalId: input.command.proposalId,
        approvedRevision: input.command.approvedRevision,
        objectKind: input.objectKind,
        objectId: objectId(),
        status: 'reserved',
        acceptedAt: null,
        updatedAt: timestamp,
        claimGeneration: 1,
        leaseToken: randomUUID(),
      };
      rows.set(key(row.bindingId, row.commandId), row);
      return { kind: 'reserved', row: { ...row }, mutationOwner: true };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async renew(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      return Boolean(row && row.objectId === input.objectId && row.leaseToken === input.leaseToken && row.claimGeneration === input.claimGeneration && row.status === 'reserved');
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async markScheduled(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (!row || row.objectId !== input.objectId || row.leaseToken !== input.leaseToken || row.claimGeneration !== input.claimGeneration || row.status !== 'reserved') return null;
      const timestamp = now().toISOString();
      Object.assign(row, { status: 'scheduled' as const, acceptedAt: timestamp, updatedAt: timestamp, leaseToken: null });
      return { ...row };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async reconcileCompleted(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (!row || row.objectId !== input.objectId || row.leaseToken !== input.leaseToken || row.claimGeneration !== input.claimGeneration || !['reserved', 'executing'].includes(row.status)) return null;
      Object.assign(row, {
        status: 'native_completed' as const, nativeCompletedAt: input.nativeCompletedAt,
        outboxEventId: input.outboxEventId, leaseToken: null, acceptedAt: row.acceptedAt ?? now().toISOString(),
        updatedAt: now().toISOString(),
      });
      return { ...row };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async actionRequired(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (!row || row.objectId !== input.objectId || row.leaseToken !== input.leaseToken || row.claimGeneration !== input.claimGeneration) return false;
      Object.assign(row, { status: 'action_required' as const, safeErrorCode: input.safeErrorCode, leaseToken: null, updatedAt: now().toISOString() });
      return true;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async lookup(bindingId, commandId) {
      const row = rows.get(key(bindingId, commandId));
      return row ? { ...row } : null;
    },
    claimScheduled() { return Promise.resolve(null); },
    returnScheduled() { return Promise.resolve(false); },
  };
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
    operation: row.operation, commandId: row.commandId, payloadHash: row.payloadHash,
    state: 'native_completed' as const,
    object: { kind: row.objectKind, id: row.objectId },
    outboxEventId: row.outboxEventId!, nativeCompletedAt: row.nativeCompletedAt!,
  };
}

export async function dispatchHelixaGenerationCommand(input: {
  bindingLocator: { bindingId: string };
  command: unknown;
  mode: 'disabled' | 'fake';
  authority: HelixaGenerationBindingAuthority;
  repository: HelixaGenerationRepository;
  nativePort: HelixaGenerationNativePort;
}) {
  if (input.mode !== 'fake') throw new Error('MegaCampus generation is disabled');
  const command = parseHelixaGenerationCommand(input.command);
  const binding = await input.authority.resolve(input.bindingLocator.bindingId);
  assertBinding(binding, command);
  if (binding.bindingId !== input.bindingLocator.bindingId) throw new Error('MegaCampus generation binding unavailable');
  const objectKind = command.operation === 'CREATE_JOB_INSTRUCTION' ? 'ROLE_GUIDE' : 'COURSE';
  const reservation = await input.repository.reserve({ binding, command, commandHash: generationCommandHash(command), objectKind });
  if (reservation.kind === 'conflict') return {
    schemaVersion: 'helixa.megacampus-generation-result.v1' as const,
    operation: command.operation,
    commandId: command.commandId,
    payloadHash: command.payloadHash,
    state: 'conflict' as const,
    error: { code: 'megacampus_generation_command_conflict' as const, retryable: false as const },
  };
  if (reservation.row.status === 'scheduled') return accepted(reservation.row);
  if (reservation.row.status === 'native_completed') return accepted(reservation.row);
  if (reservation.row.status === 'action_required') throw new Error('MegaCampus generation requires operator action');
  if (!reservation.mutationOwner) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1));
      const replay = await input.repository.lookup(binding.bindingId, command.commandId);
      if (replay?.status === 'scheduled') return accepted(replay);
      if (replay?.status === 'native_completed') return accepted(replay);
      if (replay?.status === 'action_required') throw new Error('MegaCampus generation requires operator action');
    }
    throw new Error('MegaCampus generation is still reserving');
  }
  const row = reservation.row;
  if (row.leaseToken == null) throw new Error('MegaCampus generation reservation omitted lease');
  const fence = { bindingId: binding.bindingId, commandId: command.commandId, objectId: row.objectId, leaseToken: row.leaseToken, claimGeneration: row.claimGeneration };
  try {
    if (row.claimGeneration > 1) {
      const reconciliation = await input.nativePort.reconcile?.({ binding, command, objectKind, objectId: row.objectId }) ?? 'uncertain';
      if (typeof reconciliation === 'object' && reconciliation.kind === 'completed') {
        const completed = await input.repository.reconcileCompleted({ ...fence, nativeCompletedAt: reconciliation.nativeCompletedAt, outboxEventId: reconciliation.outboxEventId });
        if (!completed) throw new Error('MegaCampus generation lease lost during reconciliation');
        return nativeCompleted(completed);
      }
      if (reconciliation === 'uncertain') {
        const recorded = await input.repository.actionRequired({ ...fence, safeErrorCode: 'megacampus_generation_outcome_uncertain' });
        if (!recorded) throw new Error('MegaCampus generation lease lost during reconciliation');
        throw new Error('MegaCampus generation outcome uncertain');
      }
    }
    if (!(await input.repository.renew(fence))) throw new Error('MegaCampus generation lease lost before scheduling');
    const result = await input.nativePort.schedule({
      binding, command, objectKind, objectId: row.objectId,
      servicePrincipalUserId: binding.servicePrincipalUserId,
      leaseToken: row.leaseToken,
      claimGeneration: row.claimGeneration,
      ...(command.operation === 'CREATE_JOB_INSTRUCTION'
        ? { jobInstruction: command.jobInstruction, selectedSources: command.selectedSources }
        : { course: command.course, sourceJobInstruction: command.sourceJobInstruction }),
      includeWebResearch: false,
      includeBusinessContextSources: false,
    });
    if (result.objectId !== row.objectId) throw new Error('Native generation returned a different object ID');
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
  mode: 'disabled' | 'fake';
  authority: HelixaGenerationBindingAuthority;
  repository: HelixaGenerationRepository;
}) {
  if (input.mode !== 'fake') throw new Error('MegaCampus generation is disabled');
  const query = parseHelixaGenerationLookupQuery(input.query);
  const binding = await input.authority.resolve(input.bindingLocator.bindingId);
  assertPrincipalBinding(binding);
  if (binding.bindingId !== input.bindingLocator.bindingId) throw new Error('MegaCampus generation binding unavailable');
  const row = await input.repository.lookup(binding.bindingId, query.commandId);
  const common = {
    schemaVersion: 'helixa.megacampus-generation-result.v1' as const,
    commandId: query.commandId, payloadHash: query.payloadHash,
  };
  if (!row) return { ...common, state: 'not_found' as const };
  if (row.payloadHash !== query.payloadHash) return {
    ...common, state: 'conflict' as const,
    error: { code: 'megacampus_generation_command_conflict' as const, retryable: false as const },
  };
  if (row.status === 'native_completed') return nativeCompleted(row);
  if (row.status === 'action_required') return {
    ...common, operation: row.operation, state: 'action_required' as const,
    object: { kind: row.objectKind, id: row.objectId },
    error: { code: row.safeErrorCode!, retryable: false as const },
  };
  return {
    ...common, operation: row.operation,
    state: row.status === 'scheduled' ? 'scheduled' as const : 'executing' as const,
    object: { kind: row.objectKind, id: row.objectId }, updatedAt: row.updatedAt,
  };
}

export async function observeHelixaScheduledGenerationCommand(input: {
  bindingLocator: { bindingId: string };
  commandId: string;
  mode: 'disabled' | 'fake';
  authority: HelixaGenerationBindingAuthority;
  repository: HelixaGenerationRepository;
  nativePort: HelixaGenerationNativePort;
}): Promise<'not_found' | 'busy' | 'scheduled' | 'native_completed' | 'action_required'> {
  if (input.mode !== 'fake') throw new Error('MegaCampus generation is disabled');
  const binding = await input.authority.resolve(input.bindingLocator.bindingId);
  assertPrincipalBinding(binding);
  if (binding.bindingId !== input.bindingLocator.bindingId) throw new Error('MegaCampus generation binding unavailable');
  if (!input.repository.claimScheduled || !input.repository.returnScheduled || !input.repository.failObserved
    || !input.repository.completeObserved || !input.nativePort.observe) {
    throw new Error('MegaCampus generation observer unavailable');
  }
  const row = await input.repository.claimScheduled({ bindingId: binding.bindingId, commandId: input.commandId });
  if (!row) {
    const current = await input.repository.lookup(binding.bindingId, input.commandId);
    if (!current) return 'not_found';
    if (current.status === 'native_completed') return 'native_completed';
    if (current.status === 'action_required') return 'action_required';
    return 'busy';
  }
  if (!row.leaseToken) throw new Error('MegaCampus generation observer claim omitted lease');
  const fence = {
    bindingId: binding.bindingId, commandId: row.commandId, objectId: row.objectId,
    leaseToken: row.leaseToken, claimGeneration: row.claimGeneration,
  };
  const observed = await input.nativePort.observe({ binding, objectKind: row.objectKind, objectId: row.objectId });
  if (typeof observed === 'object' && observed.kind === 'failed') {
    if (!await input.repository.failObserved(fence)) {
      throw new Error('MegaCampus generation observer lease lost');
    }
    return 'action_required';
  }
  if (typeof observed === 'object' && observed.kind === 'completed') {
    const completed = await input.repository.completeObserved({
      ...fence, nativeCompletedAt: observed.nativeCompletedAt, outboxEventId: observed.outboxEventId,
    });
    if (!completed) throw new Error('MegaCampus generation observer lease lost');
    return 'native_completed';
  }
  if (!await input.repository.returnScheduled(fence)) throw new Error('MegaCampus generation observer lease lost');
  return 'scheduled';
}
