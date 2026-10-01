import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { getUploadStorageRootPath } from '@/stages/stage1-document-upload/storage-paths';

import type {
  KnowledgeObjectKind,
  KnowledgeManifestObject,
  KnowledgeManifestResendObject,
  KnowledgeSyncV2IntentEventType,
  KnowledgeRetractionReason,
} from './contract';
import type { KnowledgeSyncOutboxEntry, KnowledgeSyncOutboxRepository } from './outbox';
import {
  bindAcceptedCourseSources,
  mapCompletedCourse,
  mapCompletedRoleGuide,
  mapPinnedKnowledgeSnapshot,
  parseAcceptedCourseSourceManifest,
  type CourseJobInstructionSourceRow,
  type GenerationOriginRow,
  type PinnedKnowledgeSnapshot,
} from './snapshot-loader';
import {
  createCourseSourceReader,
  createUploadStorageReader,
  type CourseNativeSourceProofRow,
} from './storage-reader';
import type { CompletedObject, ReconcileRepository } from './reconciler';
import { isKnowledgeSyncContractV2Enabled } from './scheduler';
import { KnowledgeSyncPreparationError } from './errors';

export { isKnowledgeSyncContractV2Enabled } from './scheduler';

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
}
interface QueryBuilder<T = unknown> extends PromiseLike<QueryResult<T>> {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  is(column: string, value: null): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(value: number): QueryBuilder<T>;
  single(): Promise<QueryResult<T>>;
  maybeSingle(): Promise<QueryResult<T>>;
  insert(values: unknown, options?: { count?: 'exact' }): QueryBuilder<T>;
  update(values: unknown): QueryBuilder<T>;
}
interface RuntimeClient {
  from<T = unknown>(table: string): QueryBuilder<T>;
  rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<QueryResult<T>>;
}

function client(): RuntimeClient {
  return getSupabaseAdmin() as unknown as RuntimeClient;
}
function expectData<T>(result: QueryResult<T>, label: string): T {
  if (result.error || result.data == null)
    throw new Error(`${label}: ${result.error?.message ?? 'not found'}`);
  return result.data;
}

type OutboxRow = {
  id: string;
  event_id: string;
  object_kind: KnowledgeObjectKind;
  object_id: string;
  organization_id: string;
  completed_at: string;
  raw_body_base64: string | null;
  attempts: number;
  lease_token: string;
  binding_id: string;
  event_type?: KnowledgeSyncV2IntentEventType;
  revision?: number;
  retraction_reason?: KnowledgeRetractionReason | null;
  content_hash?: string | null;
  created_at?: string;
  snapshot?: PinnedKnowledgeSnapshot | null;
};

function bindingParameters(binding: KnowledgeSyncBindingConfig): Record<string, unknown> {
  return {
    p_binding_id: binding.bindingId,
    p_organization_id: binding.organizationId,
    p_environment: binding.environment,
    p_destination_binding_id: binding.destinationBindingId,
  };
}

export async function synchronizeKnowledgeSyncCaptureGate(
  binding: KnowledgeSyncBindingConfig
): Promise<void> {
  const result = await client().rpc<boolean>('set_helixa_knowledge_sync_v2_enabled', {
    ...bindingParameters(binding),
    p_enabled: binding.contractV2 === true,
  });
  // V1 must work during rollout before the new migration is installed. Only
  // a missing RPC is compatible; an installed gate/authority failure stops claims.
  if (
    binding.contractV2 !== true &&
    result.error &&
    (result.error.code === 'PGRST202' || result.error.code === '42883')
  )
    return;
  if (result.error) throw new Error('Failed to configure Helixa knowledge sync capture mode');
}

