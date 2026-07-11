/**
 * Canonical contracts for durable advisory document evidence.
 * @module shared-types/document-evidence
 */

import { z } from 'zod';
import { AnswerSourceSchema } from './clarifying-questions';

export const DocumentAuthorityScopeSchema = z.enum([
  'organization_specific',
  'course_source',
  'general_reference',
  'unknown',
]);

export const DocumentEvidenceModeSchema = z.enum([
  'full_text',
  'hierarchical_summary',
  'summary',
  'targeted_retrieval',
  'metadata_only',
]);

export const DocumentCoverageStatusSchema = z.enum(['assessed', 'degraded', 'failed']);

export const DocumentEvidenceRunStatusSchema = z.enum([
  'pending',
  'processing',
  'accepted',
  'failed',
]);

export const DocumentEvidenceEnrichmentStatusSchema = z.enum([
  'not_applicable',
  'applied',
  'no_relevant_evidence',
  'degraded',
  'failed_open_with_decision',
]);

export const EvidenceSourceRefSchema = z
  .object({
    document_id: z.string().uuid(),
    chunk_id: z.string().min(1).optional(),
    page_number: z.number().int().positive().optional(),
    heading_path: z.string().min(1).optional(),
    version_hash: z.string().min(1).optional(),
  })
  .strict();

export const EvidenceClaimSchema = z
  .object({
    claim_id: z.string().uuid(),
    statement: z.string().min(1),
    confidence: z.number().min(0).max(1),
    source_refs: z.array(EvidenceSourceRefSchema).min(1),
  })
  .strict();

export const DocumentEvidenceTokenCountsSchema = z
  .object({
    original: z.number().int().nonnegative(),
    summary: z.number().int().nonnegative(),
    allocated: z.number().int().nonnegative(),
  })
  .strict();

export const DocumentEvidenceSourceManifestEntrySchema = z
  .object({
    document_id: z.string().uuid(),
    source_version_hash: z.string().min(1),
    document_name: z.string().min(1),
  })
  .strict();

export const DocumentEvidenceSourceManifestSchema = z
  .array(DocumentEvidenceSourceManifestEntrySchema)
  .min(1)
  .superRefine((manifest, context) => {
    const documentIds = manifest.map(source => source.document_id);
    if (new Set(documentIds).size !== manifest.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'source_manifest document_id values must be unique',
      });
    }
    const sorted = [...documentIds].sort();
    if (sorted.some((documentId, index) => documentId !== documentIds[index])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'source_manifest must be sorted by document_id',
      });
    }
  });

export const DocumentEvidenceCardSchema = z
  .object({
    document_id: z.string().uuid(),
    document_name: z.string().min(1),
    priority: z.enum(['CORE', 'IMPORTANT', 'SUPPLEMENTARY']),
    authority_scope: DocumentAuthorityScopeSchema,
    content_quality: z.number().min(0).max(1),
    course_relevance: z.number().min(0).max(1),
    processing_mode: DocumentEvidenceModeSchema,
    summary: z.string().min(1).nullable().optional(),
    key_claims: z.array(EvidenceClaimSchema),
    terminology: z.array(z.string().min(1)),
    constraints: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)),
    coverage_status: DocumentCoverageStatusSchema,
    coverage_reason: z.string().min(1),
    token_counts: DocumentEvidenceTokenCountsSchema,
  })
  .strict()
  .superRefine((card, context) => {
    if (card.coverage_status === 'assessed' && !card.summary) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['summary'],
        message: 'summary is required when coverage_status is assessed',
      });
    }
  });

export const DocumentEvidenceCardsSchema = z
  .array(DocumentEvidenceCardSchema)
  .superRefine((cards, context) => {
    const seen = new Set<string>();
    cards.forEach((card, index) => {
      if (seen.has(card.document_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'document_id'],
          message: `Duplicate document_id in coverage ledger: ${card.document_id}`,
        });
      }
      seen.add(card.document_id);
    });
  });

export const DocumentConflictSideSchema = z
  .object({
    statement: z.string().min(1),
    claim_ids: z.array(z.string().uuid()).min(1),
    document_ids: z.array(z.string().uuid()).min(1),
    source_refs: z.array(EvidenceSourceRefSchema).min(1),
  })
  .strict();

