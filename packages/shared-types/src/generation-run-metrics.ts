/**
 * Stage 5 generation metadata: what a run cost, how it scored, how it retried.
 * @module generation-run-metrics
 *
 * Split out of `generation-result.ts` at 617 lines of code against a limit of
 * 500. The two halves answer different questions — the other one describes the
 * COURSE (objectives, lessons, sections, structure, metadata), this one
 * describes the RUN that produced it (models, tokens, duration, quality scores,
 * retries, document-evidence enrichment). Only one edge crosses between them,
 * and it is a type.
 *
 * Named `-run-metrics` rather than `-metadata` because `generation-metadata.ts` is already
 * taken, by the helper module that CONSUMES these schemas (`getEmptyMetadata`,
 * `updatePhaseMetrics`, `isGenerationMetadata`).
 *
 * Re-exported by `generation-result.ts`, so every existing import is unaffected.
 */

import { z } from 'zod';
import {
  DocumentEvidenceEnrichmentStatusSchema,
  EvidenceSourceRefSchema,
} from './document-evidence';
import type { CourseStructure } from './generation-result';

/**
 * Model usage per generation phase
 * Tracks which models were used for metadata, sections, and validation
 */
export const SectionModelUsageSchema = z.object({
  section_number: z.number().int().min(1).describe('Section number (1-based)'),
  model: z.string().describe('Actual model used for this section generation'),
  tier: z
    .string()
    .optional()
    .describe('Model tier selected for this section (simple/normal/complex)'),
  retry_count: z.number().int().min(0).describe('Retry count for this section generation'),
});

export type SectionModelUsage = z.infer<typeof SectionModelUsageSchema>;

export const ModelUsageSchema = z.object({
  metadata: z.string().describe('Model used for metadata generation (e.g., qwen/qwen3-max)'),
  sections: z.string().describe('Model used for section generation (e.g., openai/gpt-oss-20b)'),
  validation: z.string().optional().describe('Model used for validation (if applicable)'),
  sections_breakdown: z
    .array(SectionModelUsageSchema)
    .optional()
    .describe('Per-section model usage breakdown (actual model, tier, retries)'),
});

export type ModelUsage = z.infer<typeof ModelUsageSchema>;

/**
 * Token usage per generation phase
 * Validates compliance with RT-003 budget constraints
 */
export const TokenUsageSchema = z.object({
  metadata: z.number().int().min(0).describe('Tokens used for metadata phase'),
  sections: z.number().int().min(0).describe('Tokens used for all section batches'),
  validation: z.number().int().min(0).describe('Tokens used for validation phase'),
  total: z.number().int().min(0).describe('Total tokens used'),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Duration in milliseconds per generation phase
 * Enables latency monitoring and performance optimization
 */
export const DurationSchema = z.object({
  metadata: z.number().int().min(0).describe('Duration of metadata phase (ms)'),
  sections: z.number().int().min(0).describe('Duration of section batches (ms)'),
  validation: z.number().int().min(0).describe('Duration of validation phase (ms)'),
  total: z.number().int().min(0).describe('Total pipeline duration (ms)'),
});

export type Duration = z.infer<typeof DurationSchema>;

const StructuralIssueDetailsValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  z.array(z.number()),
]);

/**
 * Quality scores based on semantic similarity (Jina-v3 embeddings)
 * RT-004 validation thresholds for quality assurance
 */
export const QualityScoresSchema = z.object({
  metadata_similarity: z
    .number()
    .min(0)
    .max(1)
    .describe('Semantic similarity score for metadata (Jina-v3)'),

  sections_similarity: z
    .array(z.number().min(0).max(1))
    .describe('Semantic similarity scores per section batch'),

  overall: z.number().min(0).max(1).describe('Overall quality score (weighted average)'),

  structure: z
    .object({
      passed: z.boolean(),
      hasCriticalIssues: z.boolean(),
      profileId: z.string(),
      totalLessons: z.number().int().min(0),
      computedDurationHours: z.number().min(0),
      criticalIssues: z.array(
        z.object({
          code: z.string(),
          severity: z.enum(['critical', 'warning']),
          message: z.string(),
          details: z.record(StructuralIssueDetailsValueSchema).optional(),
        })
      ),
      warnings: z.array(
        z.object({
          code: z.string(),
          severity: z.enum(['critical', 'warning']),
          message: z.string(),
          details: z.record(StructuralIssueDetailsValueSchema).optional(),
        })
      ),
    })
    .optional()
    .describe('Deterministic Stage 5 structural quality gate result'),
});

export type QualityScores = z.infer<typeof QualityScoresSchema>;

/**
 * Retry counts per generation phase
 * RT-004 10-attempt tiered retry strategy tracking
 */