function mapOutboxRow(row: OutboxRow, contractVersion: 1 | 2): KnowledgeSyncOutboxEntry {
  return {
    id: row.id,
    eventId: row.event_id,
    objectKind: row.object_kind,
    objectId: row.object_id,
    organizationId: row.organization_id,
    completedAt: row.completed_at,
    rawBody: row.raw_body_base64 ? Buffer.from(row.raw_body_base64, 'base64') : null,
    attempts: row.attempts,
    leaseToken: row.lease_token,
    bindingId: row.binding_id,
    contractVersion,
    ...(contractVersion === 2
      ? {
          eventType: row.event_type,
          revision: row.revision,
          retractionReason: row.retraction_reason,
          contentHash: row.content_hash,
          createdAt: row.created_at,
          snapshot: row.snapshot,
        }
      : {}),
  };
}

export async function claimKnowledgeSyncOutbox(
  binding: KnowledgeSyncRuntimeConfig,
  batchSize = 10
): Promise<KnowledgeSyncOutboxEntry[]> {
  await synchronizeKnowledgeSyncCaptureGate(binding);
  // V1 is revisionless: keep its durable backlog paused throughout V2 mode.
  // It can drain unchanged only after an explicit switch back to V1.
  const contractVersion = binding.contractV2 === true ? 2 : 1;
  const rows = expectData(
    await client().rpc<OutboxRow[]>(
      contractVersion === 2
        ? 'claim_helixa_knowledge_sync_v2_outbox'
        : 'claim_helixa_knowledge_sync_outbox',
      { ...bindingParameters(binding), p_batch_size: batchSize }
    ),
    contractVersion === 2
      ? 'Failed to claim Helixa knowledge v2 outbox'
      : 'Failed to claim Helixa knowledge outbox'
  );
  return rows.map(row => mapOutboxRow(row, contractVersion));
}

export function createKnowledgeSyncOutboxRepository(): KnowledgeSyncOutboxRepository {
  return {
    async persistRawBodyOnce(id, leaseToken, rawBody, payloadHash) {
      const result = await client().rpc<string>('freeze_helixa_knowledge_sync_payload', {
        p_id: id,
        p_lease_token: leaseToken,
        p_raw_body_utf8: rawBody.toString('utf8'),
        p_payload_hash: payloadHash,
      });
      if (result.error) throw new Error('Failed to freeze Helixa payload');
      return result.data == null ? null : Buffer.from(result.data, 'base64');
    },
    async markDelivered(id, leaseToken) {
      const result = await client().rpc<boolean>('transition_helixa_knowledge_sync_outbox', {
        p_id: id,
        p_lease_token: leaseToken,
        p_action: 'delivered',
        p_next_attempt_at: null,
        p_error: null,
      });
      if (result.error) throw new Error('Failed to mark Helixa delivery');
      return result.data === true;
    },
    async reschedule(id, leaseToken, nextAttemptAt, error) {
      const result = await client().rpc<boolean>('transition_helixa_knowledge_sync_outbox', {
        p_id: id,
        p_lease_token: leaseToken,
        p_action: 'retryable',
        p_next_attempt_at: nextAttemptAt.toISOString(),
        p_error: error,
      });
      if (result.error) throw new Error('Failed to reschedule Helixa delivery');
      return result.data === true;
    },
    async markTerminal(id, leaseToken, error) {
      const result = await client().rpc<boolean>('transition_helixa_knowledge_sync_outbox', {
        p_id: id,
        p_lease_token: leaseToken,
        p_action: 'action_required',
        p_next_attempt_at: null,
        p_error: error,
      });
      if (result.error) throw new Error('Failed to record Helixa refusal');
      return result.data === true;
    },
  };
}

