# FIXES REQUIRED - PHASE 2

**Date:** 2025-11-25
**Priority:** 🔴 CRITICAL
**Blocker for:** Production deployment, Stage 6 functionality, Refinement feature

---

## Overview

Phase 1 fixes created a migration but it has critical schema mismatches with database types and Stage 6 code. This phase corrects the schema and aligns all components.

---

## 🔴 Critical Issues Found

### Issue #1: Migration Not Applied to Database
**File:** `packages/course-gen-platform/supabase/migrations/20251125120000_fix_lesson_contents_refinement.sql`
**Problem:** Migration exists locally but NOT applied to Supabase database.
**Priority:** 🔴 CRITICAL

### Issue #2: Schema Mismatch (Migration vs Types)
**Files:**
- Migration: `20251125120000_fix_lesson_contents_refinement.sql`
- Types: `packages/shared-types/src/database.types.ts` (lines 1098-1145)

**Problem:** Migration creates table WITHOUT required fields.

**Missing in Migration:**
- `course_id UUID NOT NULL` (REQUIRED by types)
- `metadata JSONB NOT NULL DEFAULT '{}'` (REQUIRED by types)

**Type Mismatch:**
- Migration: `content TEXT`
- Types: `content: Json` (JSONB)

**Priority:** 🔴 CRITICAL

