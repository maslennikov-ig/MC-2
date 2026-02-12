# Plan: Process Error Logs (2026-02-04)

## Summary

1531 new error_logs (829 stage, 558 dev, 144 local) + 35 generation_trace errors.
After analysis: **most errors cluster into ~12 unique fingerprints**. Several are auto-mutable, several need real fixes, and local errors can be bulk-resolved.

---

## Phase 1: Bulk Housekeeping (SQL only, no code changes)

### 1a. Bulk resolve LOCAL environment errors (144)

```sql
-- environment IS NULL = local dev testing
INSERT INTO log_issue_status ... WHERE el.environment IS NULL
```

### 1b. Mark already auto-muted errors that slipped through

**"Unexpected exit code: 10"** (fingerprint `ca79a31e...`, 8 errors, status='new') - should be auto_muted per rule in `auto-classification.ts` but shows as 'new'. Mark as `auto_muted` with note.

**"Invalid status for approval"** (fingerprint `811152569f...`, 12 on stage) - already has auto-mute rule. Mark as `auto_muted`.

### 1c. Mark "Job not found" tRPC errors as auto_muted (NEW rule needed)

**"Job X not found"** (fingerprints `3105f7ed...` + `1daccd12...`, 165 on dev) - Frontend polls `jobs.getStatus` after job cleanup. This is expected behavior (race condition).

- Add auto-mute rule to `auto-classification.ts`
- Bulk resolve existing errors

---

## Phase 2: Fix Real Bugs (priority order)

### BUG 1 (P1): "content.sections is not iterable" - Stage 6 Judge

- **Impact**: 20+ generation_trace judge_errors, blocks course generation
- **Root cause**: `makeDecisionFromVerdict()` in `decision-engine.ts:656` accesses `content.sections.length` without null check. `extractContentBody()` can return object with `sections: undefined`
- **File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/decision-engine.ts`
- **Also affected**: `cascade-evaluator.ts:323,367,390`, `clev-voter.ts:217`
- **Fix**: Add defensive check `content.sections = content.sections ?? []` in `extractContentBody()` return, and add guard in `makeDecisionFromVerdict()`
- **Delegate to**: `stage-pipeline-specialist`

### BUG 2 (P1): "Bucket not found" - Stage 7 Enrichment Upload

- **Impact**: 42+13+41 = 96 errors on stage, blocks card/cover generation
- **Root cause**: Supabase storage bucket `course-enrichments` doesn't exist. `USE_LOCAL_STORAGE=true` is set but `buildPublicUrl()` may still hit Supabase path
- **File**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/unified-storage-service.ts:171-183`
- **Fix**: Verify `buildPublicUrl()` correctly routes to local when `USE_LOCAL_STORAGE=true`. Alternatively create the missing bucket in Supabase.
- **Delegate to**: `fullstack-nextjs-specialist`

### BUG 3 (P2): "Failed to store fallback processed_content" - Stage 2 constraint violation

- **Impact**: 20 errors on stage, prevents document fallback storage
- **Root cause**: `orchestrator.ts:1080` writes `processing_method: 'failed_fallback'` but DB constraint only allows `('full_text', 'hierarchical')`
- **File**: `packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts:1080`
- **Fix**: Change `'failed_fallback'` to `'full_text'` (semantically correct for plain text fallback)
- **Delegate to**: Execute directly (single-line fix)

### BUG 4 (P2): Stage 4 Validation - "suggested_answers" schema mismatch