export async function loadKnowledgeSnapshot(
  entry: Pick<
    KnowledgeSyncOutboxEntry,
    'objectKind' | 'objectId' | 'organizationId' | 'completedAt' | 'bindingId'
  > &
    Partial<Pick<KnowledgeSyncOutboxEntry, 'contractVersion' | 'snapshot'>>
) {
  const readUploadBytes = createUploadStorageReader(getUploadStorageRootPath());
  if (entry.contractVersion === 2) {
    if (!entry.snapshot) throw new KnowledgeSyncPreparationError('contract', false);
    const readBytes =
      entry.objectKind === 'COURSE'
        ? createCourseSourceReader({
            courseId: entry.objectId,
            organizationId: entry.organizationId,
            jobInstructionSource: entry.snapshot._jobInstructionSource ?? null,
            nativeSources: (entry.snapshot.sources ?? []).flatMap(source =>
              source._nativeProof ? [source._nativeProof] : []
            ),
            readUploadBytes,
          })
        : readUploadBytes;
    return mapPinnedKnowledgeSnapshot(
      entry.snapshot,
      {
        kind: entry.objectKind,
        id: entry.objectId,
        organizationId: entry.organizationId,
        bindingId: entry.bindingId,
      },
      readBytes
    );
  }
  const db = client();
  const originResult = await db
    .from<GenerationOriginRow>('helixa_generation_commands')
    .select(
      'binding_id, command_id, command_kind, proposal_id, approved_revision, proposal_payload_hash, object_kind, object_id, organization_id, status'
    )
    .eq('binding_id', entry.bindingId)
    .eq('object_kind', entry.objectKind)
    .eq('object_id', entry.objectId)
    .eq('organization_id', entry.organizationId)
    .eq('status', 'native_completed')
    .maybeSingle();
  if (originResult.error)
    throw new Error(`Failed to load Helixa generation origin: ${originResult.error.message}`);
  if (entry.objectKind === 'COURSE') {
    const course = expectData(
      await db
        .from('courses')
        .select(
          'id, organization_id, generation_status, generation_completed_at, title, language, course_structure, course_description, slug'
        )
        .eq('id', entry.objectId)
        .eq('organization_id', entry.organizationId)
        .single(),
      'Failed to load completed Course'
    );
    const lessons = expectData(
      await db
        .from('lesson_contents')
        .select('lesson_id, status, content, metadata')
        .eq('course_id', entry.objectId),
      'Failed to load Course lesson content'
    );
    const relationResult = await db
      .from<CourseJobInstructionSourceRow>('course_job_instruction_sources')
      .select(
        'course_id, organization_id, job_instruction_id, source_version, source_content_hash, origin_binding_id, origin_command_id'
      )
      .eq('course_id', entry.objectId)
      .eq('organization_id', entry.organizationId)
      .maybeSingle();
    if (relationResult.error)
      throw new Error(
        `Failed to load Course Job Instruction source: ${relationResult.error.message}`
      );
    const isDirectCourse = originResult.data?.command_kind === 'CREATE_COURSE';
    let approvedFiles: Array<{ id: string; hash: string }> = [];
    let nativeSources: CourseNativeSourceProofRow[] = [];
    if (!isDirectCourse) {
      const acceptedRunResult = await db
        .from<{
          source_manifest: Array<{
            document_id: string;
            source_version_hash: string;
            document_name: string;
          }>;
        }>('document_evidence_runs')
        .select('source_manifest')
        .eq('course_id', entry.objectId)
        .eq('organization_id', entry.organizationId)
        .eq('status', 'accepted')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (acceptedRunResult.error)
        throw new Error(
          `Failed to load accepted Course provenance: ${acceptedRunResult.error.message}`
        );
      const manifest = parseAcceptedCourseSourceManifest(acceptedRunResult.data?.source_manifest);
      const sourceIds = manifest.map((item: { document_id: string }) => item.document_id);
      const files =
        sourceIds.length === 0
          ? []
          : expectData(
              await db
                .from('file_catalog')
                .select(
                  'id, organization_id, course_id, filename, mime_type, hash, storage_path, markdown_content, processed_content, parsed_content, summary_metadata'
                )
                .in('id', sourceIds)
                .eq('organization_id', entry.organizationId)
                .eq('course_id', entry.objectId),
              'Failed to load approved Course sources'
            );
      approvedFiles = bindAcceptedCourseSources(
        manifest,
        files as Array<{ id: string; hash: string }>
      );
      nativeSources =
        sourceIds.length === 0
          ? []
          : expectData(
              await db
                .from<CourseNativeSourceProofRow[]>('course_job_instruction_native_sources')
                .select(
                  'course_id, organization_id, file_catalog_id, source_canonical_content, source_content_hash'
                )
                .eq('course_id', entry.objectId)
                .eq('organization_id', entry.organizationId)
                .in('file_catalog_id', sourceIds),
              'Failed to load governed Course native sources'
            );
    }
    const readBytes = createCourseSourceReader({
      courseId: entry.objectId,
      organizationId: entry.organizationId,
      jobInstructionSource: relationResult.data,
      nativeSources,
      readUploadBytes,
    });
    return mapCompletedCourse({
      course: course as never,
      lessonContents: lessons as never[],
      files: approvedFiles as never[],
      readBytes,
      generationOrigin: originResult.data,
      jobInstructionSource: relationResult.data,
    });
  }
  const playbook = expectData(
    await db
      .from('career_playbooks')
      .select(
        'id, organization_id, status, completed_at, position_title, language, final_markdown, role_profile_spec, generated_blocks'
      )
      .eq('id', entry.objectId)
      .eq('organization_id', entry.organizationId)
      .single(),
    'Failed to load completed Role Guide'
  );
  const sources = expectData(
    await db
      .from('career_playbook_sources')
      .select(
        'id, playbook_id, organization_id, source_type, status, filename, text, file:file_catalog(id, organization_id, course_id, filename, mime_type, hash, storage_path, markdown_content, parsed_content)'
      )
      .eq('playbook_id', entry.objectId)
      .eq('organization_id', entry.organizationId)
      .eq('status', 'ready'),
    'Failed to load Role Guide sources'
  );
  return mapCompletedRoleGuide({
    playbook: playbook as never,
    sources: sources as never[],
    readBytes: readUploadBytes,
    generationOrigin: originResult.data,
  });
}

