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
  type AnswerSource,
  type DocumentConflict,
  type DocumentEvidenceCard,
  type DocumentEvidenceCoverageSummary,
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
    name: 'persist_document_evidence_items',
    args: Record<string, unknown>
  ): Promise<DatabaseResult>;
}

export interface GetOrCreateEvidenceRunInput {
  courseId: string;
  organizationId: string;
  inputFingerprint: string;
  evidenceVersion: string;
  sourceCount: number;
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

export class DocumentEvidenceRepository {
  constructor(private readonly client: DocumentEvidenceDatabaseClient) {}

  async getOrCreateRun(
    input: GetOrCreateEvidenceRunInput
  ): Promise<{ run: Record<string, unknown>; reused: boolean }> {
    const findExisting = async (): Promise<DatabaseResult> =>
      this.client
        .from('document_evidence_runs')
        .select('*')
        .eq('course_id', input.courseId)
        .eq('organization_id', input.organizationId)
        .eq('input_fingerprint', input.inputFingerprint)
        .eq('evidence_version', input.evidenceVersion)
        .maybeSingle();

    const existing = await findExisting();
    if (existing.error) {
      throwDatabaseError('find_run', existing.error);
    }
    if (existing.data) {
      return { run: assertRecord(existing.data, 'find_run'), reused: true };
    }

    const created = await this.client
      .from('document_evidence_runs')
      .insert({
        course_id: input.courseId,
        organization_id: input.organizationId,
        input_fingerprint: input.inputFingerprint,
        evidence_version: input.evidenceVersion,
        status: 'processing',
        source_count: input.sourceCount,
      })
      .select('*')
      .single();

    if (!created.error && created.data) {
      return { run: assertRecord(created.data, 'create_run'), reused: false };
    }

    // A concurrent retry may win the uniqueness race. Re-read instead of
    // changing the already-created run.
    if (created.error?.code === '23505') {
      const concurrent = await findExisting();
      if (!concurrent.error && concurrent.data) {
        return { run: assertRecord(concurrent.data, 'find_concurrent_run'), reused: true };
      }
      if (concurrent.error) throwDatabaseError('find_concurrent_run', concurrent.error);
    }

    if (created.error) throwDatabaseError('create_run', created.error);
    throw new DocumentEvidenceRepositoryError('create_run:missing_result');
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
    const claimIds = [...new Set(conflict.sides.flatMap(side => side.claim_ids))];
    const sourceRefs = [
      ...new Map(
        conflict.sides
          .flatMap(side => side.source_refs)
          .map(sourceRef => [JSON.stringify(sourceRef), sourceRef])
      ).values(),
    ];
    const inserted = await this.client
      .from('document_evidence_conflicts')
      .insert({
        id: conflict.conflict_id,
        run_id: input.runId,
        course_id: input.courseId,
        organization_id: input.organizationId,
        conflict_fingerprint: conflict.conflict_fingerprint,
        topic: conflict.topic,
        severity: conflict.severity,
        sides: conflict.sides,
        claim_ids: claimIds,
        source_refs: sourceRefs,
        course_impact: conflict.course_impact,
        recommended_resolution: conflict.recommended_resolution,
        recommendation_rationale: conflict.recommendation_rationale,
        alternatives: conflict.alternatives,
        detection_model: input.detectionModel,
        detection_version: input.detectionVersion,
      })
      .select('*')
      .single();

    if (!inserted.error && inserted.data) {
      return assertRecord(inserted.data, 'insert_conflict');
    }
    if (inserted.error?.code !== '23505') {
      if (inserted.error) throwDatabaseError('insert_conflict', inserted.error);
      throw new DocumentEvidenceRepositoryError('insert_conflict:missing_result');
    }

    const existing = await this.client
      .from('document_evidence_conflicts')
      .select('*')
      .eq('run_id', input.runId)
      .eq('conflict_fingerprint', conflict.conflict_fingerprint)
      .single();

    if (existing.error) throwDatabaseError('find_conflict', existing.error);
    return assertRecord(existing.data, 'find_conflict');
  }

  async appendDecision(input: AppendEvidenceDecisionInput): Promise<Record<string, unknown>> {
    const answerSource = AnswerSourceSchema.parse(input.answerSource);
    if (input.resolvedBy === 'system' && answerSource !== 'system') {
      throw new DocumentEvidenceRepositoryError('append_decision:invalid_system_answer_source');
    }

    const inserted = await this.client
      .from('document_evidence_decisions')
      .insert({
        run_id: input.runId,
        conflict_id: input.conflictId,
        clarifying_question_id: input.clarifyingQuestionId,
        selected_resolution: input.selectedResolution,
        rationale: input.rationale,
        resolved_by: input.resolvedBy,
        answer_source: answerSource,
        selected_recommendation_index: input.selectedRecommendationIndex,
        selected_recommendation_value: input.selectedRecommendationValue,
        supersedes_decision_id: input.supersedesDecisionId,
        decided_at: input.decidedAt,
      })
      .select('*')
      .single();

    if (inserted.error) throwDatabaseError('append_decision', inserted.error);
    return assertRecord(inserted.data, 'append_decision');
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
