# Fix Judge Cost & Token Tracing

## Context

Judge evaluations (Stage 6 CLEV) write to `generation_trace` but `cost_usd` is always NULL and `input_data` lacks `inputTokens`/`outputTokens` breakdown. This makes it impossible to analyze real LLM spend per model. GLM-5 is the secondary CLEV judge called for every lesson — we need accurate cost data to optimize.

**Root causes:**

1. `finalizeJudgeResult()` calls `logTrace()` without `costUsd` parameter → NULL in DB
2. `JudgeVerdict` only stores `tokensUsed` (total) — `inputTokens`/`outputTokens` from `LLMResponse` are discarded
3. No cost calculation happens anywhere in the judge pipeline

## Plan

### Step 1: Extend JudgeVerdict schema with token breakdown

**File:** `packages/shared-types/src/judge-types.ts:162-188`

Add optional fields to `JudgeVerdictSchema`:

```ts
inputTokens: z.number().int().min(0).optional(),
outputTokens: z.number().int().min(0).optional(),
```

Then rebuild: `pnpm --filter @megacampus/shared-types build`

### Step 2: Capture input/output tokens in single judge

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/single-judge.ts:~280`

Currently:

```ts
tokensUsed: response.totalTokens,
```

Add:

```ts
inputTokens: response.inputTokens,
outputTokens: response.outputTokens,
```

### Step 3: Capture input/output tokens in CLEV voter

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts:~263`

Same change — capture `response.inputTokens` and `response.outputTokens` into the verdict.

### Step 4: Extend CascadeResult with token breakdown

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/types.ts:136-159`

Add to `CascadeResult`:

```ts
totalInputTokens: number;
totalOutputTokens: number;
```

### Step 5: Aggregate input/output tokens in cascade orchestrator

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/orchestrator.ts`

Track `totalInputTokens` and `totalOutputTokens` alongside existing `totalTokensUsed`:

- From `singleJudgeVerdict.inputTokens` / `.outputTokens` (Step 2)
- From CLEV `verdict.inputTokens` / `.outputTokens` (Step 3)

Return them in the CascadeResult.

### Step 6: Calculate cost and pass to logTrace

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-node-helpers.ts:648-727`

In `finalizeJudgeResult()`:

1. Extract `totalInputTokens`/`totalOutputTokens` from `cascadeResult`
2. Calculate cost per model using existing `costTracker.calculateCost()` from `@/shared/metrics/cost-tracker`
3. For multi-model CLEV, split tokens proportionally (equal split among judges is acceptable estimate)
4. Pass `costUsd` to `logTrace()` call (line 687)
5. Add `inputTokens`/`outputTokens` to `inputData` in `logTrace()` call

Result: `logTrace()` already supports `costUsd` parameter (trace-logger.ts:29) — just need to pass it.

## Key files

| File                              | Change                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| `shared-types/src/judge-types.ts` | Add optional `inputTokens`/`outputTokens` to JudgeVerdictSchema |
| `judge/cascade/single-judge.ts`   | Capture token breakdown from LLMResponse                        |
| `judge/clev-voter.ts`             | Capture token breakdown from LLMResponse                        |
| `judge/cascade/types.ts`          | Extend CascadeResult interface                                  |
| `judge/cascade/orchestrator.ts`   | Aggregate input/output tokens                                   |
| `nodes/judge-node-helpers.ts`     | Calculate cost, pass to logTrace                                |

## Reuse existing code

- `costTracker.calculateCost(modelId, usage)` from `src/shared/metrics/cost-tracker.ts:224` — already computes cost from model pricing table
- `MODEL_PRICING` from `src/shared/metrics/cost-tracker.ts:66` — has GLM-5, minimax-m2.5, qwen3.5-plus pricing
- `TraceLogParams.costUsd` from `src/shared/trace-logger.ts:29` — already supported, just unused by judge
- `LLMResponse.inputTokens`/`.outputTokens` from `src/shared/llm/client.ts:53-56` — already available

## Verification

1. `pnpm --filter @megacampus/shared-types build` — shared-types compiles
2. `pnpm --filter course-gen-platform type-check` — no type errors
3. `pnpm --filter course-gen-platform test` — unit tests pass
4. After deploying, verify with SQL:

```sql
SELECT model_used, cost_usd,
       input_data->>'inputTokens' as input_tokens,
       input_data->>'outputTokens' as output_tokens
FROM generation_trace
WHERE phase = 'judge'
ORDER BY created_at DESC LIMIT 5;
```

- `cost_usd` should be non-NULL numeric value
- `inputTokens`/`outputTokens` should be present in input_data
