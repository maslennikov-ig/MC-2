# Plan: tRPC Test Cleanup

## Context

После миграции tRPC (commit `ec8c8b6e`) обнаружен дубликат тестового файла: `tests/unit/server/trpc.test.ts` идентичен `tests/unit/trpc-context.test.ts` (30 тестов x2). Оба проходят, но 30 тестов прогоняются дважды без пользы.

## Current State

- **Unit tests**: 83/83 pass, 2260 tests, ~10s
- `trpc-context.test.ts` (30 tests) — relative imports `../../src/server/trpc`
- `server/trpc.test.ts` (30 tests) — alias imports `@/server/trpc`
- **Integration**: `tests/integration/trpc-server.test.ts` (21 tests) — requires infra, not in unit suite

## Plan

### Step 1: Delete duplicate

- **Delete** `packages/course-gen-platform/tests/unit/server/trpc.test.ts`
- Canonical version: `tests/unit/trpc-context.test.ts`

### Step 2: Verify 82/82 pass

- `pnpm --filter course-gen-platform test`
- Expect: 82 files, ~2230 tests, no regressions

### Step 3: Commit & push

## Verification

- `pnpm --filter course-gen-platform test` — 82/82 pass, no hanging
