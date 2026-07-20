import type {
  CourseStructure,
  DocumentConflict,
  DocumentEvidenceCard,
  DocumentEvidenceSnapshot,
  EvidenceSourceRef,
  Stage5DocumentEvidenceEnrichment,
} from '@megacampus/shared-types';
import type { SearchOptions, SearchResponse } from '@/shared/qdrant/search-types';

export interface Stage5CurrentEvidenceDecision {
  id: string;
  run_id: string;
  course_id: string;
  organization_id: string;
  conflict_id: string | null;
  subject_kind: 'claim_conflict' | 'degraded_evidence' | 'detector_capacity';
  subject_key: string;
  document_id?: string | null;
  selected_resolution: string;
  selected_recommendation_value?: string | null;
  supersedes_decision_id: string | null;
  decided_at: string;
}

export interface Stage5EvidenceContextRepository {
  getAcceptedRun(
    runId: string,
    courseId: string,
    organizationId: string
  ): Promise<{ id: string; status: 'accepted' }>;
  listItems(runId: string): Promise<DocumentEvidenceCard[]>;
  listConflicts(runId: string): Promise<DocumentConflict[]>;
  getLatestDecisions(runId: string): Promise<Stage5CurrentEvidenceDecision[]>;
}

export interface Stage5EvidenceMaterial {
  sectionNumber: number;
  documentId: string;
  additions: string[];
  evidenceRefs: EvidenceSourceRef[];
  searchQuery: string;
}

export interface Stage5EvidencePatchInput {
  baseline: CourseStructure;
  materials: Stage5EvidenceMaterial[];
  attempt: 1 | 2;
  violations: string[];
}

export type Stage5EvidencePatcher = (
  input: Stage5EvidencePatchInput
) => Promise<CourseStructure> | CourseStructure;

export interface Stage5EvidenceLogger {
  info(value: Record<string, unknown>, message: string): void;
  warn(value: Record<string, unknown>, message: string): void;
  error?(value: Record<string, unknown>, message: string): void;
}

export interface Stage5EvidenceEnrichmentInput {
  courseId: string;
  organizationId: string;
  language: string;
  baseline: CourseStructure;
  snapshot?: DocumentEvidenceSnapshot;
  validateCandidate?: (candidate: CourseStructure) => string[];
}

export interface Stage5EvidenceEnrichmentDependencies {
  repository: Stage5EvidenceContextRepository;
  search(query: string, options: SearchOptions): Promise<SearchResponse>;
  patcher?: Stage5EvidencePatcher;
  validateCandidate?: (candidate: CourseStructure) => string[];
  log?: Stage5EvidenceLogger;
}

export interface Stage5EvidenceEnrichmentResult {
  courseStructure: CourseStructure;
  enrichment: Stage5DocumentEvidenceEnrichment;
  retrievalAttempts: number;
}

/** Sanitized failure envelope that preserves only the completed retrieval count. */
export class Stage5EvidenceEnrichmentFailure extends Error {
  readonly retrievalAttempts: number;

  constructor(retrievalAttempts: number) {
    super('Stage 5 evidence enrichment failed');
    this.name = 'Stage5EvidenceEnrichmentFailure';
    this.retrievalAttempts = retrievalAttempts;
  }
}

export type Stage5EvidenceEnricher = (
  input: Stage5EvidenceEnrichmentInput
) => Promise<Stage5EvidenceEnrichmentResult>;