### Issue #3: Stage 6 Code Missing Required Fields
**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts` (lines 799-808)
**Problem:** Insert statement missing `course_id` and `metadata`.
**Priority:** 🔴 CRITICAL

### Issue #4: Extra Fields in Migration Not in Types
**File:** `20251125120000_fix_lesson_contents_refinement.sql`
**Problem:** Migration has fields NOT in types:
- `generation_attempt INTEGER`
- `parent_content_id UUID`
- `user_refinement_prompt TEXT`

**Question:** Are these needed for refinement feature? If yes, types need update.
**Priority:** ⚠️ HIGH (clarification needed)

---

## 📋 Tasks to Fix

### Task 1: Create Aligned Migration Schema

**Goal:** Create new migration that matches database types exactly.

**Actions:**

1. **Rename broken migration to .obsolete:**
   ```bash
   cd /home/me/code/megacampus2
   mv packages/course-gen-platform/supabase/migrations/20251125120000_fix_lesson_contents_refinement.sql \
      packages/course-gen-platform/supabase/migrations/20251125120000_fix_lesson_contents_refinement.sql.obsolete
   ```

2. **Create new migration:** `20251125130000_fix_lesson_contents_schema_alignment.sql`

   **Decision Point:** Do we need versioning fields (generation_attempt, parent_content_id, user_refinement_prompt)?

   **Option A: Minimal Schema (matches current types)**
   ```sql
   -- Migration: Fix lesson_contents schema alignment
   -- Purpose: Align lesson_contents table with database.types.ts
   -- Date: 2025-11-25

   -- Drop table if exists (safe because migration never applied)
   DROP TABLE IF EXISTS lesson_contents CASCADE;

   -- Create with correct schema
   CREATE TABLE lesson_contents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
     course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

     -- Content fields (JSONB to match types)
     content JSONB NOT NULL DEFAULT '{}',
     metadata JSONB NOT NULL DEFAULT '{}',
     status TEXT NOT NULL DEFAULT 'pending'
       CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'review_required')),

     -- Timestamps
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   -- Indexes
   CREATE INDEX idx_lesson_contents_lesson_id ON lesson_contents(lesson_id);
   CREATE INDEX idx_lesson_contents_course_id ON lesson_contents(course_id);
   CREATE INDEX idx_lesson_contents_status ON lesson_contents(status);
   CREATE INDEX idx_lesson_contents_created_at ON lesson_contents(created_at DESC);

   -- RLS Policies
   ALTER TABLE lesson_contents ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can view own lesson contents"
     ON lesson_contents FOR SELECT
     TO authenticated
     USING (
       EXISTS (
         SELECT 1 FROM lessons l
         JOIN sections s ON l.section_id = s.id
         JOIN courses c ON s.course_id = c.id
         WHERE l.id = lesson_contents.lesson_id
         AND c.user_id = auth.uid()
       )
     );

   CREATE POLICY "Superadmins can manage all lesson contents"
     ON lesson_contents FOR ALL
     TO authenticated
     USING (is_superadmin(auth.uid()));

   -- Trigger for updated_at
   CREATE TRIGGER update_lesson_contents_updated_at
     BEFORE UPDATE ON lesson_contents
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();

   -- Cleanup: Remove incorrect columns from lesson_content (singular)
   ALTER TABLE lesson_content DROP COLUMN IF EXISTS generation_attempt;
   ALTER TABLE lesson_content DROP COLUMN IF EXISTS parent_content_id;
   ALTER TABLE lesson_content DROP COLUMN IF EXISTS user_refinement_prompt;
   ```

   **Option B: Extended Schema (with versioning for refinement)**
   ```sql
   -- Migration: Fix lesson_contents schema alignment with versioning
   -- Purpose: Align lesson_contents table with database.types.ts AND add versioning
   -- Date: 2025-11-25

   -- Drop table if exists
   DROP TABLE IF EXISTS lesson_contents CASCADE;

   -- Create with extended schema
   CREATE TABLE lesson_contents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
     course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

     -- Content fields
     content JSONB NOT NULL DEFAULT '{}',
     metadata JSONB NOT NULL DEFAULT '{}',
     status TEXT NOT NULL DEFAULT 'pending'
       CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'review_required')),

     -- Versioning fields (for refinement feature)
     generation_attempt INTEGER NOT NULL DEFAULT 1,
     parent_content_id UUID REFERENCES lesson_contents(id) ON DELETE SET NULL,
     user_refinement_prompt TEXT,

     -- Timestamps
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   -- Indexes
   CREATE INDEX idx_lesson_contents_lesson_id ON lesson_contents(lesson_id);
   CREATE INDEX idx_lesson_contents_course_id ON lesson_contents(course_id);
   CREATE INDEX idx_lesson_contents_parent_id ON lesson_contents(parent_content_id);
   CREATE INDEX idx_lesson_contents_status ON lesson_contents(status);
   CREATE INDEX idx_lesson_contents_created_at ON lesson_contents(created_at DESC);

   -- RLS Policies
   ALTER TABLE lesson_contents ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can view own lesson contents"
     ON lesson_contents FOR SELECT
     TO authenticated
     USING (
       EXISTS (
         SELECT 1 FROM lessons l
         JOIN sections s ON l.section_id = s.id
         JOIN courses c ON s.course_id = c.id
         WHERE l.id = lesson_contents.lesson_id
         AND c.user_id = auth.uid()
       )
     );

   CREATE POLICY "Superadmins can manage all lesson contents"
     ON lesson_contents FOR ALL
     TO authenticated
     USING (is_superadmin(auth.uid()));

   -- Trigger
   CREATE TRIGGER update_lesson_contents_updated_at
     BEFORE UPDATE ON lesson_contents
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();

   -- Cleanup
   ALTER TABLE lesson_content DROP COLUMN IF EXISTS generation_attempt;
   ALTER TABLE lesson_content DROP COLUMN IF EXISTS parent_content_id;
   ALTER TABLE lesson_content DROP COLUMN IF EXISTS user_refinement_prompt;
   ```

   **Recommendation:** Use **Option B** if refinement feature is planned (Phase 5 in tasks.md shows it is). Otherwise use Option A.

3. **Apply migration:**
   ```typescript
   // Use Supabase MCP
   mcp__supabase__apply_migration({
     name: "fix_lesson_contents_schema_alignment",
     query: <SQL from Option A or B above>
   })
   ```

**Acceptance criteria:**
- [ ] Old migration renamed to .obsolete
- [ ] New migration file created with correct schema
- [ ] Migration applied successfully
- [ ] Table `lesson_contents` exists in database
- [ ] All required columns present: id, lesson_id, course_id, content, metadata, status, created_at, updated_at
- [ ] Foreign keys validated: lesson_id → lessons(id), course_id → courses(id)
- [ ] (If Option B) Versioning columns present: generation_attempt, parent_content_id, user_refinement_prompt

---

### Task 2: Update Stage 6 Handler Code

**Goal:** Fix insert statement to include all required fields.

**Actions:**

1. **Update saveLessonContent function:**

   **File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts`

   **Lines 799-808, REPLACE:**
   ```typescript
   // OLD (BROKEN)
   const { error } = await supabaseAdmin
     .from('lesson_contents' as any) // Cast to any until types are updated
     .insert({
       lesson_id: lessonId,
       content: extractContentMarkdown(result.lessonContent),
       status: 'completed',
       generation_attempt: 1,
       updated_at: new Date().toISOString(),
     });
   ```

   **WITH:**
   ```typescript
   // NEW (CORRECT)
   const { error } = await supabaseAdmin
     .from('lesson_contents')
     .insert({
       lesson_id: lessonId,
       course_id: courseId,  // ✅ ADD: Required field
       content: result.lessonContent,  // ✅ FIX: Pass full object (Json), not markdown string
       metadata: {  // ✅ ADD: Required field
         tokensUsed: result.metrics.tokensUsed,
         modelUsed: result.metrics.modelUsed,
         qualityScore: result.metrics.qualityScore,
         durationMs: result.metrics.durationMs,
         generatedAt: new Date().toISOString(),
       },
       status: 'completed' as const,
       // If using Option B migration (with versioning):
       generation_attempt: 1,
       parent_content_id: null,
       user_refinement_prompt: null,
       // Timestamps
       created_at: new Date().toISOString(),
       updated_at: new Date().toISOString(),
     });
   ```

