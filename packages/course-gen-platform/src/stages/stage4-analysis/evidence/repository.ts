/**
 * Durable persistence for Stage 4 document evidence.
 *
 * The repository intentionally uses a narrow client contract because the new
 * migration is delivered before generated database types are refreshed.
 * Stored JSON bodies are never written to logs or error messages here.
 */

import {
  AnswerSourceSchema,
  DocumentConflictSchema,
  DocumentEvidenceCardsSchema,
  DocumentEvidenceCoverageSummarySchema,
  DocumentEvidenceSourceManifestEntrySchema,
  DocumentEvidenceSourceManifestSchema,
  type AnswerSource,
  type DocumentConflict,
  type DocumentEvidenceCard,
  type DocumentEvidenceCoverageSummary,
  type DocumentEvidenceSourceManifestEntry,
} from '@megacampus/shared-types';

type EvidenceTableName =
  | 'document_evidence_runs'
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
      | 'upsert_document_evidence_conflict'
      | 'append_document_evidence_decision',
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

export interface UpsertEvidenceConflictInput {
  runId: string;
  courseId: string;
  organizationId: string;
  conflict: DocumentConflict;
  detectionModel: string;
  detectionVersion: string;
}

export interface AppendEvidenceDecisionInput {
  runId: string;
  conflictId: string;
  selectedResolution: string;
  resolvedBy: 'user' | 'system';
  answerSource: AnswerSource;
  rationale: string;
  decidedAt: string;
  clarifyingQuestionId?: string;
  selectedRecommendationIndex?: number;
  selectedRecommendationValue?: string;
  supersedesDecisionId?: string;
}

export interface EvidenceDecisionRow {
  id: string;
  conflict_id: string;
  supersedes_decision_id: string | null;
  decided_at: string;
  [key: string]: unknown;
}

export class DocumentEvidenceRepositoryError extends Error {
  constructor(
    operation: string,
    readonly databaseCode?: string
  ) {
    super(`Document evidence repository operation failed: ${operation}`);
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
  throw new DocumentEvidenceRepositoryError(operation, error.code);
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

  async appendDecision(input: AppendEvidenceDecisionInput): Promise<Record<string, unknown>> {
    const answerSource = AnswerSourceSchema.parse(input.answerSource);
    if ((input.resolvedBy === 'system') !== (answerSource === 'system')) {
      throw new DocumentEvidenceRepositoryError('append_decision:invalid_system_answer_source');
    }
    if (input.supersedesDecisionId && input.resolvedBy !== 'user') {
      throw new DocumentEvidenceRepositoryError(
        'append_decision:superseding_decision_must_be_user'
      );
    }
    const decision = {
      run_id: input.runId,
      conflict_id: input.conflictId,
      selected_resolution: input.selectedResolution,
      resolved_by: input.resolvedBy,
      answer_source: answerSource,
      rationale: input.rationale,
      decided_at: input.decidedAt,
      ...(input.clarifyingQuestionId ? { clarifying_question_id: input.clarifyingQuestionId } : {}),
      ...(input.selectedRecommendationIndex !== undefined
        ? { selected_recommendation_index: input.selectedRecommendationIndex }
        : {}),
      ...(input.selectedRecommendationValue
        ? { selected_recommendation_value: input.selectedRecommendationValue }
        : {}),
      ...(input.supersedesDecisionId ? { supersedes_decision_id: input.supersedesDecisionId } : {}),
    };
    const { data, error } = await this.client.rpc('append_document_evidence_decision', {
      p_decision: decision,
    });
    if (error) throwDatabaseError('append_decision', error);
    return assertRecord(data, 'append_decision');
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
        typeof row.conflict_id !== 'string' ||
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
    const seenConflicts = new Set<string>();
    for (const decision of current) {
      if (seenConflicts.has(decision.conflict_id)) {
        throw new DocumentEvidenceRepositoryError('list_decisions:branched_chain');
      }
      seenConflicts.add(decision.conflict_id);
    }
    return current;
  }
}

export function createDocumentEvidenceRepository(
  client: DocumentEvidenceDatabaseClient
): DocumentEvidenceRepository {
  return new DocumentEvidenceRepository(client);
}
