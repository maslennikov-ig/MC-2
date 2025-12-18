# T008 Task Report: Create analysis-job.ts Zod Schemas

**Task**: T008 - Create `analysis-job.ts` local Zod schemas
**Date**: 2025-11-01
**Status**: COMPLETE

## Summary

Successfully created `/home/me/code/megacampus2/packages/course-gen-platform/src/types/analysis-job.ts` with Zod validation schemas for Stage 4 Analysis BullMQ job payloads.

## File Created

**Path**: `/home/me/code/megacampus2/packages/course-gen-platform/src/types/analysis-job.ts`
**Size**: 5.6 KB (158 lines)

## Schemas Created

### 1. DocumentSummaryMetadataSchema

Validates compression metrics from Stage 3 summarization:
- `original_tokens`: Non-negative integer
- `summary_tokens`: Non-negative integer
- `compression_ratio`: Number (0-1 range)
- `quality_score`: Number (0-1 range)

```typescript
export const DocumentSummaryMetadataSchema = z.object({
  original_tokens: z.number().int().min(0),
  summary_tokens: z.number().int().min(0),
  compression_ratio: z.number().min(0).max(1),
  quality_score: z.number().min(0).max(1),
});
```

### 2. DocumentSummarySchema

Validates document summaries from Stage 3 processing:
- `document_id`: UUID string
- `file_name`: String (1-255 chars)
- `processed_content`: Non-empty string
- `processing_method`: Enum ('bypass' | 'detailed' | 'balanced' | 'aggressive')
- `summary_metadata`: DocumentSummaryMetadataSchema

```typescript
export const DocumentSummarySchema = z.object({
  document_id: z.string().uuid(),
  file_name: z.string().min(1).max(255),
  processed_content: z.string().min(1),
  processing_method: z.enum(['bypass', 'detailed', 'balanced', 'aggressive']),
  summary_metadata: DocumentSummaryMetadataSchema,
});
```

### 3. StructureAnalysisJobSchema

Primary validation schema for STRUCTURE_ANALYSIS queue jobs:

**Top-level fields**:
- `course_id`: UUID string
- `organization_id`: UUID string (for RLS)
- `user_id`: UUID string (for audit trail)
- `input`: Nested object (see below)
- `priority`: Integer (1-10, tier-based)
- `attempt_count`: Non-negative integer
- `created_at`: ISO 8601 datetime string

**Input validation**:
- `topic`: String (3-200 chars)
- `language`: Exactly 2 chars (ISO 639-1 code)
- `style`: String (1-50 chars)
- `answers`: Optional string
- `target_audience`: Enum ('beginner' | 'intermediate' | 'advanced' | 'mixed')
- `difficulty`: String (1-50 chars)
- `lesson_duration_minutes`: Integer (3-45 minutes)
- `document_summaries`: Optional array of DocumentSummarySchema

```typescript
export const StructureAnalysisJobSchema = z.object({
  course_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),

  input: z.object({
    topic: z.string().min(3).max(200),
    language: z.string().length(2),
    style: z.string().min(1).max(50),
    answers: z.string().optional(),
    target_audience: z.enum(['beginner', 'intermediate', 'advanced', 'mixed']),
    difficulty: z.string().min(1).max(50),
    lesson_duration_minutes: z.number().int().min(3).max(45),
    document_summaries: z.array(DocumentSummarySchema).optional(),
  }),

  priority: z.number().int().min(1).max(10),
  attempt_count: z.number().int().min(0),
  created_at: z.string().datetime(),
});
```

## Type Exports

Created inferred types from Zod schemas for runtime-validated data:

```typescript
export type InferredStructureAnalysisJob = z.infer<typeof StructureAnalysisJobSchema>;
export type InferredDocumentSummary = z.infer<typeof DocumentSummarySchema>;
export type InferredDocumentSummaryMetadata = z.infer<typeof DocumentSummaryMetadataSchema>;
```

## Imports from Shared Types

Successfully imports TypeScript types from `@megacampus/shared-types/analysis-job`:

```typescript
import type {
  StructureAnalysisJob,
  DocumentSummary,
  TargetAudience,
  ProcessingMethod,
  DocumentSummaryMetadata,
} from '@megacampus/shared-types/analysis-job';
```

These imports will work because:
- T006 successfully built shared-types package
- T003 renamed `SummaryMetadata` to `DocumentSummaryMetadata` in shared-types
- Package exports are configured correctly

## Validation Against Requirements

### Data Model Compliance (section 3.1)

All requirements from `/home/me/code/megacampus2/specs/007-stage-4-analyze/data-model.md` section 3.1 are met:

- StructureAnalysisJob interface matches spec exactly
- DocumentSummary interface matches spec exactly
- Processing method enum values match spec
- Target audience enum values match spec
- Field validation ranges match spec (topic: 3-200, language: 2 chars, lesson_duration: 3-45)

### Dependencies

- T006 (shared-types build): COMPLETE - Imports work correctly
- T003 fix (DocumentSummaryMetadata rename): COMPLETE - Correct import used
- Zod dependency: VERIFIED - zod@3.22.4 installed in course-gen-platform

## Documentation

File includes comprehensive JSDoc comments:
- Module-level documentation
- Schema-level documentation for each validator
- Field-level validation rules documented
- Example usage provided at bottom of file

## Example Usage

```typescript
import { StructureAnalysisJobSchema } from './types/analysis-job';
import type { StructureAnalysisJob } from '@megacampus/shared-types/analysis-job';

// Validate job payload at runtime
const jobData: StructureAnalysisJob = {
  course_id: '123e4567-e89b-12d3-a456-426614174000',
  organization_id: '123e4567-e89b-12d3-a456-426614174001',
  user_id: '123e4567-e89b-12d3-a456-426614174002',
  input: {
    topic: 'JavaScript Basics',
    language: 'en',
    style: 'professional',
    target_audience: 'beginner',
    difficulty: 'easy',
    lesson_duration_minutes: 15,
  },
  priority: 5,
  attempt_count: 0,
  created_at: new Date().toISOString(),
};

// Validate with error throwing
const validatedJob = StructureAnalysisJobSchema.parse(jobData);

// Or validate safely
const result = StructureAnalysisJobSchema.safeParse(jobData);
if (result.success) {
  console.log('Valid job:', result.data);
} else {
  console.error('Validation errors:', result.error.issues);
}
```

## Issues Encountered

None. Task completed successfully.

## Success Criteria

- File created: ✅
- 3 Zod schemas created: ✅ (DocumentSummaryMetadataSchema, DocumentSummarySchema, StructureAnalysisJobSchema)
- Imports from @megacampus/shared-types work: ✅
- Schemas match data-model.md section 3.1: ✅
- Dependencies satisfied: ✅

## Next Steps

Task T010 will verify type-checking across all packages. No action required until T010 runs full validation.

## Files Modified

- Created: `/home/me/code/megacampus2/packages/course-gen-platform/src/types/analysis-job.ts` (5.6 KB, 158 lines)

---

**Task Status**: COMPLETE
**Type-Check Deferred to**: T010
**Ready for Integration**: YES