export const DocumentConflictSchema = z
  .object({
    conflict_id: z.string().uuid(),
    conflict_fingerprint: z.string().min(1),
    topic: z.string().min(1),
    severity: z.enum(['critical', 'important', 'informational']),
    sides: z.array(DocumentConflictSideSchema).min(2),
    course_impact: z.string().min(1),
    recommended_resolution: z.string().min(1),
    recommendation_rationale: z.string().min(1),
    alternatives: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const DocumentDecisionSchema = z
  .object({
    decision_id: z.string().uuid(),
    run_id: z.string().uuid(),
    conflict_id: z.string().uuid(),
    selected_resolution: z.string().min(1),
    resolved_by: z.enum(['user', 'system']),
    answer_source: AnswerSourceSchema,
    rationale: z.string().min(1),
    clarifying_question_id: z.string().uuid().optional(),
    selected_recommendation_index: z.number().int().nonnegative().optional(),
    selected_recommendation_value: z.string().min(1).optional(),
    supersedes_decision_id: z.string().uuid().optional(),
    decided_at: z.string().datetime(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.supersedes_decision_id === decision.decision_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supersedes_decision_id'],
        message: 'A decision cannot supersede itself',
      });
    }
    if ((decision.resolved_by === 'system') !== (decision.answer_source === 'system')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer_source'],
        message: 'resolved_by=system iff answer_source=system',
      });
    }
    if (decision.supersedes_decision_id && decision.resolved_by !== 'user') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolved_by'],
        message: 'A superseding decision must use resolved_by=user',
      });
    }
  });

const CountSchema = z.number().int().nonnegative();

export const DocumentEvidenceCoverageSummarySchema = z
  .object({
    source_count: CountSchema,
    assessed_count: CountSchema,
    degraded_count: CountSchema,
    failed_count: CountSchema,
  })
  .strict()
  .superRefine((coverage, context) => {
    const covered = coverage.assessed_count + coverage.degraded_count + coverage.failed_count;
    if (covered !== coverage.source_count) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Coverage counts must equal source_count',
      });
    }
  });

export const DocumentEvidenceRunSummarySchema = z
  .object({
    run_id: z.string().uuid(),
    course_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    input_fingerprint: z.string().min(1),
    evidence_version: z.string().min(1),
    status: DocumentEvidenceRunStatusSchema,
    source_manifest: DocumentEvidenceSourceManifestSchema,
    source_count: CountSchema,
    assessed_count: CountSchema,
    degraded_count: CountSchema,
    failed_count: CountSchema,
    batch_count: CountSchema,
    model_calls: CountSchema,
    input_tokens: CountSchema,
    output_tokens: CountSchema,
    total_cost_usd: z.number().nonnegative(),
    conflict_summary: z
      .object({
        critical: CountSchema,
        important: CountSchema,
        informational: CountSchema,
      })
      .strict(),
    decision_summary: z
      .object({ user: CountSchema, system: CountSchema, unresolved: CountSchema })
      .strict(),
    started_at: z.string().datetime(),
    completed_at: z.string().datetime().nullable().optional(),
    error_category: z.string().min(1).nullable().optional(),
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.source_manifest.length !== summary.source_count) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source_manifest'],
        message: 'source_manifest length must equal source_count',
      });
    }
    if (
      summary.status === 'accepted' &&
      summary.assessed_count + summary.degraded_count + summary.failed_count !==
        summary.source_count
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Accepted run coverage counts must equal source_count',
      });
    }
  });

export const DocumentEvidenceSnapshotSchema = z
  .object({
    accepted_run_id: z.string().uuid(),
    coverage: DocumentEvidenceCoverageSummarySchema,
    current_decision_ids: z.array(z.string().uuid()),
    unresolved_informational_conflict_ids: z.array(z.string().uuid()),
    enrichment_status: DocumentEvidenceEnrichmentStatusSchema,
  })
  .strict();

export type DocumentAuthorityScope = z.infer<typeof DocumentAuthorityScopeSchema>;
export type DocumentEvidenceMode = z.infer<typeof DocumentEvidenceModeSchema>;
export type DocumentCoverageStatus = z.infer<typeof DocumentCoverageStatusSchema>;
export type DocumentEvidenceRunStatus = z.infer<typeof DocumentEvidenceRunStatusSchema>;
export type DocumentEvidenceEnrichmentStatus = z.infer<
  typeof DocumentEvidenceEnrichmentStatusSchema
>;
export type EvidenceSourceRef = z.infer<typeof EvidenceSourceRefSchema>;
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;
export type DocumentEvidenceTokenCounts = z.infer<typeof DocumentEvidenceTokenCountsSchema>;
export type DocumentEvidenceSourceManifestEntry = z.infer<
  typeof DocumentEvidenceSourceManifestEntrySchema
>;
export type DocumentEvidenceSourceManifest = z.infer<typeof DocumentEvidenceSourceManifestSchema>;
export type DocumentEvidenceCard = z.infer<typeof DocumentEvidenceCardSchema>;
export type DocumentConflictSide = z.infer<typeof DocumentConflictSideSchema>;
export type DocumentConflict = z.infer<typeof DocumentConflictSchema>;
export type DocumentDecision = z.infer<typeof DocumentDecisionSchema>;
export type DocumentEvidenceCoverageSummary = z.infer<typeof DocumentEvidenceCoverageSummarySchema>;
export type DocumentEvidenceRunSummary = z.infer<typeof DocumentEvidenceRunSummarySchema>;
export type DocumentEvidenceSnapshot = z.infer<typeof DocumentEvidenceSnapshotSchema>;
