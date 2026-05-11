# Fix root-level tsc errors

## Context

Running `tsc --noEmit` from repo root produces ~20,500 errors. All individual packages pass their own type-check cleanly. The root tsconfig lacks `jsx`, path aliases, and project references — so it type-checks everything with wrong settings. Additionally, `docs/`, `specs/`, and test files outside packages contribute real errors.

**Goal**: `tsc --noEmit` from root should produce 0 errors (or near-zero).

## Approach

Two-part fix: (1) exclude directories that have their own tsconfigs, (2) exclude non-compilable TS files.

### Step 1: Update root `tsconfig.json` exclude list

Add to `exclude`:

- `packages/web` — has own tsconfig with jsx, path aliases
- `packages/course-gen-platform` — has own tsconfig with path aliases
- `docs` — archive/llm-testing TS files are reference code, not compilable
- `specs` — contract TS files depend on `zod` which isn't in root deps
- `scripts` — orchestration scripts not meant for root tsc

**File**: `tsconfig.json`

### Step 2: Verify remaining errors

After exclusions, only `packages/shared-types`, `packages/shared-utils`, `packages/shared-logger` remain. Their test files produce a few errors from root context (NODE_ENV assignment, unknown types). These are test-only issues already excluded by each package's own tsconfig.

Add to root exclude:

- `**/__tests__/**`
- `**/*.test.ts`
- `**/tests/**`

### Step 3: Final verification

```bash
tsc --noEmit   # should be 0 errors
cd packages/web && tsc --noEmit          # should still pass
cd packages/course-gen-platform && tsc --noEmit  # should still pass
```

## Files to modify

- `/home/me/code/mc2/tsconfig.json` — add excludes

## Verification

1. `tsc --noEmit` from root — 0 errors
2. `cd packages/web && npx tsc --noEmit` — 0 errors (unchanged)
3. `cd packages/course-gen-platform && npx tsc --noEmit` — 0 errors (unchanged)
4. `cd packages/shared-types && npx tsc --noEmit` — 0 errors (unchanged)
