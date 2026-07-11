import {
  DocumentEvidenceSnapshotSchema,
  DocumentEvidenceSourceManifestSchema,
  type DocumentConflict,
  type DocumentEvidenceCard,
  type DocumentEvidenceSourceManifestEntry,
} from '@megacampus/shared-types';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import {
  createDocumentEvidenceRepository,
  type DocumentEvidenceDatabaseClient,
} from '@/stages/stage4-analysis/evidence/repository';
import {
  buildStage6EvidenceContext,
  Stage6EvidenceScopeError,
  type Stage6AcceptedEvidenceContext,
  type Stage6EvidenceDecisionRow,
} from './evidence-context';
import { isDocumentEvidenceActive } from '@/shared/document-evidence/rollout';

export interface LoadStage6EvidenceForCourseInput {
  courseId: string;
  requestedOrganizationId?: string;
  providedAnalysisResult?: unknown;
}

interface CourseScope {
  organizationId: string;
  analysisResult: unknown;
}

interface AcceptedEvidenceData {
  sourceManifest: DocumentEvidenceSourceManifestEntry[];
  cards: DocumentEvidenceCard[];
  conflicts: DocumentConflict[];
  decisions: Stage6EvidenceDecisionRow[];
}

export interface Stage6EvidenceLoaderDependencies {
  loadCourseScope(courseId: string): Promise<CourseScope>;
  loadAcceptedEvidence(input: {
    runId: string;
    courseId: string;
    organizationId: string;
  }): Promise<AcceptedEvidenceData>;
}

function evidenceSnapshot(analysisResult: unknown) {
  if (!analysisResult || typeof analysisResult !== 'object' || Array.isArray(analysisResult)) {
    return undefined;
  }
  const raw = (analysisResult as Record<string, unknown>).document_evidence;
  return raw === undefined ? undefined : DocumentEvidenceSnapshotSchema.parse(raw);
}

async function loadCourseScope(courseId: string): Promise<CourseScope> {
  const { data, error } = await getSupabaseAdmin()
    .from('courses')
    .select('organization_id,analysis_result')
    .eq('id', courseId)
    .single();
  if (error || !data || typeof data.organization_id !== 'string') {
    throw new Stage6EvidenceScopeError('Unable to resolve the Stage 6 course organization scope');
  }
  return { organizationId: data.organization_id, analysisResult: data.analysis_result };
}

function decisionRow(value: Record<string, unknown>): Stage6EvidenceDecisionRow {
  const subjectKind = value.subject_kind;
  if (
    typeof value.id !== 'string' ||
    typeof value.run_id !== 'string' ||
    !['claim_conflict', 'degraded_evidence', 'detector_capacity'].includes(String(subjectKind)) ||
    typeof value.selected_resolution !== 'string' ||
    typeof value.subject_key !== 'string' ||
    typeof value.decided_at !== 'string'
  ) {
    throw new Stage6EvidenceScopeError('Stage 6 evidence decision row is invalid');
  }
  return {
    id: value.id,
    run_id: value.run_id,
    subject_kind: subjectKind as Stage6EvidenceDecisionRow['subject_kind'],
    conflict_id: typeof value.conflict_id === 'string' ? value.conflict_id : null,
    document_id: typeof value.document_id === 'string' ? value.document_id : null,
    selected_resolution: value.selected_resolution,
    selected_recommendation_value:
      typeof value.selected_recommendation_value === 'string'
        ? value.selected_recommendation_value
        : null,
    selected_side_handle:
      typeof value.selected_side_handle === 'string' ? value.selected_side_handle : null,
    subject_key: value.subject_key,
    supersedes_decision_id:
      typeof value.supersedes_decision_id === 'string' ? value.supersedes_decision_id : null,
    decided_at: value.decided_at,
  };
}

async function loadAcceptedEvidence(input: {
  runId: string;
  courseId: string;
  organizationId: string;
}): Promise<AcceptedEvidenceData> {
  const client = getSupabaseAdmin() as unknown as DocumentEvidenceDatabaseClient;
  const repository = createDocumentEvidenceRepository(client);
  await repository.getAcceptedRun(input.runId, input.courseId, input.organizationId);
  const runResult = await client
    .from('document_evidence_runs')
    .select('source_manifest')
    .eq('id', input.runId)
    .eq('course_id', input.courseId)
    .eq('organization_id', input.organizationId)
    .maybeSingle();
  if (runResult.error || !runResult.data || typeof runResult.data !== 'object') {
    throw new Stage6EvidenceScopeError('Accepted Stage 6 evidence manifest is unavailable');
  }
  const sourceManifest = DocumentEvidenceSourceManifestSchema.parse(
    (runResult.data as Record<string, unknown>).source_manifest
  );
  const [cards, conflicts, rawDecisions] = await Promise.all([
    repository.listItems(input.runId),
    repository.listConflicts(input.runId),
    repository.getLatestDecisions(input.runId),
  ]);
  return {
    sourceManifest,
    cards,
    conflicts,
    decisions: rawDecisions.map(value => decisionRow(value)),
  };
}

const productionDependencies: Stage6EvidenceLoaderDependencies = {
  loadCourseScope,
  loadAcceptedEvidence,
};

/** Load current database truth; queued analysis snapshots are never trusted for cache identity. */
export async function loadStage6EvidenceForCourse(
  input: LoadStage6EvidenceForCourseInput,
  dependencies: Stage6EvidenceLoaderDependencies = productionDependencies
): Promise<{ organizationId: string; evidenceContext: Stage6AcceptedEvidenceContext | undefined }> {
  void input.providedAnalysisResult;
  const course = await dependencies.loadCourseScope(input.courseId);
  if (input.requestedOrganizationId && input.requestedOrganizationId !== course.organizationId) {
    throw new Stage6EvidenceScopeError(
      'Stage 6 requested organization scope does not own the course'
    );
  }
  if (!isDocumentEvidenceActive()) {
    return { organizationId: course.organizationId, evidenceContext: undefined };
  }
  const snapshot = evidenceSnapshot(course.analysisResult);
  if (!snapshot) {
    return { organizationId: course.organizationId, evidenceContext: undefined };
  }
  const evidence = await dependencies.loadAcceptedEvidence({
    runId: snapshot.accepted_run_id,
    courseId: input.courseId,
    organizationId: course.organizationId,
  });
  return {
    organizationId: course.organizationId,
    evidenceContext: buildStage6EvidenceContext({
      courseId: input.courseId,
      organizationId: course.organizationId,
      snapshot,
      sourceManifest: evidence.sourceManifest,
      cards: evidence.cards,
      conflicts: evidence.conflicts,
      decisions: evidence.decisions,
    }),
  };
}
