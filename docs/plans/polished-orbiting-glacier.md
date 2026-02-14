# Plan: Process Error Logs (Feb 14, 2026)

## Context

Последнее время код сильно обновлялся, в логах накопилось 176,094 новых ошибок в `error_logs` и 8 в `generation_trace`. Большинство ошибок — устаревшие или уже исправленные. Нужно разобрать все ошибки, исправить актуальные баги, и очистить логи.

**Распределение:** stage: 38,307 | local: 566 | test: 410 | dev: 297

## Phase 1: Bulk Resolve (SQL operations)

### 1a. Resolve local + test errors

Bulk resolve ~976 ошибок из local (NULL) и test окружений.

### 1b. Resolve errors matching existing auto-mute rules

Эти ошибки соответствуют уже существующим правилам auto-mute (вставлены ДО создания правил):

| Fingerprint             | Error                                  | Count  | Auto-mute rule (exists)                               |
| ----------------------- | -------------------------------------- | ------ | ----------------------------------------------------- |
| `fc22b2db`              | Stage 6 worker: "could not renew lock" | 37,889 | `could not renew lock for job`                        |
| `d5cc91b6`              | tRPC: Job 191 not found                | 76     | `Job \d+ not found`                                   |
| `5901a446`              | tRPC: Job 191 not found                | 44     | `Job \d+ not found`                                   |
| `1a513f33`              | Mermaid fallback                       | 123    | `Mermaid.*fallback.*used` (line 219)                  |
| `cf6e1645`              | Layer failed, trying next              | 28     | `Layer failed, trying next`                           |
| `9e43e542`              | Cache directory does not exist         | 8      | `Cache directory does not exist`                      |
| `1f9c2b2b`              | Content failed sanity check            | 2      | `Content failed sanity check.*non-blocking`           |
| `09ecc133`              | GET /trpc/jobs.getStatus 404           | 2      | `/trpc/jobs\.getStatus 404`                           |
| `d85c7f92` + `016533a1` | Rate limit exceeded                    | 2      | `Rate limit exceeded`                                 |
| `e3cb425d`              | Patcher failed - section lock          | 304    | `Patcher failed.*section lock` (line 204)             |
| `1e9caa3a`              | Visual style validation fallback       | 20     | `Visual style validation failed.*fallback` (line 194) |

### 1c. Mark external service errors as `to_verify`

| Fingerprint | Error                            | Count | Reason                     |
| ----------- | -------------------------------- | ----- | -------------------------- |
| `8d393f8b`  | Batch processing: Cloudflare 522 | 10    | Supabase timeout, external |
| `7c7957ab`  | Outbox processor: Cloudflare 522 | 7     | Supabase timeout, external |

### 1d. Resolve already-fixed / expected behavior errors

| Fingerprint | Error                               | Count | Reason                                            |
| ----------- | ----------------------------------- | ----- | ------------------------------------------------- |
| `1b012e28`  | Failed to build lesson specs        | 15    | One-off for specific course session               |
| `cd22363c`  | No lesson specifications built      | 15    | Same course/session                               |
| `2840033c`  | partialGenerate 400                 | 1     | Same session                                      |
| `755a4372`  | Target audience inferred            | 6     | Expected: no analysis data available              |
| `8cee63f4`  | Generation error, BullMQ retry      | 3     | Retry mechanism working as designed               |
| `bf8b2a25`  | Phase phase2_scope attempt 1 failed | 2     | Retry attempt, expected                           |
| `eb8efef7`  | STALE phase config                  | 9     | Graceful degradation during Cloudflare 522 outage |

### 1e. Resolve generation_trace errors

| ID                     | Error                              | Action                               |
| ---------------------- | ---------------------------------- | ------------------------------------ |
| 5x stage_6 judge_error | `content.sections is not iterable` | Resolve + fix in Phase 2             |
| 4x stage_4 failed      | `rationale is Required`            | Resolve — fixed in commit `f7eb27b8` |

## Phase 2: Code Fixes (2 issues)

### Fix A: Add hardcoded fallback for chat phases (CRITICAL, priority 1)

**Problem:** `chat_intent_classification`, `chat_stage_5_refinement`, `chat_stage_6_refinement` have DB config (via seed) but NO hardcoded fallback in `DEFAULT_PHASE_CONFIGS`. When DB is unavailable on cold start, system crashes with CRITICAL error.

**File:** `packages/course-gen-platform/src/shared/llm/model-config-db.ts` (after line 591, before `emergency`)

**Add 3 entries to `DEFAULT_PHASE_CONFIGS`:**

```typescript
// Chat phases
chat_intent_classification: {
  modelId: 'xiaomi/mimo-v2-flash',
  fallbackModelId: 'qwen/qwen3-235b-a22b-2507',
  temperature: 0.1,
  maxTokens: 200,
  maxContextTokens: 128000,
  qualityThreshold: null,
  maxRetries: 3,
  timeoutMs: null,
  tier: 'standard',
  source: 'hardcoded',
},
chat_stage_5_refinement: {
  modelId: 'xiaomi/mimo-v2-flash',
  fallbackModelId: 'qwen/qwen3-235b-a22b-2507',
  temperature: 0.7,
  maxTokens: 8192,
  maxContextTokens: 128000,
  qualityThreshold: null,
  maxRetries: 3,
  timeoutMs: null,
  tier: 'standard',
  source: 'hardcoded',
},
chat_stage_6_refinement: {
  modelId: 'xiaomi/mimo-v2-flash',
  fallbackModelId: 'qwen/qwen3-235b-a22b-2507',
  temperature: 0.7,
  maxTokens: 8192,
  maxContextTokens: 128000,
  qualityThreshold: null,
  maxRetries: 3,
  timeoutMs: null,
  tier: 'standard',
  source: 'hardcoded',
},
```

**Reference:** `packages/course-gen-platform/src/config/config-seed.json` (lines 461-508)

### Fix B: Add guard for `content.sections` iteration (priority 2)

**Problem:** `for...of` on `content.sections` crashes when sections is undefined/null.

**2 files, same fix — replace `content.sections` with `content.sections ?? []`:**

1. `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/orchestrator.ts` (line 42)
   - `for (const section of content.sections)` → `for (const section of content.sections ?? [])`

2. `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/heuristic-helpers.ts` (line 29)
   - `for (const section of content.sections)` → `for (const section of content.sections ?? [])`

Also add same guard for `examples` and `exercises` loops in both files (lines 47, 55 in orchestrator; lines 35, 44 in heuristic-helpers) for consistency.

## Phase 3: Verification

1. `pnpm type-check` — ensure no type errors from changes
2. `pnpm build` — ensure build passes
3. Final SQL count — verify no unresolved server errors remain
4. Commit changes + create beads tasks

## Summary

| Action                             | Count       |
| ---------------------------------- | ----------- |
| Bulk resolve (local/test)          | ~976        |
| Bulk resolve (auto-mutable)        | ~38,498     |
| Mark to_verify (external)          | 17          |
| Resolve (fixed/expected)           | ~51         |
| Resolve (generation_trace)         | 9           |
| **Code fix: chat config fallback** | **1 file**  |
| **Code fix: sections guard**       | **2 files** |
| **Total errors cleared**           | **~39,551** |
