# Tech Debt: Course Cover Generation

## Status: Planned

## Description

Currently, cover image generation is implemented only for **lessons** (as enrichment type `cover`). The user requested the ability to also generate cover images for **courses** as a whole.

## Current Implementation

- **Lesson covers**: Implemented as enrichment type `cover` in Stage 7
- **Model**: `bytedance-seed/seedream-4.5` via OpenRouter
- **Cost**: ~$0.042 per image ($0.04 image + ~$0.002 LLM prompt)
- **Storage**: Supabase Storage bucket `course-enrichments`

## Proposed Solutions

### Option A: Add `cover_url` field to `courses` table (Simplest)

```sql
ALTER TABLE courses ADD COLUMN cover_url TEXT;
ALTER TABLE courses ADD COLUMN cover_generated_at TIMESTAMPTZ;
```

**Pros**:
- Simple implementation
- No new tables
- Fast queries

**Cons**:
- No generation history
- No metadata tracking
- Different pattern from lesson covers

### Option B: New `course_enrichments` table (Consistent)

```sql
CREATE TABLE course_enrichments (
  id UUID PRIMARY KEY,
  course_id UUID REFERENCES courses(id),
  enrichment_type enrichment_type NOT NULL,
  content JSONB,
  status enrichment_status,
  metadata JSONB,
  -- ... same structure as lesson_enrichments
);
```

**Pros**:
- Consistent with lesson enrichments
- Full metadata tracking
- Extensible for future course-level enrichments

**Cons**:
- New table to maintain
- More complex queries

### Option C: Extend `lesson_enrichments` for course-level (Reuse)

Add `lesson_id` as nullable, add `course_only` boolean.

**Pros**:
- Reuses existing infrastructure
- Single table for all enrichments

**Cons**:
- Breaks current foreign key constraint
- Confusing semantics

## Recommended Approach

**Option B** - Create dedicated `course_enrichments` table for consistency and extensibility.

## Implementation Tasks

1. [ ] Design `course_enrichments` table schema
2. [ ] Create database migration
3. [ ] Add TypeScript types for CourseEnrichment
4. [ ] Create course-cover-handler (can reuse image-generation-service)
5. [ ] Add UI for course cover in CourseSettings or CourseHeader
6. [ ] Add generation trigger in course creation/edit flow

## Generation Trigger Options

1. **Automatic**: Generate cover when course is created/published
2. **Manual**: Button in course settings to generate cover
3. **Stage 5**: Generate during course outline generation (Stage 5)

## Priority

Medium - Nice to have, but lesson covers are the primary use case.

## Related Files

- `/packages/course-gen-platform/src/stages/stage7-enrichments/handlers/cover-handler.ts`
- `/packages/course-gen-platform/src/stages/stage7-enrichments/services/image-generation-service.ts`
- `/packages/shared-types/src/enrichment-content.ts` (CoverEnrichmentContent schema)