export const RetryCountSchema = z.object({
  metadata: z.number().int().min(0).describe('Retry count for metadata generation'),
  sections: z.array(z.number().int().min(0)).describe('Retry counts per section batch'),
});

export type RetryCount = z.infer<typeof RetryCountSchema>;

const Stage5EvidenceRefSchema = EvidenceSourceRefSchema;

const Stage5SectionEvidenceSchema = z
  .object({
    section_number: z.number().int().positive(),
    search_queries: z.array(z.string().min(3).max(300)).max(4),
    evidence_refs: z.array(Stage5EvidenceRefSchema).max(16),
  })
  .strict()
  .superRefine((section, context) => {
    if (new Set(section.search_queries).size !== section.search_queries.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['search_queries'],
        message: 'Stage 5 evidence search queries must be unique',
      });
    }
    const refKeys = section.evidence_refs.map(ref => JSON.stringify(ref));
    if (new Set(refKeys).size !== refKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidence_refs'],
        message: 'Stage 5 evidence refs must be unique',
      });
    }
  });

/**
 * Durable, privacy-safe audit of the Stage 5 advisory evidence pass.
 * Source and claim bodies deliberately remain in tenant-scoped evidence storage.
 */
export const Stage5DocumentEvidenceEnrichmentSchema = z
  .object({
    schema_version: z.literal('stage5-document-evidence-enrichment-v1'),
    status: DocumentEvidenceEnrichmentStatusSchema,
    accepted_run_id: z.string().uuid().nullable(),
    accepted_decision_ids: z.array(z.string().uuid()).max(1_000),
    section_evidence: z.array(Stage5SectionEvidenceSchema).max(30),
    provenance_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    attempted_patches: z.number().int().min(0).max(2),
    retrieved_ref_count: z.number().int().nonnegative().max(480),
    fallback_section_count: z.number().int().nonnegative().max(30),
  })
  .strict()
  .superRefine((record, context) => {
    const sortedDecisions = [...record.accepted_decision_ids].sort();
    if (
      new Set(record.accepted_decision_ids).size !== record.accepted_decision_ids.length ||
      sortedDecisions.some(
        (decisionId, index) => decisionId !== record.accepted_decision_ids[index]
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accepted_decision_ids'],
        message: 'Stage 5 accepted decision IDs must be sorted and unique',
      });
    }
    const sectionNumbers = record.section_evidence.map(section => section.section_number);
    if (
      new Set(sectionNumbers).size !== sectionNumbers.length ||
      sectionNumbers.some(
        (sectionNumber, index) => index > 0 && sectionNumber <= sectionNumbers[index - 1]
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['section_evidence'],
        message: 'Stage 5 section evidence must be sorted and unique by section number',
      });
    }
    const refCount = record.section_evidence.reduce(
      (total, section) => total + section.evidence_refs.length,
      0
    );
    if (record.retrieved_ref_count !== refCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retrieved_ref_count'],
        message: 'Stage 5 retrieved ref count must equal persisted section refs',
      });
    }
    if (record.status === 'not_applicable') {
      if (
        record.accepted_run_id !== null ||
        record.accepted_decision_ids.length > 0 ||
        record.section_evidence.length > 0 ||
        record.attempted_patches !== 0 ||
        record.fallback_section_count !== 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'not_applicable Stage 5 evidence cannot reference a run, decisions, or evidence',
        });
      }
    } else if (record.accepted_run_id === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accepted_run_id'],
        message: 'Applicable Stage 5 evidence requires an accepted run',
      });
    }
  });

export type Stage5DocumentEvidenceEnrichment = z.infer<
  typeof Stage5DocumentEvidenceEnrichmentSchema
>;

/**
 * Complete generation metadata schema (FR-025)
 * Stored in courses.generation_metadata JSONB column
 */
export const GenerationMetadataSchema = z.object({
  model_used: ModelUsageSchema,
  total_tokens: TokenUsageSchema,
  cost_usd: z.number().min(0).describe('Total cost in USD'),
  duration_ms: DurationSchema,
  quality_scores: QualityScoresSchema,
  batch_count: z.number().int().positive().describe('Number of section batches processed'),
  retry_count: RetryCountSchema,
  document_evidence_enrichment: Stage5DocumentEvidenceEnrichmentSchema.optional(),
  created_at: z.string().datetime().describe('ISO 8601 timestamp of generation completion'),
});

export type GenerationMetadata = z.infer<typeof GenerationMetadataSchema>;

// ============================================================================
// FULL GENERATION RESULT
// ============================================================================

/**
 * Complete generation result combining course structure and metadata
 */
export interface GenerationResult {
  course_structure: CourseStructure;
  generation_metadata: GenerationMetadata;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validation is integrated into Zod schemas:
 *
 * - CourseStructureSchema: Placeholder detection
 * - LearningObjectiveSchema: Text length validation
 */