export function createSupabaseReconcileRepository(
  binding: KnowledgeSyncRuntimeConfig
): ReconcileRepository {
  return {
    async listCompleted() {
      const db = client();
      const courses = expectData(
        await db
          .from<
            Array<{ id: string; organization_id: string; generation_completed_at: string }>
          >('courses')
          .select('id, organization_id, generation_completed_at')
          .eq('generation_status', 'completed')
          .eq('organization_id', binding.organizationId),
        'Failed to list completed Courses'
      );
      const guides = expectData(
        await db
          .from<
            Array<{ id: string; organization_id: string; completed_at: string }>
          >('career_playbooks')
          .select('id, organization_id, completed_at')
          .eq('status', 'completed')
          .eq('organization_id', binding.organizationId),
        'Failed to list completed Role Guides'
      );
      return [
        ...courses
          .filter(row => row.generation_completed_at)
          .map(row => ({
            kind: 'COURSE' as const,
            id: row.id,
            organizationId: row.organization_id,
            completedAt: row.generation_completed_at,
          })),
        ...guides
          .filter(row => row.completed_at)
          .map(row => ({
            kind: 'ROLE_GUIDE' as const,
            id: row.id,
            organizationId: row.organization_id,
            completedAt: row.completed_at,
          })),
      ];
    },
    async insertMissing(intents: Array<CompletedObject & { eventId: string }>) {
      if (intents.length === 0) return 0;
      const rows = intents.map(intent => ({
        event_id: intent.eventId,
        object_kind: intent.kind,
        object_id: intent.id,
        organization_id: intent.organizationId,
        completed_at: intent.completedAt,
      }));
      let inserted = 0;
      for (const row of rows) {
        const result = await client().rpc<boolean>('reconcile_helixa_knowledge_sync_intent', {
          p_event_id: row.event_id,
          p_object_kind: row.object_kind,
          p_object_id: row.object_id,
          p_organization_id: row.organization_id,
          p_completed_at: row.completed_at,
          p_binding_id: binding.bindingId,
          p_environment: binding.environment,
          p_destination_binding_id: binding.destinationBindingId,
        });
        if (result.error)
          throw new Error(`Failed to reconcile Helixa intent: ${result.error.message}`);
        if (result.data) inserted += 1;
      }
      return inserted;
    },
  };
}

export interface KnowledgeSyncBindingConfig {
  environment: string;
  bindingId: string;
  organizationId: string;
  destinationBindingId: string;
  contractV2?: boolean;
}

