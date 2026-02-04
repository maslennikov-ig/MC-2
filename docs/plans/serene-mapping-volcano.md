# Plan: mc2-7wdr + mc2-88sv

## Task 1: mc2-7wdr — Extend validateGeneratedContent to Stage 7

### Analysis Summary

- **Current state**: `validateGeneratedContent()` checks 7 prompt markers in Stage 6 patcher
- **Stage 7 handlers**: Generate JSON (quiz, video, presentation) — already validated by Zod schemas
- **Section-expander**: Generates markdown — NO prompt marker validation currently
- **Risk**: Section-expander can hallucinate prompt structure (same as patcher)

### Recommendation: Add validation ONLY to section-expander

Stage 7 JSON outputs don't need marker validation (Zod schema catches malformed JSON).
Section-expander outputs markdown and lacks protection.

### Implementation Steps

**Step 1**: Extend markers in `generator-content.ts`

```typescript
// Add section-expander specific markers
export const SECTION_EXPANDER_MARKERS = [
  '## SECTION INFORMATION',
  '## LEARNING OBJECTIVES FOR THIS SECTION',
  '## ISSUES TO ADDRESS',
  '## ORIGINAL CONTENT (for reference)',
  '## REFERENCE MATERIALS (RAG)',
  'REGENERATED SECTION:',
] as const;

export const ALL_PROMPT_MARKERS = [
  ...PROMPT_TEMPLATE_MARKERS,
  ...SECTION_EXPANDER_MARKERS,
] as const;
```

**Step 2**: Add validation call in `section-expander/index.ts`

- Import `validateGeneratedContent`
- Call after LLM response, before returning
- On failure: return original content with error message

### Files to Modify

- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-content.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/section-expander/index.ts`

### Estimated Scope

- ~20 lines code changes
- Low risk, minimal impact

---

## Task 2: mc2-88sv — Migrate user preferences to Supabase

### Analysis Summary

- **Current state**: localStorage only, Supabase code ALREADY WRITTEN but commented out
- **Missing**: Database table `user_preferences`
- **Blocker**: Table doesn't exist, code is disabled pending table creation

### Implementation Steps

**Step 1**: Create migration file

```
packages/course-gen-platform/supabase/migrations/20260202150000_user_preferences.sql
```

```sql
-- Table
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_preferences" ON user_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_preferences" ON user_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_preferences" ON user_preferences
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_preferences" ON user_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trigger
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Step 2**: Apply migration

```bash
mcp__supabase__apply_migration
```

**Step 3**: Generate TypeScript types

```bash
mcp__supabase__generate_typescript_types
```

**Step 4**: Enable code in `user-preferences.ts`

- Remove `_` prefix from parameters (`_supabase` → `supabase`, `_userId` → `userId`)
- Uncomment Supabase integration blocks (lines 76-122, 135-172)
- Remove TODO comments

### Files to Modify/Create

- `packages/course-gen-platform/supabase/migrations/20260202150000_user_preferences.sql` (CREATE)
- `packages/web/lib/user-preferences.ts` (MODIFY)
- `packages/shared-types/src/database.types.ts` (AUTO-GENERATED)

### Data Flow After Migration

```
Load: Supabase → localStorage cache → Return
Save: Supabase (primary) + localStorage (cache/fallback)
Offline: localStorage fallback gracefully
```

---

## Verification

### Task 1 (mc2-7wdr)

```bash
pnpm type-check
pnpm build
# Manual: trigger section-expander with malformed prompt response
```

### Task 2 (mc2-88sv)

```bash
# 1. Apply migration
mcp__supabase__apply_migration

# 2. Generate types
mcp__supabase__generate_typescript_types

# 3. Type-check & build
pnpm type-check
pnpm build

# 4. Manual test on profile page:
#    - Login
#    - Change theme/language
#    - Refresh page — settings should persist
#    - Login from different browser — settings should sync
```

---

## Execution Order

1. **mc2-88sv first** (database migration + code enable)
2. **mc2-7wdr second** (small code change)
3. Single commit with both changes
4. `/push patch`

---

## Risk Assessment

| Task     | Risk                       | Mitigation                                                |
| -------- | -------------------------- | --------------------------------------------------------- |
| mc2-88sv | Migration failure          | Test locally first, RLS policies follow existing patterns |
| mc2-88sv | Existing localStorage data | Auto-migrates on first authenticated load (existing code) |
| mc2-7wdr | False positives            | Markers are highly specific to prompts                    |
| mc2-7wdr | Performance                | validateGeneratedContent is O(n) string scan, negligible  |
