/**
 * Durable persistence for Stage 4 document evidence.
 *
 * The repository intentionally uses a narrow client contract because the new
 * migration is delivered before generated database types are refreshed.
 * Stored JSON bodies are never written to logs or error messages here.
 */

import {
  DocumentConflictSchema,
  DocumentEvidenceCardsSchema,
  DocumentEvidenceCoverageSummarySchema,
  DocumentEvidenceSourceManifestEntrySchema,
  DocumentEvidenceSourceManifestSchema,
  type DocumentConflict,
  type DocumentEvidenceCard,
  type DocumentEvidenceCoverageSummary,
  type DocumentEvidenceSourceManifestEntry,
} from '@megacampus/shared-types';
import {
  DetectorCapacityIssueSchema,
  type CommitConflictBatchInput,
  type ConflictCheckpointRow,
  type DetectorCapacityIssue,
} from './conflict-detector';
import type { DocumentEvidenceQuestion, CurrentEvidenceDecision } from './decision-service';

type EvidenceTableName =
  | 'document_evidence_runs'
  | 'document_evidence_items'
  | 'document_evidence_batch_checkpoints'
  | 'document_evidence_conflict_checkpoints'
  | 'document_evidence_conflicts'
  | 'document_evidence_decisions';

interface DatabaseError {
  code?: string;
  message: string;
}

interface DatabaseResult<T = unknown> {
  data: T | null;
  error: DatabaseError | null;
}

interface EvidenceQueryBuilder extends PromiseLike<DatabaseResult> {
  select(columns?: string): EvidenceQueryBuilder;
  eq(column: string, value: unknown): EvidenceQueryBuilder;
  insert(values: unknown): EvidenceQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): EvidenceQueryBuilder;
  single(): Promise<DatabaseResult>;
  maybeSingle(): Promise<DatabaseResult>;
}

export interface DocumentEvidenceDatabaseClient {
  from(table: EvidenceTableName): EvidenceQueryBuilder;
  rpc(
    name:
      | 'create_or_reuse_document_evidence_run'
      | 'persist_document_evidence_items'
      | 'commit_document_evidence_batch'
      | 'finalize_document_evidence_run'
      | 'upsert_document_evidence_conflict'
      | 'commit_document_evidence_conflict_batch'
      | 'materialize_document_evidence_decision_gate_atomic'
      | 'answer_document_evidence_questions_atomic'
      | 'get_document_evidence_retry_state'
      | 'get_document_evidence_retry_directives'
      | 'consume_document_evidence_retry_directives'
      | 'record_document_evidence_automatic_retry',
    args: Record<string, unknown>
  ): Promise<DatabaseResult>;
}

export interface GetOrCreateEvidenceRunInput {
  courseId: string;
  organizationId: string;
  inputFingerprint: string;
  evidenceVersion: string;
  sourceManifest: DocumentEvidenceSourceManifestEntry[];
}

export interface PersistEvidenceItemsInput {
  runId: string;
  courseId: string;
  organizationId: string;
  cards: DocumentEvidenceCard[];
}

export interface FinalizeEvidenceRunInput {
  runId: string;
  courseId: string;
  organizationId: string;
  status: 'accepted' | 'failed';
}

export interface CheckpointEvidenceRunMetricsInput {
  runId: string;
  courseId: string;
  organizationId: string;
  batchCount: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

export interface CommitEvidenceBatchInput extends CheckpointEvidenceRunMetricsInput {
  cards: DocumentEvidenceCard[];
  batchKey: string;
  inputHash: string;
  structuredCheckpoint: Record<string, unknown>;
  cursor: Record<string, unknown>;
}

export interface UpsertEvidenceConflictInput {
  runId: string;
  courseId: string;
  organizationId: string;
  conflict: DocumentConflict;
  detectionModel: string;
  detectionVersion: string;
}

export interface EvidenceDecisionRow {
  id: string;
  conflict_id: string | null;
  subject_key: string;
  supersedes_decision_id: string | null;
  decided_at: string;
  [key: string]: unknown;
}

/**
 * A repository failure that says what the database said.
 *
 * The operation name alone was not enough to act on: a live run (mc2-2pplo,
 * 2026-08-15) failed here and the only way to learn why was another paid run.
 * The database code and message now travel in the message itself, because a
 * `cause` is dropped by the logger and never reaches the console.
 *
 * Only `code` and `message` are carried. Postgres puts offending values in
 * `details`, and stored JSON bodies still never appear in a message here.
 */
export class DocumentEvidenceRepositoryError extends Error {
  constructor(
    operation: string,
    readonly databaseCode?: string,
    databaseMessage?: string
  ) {
    const said = [databaseCode, databaseMessage].filter(Boolean).join(' ');
    super(
      `Document evidence repository operation failed: ${operation}${said ? ` (database said: ${said})` : ''}`
    );
    this.name = 'DocumentEvidenceRepositoryError';
  }
}

function assertRecord(value: unknown, operation: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DocumentEvidenceRepositoryError(`${operation}:invalid_result`);
  }
  return value as Record<string, unknown>;
}

