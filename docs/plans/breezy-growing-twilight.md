# Fix: Stage 5 infinite retry loop — section count mismatch

## Context

Course PTB-8264 ("Как стать счастливым") stuck in Stage 5 retry loop since 07:07 UTC.
156 Stage 5 traces, 6 full failures, ~150K+ wasted tokens.

**Root cause**: Stage 4 produced inconsistent `analysis_result`:

- `recommended_structure.total_sections = 7`
- `recommended_structure.sections_breakdown.length = 8`

Stage 5 generation vs validation mismatch:

- **Generation** (`generation-phases.ts:479`): Uses `total_sections` (7) → generates 7 sections
- **Validation** (`generation-phases.ts:1044`): Uses `sections_breakdown.map(...)` → expects 8 topics
- `quality-validator.ts:336`: strict `8 !== 7` → `ValidationError` → retry → loop

**Why retries don't stop it**: The quality `ValidationError` is caught by `executeWithModelFallback` (`handler-helpers.ts:341`) which runs `maxPrimaryAttempts` tries on primary model, then 1 fallback attempt, then BullMQ retries the whole job (`maxAttempts = 3`). Total: 3 BullMQ × 3 inner = **9 full Stage 5 runs** before final failure. Each burns ~24K tokens on a deterministic error. Structural mismatches should be non-retryable.

## Immediate: Stop PTB-8264

```sql
-- Fix analysis_result so total_sections matches sections_breakdown
UPDATE courses
SET analysis_result = jsonb_set(
  analysis_result,
  '{recommended_structure,total_sections}',
  '8'
)
WHERE id = '4c7660bd-ac49-4ed5-8e52-66b87c38a4b5';
```

If BullMQ job is already dead, re-trigger via admin panel after code fix is deployed.

## Fix 1: Stage 5 validation — align expectedTopics with generation count

**File**: `packages/course-gen-platform/src/stages/stage5-generation/phases/generation-phases.ts`
**Lines**: 1043-1047

**Before**:

```ts
const expectedTopics =
  state.input.analysis_result?.recommended_structure.sections_breakdown.map(
    section => section.area || 'Untitled Section'
  ) || [];
```

**After**:

```ts
const allTopics =
  state.input.analysis_result?.recommended_structure.sections_breakdown.map(
    section => section.area || 'Untitled Section'
  ) || [];

// Align with generation logic (lines 479-495): respect total_sections cap
const recStruct = state.input.analysis_result?.recommended_structure;
const cappedCount = Math.min(recStruct?.total_sections ?? allTopics.length, allTopics.length);
const expectedTopics = allTopics.slice(0, cappedCount);
```

## Fix 2: Stage 4 post-processing — enforce total_sections = sections_breakdown.length

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-2-scope-helpers.ts`
**Function**: `applyStructureDefaults` (line 232), after line 251:

```ts
// Enforce total_sections consistency with sections_breakdown
if (recStructure.sections_breakdown && Array.isArray(recStructure.sections_breakdown)) {
  const breakdownLength = (recStructure.sections_breakdown as unknown[]).length;
  if (recStructure.total_sections !== breakdownLength) {
    logger.warn(
      {
        phase: 'phase-2-scope',
        totalSections: recStructure.total_sections,
        breakdownLength,
      },
      'total_sections mismatch with sections_breakdown.length, auto-correcting'
    );
    recStructure.total_sections = breakdownLength;
  }
}
```

## Verification

1. `pnpm type-check` — types pass
2. `pnpm -F course-gen-platform test` — existing tests pass
3. Run SQL fix for PTB-8264
4. Deploy to dev, verify PTB-8264 resolves
5. Create test course and verify Stage 5 completes
