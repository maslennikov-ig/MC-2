# Plan: Test Structure Migration to Hybrid Approach

## Goal

Migrate 197 test files from scattered `tests/` folders to hybrid structure:

- **Unit tests**: Colocation in `src/**/__tests__/`
- **E2E/Integration**: Remain in `tests/e2e/`, `tests/integration/`
- **Fixtures**: Remain in `tests/fixtures/`

## Critical Files to Modify

### Vitest Configs

- `packages/web/vitest.config.ts` - add `src/**/__tests__/**/*.test.{ts,tsx}` to include
- `packages/course-gen-platform/vitest.config.ts` - add `src/**/__tests__/**/*.test.ts` to include

### Migration Summary

| Package             | Unit Tests          | E2E     | Integration | Fixtures |
| ------------------- | ------------------- | ------- | ----------- | -------- |
| web                 | 15 → colocation     | 13 stay | 2 stay      | stay     |
| course-gen-platform | ~80 → colocation    | 8 stay  | 36 stay     | stay     |
| shared-types        | 2 → colocation      | -       | -           | -        |
| shared-logger       | 2 already colocated | -       | -           | -        |

## Implementation Steps

### Phase 1: Update Vitest Configs (non-breaking)

Update configs to find tests in BOTH locations:

```typescript
// packages/web/vitest.config.ts
include: [
  'src/**/__tests__/**/*.test.{ts,tsx}', // NEW: colocation
  'tests/unit/**/*.test.{ts,tsx}', // OLD: keep for gradual migration
  'tests/integration/**/*.test.{ts,tsx}',
];

// packages/course-gen-platform/vitest.config.ts
include: [
  'src/**/__tests__/**/*.test.ts', // NEW: colocation
  'tests/**/*.test.ts', // OLD: keep all
];
```

### Phase 2: Create Directory Structure

Create `__tests__` directories where needed.

### Phase 3: Migrate Unit Tests

#### packages/web (15 files)

```bash
# lib utilities
tests/unit/rate-limit.test.ts → src/lib/__tests__/rate-limit.test.ts
tests/unit/draft-session.test.ts → src/lib/__tests__/draft-session.test.ts
tests/unit/validation.test.ts → src/lib/__tests__/validation.test.ts
tests/unit/course-data-utils.test.ts → src/lib/__tests__/course-data-utils.test.ts

# API routes
tests/unit/api/courses/pause-resume.test.ts → src/app/api/courses/[slug]/__tests__/pause-resume.test.ts

# Components - markdown
tests/unit/components/markdown/presets.test.ts → src/components/markdown/__tests__/presets.test.ts
tests/unit/components/markdown/MarkdownRenderer.test.tsx → src/components/markdown/__tests__/MarkdownRenderer.test.tsx
tests/unit/components/markdown/MarkdownRendererClient.test.tsx → src/components/markdown/__tests__/MarkdownRendererClient.test.tsx

# Components - generation-celestial
tests/unit/components/generation-celestial/utils.test.ts → src/components/generation-celestial/__tests__/utils.test.ts
tests/unit/components/generation-celestial/components.test.tsx → src/components/generation-celestial/__tests__/components.test.tsx

# Components - generation-graph
tests/unit/components/generation-graph/hooks/useModuleDashboardData.test.ts → src/hooks/__tests__/useModuleDashboardData.test.ts
tests/unit/components/generation-graph/components/ProgressSummaryDisplay.test.tsx → src/components/generation-graph/components/__tests__/ProgressSummaryDisplay.test.tsx

# Components - course viewer
tests/unit/components/course/viewer/EnrichmentGeneratingCard.test.tsx → src/components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx
tests/unit/components/course/viewer/EnrichmentPlaceholderCard.test.tsx → src/components/course/viewer/__tests__/EnrichmentPlaceholderCard.test.tsx

# Hooks
tests/unit/hooks/useEnrichmentGeneration.test.ts → src/lib/hooks/__tests__/useEnrichmentGeneration.test.ts
```

#### packages/course-gen-platform (~80 files)

