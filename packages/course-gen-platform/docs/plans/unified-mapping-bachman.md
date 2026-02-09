# Structural Batch 3: Top-Warning Files (mc2-buvu)

## Context

ESLint warning campaign: 740 → 158 (79% reduction). Batch 3 targets all **14 files with 3 warnings each** = 42 warnings eliminated. After batch 3: target ~116 warnings.

**ESLint rules** (all skip blank lines + comments):

- `max-lines`: file > 500 effective lines → extract to `-helpers.ts`
- `max-lines-per-function`: function > 150 lines → extract steps to helper functions
- `complexity`: cyclomatic complexity > 20 → extract branches to helpers

## Files (14 files, 42 warnings)

| #   | File                                                                          | Lines | Warnings                            | Key Functions                                                         |
| --- | ----------------------------------------------------------------------------- | ----- | ----------------------------------- | --------------------------------------------------------------------- |
| 1   | `src/server/routers/lms/config.router.ts`                                     | 673   | max-lines + func-lines + complexity | `updateConfig` (line 859), anon at 506                                |
| 2   | `src/server/routers/lms/publish.router.ts`                                    | 575   | max-lines + func-lines + complexity | `publishCourse` (line 157)                                            |
| 3   | `src/server/routers/pipeline-admin/export-import.ts`                          | 520   | max-lines + func-lines + complexity | `importCourse` (line 450)                                             |
| 4   | `src/server/routers/generation/editing/element-crud.router.ts`                | ~550  | func-lines x2 + complexity          | `moveElement` (line 200), anon at 26                                  |
| 5   | `src/server/routers/generation/status.router.ts`                              | ~423  | complexity x2 + func-lines          | `getStatus` (line 194), anon at 41                                    |
| 6   | `src/shared/embeddings/generate.ts`                                           | ~787  | func-lines + complexity x2          | `generateEmbeddingsWithLateChunking` (432), `makeJinaV3Request` (271) |
| 7   | `src/shared/llm/model-config-service.ts`                                      | 996   | max-lines + complexity x2           | `getModelForPhase` (624), `fetchPhaseConfigFromDb` (1163)             |
| 8   | `src/shared/qdrant/lifecycle.ts`                                              | 681   | max-lines + func-lines x2           | `handleFileUpload` (368), `handleFileDelete` (614)                    |
| 9   | `src/stages/stage2-document-processing/orchestrator.ts`                       | 847   | max-lines + func-lines + complexity | `execute` (51), `updateDocumentProcessingProgress` (620)              |
| 10  | `src/stages/stage4-analysis/orchestrator.ts`                                  | 704   | max-lines + func-lines + complexity | `runAnalysisOrchestration` (214) — 576 lines, complexity 51!          |
| 11  | `src/stages/stage6-lesson-content/judge/targeted-refinement/task-executor.ts` | 510   | max-lines + func-lines + complexity | `executePatcherTask` (105) — 300 lines                                |
| 12  | `src/stages/stage6-lesson-content/nodes/judge-node.ts`                        | 519   | max-lines + func-lines + complexity | `judgeNode` (41) — 491 lines, complexity 66!                          |
| 13  | `src/stages/stage6-lesson-content/utils/mermaid-sanitizer.ts`                 | ~812  | func-lines x2 + complexity          | `sanitizeMermaidBlocks` (201) — 387 lines                             |
| 14  | `src/stages/stage7-enrichments/services/auto-card-trigger.ts`                 | 629   | max-lines + func-lines + complexity | `triggerCourseCard` (496)                                             |

## Execution Plan: 5 Parallel Subagent Groups

### Group A — LMS + Pipeline Routers (3 files, 9 warnings)

**Subagent**: `stage-pipeline-specialist`
**Files**:

1. `config.router.ts` — extract `updateConfig` handler body → `config-helpers.ts`
2. `publish.router.ts` — extract `publishCourse` handler body → `publish-helpers.ts`
3. `export-import.ts` — extract `importCourse` handler body → `export-import-helpers.ts`

