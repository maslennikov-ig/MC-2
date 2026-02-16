# Fix: Stage 4 Phase 3 stale DB prompt template (mc2-2peu)

## Context

**Problem**: After commit `6be9a309` (today, Feb 16) migrated Phase 3 Expert to `PromptService.renderPrompt()`, the code fetches the **old DB template** (seeded Dec 2025, version 2) which asks for `teaching_style`, `practical_focus`, `interactivity_level`, `expansion_areas` — a completely different schema. The LLM follows the old prompt format, but `Phase3OutputSchema` expects `pedagogical_strategy.assessment_approach` + `progression_logic`. Zod validation fails, all 3 retries exhaust, CRITICAL error cascades to 4 fingerprints.

**Root cause**: Task mc2-ruwv migrated Phase 3 code to PromptService but didn't create a DB migration to update the stale prompt template.

**Why only Phase 3 broke**: Phases 1 and 4 survived because their DB keys (`stage4_phase1_classification`, `stage4_phase4_synthesis`) don't match the new split keys (`..._system` + `..._user`) — so PromptService falls back to hardcoded. Phase 3's key `stage4_phase3_expert` matches exactly, so DB wins with old content.

**Impact**: ALL Stage 4 analysis jobs fail for every course on dev. 4 error fingerprints, 20+ error_log records.

## Plan

### Step 1: Create DB migration for ALL Stage 4 prompt templates

**File**: `packages/course-gen-platform/supabase/migrations/20260216230000_sync_stage4_prompt_templates.sql`

Follow the idempotent pattern from `20260216220000_ensure_stage5_batch_section_prompt_in_db.sql`:

- `DO $$ DECLARE v_template text := $prompt$...$prompt$; v_variables jsonb := '...'::jsonb;`
- UPDATE active row if exists, INSERT if missing

Templates to create/update (7 total, matching `stage4-prompts.ts`):

| prompt_key                            | Action                     | Source (stage4-prompts.ts) |
| ------------------------------------- | -------------------------- | -------------------------- |
| `stage4_phase1_classification_system` | **INSERT** (new split key) | Lines 25-46                |
| `stage4_phase1_classification_user`   | **INSERT** (new split key) | Lines 74-88                |
| `stage4_phase2_scope_system`          | **INSERT** (new split key) | Lines 146-170              |
| `stage4_phase2_scope_user`            | **INSERT** (new split key) | Lines 203-326              |
| `stage4_phase3_expert`                | **UPDATE** (exists, stale) | Lines 438-494              |
| `stage4_phase4_synthesis_system`      | **INSERT** (new split key) | Lines 582-595              |
| `stage4_phase4_synthesis_user`        | **INSERT** (new split key) | Lines 604-702              |

Also **deactivate** old combined keys that are no longer used by code:

- `stage4_phase1_classification` → `SET is_active = false`
- `stage4_phase2_scope` → `SET is_active = false`
- `stage4_phase4_synthesis` → `SET is_active = false`

Variables JSON must exactly match the interfaces in `prompt-contracts.ts:37-119`.

### Step 2: Add stale template detection to PromptService

**File**: `packages/course-gen-platform/src/shared/prompts/prompt-service.ts`

In `renderPrompt()` method (line 150), after rendering (line 172), add detection of **unused passed variables** — variables whose `{{key}}` placeholder doesn't exist in the template:

```typescript
// After line 173: rendered = rendered.replaceAll(placeholder, value);
// Track which variables were actually substituted
const unusedVars = Object.keys(variables).filter(key => {
  const placeholder = `{{${key}}}`;
  return !prompt.promptTemplate.includes(placeholder);
});

if (unusedVars.length > 0 && prompt.source === 'database') {
  logger.error(
    { promptKey, unusedVars, dbVersion: prompt.version, source: prompt.source },
    'STALE DB TEMPLATE: variables passed but not in template — falling back to hardcoded'
  );
  // Fall back to hardcoded
  const hardcoded = this.getHardcodedPromptResult(promptKey);
  if (hardcoded) {
    return this.renderWithTemplate(hardcoded, variables);
  }
}
```

Extract the rendering logic into a private `renderWithTemplate()` method to avoid code duplication.

**Key files**:

- `prompt-service.ts:150-193` — renderPrompt method
- Reuse `filterWhitelistedTemplates()` from `template-whitelist.ts` for the unused check (some "unused" vars may be whitelisted template patterns in RAG context)