- **Impact**: 1 CRITICAL error on dev (today), LLM returns strings instead of objects for answers
- **Root cause**: LLM in `phase-0.5-clarifying` generates `suggested_answers` as strings instead of `{text, is_correct}` objects, and array exceeds max 6 elements
- **File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`
- **Fix**: Add post-processing to normalize `suggested_answers` (coerce strings to `{text: str, is_correct: false}`, truncate array to max 6)
- **Delegate to**: `stage-pipeline-specialist`

---

## Phase 3: Auto-Mute / Mark as Known Issues

### 3a. "Failed to log generation trace" (468 total, 437 stage)

- **Root cause**: Supabase connection pool exhaustion (PGRST003) during parallel stage_6 RAG. Non-critical - trace logging failure doesn't block generation.
- **Action**: Add auto-mute rule for `Failed to log generation trace` + mark existing as `auto_muted`
- **Follow-up task**: Create beads task for implementing trace insert batching/queuing (P3)

### 3b. Docling MCP server failures (32+24+20+19 = 95 errors)

- **Root cause**: Docling MCP server timeout (-32001). Server restart/connectivity issue on stage.
- **Action**: Mark as `to_verify` with note "External Docling MCP service. Monitor availability."
- **Last seen**: Feb 3 - not happening today, may be resolved by server restart

### 3c. "ModelConfigBunker DB sync failed" (11 errors)

- **Root cause**: Database query timeout (10s) during config sync. Transient during connection pool pressure.
- **Action**: Already has auto-mute rule. Mark existing as `auto_muted`.

### 3d. "Patcher: REJECTED - content was truncated" (10 errors)

- **Root cause**: LLM patcher detects truncated content and returns original. This is correct defensive behavior.
- **Action**: Add auto-mute rule (graceful_fallback category). Mark existing as `auto_muted`.

### 3e. "Schema validation failed" - placeholders/missing fields (5 errors)

- **Root cause**: LLM output contains `{{USP}}` placeholder or missing `course_tags`. Expected LLM hallucination edge case.
- **Action**: Mark as `resolved` with note "LLM output quality issue. Retry handles it."

### 3f. JSON parsing failed - Stage 4 CRITICAL (1 error)

- **Root cause**: LLM returned malformed JSON that all repair strategies couldn't fix. One-time occurrence.
- **Action**: Mark as `resolved` with note "One-time LLM JSON output failure. Repair strategies exhausted. No code fix needed."

### 3g. Generation trace judge_errors (35 in generation_trace table)

- **Root cause**: Same as BUG 1 ("content.sections is not iterable"). Will be fixed by BUG 1 fix.
- **Action**: Mark as `in_progress`, link to BUG 1 fix

---

## Phase 4: New Auto-Mute Rules

Add to `packages/course-gen-platform/src/shared/logger/auto-classification.ts`:

```typescript
// 1. Job polling after cleanup (expected frontend behavior)
{ pattern: /Job \d+ not found/i, reason: 'expected_behavior', description: 'Frontend polls job status after job record cleanup' },

// 2. Trace logging failure (non-critical, connection pool pressure)
{ pattern: /Failed to log generation trace/i, reason: 'expected_behavior', description: 'Trace insert failed during connection pool pressure, non-blocking' },

// 3. Patcher rejection (correct defensive behavior)
{ pattern: /Patcher:.*REJECTED.*truncated/i, reason: 'graceful_fallback', description: 'Patcher detected truncated content, returns original safely' },
```

Update tests in `auto-classification.test.ts` and sync with SKILL.md doc.

---

## Phase 5: Verification & Commit

1. `pnpm type-check` - ensure no type errors
2. `pnpm build` - ensure build passes
3. Run auto-classification tests: `pnpm vitest run auto-classification`
4. Create beads tasks for each bug fix
5. Commit and push

---

## Execution Order

| Step | Action                                                   | Type       | Est.   |
| ---- | -------------------------------------------------------- | ---------- | ------ |
| 1    | Bulk resolve local errors (SQL)                          | SQL        | 1 min  |
| 2    | Fix BUG 3: fallback processing_method                    | Direct fix | 2 min  |
| 3    | Fix BUG 1: content.sections null check                   | Delegate   | 10 min |
| 4    | Fix BUG 2: bucket not found                              | Delegate   | 10 min |
| 5    | Fix BUG 4: suggested_answers normalization               | Delegate   | 10 min |
| 6    | Add 3 new auto-mute rules + tests                        | Direct     | 5 min  |
| 7    | Bulk update log_issue_status for all resolved/auto_muted | SQL        | 2 min  |
| 8    | Verify: type-check, build, tests                         | Bash       | 3 min  |
| 9    | Commit + push                                            | Git        | 1 min  |

---

## Files to Modify

| File                                                                                             | Change                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/judge-helpers.ts`           | Ensure `extractContentBody()` returns `sections: []` not undefined |
| `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/decision-engine.ts`         | Add defensive check for content.sections                           |
| `packages/course-gen-platform/src/stages/stage7-enrichments/services/unified-storage-service.ts` | Fix buildPublicUrl routing                                         |
| `packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts:1080`        | Change `'failed_fallback'` to `'full_text'`                        |
| `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`         | Normalize suggested_answers post-LLM                               |
| `packages/course-gen-platform/src/shared/logger/auto-classification.ts`                          | Add 3 new rules                                                    |
| `packages/course-gen-platform/src/shared/logger/__tests__/auto-classification.test.ts`           | Add tests                                                          |
| `.claude/skills/process-logs/SKILL.md`                                                           | Update auto-mute table                                             |