2. **Update extractContentMarkdown usage:**

   **Current usage (WRONG):**
   - `content: extractContentMarkdown(result.lessonContent)` → Returns string

   **New approach (CORRECT):**
   - Store full `LessonContent` object in `content` JSONB column
   - Store extracted markdown in `metadata.markdownContent` if needed for display

   **Alternative:** If you want markdown in `content`:
   ```typescript
   content: { markdown: extractContentMarkdown(result.lessonContent) }
   ```

   **Recommendation:** Store full object in `content`, add `markdownContent` to metadata for backwards compatibility.

**Acceptance criteria:**
- [ ] Insert includes `course_id`
- [ ] Insert includes `metadata` with metrics
- [ ] Content type matches schema (JSONB object, not string)
- [ ] (If Option B) Versioning fields set correctly
- [ ] No TypeScript errors
- [ ] Remove `as any` cast

---

### Task 3: Regenerate Database Types

**Goal:** Update TypeScript types to match new database schema.

**Actions:**

1. **Generate types from database:**
   ```typescript
   // Use Supabase MCP
   const typesOutput = await mcp__supabase__generate_typescript_types();
   ```

2. **Update types file:**
   ```bash
   # Copy output to main types file
   # File: packages/shared-types/src/database.types.ts
   ```

3. **Verify lesson_contents table in types:**

   **If Option A (minimal schema):**
   ```typescript
   lesson_contents: {
     Row: {
       id: string
       lesson_id: string
       course_id: string
       content: Json
       metadata: Json
       status: Database["public"]["Enums"]["lesson_content_status"]
       created_at: string
       updated_at: string
     }
     Insert: {
       id?: string
       lesson_id: string
       course_id: string
       content?: Json
       metadata?: Json
       status?: Database["public"]["Enums"]["lesson_content_status"]
       created_at?: string
       updated_at?: string
     }
     Update: {
       // ... same optional fields
     }
     Relationships: [
       {
         foreignKeyName: "lesson_contents_lesson_id_fkey"
         columns: ["lesson_id"]
         isOneToOne: true
         referencedRelation: "lessons"
         referencedColumns: ["id"]
       },
       {
         foreignKeyName: "lesson_contents_course_id_fkey"
         columns: ["course_id"]
         isOneToOne: false
         referencedRelation: "courses"
         referencedColumns: ["id"]
       }
     ]
   }
   ```

   **If Option B (with versioning):**
   ```typescript
   lesson_contents: {
     Row: {
       id: string
       lesson_id: string
       course_id: string
       content: Json
       metadata: Json
       status: Database["public"]["Enums"]["lesson_content_status"]
       generation_attempt: number
       parent_content_id: string | null
       user_refinement_prompt: string | null
       created_at: string
       updated_at: string
     }
     Insert: {
       // Same as Row but with optional fields
     }
     Relationships: [
       // ... lesson_id, course_id FKs
       {
         foreignKeyName: "lesson_contents_parent_content_id_fkey"
         columns: ["parent_content_id"]
         isOneToOne: false
         referencedRelation: "lesson_contents"
         referencedColumns: ["id"]  // ← CRITICAL: Must be "id", not "lesson_id"
       }
     ]
   }
   ```

4. **Verify type-check passes:**
   ```bash
   pnpm type-check
   ```

**Acceptance criteria:**
- [ ] Types file updated
- [ ] `lesson_contents` table present in types
- [ ] All columns match migration schema
- [ ] Foreign key relationships correct (especially parent_content_id → lesson_contents.id)
- [ ] `pnpm type-check` passes with no errors

---

### Task 4: Update lesson_content Table (Cleanup)

**Goal:** Remove incorrect columns from old `lesson_content` (singular) table.

