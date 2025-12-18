# Stage 5 Generation Metadata Migration

**Migration File:** `20251108000000_stage5_generation_metadata.sql`
**Created:** 2025-11-08
**Status:** ⚠️ PENDING MANUAL APPLICATION
**Task:** T001 from tasks.md

## Overview

This migration adds infrastructure for Stage 5 (Course Structure JSON Generation) tracking:

1. **New JSONB Column:** `courses.generation_metadata`
2. **GIN Index:** `idx_courses_generation_metadata` for efficient JSONB queries
3. **Validation Function:** `validate_minimum_lessons(course_structure JSONB)` for FR-015 enforcement

## What This Migration Adds

### 1. generation_metadata JSONB Column

Tracks comprehensive generation metrics across all phases:

```typescript
{
  model_used: {
    metadata: string,      // Model ID for metadata generation phase
    sections: string,      // Model ID for sections generation phase
    validation?: string    // Optional model ID for validation phase
  },
  total_tokens: {
    metadata: number,      // Tokens consumed in metadata phase
    sections: number,      // Tokens consumed in sections phase
    validation: number,    // Tokens consumed in validation phase
    total: number          // Sum of all token usage
  },
  cost_usd: number,        // Total generation cost in USD
  duration_ms: {
    metadata: number,      // Duration of metadata phase (milliseconds)
    sections: number,      // Duration of sections phase (milliseconds)
    validation: number,    // Duration of validation phase (milliseconds)
    total: number          // Total generation duration (milliseconds)
  },
  quality_scores: {
    metadata_similarity: number,    // 0-1 Jina-v3 similarity score for metadata
    sections_similarity: number[],  // 0-1 similarity scores per section
    overall: number                 // Weighted average quality score
  },
  batch_count: number,     // Number of batches (= total_sections, SECTIONS_PER_BATCH = 1)
  retry_count: {
    metadata: number,      // Number of retry attempts for metadata generation
    sections: number[]     // Retry attempts per section batch
  },
  created_at: string       // ISO 8601 timestamp of generation completion
}
```

### 2. GIN Index

```sql
CREATE INDEX IF NOT EXISTS idx_courses_generation_metadata
ON courses USING GIN (generation_metadata);
```

Enables fast queries like:
```sql
-- Find expensive generations
SELECT id, title, generation_metadata->'cost_usd' as cost
FROM courses
WHERE (generation_metadata->>'cost_usd')::numeric > 1.0;

-- Find slow generations
SELECT id, title, generation_metadata->'duration_ms'->'total' as duration
FROM courses
WHERE (generation_metadata->'duration_ms'->>'total')::int > 30000;

-- Find low-quality generations
SELECT id, title, generation_metadata->'quality_scores'->'overall' as quality
FROM courses
WHERE (generation_metadata->'quality_scores'->>'overall')::numeric < 0.7;
```

### 3. validate_minimum_lessons() Function

**Purpose:** Enforces FR-015 requirement (minimum 10 lessons per course)

**Signature:**
```sql
CREATE OR REPLACE FUNCTION validate_minimum_lessons(course_structure JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
```

**Usage:**
```sql
-- Check if course meets minimum lesson requirement
SELECT validate_minimum_lessons(course_structure)
FROM courses
WHERE id = 'course-uuid';

-- Find courses that don't meet requirement
SELECT id, title, course_structure
FROM courses
WHERE NOT validate_minimum_lessons(course_structure);

-- Use in application validation
IF NOT validate_minimum_lessons(new_course_structure) THEN
  RAISE EXCEPTION 'Course must have at least 10 lessons (FR-015)';
END IF;
```

**Implementation Details:**
- Iterates through all sections in `course_structure.sections` array
- Counts total lessons using `jsonb_array_length(section->'lessons')`
- Returns TRUE if total >= 10, FALSE otherwise
- Marked as IMMUTABLE for potential index usage

## Manual Application Instructions

Since Supabase CLI encountered connection issues, apply manually:

### Option 1: Supabase Dashboard SQL Editor

1. Go to https://supabase.com/dashboard/project/diqooqbuchsliypgwksu/sql
2. Copy the contents of `20251108000000_stage5_generation_metadata.sql`
3. Paste into SQL Editor
4. Click "Run" to execute
5. Verify with queries below

### Option 2: psql Command Line

```bash
# Set password (replace with your actual password)
export PGPASSWORD="YOUR_PASSWORD_HERE"

# Apply migration
psql \
  -h db.diqooqbuchsliypgwksu.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f 20251108000000_stage5_generation_metadata.sql
```

### Option 3: Supabase CLI (when connection stable)

```bash
cd /path/to/packages/course-gen-platform

# Set access token (replace with your actual access token)
export SUPABASE_ACCESS_TOKEN="YOUR_ACCESS_TOKEN_HERE"

# Link project
npx supabase link --project-ref diqooqbuchsliypgwksu

# Push migration
npx supabase db push
```

## Verification Queries

After applying the migration, run these queries to verify:

### 1. Check Column Exists

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'courses'
  AND column_name = 'generation_metadata';
```

Expected result:
```
column_name          | data_type | is_nullable
---------------------|-----------|------------
generation_metadata  | jsonb     | YES
```

### 2. Check Index Exists

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'courses'
  AND indexname = 'idx_courses_generation_metadata';
```

