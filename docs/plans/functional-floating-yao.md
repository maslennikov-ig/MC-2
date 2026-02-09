# Plan: Create @megacampus/shared-utils package

**Bead**: mc2-6noj
**Status**: Plan

## Context

AUDIT_REPORT.md (Section 2.3, 4.2) identified code duplication across `web` and `course-gen-platform`. Three utility groups are duplicated with ~15 import sites. Creating a dedicated `@megacampus/shared-utils` package consolidates them, provides a home for future shared utilities, and follows the existing monorepo pattern (`shared-logger`).

## Scope: 3 utility groups

| Utility               | Frontend                                                               | Backend                                                         | Import sites |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ------------ |
| Document display name | `web/lib/generation-graph/document-display-name.ts`                    | `course-gen-platform/src/shared/utils/document-display-name.ts` | 2 (web)      |
| formatDuration        | `web/lib/utils/format.ts` + `web/lib/generation-graph/format-utils.ts` | `course-gen-platform/src/shared/metrics/stage-metrics.ts`       | 7 (web)      |
| Language utils        | --                                                                     | `course-gen-platform/src/shared/utils/language-utils.ts`        | 6 (backend)  |

## Phase 1: Create package structure

Create `packages/shared-utils/` following `shared-logger` pattern:

```
packages/shared-utils/
  package.json          # tsup, zero deps, v0.29.3
  tsconfig.json         # extends root, composite: false
  vitest.config.ts
  src/
    index.ts            # barrel exports
    document-display-name.ts
    format.ts
    language.ts
  tests/
    document-display-name.test.ts
    format.test.ts
    language.test.ts
```

**package.json** key config:

- Build: `tsup src/index.ts --format cjs,esm --dts` (like shared-logger)
- Zero runtime `dependencies`
- devDependencies: tsup, typescript, vitest

### Source files

**`document-display-name.ts`** — Copy from `packages/web/lib/generation-graph/document-display-name.ts` (supports both snake_case + camelCase). No changes to logic.

**`format.ts`** — Merged `formatDuration`:

- Accept `number | undefined` (from format-utils.ts pattern)
- Return `''` for invalid input
- Support ms/s/m/h ranges (from stage-metrics.ts pattern)

**`language.ts`** — Copy from `course-gen-platform/src/shared/utils/language-utils.ts` with ONE change:

- Remove `import { logger }` dependency (3 call sites — all debug/warn with zero business logic, just remove them)
- All types, constants, and functions otherwise identical

### Tests

Cover core scenarios for each utility. ~50 test cases total.

## Phase 2: Wire up dependencies

1. Add `"@megacampus/shared-utils": "workspace:*"` to:
   - `packages/web/package.json`
   - `packages/course-gen-platform/package.json`

2. Add to root `tsconfig.json` paths:

   ```json
   "@megacampus/shared-utils": ["./packages/shared-utils/src"]
   ```

3. Add to `packages/course-gen-platform/tsconfig.json` paths:

   ```json
   "@megacampus/shared-utils": ["../shared-utils/src"]
   ```

4. Run `pnpm install`

## Phase 3: Migrate imports (direct swap, no re-exports)

### Document display name (2 files in web)

| File                                                                   | Old import                                     | New import                 |
| ---------------------------------------------------------------------- | ---------------------------------------------- | -------------------------- |
| `web/components/generation-graph/panels/stage2/Stage2Dashboard.tsx`    | `@/lib/generation-graph/document-display-name` | `@megacampus/shared-utils` |
| `web/components/generation-graph/panels/output/PrioritizationView.tsx` | `@/lib/generation-graph/document-display-name` | `@megacampus/shared-utils` |

### formatDuration (7 files in web)