function throwDatabaseError(operation: string, error: DatabaseError): never {
  throw new DocumentEvidenceRepositoryError(operation, error.code, error.message);
}

function normalizeSourceManifest(
  input: DocumentEvidenceSourceManifestEntry[]
): DocumentEvidenceSourceManifestEntry[] {
  const byDocumentId = new Map<string, DocumentEvidenceSourceManifestEntry>();
  for (const rawEntry of input) {
    const entry = DocumentEvidenceSourceManifestEntrySchema.parse(rawEntry);
    const existing = byDocumentId.get(entry.document_id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) {
      throw new DocumentEvidenceRepositoryError('normalize_manifest:conflicting_document_snapshot');
    }
    byDocumentId.set(entry.document_id, entry);
  }
  return DocumentEvidenceSourceManifestSchema.parse(
    [...byDocumentId.values()].sort((left, right) =>
      left.document_id.localeCompare(right.document_id)
    )
  );
}

function assertRunSourceManifest(
  value: unknown,
  expectedManifest: DocumentEvidenceSourceManifestEntry[],
  operation: string
): Record<string, unknown> {
  const run = assertRecord(value, operation);
  const parsedManifest = DocumentEvidenceSourceManifestSchema.safeParse(run.source_manifest);
  if (
    !parsedManifest.success ||
    JSON.stringify(parsedManifest.data) !== JSON.stringify(expectedManifest) ||
    run.source_count !== expectedManifest.length
  ) {
    throw new DocumentEvidenceRepositoryError(`${operation}:source_set_mismatch`);
  }
  return run;
}

export class DocumentEvidenceRepository {
  constructor(private readonly client: DocumentEvidenceDatabaseClient) {}

