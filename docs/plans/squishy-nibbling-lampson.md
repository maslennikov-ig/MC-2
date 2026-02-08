# Plan: mc2-jlje — Remove Bloom's dead code, replace with prompt guidance

## Context

Task mc2-jlje investigated whether Bloom's Taxonomy validation justifies its token cost.

**Research findings:**

- ~1120 lines of Bloom's validation code exist but are NEVER called in the pipeline (dead code)
- Only `hasNonMeasurableVerb()` blacklist (21 verbs, EN/RU) works via Zod `.refine()`
- `cognitiveLevel`, `estimatedDuration`, `targetAudienceLevel` fields on LearningObjective are never populated or consumed
- `orchestrateValidation()` is exported but never imported/called anywhere

**Decision:** Replace all Bloom's validation with concise prompt guidance (good/bad examples in English). Delete dead code and unused schema fields. The LLM knows Bloom's Taxonomy from training data — soft prompt guidance + examples is more effective than rigid code validation.

## Changes

### 1. DELETE files (3 source + 1 test)

- `packages/course-gen-platform/src/stages/stage5-generation/validators/blooms-validators.ts` (448 lines)
- `packages/course-gen-platform/src/stages/stage5-generation/validators/blooms-whitelists.ts` (238 lines)
- `packages/course-gen-platform/src/stages/stage5-generation/validators/validation-orchestrator.ts` (426 lines)
- `packages/course-gen-platform/src/stages/stage5-generation/validators/__tests__/blooms-validators.test.ts`

### 2. MODIFY `shared-types/src/generation-result.ts`

Remove from file:

- `NON_MEASURABLE_VERBS_BLACKLIST` constant (~27 lines)
- `BLOOMS_TAXONOMY_WHITELIST` constant (~160 lines)
- `extractActionVerb()` function (~8 lines)
- `hasNonMeasurableVerb()` function (~17 lines)
- `isBloomsVerb()` function (~13 lines)
- `BloomCognitiveLevelSchema` definition (~10 lines)
- `cognitiveLevel` field from `LearningObjectiveBaseSchema` (~3 lines)
- `estimatedDuration` field from `LearningObjectiveBaseSchema` (~7 lines)
- `targetAudienceLevel` field from `LearningObjectiveBaseSchema` (~4 lines)
- `.refine()` on `LearningObjectiveSchema` — change to just `= LearningObjectiveBaseSchema`

**Keep:** `ValidationSeverity`, `ValidationResult`, placeholder patterns, `scanForPlaceholders()` — used by other validators.

### 3. MODIFY `validators/index.ts`

Remove:

```typescript
export * from './blooms-validators';
export * from './validation-orchestrator';
```

### 4. MODIFY `shared/validation/enum-synonyms.ts`

Remove `cognitiveLevel` synonyms mapping (~8 lines).

### 5. MODIFY `shared/regeneration/semantic-diff-generator.ts`

- Remove import of `validateBloomsTaxonomy`
- Simplify `isPedagogicalIntentPreserved()` — remove Bloom's validation, return `true` (semantic diff handles concept preservation separately)

### 6. MODIFY metadata-generator.ts prompt (line 564)

**Before:**

```
1. Learning outcomes must be measurable and use action verbs (Bloom's taxonomy)
```

**After:**

```
1. Learning outcomes MUST use measurable action verbs (Bloom's taxonomy).
   BAD: "Understand X", "Know Y", "Learn Z", "Be familiar with X" (non-measurable, cannot assess)
   GOOD: "Explain X", "Implement Y", "Design Z", "Compare X and Y" (measurable, verifiable)
```

This adds ~30 tokens but replaces ~1120 lines of code. English-only prompt — LLM will apply to all languages.

### 7. UPDATE test fixtures

Remove `cognitiveLevel` from test data in:

- `src/stages/stage5-generation/regeneration/__tests__/dependency-graph-builder.test.ts`
- `tests/unit/regeneration/dependency-graph-builder.test.ts`
- `src/stages/stage5-generation/__tests__/qwen3-section-generation.test.ts`
- `tests/contract/generation.test.ts`

### 8. REBUILD shared-types

After modifying `generation-result.ts`:

```bash
pnpm --filter @megacampus/shared-types build
```

## Files summary

| File                                                               | Action                               |
| ------------------------------------------------------------------ | ------------------------------------ |
| `stage5-generation/validators/blooms-validators.ts`                | DELETE                               |
| `stage5-generation/validators/blooms-whitelists.ts`                | DELETE                               |
| `stage5-generation/validators/validation-orchestrator.ts`          | DELETE                               |
| `stage5-generation/validators/__tests__/blooms-validators.test.ts` | DELETE                               |
| `shared-types/src/generation-result.ts`                            | Remove Bloom's code (~250 lines)     |
| `stage5-generation/validators/index.ts`                            | Remove 2 exports                     |
| `shared/validation/enum-synonyms.ts`                               | Remove cognitiveLevel mapping        |
| `shared/regeneration/semantic-diff-generator.ts`                   | Remove Bloom's import/usage          |
| `stage5-generation/utils/metadata-generator.ts`                    | Improve prompt line 564              |
| Test fixtures (4 files)                                            | Remove cognitiveLevel from test data |

## Verification

1. `pnpm --filter @megacampus/shared-types build` — types rebuild
2. `pnpm type-check` — no type errors
3. `pnpm build` — full build passes
4. `pnpm --filter course-gen-platform test` — tests pass (after fixture updates)
5. Verify prompt change in metadata-generator renders correctly