export interface KnowledgeSyncRuntimeConfig extends KnowledgeSyncBindingConfig {
  endpoint: string;
  hmacKey: string;
  externalSystemId: string;
  externalProjectId: string | null;
}

export function readKnowledgeSyncBindingConfig(
  environment: NodeJS.ProcessEnv = process.env
): KnowledgeSyncBindingConfig {
  const bindingId = environment.HELIXA_KNOWLEDGE_SYNC_BINDING_ID;
  const organizationId = environment.HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID;
  const destinationBindingId = environment.HELIXA_DESTINATION_BINDING_ID;
  if (!bindingId || !organizationId || !destinationBindingId)
    throw new Error('Helixa knowledge sync binding configuration is incomplete');
  return {
    bindingId,
    organizationId,
    destinationBindingId,
    environment:
      environment.HELIXA_KNOWLEDGE_SYNC_ENVIRONMENT ??
      environment.APP_ENV ??
      environment.NODE_ENV ??
      'development',
    ...(isKnowledgeSyncContractV2Enabled(environment) ? { contractV2: true } : {}),
  };
}

export function readKnowledgeSyncRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env
): KnowledgeSyncRuntimeConfig {
  const endpoint = environment.HELIXA_KNOWLEDGE_SYNC_ENDPOINT;
  const hmacKey = environment.HELIXA_KNOWLEDGE_SYNC_HMAC_KEY;
  const externalSystemId = environment.HELIXA_EXTERNAL_SYSTEM_ID;
  if (!endpoint || !hmacKey || !externalSystemId)
    throw new Error('Helixa knowledge sync configuration is incomplete');
  return {
    endpoint,
    hmacKey,
    externalSystemId,
    ...readKnowledgeSyncBindingConfig(environment),
    externalProjectId: environment.HELIXA_DESTINATION_PROJECT_ID ?? null,
  };
}

/** One JSON array from one SQL statement, unaffected by PostgREST's table row cap. */
export async function loadKnowledgeSyncManifestInventory(
  binding: KnowledgeSyncRuntimeConfig
): Promise<KnowledgeManifestObject[]> {
  return expectData(
    await client().rpc<KnowledgeManifestObject[]>(
      'get_helixa_knowledge_sync_manifest',
      bindingParameters(binding)
    ),
    'Failed to load current Helixa knowledge manifest'
  );
}

export async function enqueueKnowledgeSyncManifestResend(
  binding: KnowledgeSyncRuntimeConfig,
  objects: KnowledgeManifestResendObject[]
): Promise<number> {
  return expectData(
    await client().rpc<number>('enqueue_helixa_knowledge_sync_v2_resend', {
      ...bindingParameters(binding),
      p_objects: objects,
    }),
    'Failed to enqueue current Helixa knowledge resend'
  );
}

export interface KnowledgeSyncV2ReconcileResult {
  missing: number;
  inserted: number;
  applied: boolean;
}

export async function runSupabaseKnowledgeSyncV2Reconciler(
  binding: KnowledgeSyncRuntimeConfig,
  apply = false
): Promise<KnowledgeSyncV2ReconcileResult> {
  return expectData(
    await client().rpc<KnowledgeSyncV2ReconcileResult>('reconcile_helixa_knowledge_sync_v2', {
      ...bindingParameters(binding),
      p_apply: apply,
    }),
    'Failed to reconcile current Helixa v2 knowledge'
  );
}

export async function resetKnowledgeSyncIntent(
  binding: KnowledgeSyncRuntimeConfig,
  eventId: string
): Promise<boolean> {
  const result = await client().rpc<boolean>('reset_helixa_knowledge_sync_intent', {
    p_binding_id: binding.bindingId,
    p_organization_id: binding.organizationId,
    p_environment: binding.environment,
    p_destination_binding_id: binding.destinationBindingId,
    p_event_id: eventId,
  });
  if (result.error) throw new Error('Failed to reset Helixa knowledge sync intent');
  return result.data === true;
}