### Step 3: Mark error fingerprints as resolved

Use `mcp__supabase__execute_sql` to resolve the 4 Stage 4 fingerprints + cascade warnings:

```sql
-- Resolve CRITICAL + ERROR fingerprints (same root cause)
INSERT INTO log_issue_status (log_type, log_id, status, notes, fingerprint, updated_at)
SELECT 'error_log', el.id, 'resolved',
  'Stale DB template. Migration 20260216230000 syncs DB with code.',
  el.fingerprint, NOW()
FROM (
  SELECT DISTINCT ON (fingerprint) id, fingerprint
  FROM error_logs
  WHERE fingerprint IN (
    'c6ceafc1a6302c4c6d53ed12e75083e2',  -- Phase 3 validation failed
    'af97886ed93d4c8070d98cfa4244447f',  -- Stage 4 job failed
    '540a0cf23f6453cfe025d685909172b6',  -- Sandboxed processor failed
    '66cafb7a7d8d76f11c85ed5edd917ffc'   -- Stage 4 orchestration failed
  )
  ORDER BY fingerprint, created_at DESC
) el
ON CONFLICT (log_type, log_id) DO UPDATE
SET status = 'resolved', notes = EXCLUDED.notes, updated_at = NOW();
```

Also resolve cascade WARNING fingerprints:

- `d078691d` — Phase attempt 1 failed
- `27d72cbb` — Phase attempt 3 failed
- `2fe01eb4` — Phase attempt 2 failed
- `75166dc4` — Preprocessing failed (already auto-muted pattern)

### Step 4: Resolve generation_trace errors

Mark the 8 generation_trace records as resolved (RT-006 validation — separate issue tracked in mc2-65hq):

```sql
INSERT INTO log_issue_status (log_type, log_id, status, notes, updated_at)
VALUES
  ('generation_trace', '<id1>', 'to_verify', 'RT-006 validation. Tracked in mc2-65hq.', NOW()),
  ...
ON CONFLICT (log_type, log_id) DO UPDATE SET status = 'to_verify', notes = EXCLUDED.notes;
```

### Step 5: Add auto-mute rules (mc2-ppyx)

**File**: `packages/course-gen-platform/src/shared/logger/auto-classification.ts`

Add 2 new rules:

```typescript
{ pattern: /Phase phase\d+_\w+ attempt \d+ failed/i, reason: 'cascading_repair', description: 'Intermediate retry attempt, final error is the real one' },
{ pattern: /No digest section found/i, reason: 'graceful_fallback', description: 'Stage 6 returns empty digest, non-blocking' },
```

Update SKILL.md auto-mute table (add 2 new patterns, update total count to 55).

## Files to modify

| File                                                                  | Change                                  |
| --------------------------------------------------------------------- | --------------------------------------- |
| `supabase/migrations/20260216230000_sync_stage4_prompt_templates.sql` | **NEW** — DB migration with 7 templates |
| `src/shared/prompts/prompt-service.ts`                                | Add stale template detection + fallback |
| `src/shared/logger/auto-classification.ts`                            | Add 2 new auto-mute rules               |
| `.claude/skills/process-logs/SKILL.md`                                | Update auto-mute table (count 53→55)    |

## Existing code to reuse

- **Migration pattern**: `20260216220000_ensure_stage5_batch_section_prompt_in_db.sql` — DO $$/DECLARE/UPDATE-or-INSERT
- **Template content**: `src/shared/prompts/stage4-prompts.ts` — exact templates + variables
- **Variable contracts**: `src/shared/prompts/prompt-contracts.ts` — TypeScript interfaces define expected vars
- **Whitelist filter**: `src/shared/validation/template-whitelist.ts:filterWhitelistedTemplates()` — filter false positives
- **Hardcoded fallback**: `prompt-service.ts:getHardcodedPromptResult()` — already exists

## Verification

1. **Apply migration**: `mcp__supabase__apply_migration` with the SQL
2. **Verify DB templates**: Query `prompt_templates WHERE prompt_key LIKE 'stage4%'` — 7 active new keys, 3 deactivated old keys
3. **Type-check**: `pnpm type-check` — no errors
4. **Build**: `pnpm build` — success
5. **Run prompt contract tests**: `pnpm --filter course-gen-platform test -- prompt-contract-validation`
6. **Test Stage 4 on dev**: Trigger a course analysis and verify Phase 3 succeeds
7. **Check error_logs**: No new Phase 3 validation errors after fix