  async getAcceptedRun(
    runId: string,
    courseId: string,
    organizationId: string
  ): Promise<{ id: string; status: 'accepted' }> {
    const result = await this.client
      .from('document_evidence_runs')
      .select('id,status')
      .eq('id', runId)
      .eq('course_id', courseId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (result.error) throwDatabaseError('get_accepted_run', result.error);
    const row = assertRecord(result.data, 'get_accepted_run');
    if (row.id !== runId || row.status !== 'accepted') {
      throw new DocumentEvidenceRepositoryError('get_accepted_run:not_accepted');
    }
    return { id: runId, status: 'accepted' };
  }

  async listConflicts(runId: string): Promise<DocumentConflict[]> {
    const result = await this.client
      .from('document_evidence_conflicts')
      .select('*')
      .eq('run_id', runId)
      .order('conflict_fingerprint', { ascending: true });
    if (result.error) throwDatabaseError('list_conflicts', result.error);
    if (!Array.isArray(result.data)) {
      throw new DocumentEvidenceRepositoryError('list_conflicts:invalid_result');
    }
    return result.data.map(value => {
      const row = assertRecord(value, 'list_conflicts');
      const parsed = DocumentConflictSchema.parse({
        conflict_id: row.id,
        conflict_fingerprint: row.conflict_fingerprint,
        topic: row.topic,
        severity: row.severity,
        sides: row.sides,
        course_impact: row.course_impact,
        recommended_resolution: row.recommended_resolution,
        recommendation_rationale: row.recommendation_rationale,
        alternatives: row.alternatives,
      });
      const recommended = parsed.sides.filter(side => side.side_role === 'recommended');
      const alternatives = parsed.sides
        .filter(
          (side): side is typeof side & { side_handle: string; alternative_index: number } =>
            side.side_role === 'alternative' &&
            Boolean(side.side_handle) &&
            side.alternative_index !== undefined
        )
        .sort((left, right) => left.alternative_index - right.alternative_index);
      return DocumentConflictSchema.parse({
        ...parsed,
        ...(recommended.length === 1 && recommended[0].side_handle
          ? { recommended_side_handle: recommended[0].side_handle }
          : {}),
        ...(alternatives.length === parsed.alternatives.length
          ? { alternative_side_handles: alternatives.map(side => side.side_handle) }
          : {}),
      });
    });
  }

  async listConflictCheckpoints(runId: string): Promise<ConflictCheckpointRow[]> {
    const result = await this.client
      .from('document_evidence_conflict_checkpoints')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });
    if (result.error) throwDatabaseError('list_conflict_checkpoints', result.error);
    if (!Array.isArray(result.data)) {
      throw new DocumentEvidenceRepositoryError('list_conflict_checkpoints:invalid_result');
    }
    return result.data.map(value => assertRecord(value, 'list_conflict_checkpoints'));
  }

  async commitConflictBatch(input: CommitConflictBatchInput): Promise<Record<string, unknown>> {
    const conflicts = input.conflicts.map(conflict => DocumentConflictSchema.parse(conflict));
    const { data, error } = await this.client.rpc('commit_document_evidence_conflict_batch', {
      p_run_id: input.runId,
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_batch_key: input.batchKey,
      p_input_hash: input.inputHash,
      p_structured_checkpoint: input.structuredCheckpoint,
      p_conflicts: conflicts,
      p_detection_model: input.detectionModel,
      p_detection_version: input.detectionVersion,
      p_verification_status: input.verificationStatus,
      p_conflict_verification: input.conflictVerification ?? [],
    });
    if (error) throwDatabaseError('commit_conflict_batch', error);
    return assertRecord(data, 'commit_conflict_batch');
  }

  async listDetectorCapacityIssues(runId: string): Promise<DetectorCapacityIssue[]> {
    const rows = await this.listConflictCheckpoints(runId);
    const byPlan = new Map<string, DetectorCapacityIssue>();
    for (const row of rows) {
      const checkpoint = row.structured_checkpoint;
      if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) continue;
      const value = checkpoint as Record<string, unknown>;
      if (value.kind !== 'conflict_capacity_degraded') continue;
      const issue = DetectorCapacityIssueSchema.parse(value.issue);
      byPlan.set(issue.call_plan_hash, issue);
    }
    return [...byPlan.values()].sort((left, right) =>
      left.call_plan_hash.localeCompare(right.call_plan_hash)
    );
  }

  async getDegradedRetryState(input: {
    runId: string;
    documentId: string;
    configuredMaxAttempts: number;
  }): Promise<{ attempt: number; maxAttempts: number }> {
    const { data, error } = await this.client.rpc('get_document_evidence_retry_state', {
      p_run_id: input.runId,
      p_document_id: input.documentId,
      p_configured_max_attempts: input.configuredMaxAttempts,
    });
    if (error) throwDatabaseError('get_retry_state', error);
    const row = assertRecord(data, 'get_retry_state');
    if (
      !Number.isSafeInteger(row.attempt) ||
      !Number.isSafeInteger(row.max_attempts) ||
      (row.attempt as number) < 0 ||
      (row.max_attempts as number) < 1
    ) {
      throw new DocumentEvidenceRepositoryError('get_retry_state:invalid_result');
    }
    return { attempt: row.attempt as number, maxAttempts: row.max_attempts as number };
  }

  async getPendingRetryDirectives(
    courseId: string,
    configuredMaxAttempts: number
  ): Promise<
    Array<{
      decisionId: string;
      documentId: string;
      attempt: number;
      maxAttempts: number;
    }>
  > {
    const { data, error } = await this.client.rpc('get_document_evidence_retry_directives', {
      p_course_id: courseId,
      p_configured_max_attempts: configuredMaxAttempts,
    });
    if (error) throwDatabaseError('get_retry_directives', error);
    if (!Array.isArray(data)) {
      throw new DocumentEvidenceRepositoryError('get_retry_directives:invalid_result');
    }
    return data.map(value => {
      const row = assertRecord(value, 'get_retry_directives');
      if (
        typeof row.decision_id !== 'string' ||
        typeof row.document_id !== 'string' ||
        !Number.isSafeInteger(row.attempt) ||
        !Number.isSafeInteger(row.max_attempts) ||
        (row.attempt as number) < 1 ||
        (row.max_attempts as number) < (row.attempt as number)
      ) {
        throw new DocumentEvidenceRepositoryError('get_retry_directives:invalid_result');
      }
      return {
        decisionId: row.decision_id,
        documentId: row.document_id,
        attempt: row.attempt as number,
        maxAttempts: row.max_attempts as number,
      };
    });
  }

  async consumeRetryDirectives(input: {
    courseId: string;
    organizationId: string;
    targetRunId: string;
    decisionIds: string[];
  }): Promise<void> {
    const { data, error } = await this.client.rpc('consume_document_evidence_retry_directives', {
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_target_run_id: input.targetRunId,
      p_decision_ids: input.decisionIds,
    });
    if (error) throwDatabaseError('consume_retry_directives', error);
    const row = assertRecord(data, 'consume_retry_directives');
    if (row.target_run_id !== input.targetRunId || !Array.isArray(row.decision_ids)) {
      throw new DocumentEvidenceRepositoryError('consume_retry_directives:invalid_result');
    }
  }

  async recordAutomaticRetry(input: {
    runId: string;
    courseId: string;
    organizationId: string;
    documentId: string;
    configuredMaxAttempts: number;
    idempotencyKey: string;
  }): Promise<{
    decisionId: string;
    documentId: string;
    attempt: number;
    maxAttempts: number;
  }> {
    const { data, error } = await this.client.rpc('record_document_evidence_automatic_retry', {
      p_run_id: input.runId,
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_document_id: input.documentId,
      p_configured_max_attempts: input.configuredMaxAttempts,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throwDatabaseError('record_automatic_retry', error);
    const row = assertRecord(data, 'record_automatic_retry');
    if (
      typeof row.decision_id !== 'string' ||
      typeof row.document_id !== 'string' ||
      !Number.isSafeInteger(row.attempt) ||
      !Number.isSafeInteger(row.max_attempts)
    ) {
      throw new DocumentEvidenceRepositoryError('record_automatic_retry:invalid_result');
    }
    return {
      decisionId: row.decision_id,
      documentId: row.document_id,
      attempt: row.attempt as number,
      maxAttempts: row.max_attempts as number,
    };
  }

  async materializeDecisionGateAtomic(input: {
    runId: string;
    courseId: string;
    organizationId: string;
    mode: 'manual' | 'automatic';
    questions: DocumentEvidenceQuestion[];
    gateIdempotencyKey: string;
  }): Promise<{ question_ids: string[]; decision_ids: string[]; reused: boolean }> {
    const { data, error } = await this.client.rpc(
      'materialize_document_evidence_decision_gate_atomic',
      {
        p_run_id: input.runId,
        p_course_id: input.courseId,
        p_organization_id: input.organizationId,
        p_mode: input.mode,
        p_questions: input.questions,
        p_idempotency_key: input.gateIdempotencyKey,
      }
    );
    if (error) throwDatabaseError('materialize_decision_gate', error);
    const row = assertRecord(data, 'materialize_decision_gate');
    if (
      !Array.isArray(row.question_ids) ||
      !Array.isArray(row.decision_ids) ||
      typeof row.reused !== 'boolean'
    ) {
      throw new DocumentEvidenceRepositoryError('materialize_decision_gate:invalid_result');
    }
    return row as unknown as { question_ids: string[]; decision_ids: string[]; reused: boolean };
  }

  async answerDocumentConflictAtomic(input: {
    courseId: string;
    actorUserId: string;
    answers: Array<{
      questionId: string;
      answer: string;
      answerSource: 'suggested' | 'modified' | 'custom';
      selectedSuggestionIndex?: number;
      expectedCurrentDecisionId?: string;
      idempotencyKey: string;
    }>;
  }): Promise<Record<string, unknown>> {
    const { data, error } = await this.client.rpc('answer_document_evidence_questions_atomic', {
      p_course_id: input.courseId,
      p_actor_user_id: input.actorUserId,
      p_answers: input.answers.map(answer => ({
        question_id: answer.questionId,
        answer: answer.answer,
        answer_source: answer.answerSource,
        selected_suggestion_index: answer.selectedSuggestionIndex ?? null,
        expected_current_decision_id: answer.expectedCurrentDecisionId ?? null,
        idempotency_key: answer.idempotencyKey,
      })),
    });
    if (error) throwDatabaseError('answer_document_conflict', error);
    return assertRecord(data, 'answer_document_conflict');
  }

  async listCurrentDecisions(runId: string): Promise<CurrentEvidenceDecision[]> {
    const decisions = await this.getLatestDecisions(runId);
    return decisions.map(decision => ({
      id: decision.id,
      subject_key: String(decision.subject_key ?? decision.conflict_id),
      ...(decision.resolved_by === 'user' || decision.resolved_by === 'system'
        ? { resolved_by: decision.resolved_by }
        : {}),
      ...(decision.subject_kind === 'claim_conflict' ||
      decision.subject_kind === 'degraded_evidence' ||
      decision.subject_kind === 'detector_capacity'
        ? { subject_kind: decision.subject_kind }
        : {}),
    }));
  }

  /**
   * Accepted runs of one course, newest first, with the manifest that produced
   * them. Answers may only be carried between runs whose sources are identical,
   * so the caller needs the manifest, not just the run id.
   */
  async listCourseAcceptedRuns(
    courseId: string,
    organizationId: string
  ): Promise<Array<{ id: string; sourceManifest: DocumentEvidenceSourceManifestEntry[] }>> {
    const result = await this.client
      .from('document_evidence_runs')
      .select('id,status,source_manifest,completed_at')
      .eq('course_id', courseId)
      .eq('organization_id', organizationId)
      .order('completed_at', { ascending: false });
    if (result.error) throwDatabaseError('list_course_runs', result.error);
    if (!Array.isArray(result.data)) {
      throw new DocumentEvidenceRepositoryError('list_course_runs:invalid_result');
    }
    return result.data
      .map(value => assertRecord(value, 'list_course_runs'))
      .filter(row => row.status === 'accepted' && typeof row.id === 'string')
      .map(row => ({
        id: row.id as string,
        sourceManifest: normalizeSourceManifest(
          DocumentEvidenceSourceManifestSchema.parse(row.source_manifest ?? [])
        ),
      }));
  }

  async getOrCreateRun(
    input: GetOrCreateEvidenceRunInput
  ): Promise<{ run: Record<string, unknown>; reused: boolean }> {
    const sourceManifest = normalizeSourceManifest(input.sourceManifest);
    const { data, error } = await this.client.rpc('create_or_reuse_document_evidence_run', {
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_input_fingerprint: input.inputFingerprint,
      p_evidence_version: input.evidenceVersion,
      p_source_manifest: sourceManifest,
    });
    if (error) throwDatabaseError('create_or_reuse_run', error);
    const result = assertRecord(data, 'create_or_reuse_run');
    if (typeof result.reused !== 'boolean') {
      throw new DocumentEvidenceRepositoryError('create_or_reuse_run:invalid_result');
    }
    return {
      run: assertRunSourceManifest(result.run, sourceManifest, 'create_or_reuse_run'),
      reused: result.reused,
    };
  }

  async persistItems(input: PersistEvidenceItemsInput): Promise<DocumentEvidenceCoverageSummary> {
    const cards = DocumentEvidenceCardsSchema.parse(input.cards);
    const { data, error } = await this.client.rpc('persist_document_evidence_items', {
      p_run_id: input.runId,
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_items: cards,
    });

    if (error) throwDatabaseError('persist_items', error);
    return DocumentEvidenceCoverageSummarySchema.parse(data);
  }

  async listItems(runId: string): Promise<DocumentEvidenceCard[]> {
    const result = await this.client
      .from('document_evidence_items')
      .select('*')
      .eq('run_id', runId)
      .order('document_id', { ascending: true });
    if (result.error) throwDatabaseError('list_items', result.error);
    if (!Array.isArray(result.data)) {
      throw new DocumentEvidenceRepositoryError('list_items:invalid_result');
    }

    return DocumentEvidenceCardsSchema.parse(
      result.data.map(value => {
        const row = assertRecord(value, 'list_items');
        return {
          document_id: row.document_id,
          document_name: row.document_name,
          priority: row.priority,
          authority_scope: row.authority_scope,
          content_quality: row.content_quality,
          course_relevance: row.course_relevance,
          processing_mode: row.processing_mode,
          summary: row.summary,
          key_claims: row.claims,
          terminology: row.terminology,
          constraints: row.constraints,
          limitations: row.limitations,
          coverage_status: row.coverage_status,
          coverage_reason: row.coverage_reason,
          token_counts: {
            original: row.original_tokens,
            summary: row.summary_tokens,
            allocated: row.allocated_tokens,
          },
        };
      })
    );
  }

  async finalizeRun(input: FinalizeEvidenceRunInput): Promise<Record<string, unknown>> {
    const { data, error } = await this.client.rpc('finalize_document_evidence_run', {
      p_run_id: input.runId,
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_status: input.status,
    });
    if (error) throwDatabaseError('finalize_run', error);
    return assertRecord(data, 'finalize_run');
  }

  async commitBatch(input: CommitEvidenceBatchInput): Promise<Record<string, unknown>> {
    const cards = DocumentEvidenceCardsSchema.parse(input.cards);
    if (!input.batchKey.trim() || !input.inputHash.trim()) {
      throw new DocumentEvidenceRepositoryError('commit_batch:invalid_identity');
    }
    const integerMetrics = [
      input.batchCount,
      input.modelCalls,
      input.inputTokens,
      input.outputTokens,
    ];
    if (
      integerMetrics.some(value => !Number.isSafeInteger(value) || value < 0) ||
      !Number.isFinite(input.totalCostUsd) ||
      input.totalCostUsd < 0
    ) {
      throw new DocumentEvidenceRepositoryError('commit_batch:invalid_metrics');
    }
    const { data, error } = await this.client.rpc('commit_document_evidence_batch', {
      p_run_id: input.runId,
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_batch_key: input.batchKey,
      p_input_hash: input.inputHash,
      p_items: cards,
      p_structured_checkpoint: input.structuredCheckpoint,
      p_cursor: input.cursor,
      p_batch_count: input.batchCount,
      p_model_calls: input.modelCalls,
      p_input_tokens: input.inputTokens,
      p_output_tokens: input.outputTokens,
      p_total_cost_usd: input.totalCostUsd,
    });
    if (error) throwDatabaseError('commit_batch', error);
    return assertRecord(data, 'commit_batch');
  }

  async listBatchCheckpoints(runId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.client
      .from('document_evidence_batch_checkpoints')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });
    if (result.error) throwDatabaseError('list_batch_checkpoints', result.error);
    if (!Array.isArray(result.data)) {
      throw new DocumentEvidenceRepositoryError('list_batch_checkpoints:invalid_result');
    }
    return result.data.map(value => assertRecord(value, 'list_batch_checkpoints'));
  }

  async upsertConflict(input: UpsertEvidenceConflictInput): Promise<Record<string, unknown>> {
    const conflict = DocumentConflictSchema.parse(input.conflict);
    const { data, error } = await this.client.rpc('upsert_document_evidence_conflict', {
      p_run_id: input.runId,
      p_course_id: input.courseId,
      p_organization_id: input.organizationId,
      p_conflict: conflict,
      p_detection_model: input.detectionModel,
      p_detection_version: input.detectionVersion,
    });
    if (error) throwDatabaseError('upsert_conflict', error);
    return assertRecord(data, 'upsert_conflict');
  }

  async getLatestDecisions(runId: string): Promise<EvidenceDecisionRow[]> {
    const result = await this.client
      .from('document_evidence_decisions')
      .select('*')
      .eq('run_id', runId)
      .order('decided_at', { ascending: false });

    if (result.error) throwDatabaseError('list_decisions', result.error);
    if (!Array.isArray(result.data)) {
      throw new DocumentEvidenceRepositoryError('list_decisions:invalid_result');
    }

    const decisions = result.data.map(value => {
      const row = assertRecord(value, 'list_decisions');
      if (
        typeof row.id !== 'string' ||
        (row.conflict_id !== null && typeof row.conflict_id !== 'string') ||
        typeof row.subject_key !== 'string' ||
        typeof row.decided_at !== 'string' ||
        (row.supersedes_decision_id !== null &&
          row.supersedes_decision_id !== undefined &&
          typeof row.supersedes_decision_id !== 'string')
      ) {
        throw new DocumentEvidenceRepositoryError('list_decisions:invalid_row');
      }
      return {
        ...row,
        id: row.id,
        conflict_id: row.conflict_id,
        subject_key: row.subject_key,
        supersedes_decision_id: row.supersedes_decision_id ?? null,
        decided_at: row.decided_at,
      } satisfies EvidenceDecisionRow;
    });

    const supersededIds = new Set(
      decisions
        .map(decision => decision.supersedes_decision_id)
        .filter((id): id is string => id !== null)
    );
    const current = decisions.filter(decision => !supersededIds.has(decision.id));
    const seenSubjects = new Set<string>();
    for (const decision of current) {
      if (seenSubjects.has(decision.subject_key)) {
        throw new DocumentEvidenceRepositoryError('list_decisions:branched_chain');
      }
      seenSubjects.add(decision.subject_key);
    }
    return current;
  }
}

export function createDocumentEvidenceRepository(
  client: DocumentEvidenceDatabaseClient
): DocumentEvidenceRepository {
  return new DocumentEvidenceRepository(client);
}
