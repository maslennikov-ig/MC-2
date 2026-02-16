# mc2-j7v3: Upgrade targeted refinement to full mermaid fix pipeline

## Context

Mermaid handling inconsistency across Stage 6 content paths:

| Path                          | Function                  | Stages covered                                                 |
| ----------------------------- | ------------------------- | -------------------------------------------------------------- |
| `generator-node.ts`           | `runMermaidFixPipeline()` | 1-5 (full: regex → validate → LLM fix → revalidate → fallback) |
| `section-regenerator.ts`      | `runMermaidFixPipeline()` | 1-5 (full)                                                     |
| `task-executor.ts` (patcher)  | `sanitizeMermaidBlocks()` | **1 only** (regex)                                             |
| `task-executor.ts` (expander) | `sanitizeMermaidBlocks()` | **1 only** (regex)                                             |

If patcher/expander produces a mermaid block with syntax errors that regex cannot fix, there is no validation or fallback — the broken diagram goes to DB.

## Approach

Replace `sanitizeMermaidBlocks()` with `runMermaidFixPipeline()` (full pipeline, no skipLLM) in `task-executor.ts` for both patcher and expander. This gives all 5 stages: regex → validate → LLM fix → revalidate → fallback.

**Why full pipeline (no skipLLM)**: HTML comment fallback in final course content is bad UX. Better to spend 2-5s on LLM fix than show `<!-- Mermaid diagram could not be rendered -->` to users. This unifies behavior across all content paths (generator, section-regenerator, patcher, expander).

## Changes

### 1. `task-executor.ts` — replace `sanitizeMermaidBlocks` with `runMermaidFixPipeline` (~20 LOC)

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/task-executor.ts`

**Import change** (line 18):

```typescript
// BEFORE:
import { sanitizeMermaidBlocks } from '../../utils/mermaid-sanitizer';

// AFTER:
import { runMermaidFixPipeline } from '../../utils/mermaid-fix-pipeline';
```

**In `executePatcherTask()` (line ~195)**:

```typescript
// BEFORE (sync):
const mermaidResult = sanitizeMermaidBlocks(patchedContent);
if (mermaidResult.modified) {
  patchedContent = mermaidResult.content;
  logger.debug(
    { sectionId: task.sectionId, fixCount: mermaidResult.fixes.length },
    'Patcher: Mermaid sanitization applied to patched content'
  );
}

// AFTER (async, full pipeline):
const mermaidResult = await runMermaidFixPipeline(patchedContent);
if (mermaidResult.modified) {
  patchedContent = mermaidResult.content;
  logger.debug(
    { sectionId: task.sectionId, metrics: mermaidResult.metrics },
    'Patcher: Mermaid fix pipeline applied to patched content'
  );
}
```

**In `executeExpanderTask()` (line ~444)**:

```typescript
// BEFORE (sync):
const mermaidResult = sanitizeMermaidBlocks(expandedContent);
if (mermaidResult.modified) {
  expandedContent = mermaidResult.content;
  logger.debug(
    { sectionId: task.sectionId, fixCount: mermaidResult.fixes.length },
    'Expander: Mermaid sanitization applied to expanded content'
  );
}

// AFTER (async, full pipeline):
const mermaidResult = await runMermaidFixPipeline(expandedContent);
if (mermaidResult.modified) {
  expandedContent = mermaidResult.content;
  logger.debug(
    { sectionId: task.sectionId, metrics: mermaidResult.metrics },
    'Expander: Mermaid fix pipeline applied to expanded content'
  );
}
```

Key differences from sync version:

- `sanitizeMermaidBlocks` → `runMermaidFixPipeline` (async, full 5-stage pipeline)
- Add `await`
- No options → full pipeline (same as generator-node.ts and section-regenerator.ts)
- `mermaidResult.fixes.length` → `mermaidResult.metrics` (different result shape)

## Critical files

| File                                             | Change                          |
| ------------------------------------------------ | ------------------------------- |
| `judge/targeted-refinement/task-executor.ts:18`  | Replace import                  |
| `judge/targeted-refinement/task-executor.ts:195` | Patcher: sync → async pipeline  |
| `judge/targeted-refinement/task-executor.ts:444` | Expander: sync → async pipeline |

## Existing code to reuse

| Function                  | File                                | Notes                                   |
| ------------------------- | ----------------------------------- | --------------------------------------- |
| `runMermaidFixPipeline()` | `utils/mermaid-fix-pipeline.ts:313` | Full 5-stage pipeline, `skipLLM` option |
| `MermaidPipelineOptions`  | `utils/mermaid-fix-pipeline.ts:144` | `{ skipLLM?: boolean }`                 |
| `MermaidPipelineResult`   | `utils/mermaid-fix-pipeline.ts:121` | Result type with `metrics`              |

## Verification

1. `pnpm type-check` — no type errors
2. `pnpm build` — clean build
3. `pnpm test -- task-executor` — if tests exist
4. `pnpm test -- mermaid` — existing mermaid tests pass
5. Verify import cleanup: `sanitizeMermaidBlocks` should no longer be imported in task-executor.ts