| File                                                                 | Old import                            | New import                 |
| -------------------------------------------------------------------- | ------------------------------------- | -------------------------- |
| `web/app/[locale]/admin/pipeline/components/pipeline-stats.tsx`      | `@/lib/utils/format`                  | `@megacampus/shared-utils` |
| `web/app/[locale]/admin/pipeline/components/pipeline-overview.tsx`   | `@/lib/utils/format`                  | `@megacampus/shared-utils` |
| `web/app/[locale]/admin/pipeline/components/stage-detail-sheet.tsx`  | `@/lib/utils/format`                  | `@megacampus/shared-utils` |
| `web/components/generation-graph/panels/stage2/Stage2ProcessTab.tsx` | `@/lib/generation-graph/format-utils` | `@megacampus/shared-utils` |
| `web/components/generation-graph/panels/stage3/Stage3ProcessTab.tsx` | `@/lib/generation-graph/format-utils` | `@megacampus/shared-utils` |
| `web/components/generation-graph/panels/stage4/Stage4ProcessTab.tsx` | `@/lib/generation-graph/format-utils` | `@megacampus/shared-utils` |
| `web/components/generation-graph/panels/stage5/Stage5ProcessTab.tsx` | `@/lib/generation-graph/format-utils` | `@megacampus/shared-utils` |

### Language utils (6 files in course-gen-platform)

| File                                                                 | Old import                            | New import                 |
| -------------------------------------------------------------------- | ------------------------------------- | -------------------------- |
| `src/stages/stage5-generation/utils/metadata-generator.ts`           | `@/shared/utils/language-utils`       | `@megacampus/shared-utils` |
| `src/stages/stage5-generation/utils/section-batch/generator-core.ts` | `@/shared/utils/language-utils`       | `@megacampus/shared-utils` |
| `src/stages/stage5-generation/utils/section-batch/model-selector.ts` | `@/shared/utils/language-utils`       | `@megacampus/shared-utils` |
| `src/shared/llm/model-config-service.ts`                             | `../utils/language-utils`             | `@megacampus/shared-utils` |
| `src/shared/llm/langchain-models.ts`                                 | `../utils/language-utils` (type only) | `@megacampus/shared-utils` |
| `src/shared/llm/model-selector.ts`                                   | `../utils/language-utils`             | `@megacampus/shared-utils` |

## Phase 4: Delete old files

- `packages/web/lib/generation-graph/document-display-name.ts` — DELETE (0 remaining consumers)
- `packages/web/lib/utils/format.ts` — DELETE (only had `formatDuration`)
- `packages/course-gen-platform/src/shared/utils/document-display-name.ts` — DELETE (0 consumers verified by grep)
- `packages/course-gen-platform/src/shared/utils/language-utils.ts` — DELETE (0 remaining consumers)

**Keep** `web/lib/generation-graph/format-utils.ts` — still exports `formatNumber`, `formatFileSize`, constants used by other files. Only remove the `formatDuration` export from it.

**Keep** `course-gen-platform/src/shared/metrics/stage-metrics.ts` `formatDuration` — used internally within the file, no external consumers.

## Phase 5: Verification

```bash
pnpm install
pnpm --filter @megacampus/shared-utils build
pnpm --filter @megacampus/shared-utils test
pnpm type-check          # all packages
pnpm build               # all packages including Next.js
```

## Notes

- `SupportedLanguage` type conflict: `language-utils.ts` has 18 languages, `model-selector.ts` has local `'en' | 'ru'`. Both kept — different contexts.
- ~20 inline `formatDuration` implementations in React components — out of scope, follow-up task.
- `formatNumber`, `formatFileSize` — candidates for future migration to shared-utils (out of scope).
- Sanitization functions (DOMPurify-dependent) — NOT moved (env-specific).

## Critical files

- `packages/shared-logger/package.json` — pattern for package.json/tsup
- `packages/web/lib/generation-graph/document-display-name.ts` — source for merged implementation
- `packages/web/lib/generation-graph/format-utils.ts` — formatDuration source (format-utils variant)
- `packages/web/lib/utils/format.ts` — formatDuration source (admin variant)
- `packages/course-gen-platform/src/shared/metrics/stage-metrics.ts:561-580` — most complete formatDuration
- `packages/course-gen-platform/src/shared/utils/language-utils.ts` — language source (remove logger dep)
