# Plan: mc2-py1b — Optimize DB view performance for export-lessons

## Problem

`export-lessons.ts` fetches ALL lesson_contents versions per lesson, then filters to `status='completed'` and sorts by `created_at DESC` in JavaScript. For large courses (50 lessons x 10 versions = 500 rows), this is 10x more data than needed.

**File:** `packages/course-gen-platform/src/server/routers/lesson-content/procedures/export-lessons.ts`
**TODO at line 181:** Suggests creating a `latest_lesson_contents` database view.

## Research Findings

### PostgREST + Views (Context7 + Supabase docs)

PostgREST can infer FK relationships for **simple** views by parsing `pg_rewrite`, but it's **unreliable** for complex views (DISTINCT ON, LATERAL, UNION). The naive approach `lessons → latest_lesson_contents!lesson_id(...)` is risky.

**Solution:** Create a **combined view** `lessons_with_latest_content` that joins lessons + lesson_contents. Query directly via `.from('view_name')` — no FK inference needed.

### DISTINCT ON vs LEFT JOIN LATERAL (web research)

For "latest row per group" pattern:

- **`LEFT JOIN LATERAL ... LIMIT 1`** — faster on PG15-16 (our Supabase version), works well when outer relation is small (lessons per section = ~10-50)
- **`DISTINCT ON`** — simpler syntax but scans all rows pre-PG18 (no Skip Scan)
- PG18+ introduced Skip Scan making DISTINCT ON competitive, but we're on PG15

**Decision:** Use `LEFT JOIN LATERAL` — proven faster pattern, already used in our codebase.

Sources:

- [PostgREST Resource Embedding docs](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html)
- [Supabase Joins & Nesting](https://supabase.com/docs/guides/database/joins-and-nesting)
- [Fastest way to get most recent row per group in Postgres](https://ellisvalentiner.com/post/2023-01-07-the-fastest-way-to-get-the-most-recent-row-per-group-in-postgres/)
- [How to make DISTINCT ON faster](https://copyprogramming.com/howto/how-to-make-distinct-on-faster-in-postgresql)

## Implementation

### Step 1: Create Supabase migration

**File:** `packages/course-gen-platform/supabase/migrations/20260204000000_create_lessons_latest_content_view.sql`

```sql
-- Optimize export-lessons: combined view with latest completed content per lesson
-- Uses LEFT JOIN LATERAL + LIMIT 1 (more efficient than DISTINCT ON for this pattern)

CREATE OR REPLACE VIEW public.lessons_with_latest_content
WITH (security_invoker = true)
AS
SELECT
  l.id AS lesson_id,
  l.section_id,
  l.title AS lesson_title,
  l.order_index,
  lc.content,
  lc.metadata AS content_metadata,
  lc.created_at AS content_created_at
FROM lessons l
LEFT JOIN LATERAL (
  SELECT lc2.content, lc2.metadata, lc2.created_at
  FROM lesson_contents lc2
  WHERE lc2.lesson_id = l.id AND lc2.status = 'completed'
  ORDER BY lc2.created_at DESC
  LIMIT 1
) lc ON true;

COMMENT ON VIEW public.lessons_with_latest_content IS
'Lessons joined with their latest completed content. Used by export-lessons procedure.
LEFT JOIN LATERAL returns NULL content for lessons without completed content.
security_invoker=true respects RLS policies.';

-- Supporting index for the LATERAL subquery
CREATE INDEX IF NOT EXISTS idx_lesson_contents_lesson_completed_latest
  ON lesson_contents(lesson_id, created_at DESC)
  WHERE status = 'completed';

-- Grant access
GRANT SELECT ON public.lessons_with_latest_content TO authenticated;
GRANT SELECT ON public.lessons_with_latest_content TO service_role;
```

**Pattern matches:** Project already uses `LEFT JOIN LATERAL` (see `20260114000000_generation_trace_lifecycle.sql:347`) and `security_invoker = true` (see `20260123090641_fix_security_definer_views.sql`).

### Step 2: Apply migration via MCP

```
mcp__supabase__apply_migration → name: "create_lessons_latest_content_view", sql: <above>
```

### Step 3: Regenerate TypeScript types

```bash
mcp__supabase__generate_typescript_types → write to packages/shared-types/src/database.types.ts
```

### Step 4: Update export-lessons.ts

**Replace lines 177-203** (query + TODO comment):

```typescript
// Step 4: Get all lessons in module with their latest completed content
// Uses database view for performance (1 row per lesson instead of N content versions)
const { data: lessons, error: lessonsError } = await supabase
  .from('lessons_with_latest_content')
  .select('lesson_id, lesson_title, order_index, content, content_metadata, content_created_at')
  .eq('section_id', section.id)
  .order('order_index', { ascending: true });
```

**Replace lines 225-235** (JS filtering/sorting → direct access):

```typescript
for (const lesson of lessons) {
  // Content already filtered (completed only, latest version) by database view
  const lessonContent = lesson.content ? { content: lesson.content } : null;
```

**Adjust field references** throughout the loop:

- `lesson.id` → `lesson.lesson_id`
- `lesson.title` → `lesson.lesson_title`
- `lesson.order_index` — unchanged
- `lessonContent.content` → `lesson.content` (direct from view)

### Step 5: Remove the old TODO comment (lines 181-186)

Already removed by Step 4.

## Files to Modify

1. `packages/course-gen-platform/supabase/migrations/20260204000000_create_lessons_latest_content_view.sql` — **NEW** migration
2. `packages/course-gen-platform/src/server/routers/lesson-content/procedures/export-lessons.ts` — update query + remove JS filtering
3. `packages/shared-types/src/database.types.ts` — regenerate (auto via MCP)

## Verification

1. `mcp__supabase__execute_sql` — verify view exists and returns data:
   ```sql
   SELECT lesson_id, lesson_title, order_index,
          content IS NOT NULL as has_content
   FROM lessons_with_latest_content
   LIMIT 5;
   ```
2. `pnpm type-check` — must pass with regenerated types
3. `pnpm build` — must pass
4. Test the export endpoint manually or via existing tests
5. Verify no duplicate lesson_ids in view:
   ```sql
   SELECT lesson_id, COUNT(*) FROM lessons_with_latest_content
   GROUP BY lesson_id HAVING COUNT(*) > 1;
   -- Should return 0 rows
   ```

## Performance Gain

| Before                              | After                       |
| ----------------------------------- | --------------------------- |
| 500 rows (50 lessons x 10 versions) | 50 rows (1 per lesson)      |
| JS filter + sort in app code        | Database handles everything |
| ~2-5 MB network transfer            | ~200-500 KB                 |