**Status:** Already in migration (cleanup section), but verify after application.

**Actions:**

1. **Verify columns removed:**
   ```sql
   -- Check schema of lesson_content table
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'lesson_content'
   ORDER BY ordinal_position;
   ```

2. **Should NOT see:**
   - `generation_attempt`
   - `parent_content_id`
   - `user_refinement_prompt`

**Acceptance criteria:**
- [ ] Columns removed from `lesson_content` table
- [ ] No errors from migration cleanup section

---

### Task 5: Verify End-to-End

**Goal:** Test that Stage 6 can successfully insert lesson content.

**Actions:**

1. **Manual test (if possible):**
   ```typescript
   // Create test insert
   const testInsert = await supabaseAdmin
     .from('lesson_contents')
     .insert({
       lesson_id: '<test-lesson-uuid>',
       course_id: '<test-course-uuid>',
       content: { markdown: "# Test Content" },
       metadata: { test: true },
       status: 'completed',
     })
     .select()
     .single();

   console.log('Test insert result:', testInsert);
   ```

2. **Verify insert succeeds:**
   - No errors returned
   - Data correctly inserted
   - Foreign keys validated

3. **Run type-check:**
   ```bash
   pnpm type-check
   ```

4. **Run build:**
   ```bash
   pnpm build
   ```

**Acceptance criteria:**
- [ ] Test insert succeeds
- [ ] Type-check passes
- [ ] Build passes
- [ ] No runtime errors

---

## 🧪 Verification Tests

After all tasks complete, verify:

### Database Verification
```sql
-- 1. Table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'lesson_contents';

-- 2. Columns correct
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'lesson_contents'
ORDER BY ordinal_position;

-- Expected columns (Option A):
-- id, lesson_id, course_id, content, metadata, status, created_at, updated_at

-- Expected columns (Option B):
-- + generation_attempt, parent_content_id, user_refinement_prompt

-- 3. Foreign keys correct
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'lesson_contents' AND tc.constraint_type = 'FOREIGN KEY';

-- Expected FKs:
-- lesson_id → lessons(id)
-- course_id → courses(id)
-- (Option B) parent_content_id → lesson_contents(id)

-- 4. Test insert
INSERT INTO lesson_contents (lesson_id, course_id, content, metadata, status)
VALUES (
  (SELECT id FROM lessons LIMIT 1),
  (SELECT id FROM courses LIMIT 1),
  '{"test": true}'::jsonb,
  '{"test": true}'::jsonb,
  'completed'
)
RETURNING *;
```

### Code Verification
```bash
# Type-check
pnpm type-check

# Build
pnpm build

# Lint (optional)
pnpm lint
```

### Runtime Verification
```bash
# Run Stage 6 for test lesson
# Monitor logs for errors
# Verify lesson_contents row inserted
```

---

## Decision Required

**Question:** Should we use Option A (minimal schema) or Option B (with versioning)?

**Option A:**
- ✅ Matches current database.types.ts
- ✅ Simpler schema
- ❌ No refinement versioning support
- ❌ Need to add versioning later if refinement feature needed

**Option B:**
- ✅ Supports refinement feature (Phase 5 in tasks.md)
- ✅ Future-proof for user refinement prompts
- ⚠️ Need to update database.types.ts after migration
- ⚠️ Stage 6 code needs versioning fields set

**Recommendation:** **Use Option B** because:
1. tasks.md Phase 5 explicitly mentions refinement (T023-T026)
2. Original FIXES-REQUIRED.md requested versioning support
3. Better to add now than migrate later

**User decision needed:** Confirm Option B or choose Option A?

---

## Summary

**Total Tasks:** 5
- Task 1: Create aligned migration (DECISION NEEDED: Option A or B)
- Task 2: Update Stage 6 handler code
- Task 3: Regenerate database types
- Task 4: Verify cleanup of lesson_content table
- Task 5: End-to-end verification

**Estimated Time:** 45-60 minutes

**Blockers:** None (migration never applied, so safe to recreate)

**Risk:** 🔴 HIGH if not fixed (Stage 6 will fail at runtime)

**Next Steps:**
1. **User decides:** Option A or Option B for migration?
2. Execute Task 1 (create migration)
3. Execute Task 2 (update code)
4. Execute Task 3 (regenerate types)
5. Execute Task 4 (verify cleanup)
6. Execute Task 5 (test end-to-end)

---

**Created:** 2025-11-25
**Status:** AWAITING USER DECISION (Option A vs B)