**Pattern**: tRPC router keeps schema + `.mutation()` call. Handler logic goes to helpers.

### Group B — Generation Routers (2 files, 6 warnings)

**Subagent**: `stage-pipeline-specialist`
**Files**:

1. `element-crud.router.ts` — extract `moveElement` handler (308 lines, complexity 45) → `element-crud-helpers.ts`
2. `status.router.ts` — extract `getStatus` handler (190 lines, complexity 43) → `status-helpers.ts`

**Pattern**: Same as Group A. Keep router definition in original file.

### Group C — Shared Services (3 files, 9 warnings)

**Subagent**: `stage-pipeline-specialist`
**Files**:

1. `embeddings/generate.ts` — split `generateEmbeddingsWithLateChunking` (180 lines) into phases: chunk prep, request batching, result assembly
2. `llm/model-config-service.ts` (996 lines!) — extract DB query methods to `model-config-db.ts`, simplify conditionals in `getModelForPhase` and `fetchPhaseConfigFromDb`
3. `qdrant/lifecycle.ts` (681 lines) — extract `handleFileUpload` and `handleFileDelete` internals to `lifecycle-helpers.ts`

### Group D — Stage Orchestrators (3 files, 9 warnings)

**Subagent**: `stage-pipeline-specialist`
**Files**:

1. `stage2/orchestrator.ts` (847 lines) — extract `execute` method body into phase functions, `updateDocumentProcessingProgress` branches into helpers
2. `stage4/orchestrator.ts` (704 lines) — `runAnalysisOrchestration` is 576 lines with complexity 51. Split into sequential phases (init, classify, analyze, synthesize, finalize), extract to `orchestrator-helpers.ts`
3. `stage7/auto-card-trigger.ts` (629 lines) — extract `triggerCourseCard` steps to `auto-card-trigger-helpers.ts`

### Group E — Stage 6 Judge + Utils (3 files, 9 warnings)

**Subagent**: `stage-pipeline-specialist`
**Files**:

1. `judge-node.ts` — `judgeNode` is 491 lines, complexity 66. Extract phases: setup, cascade eval, CLEV voting, decision, finalization → `judge-node-helpers.ts`
2. `task-executor.ts` (510 lines) — `executePatcherTask` is 300 lines. Extract prompt building, LLM call, response parsing → `task-executor-helpers.ts`
3. `mermaid-sanitizer.ts` — `sanitizeMermaidBlocks` is 387 lines. Extract regex phases, diagram type handlers → `mermaid-sanitizer-helpers.ts`

## Refactoring Rules (for ALL groups)

1. **No behavioral changes** — only structural extraction
2. **Helper files**: `{original-name}-helpers.ts` in same directory
3. **Imports**: Helper functions import types/deps directly, NOT from parent
4. **Exports**: Helper functions are `export function`, called from original
5. **Max file size**: Each resulting file ≤ 500 effective lines
6. **Max function size**: Each function ≤ 150 effective lines
7. **Max complexity**: Each function complexity ≤ 20
8. **Preserve all existing exports** — don't break consumers
9. **No re-exports** — callers import from correct file directly (unless already established pattern)
10. **Type annotations**: Use `SupabaseClient<Database>` from `@megacampus/shared-types`, NOT `ReturnType<typeof getSupabaseAdmin>`

## Verification

After all 5 groups complete (subagent reports NOT trusted):

```bash
# 1. Type-check (most critical — extracted functions must have correct signatures)
pnpm type-check

# 2. Lint (target: ~116 warnings, down from 158)
cd packages/course-gen-platform && pnpm lint

# 3. Unit tests
pnpm --filter course-gen-platform test

# 4. Manual verification: read each new -helpers.ts file for correctness
```

## Risks

- **Medium**: `runAnalysisOrchestration` (complexity 51) and `judgeNode` (complexity 66) — largest extractions, most likely to have subtle state dependencies between phases
- **Low**: Router handler extraction — straightforward, well-established pattern from batches 1-2
- **Low**: `model-config-service.ts` at 996 lines — largest file, but methods are fairly independent
