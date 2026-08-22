import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { getUploadStorageRootPath } from '@/stages/stage1-document-upload/storage-paths';

import type { KnowledgeObjectKind } from './contract';
import type { KnowledgeSyncOutboxEntry, KnowledgeSyncOutboxRepository } from './outbox';
import { bindAcceptedCourseSources, mapCompletedCourse, mapCompletedRoleGuide, parseAcceptedCourseSourceManifest } from './snapshot-loader';
import { createUploadStorageReader } from './storage-reader';
import type { CompletedObject, ReconcileRepository } from './reconciler';

interface QueryResult<T> { data: T | null; error: { message: string } | null; count?: number | null }
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

function client(): RuntimeClient { return getSupabaseAdmin() as unknown as RuntimeClient; }
function expectData<T>(result: QueryResult<T>, label: string): T {
  if (result.error || result.data == null) throw new Error(`${label}: ${result.error?.message ?? 'not found'}`);
  return result.data;
}

type OutboxRow = {
  id: string; event_id: string; object_kind: KnowledgeObjectKind; object_id: string; organization_id: string;
  completed_at: string; raw_body_base64: string | null; attempts: number; lease_token: string; binding_id: string;
};

export async function claimKnowledgeSyncOutbox(binding: KnowledgeSyncRuntimeConfig, batchSize = 10): Promise<KnowledgeSyncOutboxEntry[]> {
  const rows = expectData(await client().rpc<OutboxRow[]>('claim_helixa_knowledge_sync_outbox', {
    p_binding_id: binding.bindingId, p_organization_id: binding.organizationId,
    p_environment: binding.environment, p_destination_binding_id: binding.destinationBindingId,
    p_batch_size: batchSize,
  }), 'Failed to claim Helixa knowledge outbox');
  return rows.map(row => ({ id: row.id, eventId: row.event_id, objectKind: row.object_kind, objectId: row.object_id, organizationId: row.organization_id, completedAt: row.completed_at, rawBody: row.raw_body_base64 ? Buffer.from(row.raw_body_base64, 'base64') : null, attempts: row.attempts, leaseToken: row.lease_token, bindingId: row.binding_id }));
}

export function createKnowledgeSyncOutboxRepository(): KnowledgeSyncOutboxRepository {
  return {
    async persistRawBodyOnce(id, leaseToken, rawBody, payloadHash) {
      const result = await client().rpc<string>('freeze_helixa_knowledge_sync_payload', { p_id: id, p_lease_token: leaseToken, p_raw_body_utf8: rawBody.toString('utf8'), p_payload_hash: payloadHash });
      if (result.error) throw new Error('Failed to freeze Helixa payload');
      return result.data == null ? null : Buffer.from(result.data, 'base64');
    },
    async markDelivered(id, leaseToken) {
      const result = await client().rpc<boolean>('transition_helixa_knowledge_sync_outbox', { p_id: id, p_lease_token: leaseToken, p_action: 'delivered', p_next_attempt_at: null, p_error: null });
      if (result.error) throw new Error('Failed to mark Helixa delivery');
      return result.data === true;
    },
    async reschedule(id, leaseToken, nextAttemptAt, error) {
      const result = await client().rpc<boolean>('transition_helixa_knowledge_sync_outbox', { p_id: id, p_lease_token: leaseToken, p_action: 'retryable', p_next_attempt_at: nextAttemptAt.toISOString(), p_error: error });
      if (result.error) throw new Error('Failed to reschedule Helixa delivery');
      return result.data === true;
    },
    async markTerminal(id, leaseToken, error) {
      const result = await client().rpc<boolean>('transition_helixa_knowledge_sync_outbox', { p_id: id, p_lease_token: leaseToken, p_action: 'action_required', p_next_attempt_at: null, p_error: error });
      if (result.error) throw new Error('Failed to record Helixa refusal');
      return result.data === true;
    },
  };
}

export async function loadKnowledgeSnapshot(entry: Pick<KnowledgeSyncOutboxEntry, 'objectKind' | 'objectId' | 'organizationId' | 'completedAt'>) {
  const db = client();
  const readBytes = createUploadStorageReader(getUploadStorageRootPath());
  if (entry.objectKind === 'COURSE') {
    const course = expectData(await db.from('courses').select('id, organization_id, generation_status, generation_completed_at, title, language, course_structure, course_description, slug').eq('id', entry.objectId).eq('organization_id', entry.organizationId).single(), 'Failed to load completed Course');
    const lessons = expectData(await db.from('lesson_contents').select('lesson_id, status, content, metadata').eq('course_id', entry.objectId), 'Failed to load Course lesson content');
    const acceptedRunResult = await db.from<{ source_manifest: Array<{ document_id: string; source_version_hash: string; document_name: string }> }>('document_evidence_runs').select('source_manifest').eq('course_id', entry.objectId).eq('organization_id', entry.organizationId).eq('status', 'accepted').order('completed_at', { ascending: false }).limit(1).maybeSingle();
    if (acceptedRunResult.error) throw new Error(`Failed to load accepted Course provenance: ${acceptedRunResult.error.message}`);
    const manifest = parseAcceptedCourseSourceManifest(acceptedRunResult.data?.source_manifest);
    const sourceIds = manifest.map(item => item.document_id);
    const files = sourceIds.length === 0 ? [] : expectData(await db.from('file_catalog').select('id, organization_id, course_id, filename, mime_type, hash, storage_path, markdown_content, parsed_content').in('id', sourceIds).eq('organization_id', entry.organizationId).eq('course_id', entry.objectId), 'Failed to load approved Course sources');
    const approvedFiles = bindAcceptedCourseSources(manifest, files as Array<{ id: string; hash: string }>);
    return mapCompletedCourse({ course: course as never, lessonContents: lessons as never[], files: approvedFiles as never[], readBytes });
  }
  const playbook = expectData(await db.from('career_playbooks').select('id, organization_id, status, completed_at, position_title, language, final_markdown, role_profile_spec, generated_blocks').eq('id', entry.objectId).eq('organization_id', entry.organizationId).single(), 'Failed to load completed Role Guide');
  const sources = expectData(await db.from('career_playbook_sources').select('id, playbook_id, organization_id, source_type, status, filename, text, file:file_catalog(id, organization_id, course_id, filename, mime_type, hash, storage_path, markdown_content, parsed_content)').eq('playbook_id', entry.objectId).eq('organization_id', entry.organizationId).eq('status', 'ready'), 'Failed to load Role Guide sources');
  return mapCompletedRoleGuide({ playbook: playbook as never, sources: sources as never[], readBytes });
}