Expected result:
```
indexname                         | indexdef
----------------------------------|--------------------------------------------------
idx_courses_generation_metadata   | CREATE INDEX idx_courses_generation_metadata ...
```

### 3. Check Function Exists

```sql
\df validate_minimum_lessons
```

OR

```sql
SELECT routine_name, data_type, routine_definition
FROM information_schema.routines
WHERE routine_name = 'validate_minimum_lessons';
```

Expected: Function should exist with return type `boolean`

### 4. Test Function

```sql
-- Test with valid structure (11 lessons)
SELECT validate_minimum_lessons(
  '{
    "sections": [
      {
        "title": "Section 1",
        "lessons": [
          {"title": "Lesson 1"}, {"title": "Lesson 2"}, {"title": "Lesson 3"},
          {"title": "Lesson 4"}, {"title": "Lesson 5"}, {"title": "Lesson 6"}
        ]
      },
      {
        "title": "Section 2",
        "lessons": [
          {"title": "Lesson 7"}, {"title": "Lesson 8"}, {"title": "Lesson 9"},
          {"title": "Lesson 10"}, {"title": "Lesson 11"}
        ]
      }
    ]
  }'::jsonb
);
-- Expected: TRUE

-- Test with invalid structure (9 lessons)
SELECT validate_minimum_lessons(
  '{
    "sections": [
      {
        "title": "Section 1",
        "lessons": [
          {"title": "Lesson 1"}, {"title": "Lesson 2"}, {"title": "Lesson 3"}
        ]
      },
      {
        "title": "Section 2",
        "lessons": [
          {"title": "Lesson 4"}, {"title": "Lesson 5"}, {"title": "Lesson 6"},
          {"title": "Lesson 7"}, {"title": "Lesson 8"}, {"title": "Lesson 9"}
        ]
      }
    ]
  }'::jsonb
);
-- Expected: FALSE
```

### 5. Check Column Comment

```sql
SELECT
  col_description('courses'::regclass, ordinal_position) as description
FROM information_schema.columns
WHERE table_name = 'courses'
  AND column_name = 'generation_metadata';
```

Expected: Should show descriptive comment about Stage 5 tracking

## Rollback Instructions

If needed, rollback with:

```sql
-- Drop function
DROP FUNCTION IF EXISTS validate_minimum_lessons(JSONB);

-- Drop index
DROP INDEX IF EXISTS idx_courses_generation_metadata;

-- Drop column (WARNING: data loss!)
ALTER TABLE courses DROP COLUMN IF EXISTS generation_metadata;
```

## Integration Points

### TypeScript Interface

```typescript
// Add to your types file
interface GenerationMetadata {
  model_used: {
    metadata: string;
    sections: string;
    validation?: string;
  };
  total_tokens: {
    metadata: number;
    sections: number;
    validation: number;
    total: number;
  };
  cost_usd: number;
  duration_ms: {
    metadata: number;
    sections: number;
    validation: number;
    total: number;
  };
  quality_scores: {
    metadata_similarity: number;
    sections_similarity: number[];
    overall: number;
  };
  batch_count: number;
  retry_count: {
    metadata: number;
    sections: number[];
  };
  created_at: string;
}
```

### API Usage Example

```typescript
// Update generation metadata after Stage 5 completion
const { data, error } = await supabase
  .from('courses')
  .update({
    generation_metadata: {
      model_used: {
        metadata: 'openai/gpt-4-turbo',
        sections: 'anthropic/claude-3.5-sonnet'
      },
      total_tokens: {
        metadata: 1500,
        sections: 8500,
        validation: 200,
        total: 10200
      },
      cost_usd: 0.52,
      duration_ms: {
        metadata: 2500,
        sections: 12000,
        validation: 800,
        total: 15300
      },
      quality_scores: {
        metadata_similarity: 0.92,
        sections_similarity: [0.88, 0.91, 0.89, 0.93],
        overall: 0.90
      },
      batch_count: 4,
      retry_count: {
        metadata: 0,
        sections: [0, 1, 0, 0]
      },
      created_at: new Date().toISOString()
    }
  })
  .eq('id', courseId);
```

## Files Updated

1. **Migration:** `packages/course-gen-platform/supabase/migrations/20251108000000_stage5_generation_metadata.sql`
2. **Documentation:** `docs/SUPABASE-DATABASE-REFERENCE.md`
   - Updated version to "Stage 8.1 + Stage 4 Analysis + Stage 5 Generation"
   - Added generation_metadata field to courses table section (lines 93-101)
   - Added validate_minimum_lessons function to Functions & RPCs section (lines 829-870)
   - Updated "Last Updated" to 2025-11-08

## Next Steps

1. Apply migration manually using one of the options above
2. Run verification queries to confirm success
3. Update task T001 status in tasks.md to "completed"
4. Implement Stage 5 generation logic to populate this field
5. Add analytics queries to track generation costs and quality

## References

- **Task:** T001 in `specs/008-generation-generation-json/tasks.md`
- **Requirement:** FR-015 (minimum 10 lessons per course)
- **Related Migrations:**
  - `20251031110000_stage4_analysis_fields.sql` - Added analysis_result column
  - `20251031100000_stage4_model_config.sql` - Added llm_model_config table
- **Schema Docs:** `/docs/SUPABASE-DATABASE-REFERENCE.md`
