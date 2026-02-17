# Audit: Retry loops across all pipeline stages — prevent token waste

## Context

After fixing Stage 5 infinite retry loop (PTB-8264, v0.30.4), user requested a full audit of all retry mechanisms to ensure no other stage can burn tokens on deterministic/structural errors.

**Already deployed (v0.30.4):**

- Stage 5 `processWithFallback` — bail-out for non-retryable errors
- `QualityValidationError` → classified as `VALIDATION_FAILED` → non-retryable
- Stage 4 post-processing — enforce `total_sections = sections_breakdown.length`
- Stage 5 validation — align `expectedTopics` with generation count

## Audit Results: All Retry Mechanisms

### Retry Architecture (3 levels)

```
BullMQ outer (3 attempts)
  └─ processWithFallback / inner retry (2 primary + 1 fallback)
       └─ UnifiedRegenerator (1-3 layers cascading)
```

Worst case multiplier: **3 × 3 × 3 = 27 LLM calls** for a single structural error.

### Stage-by-Stage Assessment

| Stage  | Location                                                         | Max Attempts | Bail-out for non-retryable? | Risk                                       |
| ------ | ---------------------------------------------------------------- | ------------ | --------------------------- | ------------------------------------------ |
| **5**  | `handler-helpers.ts:processWithFallback`                         | 2+1          | **YES** (v0.30.4)           | Fixed                                      |
| **5**  | `generation-phases.ts:generateMetadata` (line 337)               | 3            | NO                          | Low — errors are LLM-related               |
| **5**  | `generator-core.ts:generateWithRetry` (line 281)                 | 2            | NO                          | Medium — nested with UnifiedRegenerator(3) |
| **5**  | `generation-phases.ts:retrySingleSection` (line 898)             | configurable | NO                          | Low — bounded by caller                    |
| **6**  | `job-processor.ts:processWithFallback` (line 122)                | 2+1          | **NO**                      | **HIGH** — same bug as Stage 5             |
| **4**  | `orchestrator-phase-helpers.ts:executePhaseWithRetry` (line 639) | 3            | **NO**                      | **MEDIUM** — catches ALL errors            |
| **7**  | `retry-strategy.ts:shouldRetry`                                  | 3            | YES (categorizeError)       | OK                                         |
| **7**  | `enrichment-utils.ts:retryWithFallback`                          | bounded      | OK                          | OK                                         |
| shared | `context-overflow-handler.ts`                                    | 2            | YES (only retries overflow) | OK                                         |
| shared | `UnifiedRegenerator`                                             | 1-3          | Layer cascade, bounded      | OK                                         |
| shared | `jina-client.ts` / `reranker-client.ts`                          | 3            | OK — I/O only               | OK                                         |
| shared | `retry.ts:retryWithBackoff`                                      | bounded      | OK — generic utility        | OK                                         |

### Risks Requiring Fixes

**HIGH: Stage 6 `processWithFallback`** (`job-processor.ts:112-231`)

- Identical pattern to Stage 5 pre-fix: catches ALL errors, retries even structural errors
- No error classification, no bail-out for validation errors
- With BullMQ outer retry (3) × inner (2+1) = **9 wasted LLM calls** on deterministic errors

**MEDIUM: Stage 4 `executePhaseWithRetry`** (`orchestrator-phase-helpers.ts:639-696`)

- Generic retry wrapper, catches ALL errors, no error classification
- Used for LLM analysis phases — if LLM produces structurally invalid output that fails validation, retrying won't help
- 3 attempts × BullMQ 3 = 9 attempts on bad input

## Fixes

### Fix 1: Stage 6 `processWithFallback` — add non-retryable bail-out

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts`

In the `catch` block (line 156), before retry backoff, add error classification:

```ts
} catch (error) {
  lastError = error instanceof Error ? error : new Error(String(error));

  // Bail out immediately for non-retryable structural errors
  if (isNonRetryableStage6Error(lastError)) {
    logger.warn(
      { jobId, model: modelConfig.primary, attempt, error: lastError.message },
      'Non-retryable error, skipping remaining attempts and fallback'
    );
    throw lastError;
  }

  logger.warn(
    { jobId, model: modelConfig.primary, attempt, error: lastError.message },
    'Primary model attempt failed with exception'
  );
}
```

Add helper function in same file:

```ts
/** Errors that should NOT be retried (structural/input issues) */
function isNonRetryableStage6Error(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('invalid job input') ||
    msg.includes('invalid lesson_id') ||
    msg.includes('mismatch') ||
    msg.includes('schema validation') ||
    msg.includes('zod') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid api key')
  );
}
```

Also apply same check to the `if (!result.success)` path (line 142-155) — when the orchestrator returns `{success: false}`, check if errors indicate structural issues before retrying.

### Fix 2: Stage 4 `executePhaseWithRetry` — add non-retryable bail-out

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts`

In the `catch` block (line 665), add bail-out for validation errors:

```ts
} catch (error) {
  lastError = error instanceof Error ? error : new Error(String(error));

  // Don't retry structural/validation errors — they'll fail again
  if (isNonRetryablePhaseError(lastError)) {
    phaseLogger.warn(
      { phase: phaseName, attempt, error: lastError.message },
      `Phase ${phaseName} hit non-retryable error, bailing out`
    );
    throw lastError;
  }

  phaseLogger.warn(
    { phase: phaseName, attempt, maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS, error: lastError.message },
    `Phase ${phaseName} attempt ${attempt} failed`
  );
  // ... rest of existing retry logic
}
```

Add helper at module level:

```ts
/** Errors that indicate structural/input problems — retrying won't help */
function isNonRetryablePhaseError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('schema validation') ||
    msg.includes('zod') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid api key') ||
    msg.includes('mismatch')
  );
}
```

### Fix 3 (optional): Stage 7 `isRetryableError` — tighten unknown handling

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/retry-strategy.ts`

Currently `isRetryableError` (line 251-262) includes `'unknown'` as retryable. Combined with `shouldRetry` limiting unknown to 1 retry (line 167: `ctx.attempt < 2`), this is bounded but overly permissive.

**Recommendation**: No code change needed — Stage 7 already has proper categorization and bounds via `shouldRetry()`. The `isRetryableError` function is only used for logging, not decision-making.

## Files to Modify

1. `packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts` — Fix 1
2. `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts` — Fix 2

## Verification

1. `pnpm type-check` — all packages pass
2. `pnpm -F course-gen-platform test` — all 2817 tests pass
3. Manual review: grep for all `catch` blocks in `stages/` that don't check error type before retrying — confirm no other high-risk gaps
4. Check that both new `isNonRetryable*` functions match the error messages actually thrown by validators and schema parsers in each stage