export function createSupabaseReconcileRepository(binding: KnowledgeSyncRuntimeConfig): ReconcileRepository {
  return {
    async listCompleted() {
      const db = client();
      const courses = expectData(await db.from<Array<{ id: string; organization_id: string; generation_completed_at: string }>>('courses').select('id, organization_id, generation_completed_at').eq('generation_status', 'completed').eq('organization_id', binding.organizationId), 'Failed to list completed Courses');
      const guides = expectData(await db.from<Array<{ id: string; organization_id: string; completed_at: string }>>('career_playbooks').select('id, organization_id, completed_at').eq('status', 'completed').eq('organization_id', binding.organizationId), 'Failed to list completed Role Guides');
      return [
        ...courses.filter(row => row.generation_completed_at).map(row => ({ kind: 'COURSE' as const, id: row.id, organizationId: row.organization_id, completedAt: row.generation_completed_at })),
        ...guides.filter(row => row.completed_at).map(row => ({ kind: 'ROLE_GUIDE' as const, id: row.id, organizationId: row.organization_id, completedAt: row.completed_at })),
      ];
    },
    async insertMissing(intents: Array<CompletedObject & { eventId: string }>) {
      if (intents.length === 0) return 0;
      const rows = intents.map(intent => ({ event_id: intent.eventId, object_kind: intent.kind, object_id: intent.id, organization_id: intent.organizationId, completed_at: intent.completedAt }));
      let inserted = 0;
      for (const row of rows) {
        const result = await client().rpc<boolean>('reconcile_helixa_knowledge_sync_intent', {
          p_event_id: row.event_id, p_object_kind: row.object_kind, p_object_id: row.object_id,
          p_organization_id: row.organization_id, p_completed_at: row.completed_at,
          p_binding_id: binding.bindingId, p_environment: binding.environment,
          p_destination_binding_id: binding.destinationBindingId,
        });
        if (result.error) throw new Error(`Failed to reconcile Helixa intent: ${result.error.message}`);
        if (result.data) inserted += 1;
      }
      return inserted;
    },
  };
}

export interface KnowledgeSyncRuntimeConfig {
  endpoint: string; hmacKey: string; externalSystemId: string; environment: string; externalProjectId: string | null;
  bindingId: string; organizationId: string; destinationBindingId: string;
}

export function readKnowledgeSyncRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): KnowledgeSyncRuntimeConfig {
  const endpoint = environment.HELIXA_KNOWLEDGE_SYNC_ENDPOINT;
  const hmacKey = environment.HELIXA_KNOWLEDGE_SYNC_HMAC_KEY;
  const externalSystemId = environment.HELIXA_EXTERNAL_SYSTEM_ID;
  const bindingId = environment.HELIXA_KNOWLEDGE_SYNC_BINDING_ID;
  const organizationId = environment.HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID;
  const destinationBindingId = environment.HELIXA_DESTINATION_BINDING_ID;
  if (!endpoint || !hmacKey || !externalSystemId || !bindingId || !organizationId || !destinationBindingId) throw new Error('Helixa knowledge sync configuration is incomplete');
  return { endpoint, hmacKey, externalSystemId, bindingId, organizationId, destinationBindingId, environment: environment.APP_ENV ?? environment.NODE_ENV ?? 'development', externalProjectId: environment.HELIXA_DESTINATION_PROJECT_ID ?? null };
}

export async function resetKnowledgeSyncIntent(binding: KnowledgeSyncRuntimeConfig, eventId: string): Promise<boolean> {
  const result = await client().rpc<boolean>('reset_helixa_knowledge_sync_intent', {
    p_binding_id: binding.bindingId, p_organization_id: binding.organizationId,
    p_environment: binding.environment, p_destination_binding_id: binding.destinationBindingId,
    p_event_id: eventId,
  });
  if (result.error) throw new Error('Failed to reset Helixa knowledge sync intent');
  return result.data === true;
}