Major groups:

**Shared services:**

```bash
tests/unit/llm-client.test.ts → src/shared/llm/__tests__/client.test.ts
tests/unit/token-estimator.test.ts → src/shared/llm/__tests__/token-estimator.test.ts
tests/unit/context-overflow-handler.test.ts → src/shared/llm/__tests__/context-overflow-handler.test.ts
tests/unit/jina-reranker-client.test.ts → src/shared/rerankers/__tests__/jina.test.ts
tests/unit/i18n/translator.test.ts → src/shared/i18n/__tests__/translator.test.ts
tests/unit/constants/*.test.ts → src/shared/constants/__tests__/
```

**Server/middleware:**

```bash
tests/unit/authorize-middleware.test.ts → src/server/middleware/__tests__/authorize.test.ts
tests/unit/auth-middleware.test.ts → src/server/middleware/__tests__/auth.test.ts
tests/unit/trpc-context.test.ts → src/server/__tests__/trpc.test.ts
```

**LMS Integration (16 files):**

```bash
tests/unit/integrations/lms/*.test.ts → src/integrations/lms/__tests__/
tests/unit/integrations/lms/openedx/**/*.test.ts → src/integrations/lms/openedx/**/__tests__/
```

**Stage 2-7 (~22 files):**

```bash
tests/unit/stages/stage2/*.test.ts → src/stages/stage2-document-processing/__tests__/
tests/unit/stages/stage4/**/*.test.ts → src/stages/stage4-analysis/**/__tests__/
tests/unit/stages/stage5/**/*.test.ts → src/stages/stage5-generation/**/__tests__/
tests/unit/stages/stage6/**/*.test.ts → src/stages/stage6-lesson-content/**/__tests__/
tests/unit/stages/stage7/**/*.test.ts → src/stages/stage7-audio-generation/__tests__/
```

**Judge system (7 files):**

```bash
tests/unit/judge/*.test.ts → src/stages/stage6-lesson-content/judge/__tests__/
tests/unit/judge/arbiter/* → src/stages/stage6-lesson-content/judge/arbiter/__tests__/
```

**Other groups:**

```bash
tests/unit/validators/*.test.ts → src/stages/stage5-generation/validators/__tests__/
tests/unit/regeneration/*.test.ts → src/stages/stage5-generation/regeneration/__tests__/
tests/unit/enrichment-procedures/*.test.ts → src/server/routers/enrichment/procedures/__tests__/
tests/unit/services/**/*.test.ts → src/services/**/__tests__/
```

#### packages/shared-types (2 files)

```bash
tests/analysis-schemas.test.ts → src/__tests__/analysis-schemas.test.ts
tests/lesson-identifiers.test.ts → src/__tests__/lesson-identifiers.test.ts
```

### Phase 4: Update Import Paths

After moving files, fix relative imports in test files. Most imports use `@/` alias, so minimal changes expected.

### Phase 5: Clean Up

1. Remove empty `tests/unit/` directories
2. Remove empty `__tests__` folders created earlier but not used
3. Update vitest configs to remove old paths

### Phase 6: Document Standard

Update `CLAUDE.md` with test organization standard.

## Verification

1. Run `pnpm test` in each package
2. Run `pnpm type-check`
3. Verify test count matches before/after (197 tests)

## Rollback

If issues occur:

- Git revert the commit
- Tests remain functional due to Phase 1 allowing both paths

## Execution Order

1. [ ] Update vitest configs (allow both paths)
2. [ ] Migrate packages/web unit tests (15 files)
3. [ ] Run web tests - verify pass
4. [ ] Migrate packages/course-gen-platform unit tests (~80 files)
5. [ ] Run course-gen-platform tests - verify pass
6. [ ] Migrate packages/shared-types tests (2 files)
7. [ ] Clean up empty directories
8. [ ] Update CLAUDE.md with standard
9. [ ] Final verification: pnpm test across all packages

## Next Agent

After approval, delegate to `code-structure-refactorer` agent for safe file migration with git history preservation.
