// Split out of `generation-commands.ts` on 2026-09-05. Prettier reformatting the
// densely-authored original took it from 854 to 1258 lines, past the repository's
// 800-line `max-lines` rule, so the file that had only ever been lint-clean because
// it was unformatted had to become several files that are both. Nothing here changed
// behaviour: these are the original declarations, moved. `generation-commands.ts`
// re-exports every one of them, so no import anywhere else had to change.

import type {
  HelixaGenerationCommand,
  HelixaGenerationObjectKind,
  HelixaGenerationOperation,
} from './generation-command-schema';

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
  rpc<T>(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ data: T | null; error: { message: string } | null }>;
}

export type GenerationStatus =
  | 'reserved'
  | 'scheduled'
  | 'executing'
  | 'native_completed'
  | 'action_required';
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
  reserve(input: {
    binding: ResolvedHelixaGenerationBinding;
    command: HelixaGenerationCommand;
    commandHash: string;
    objectKind: HelixaGenerationObjectKind;
  }): Promise<
    { kind: 'conflict' } | { kind: 'reserved'; row: HelixaGenerationRow; mutationOwner: boolean }
  >;
  renew(input: {
    bindingId: string;
    commandId: string;
    objectId: string;
    leaseToken: string;
    claimGeneration: number;
  }): Promise<boolean>;
  markScheduled(input: {
    bindingId: string;
    commandId: string;
    objectId: string;
    leaseToken: string;
    claimGeneration: number;
  }): Promise<HelixaGenerationRow | null>;
  reconcileCompleted(input: {
    bindingId: string;
    commandId: string;
    objectId: string;
    leaseToken: string;
    claimGeneration: number;
    nativeCompletedAt: string;
    outboxEventId: string;
  }): Promise<HelixaGenerationRow | null>;
  actionRequired(input: {
    bindingId: string;
    commandId: string;
    objectId: string;
    leaseToken: string;
    claimGeneration: number;
    safeErrorCode: string;
  }): Promise<boolean>;
  claimScheduled?(input: {
    bindingId: string;
    commandId: string;
  }): Promise<HelixaGenerationRow | null>;
  returnScheduled?(input: {
    bindingId: string;
    commandId: string;
    objectId: string;
    leaseToken: string;
    claimGeneration: number;
  }): Promise<boolean>;
  failObserved?(input: {
    bindingId: string;
    commandId: string;
    objectId: string;
    leaseToken: string;
    claimGeneration: number;
  }): Promise<boolean>;
  completeObserved?(input: {
    bindingId: string;
    commandId: string;
    objectId: string;
    leaseToken: string;
    claimGeneration: number;
    nativeCompletedAt: string;
    outboxEventId: string;
  }): Promise<boolean>;
  lookup(bindingId: string, commandId: string): Promise<HelixaGenerationRow | null>;
}

export interface HelixaGenerationNativePort {
  reconcile?(input: {
    binding: ResolvedHelixaGenerationBinding;
    command: HelixaGenerationCommand;
    objectKind: HelixaGenerationObjectKind;
    objectId: string;
  }): Promise<
    | 'missing'
    | 'uncertain'
    | { kind: 'completed'; nativeCompletedAt: string; outboxEventId: string }
  >;
  schedule(input: {
    binding: ResolvedHelixaGenerationBinding;
    command: HelixaGenerationCommand;
    objectKind: HelixaGenerationObjectKind;
    objectId: string;
    servicePrincipalUserId: string;
    leaseToken: string;
    claimGeneration: number;
    jobInstruction?: Extract<
      HelixaGenerationCommand,
      { operation: 'CREATE_JOB_INSTRUCTION' }
    >['jobInstruction'];
    selectedSources?: Extract<
      HelixaGenerationCommand,
      { operation: 'CREATE_JOB_INSTRUCTION' }
    >['selectedSources'];
    course?: Extract<
      HelixaGenerationCommand,
      { operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' }
    >['course'];
    sourceJobInstruction?: Extract<
      HelixaGenerationCommand,
      { operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' }
    >['sourceJobInstruction'];
    includeWebResearch: false;
    includeBusinessContextSources: false;
  }): Promise<{ objectId: string }>;
  observe?(input: {
    binding: ResolvedHelixaGenerationBinding;
    objectKind: HelixaGenerationObjectKind;
    objectId: string;
  }): Promise<
    | 'running'
    | 'succeeded_awaiting_signed_import'
    | { kind: 'completed'; nativeCompletedAt: string; outboxEventId: string }
    | { kind: 'failed' }
  >;
}

export interface HelixaGenerationNativeDependencies {
  scheduleRoleGuide(input: {
    playbookId: string;
    organizationId: string;
    userId: string;
    positionTitle: string;
    language: 'ru' | 'en';
    commandOwnedTextSource: string;
    selectedSources: ReadonlyArray<{
      documentId: string;
      sourceRevisionHash: string;
      citationId: string;
    }>;
    qAData: Record<string, unknown>;
  }): Promise<void>;
  scheduleCourseFromRoleGuide(input: {
    courseId: string;
    organizationId: string;
    userId: string;
    leaseToken: string;
    claimGeneration: number;
    course: Extract<
      HelixaGenerationCommand,
      { operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' }
    >['course'];
    sourceJobInstruction: Extract<
      HelixaGenerationCommand,
      { operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' }
    >['sourceJobInstruction'];
    originBindingId: string;
    originCommandId: string;
    includeWebResearch: false;
    includeBusinessContextSources: false;
  }): Promise<void>;
  reconcile(input: {
    objectKind: HelixaGenerationObjectKind;
    objectId: string;
    organizationId: string;
  }): Promise<
    | 'missing'
    | 'uncertain'
    | { kind: 'completed'; nativeCompletedAt: string; outboxEventId: string }
  >;
  observe?(input: {
    objectKind: HelixaGenerationObjectKind;
    objectId: string;
    organizationId: string;
  }): Promise<
    | 'running'
    | 'succeeded_awaiting_signed_import'
    | { kind: 'completed'; nativeCompletedAt: string; outboxEventId: string }
    | { kind: 'failed' }
  >;
}
