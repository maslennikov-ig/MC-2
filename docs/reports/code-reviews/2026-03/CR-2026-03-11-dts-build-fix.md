# Code Review: shared-logger DTS Build Fix

**Date**: 2026-03-11
**Scope**: `packages/shared-logger` — build script change from `tsup --dts` to `tsup + tsc --emitDeclarationOnly`
**Files**: 2 | **Changes**: +3 / -2

## Summary

|              | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Issues       | 0        | 0    | 1      | 1   |
| Improvements | —        | 0    | 0      | 0   |

**Verdict**: PASS (all issues fixed)

## Issues (all resolved)

### Medium — FIXED

#### 1. Test declarations leak into dist

- **File**: `packages/shared-logger/tsconfig.json:11`
- **Problem**: `include: ["src/**/*"]` matched `src/__tests__/*.test.ts`. With `tsc --emitDeclarationOnly`, this generated `dist/__tests__/index.test.d.ts` and `dist/__tests__/transports.test.d.ts`.
- **Impact**: Test artifacts polluting dist output.
- **Fix applied**: Added `"exclude": ["src/**/*.test.ts", "src/**/__tests__"]` to `tsconfig.json`.
- **Beads**: mc2-x88h8 (closed)

### Low — FIXED (by tsbuildinfo deletion)

#### 2. Stale `index.d.mts` artifact from old build

- **File**: `packages/shared-logger/dist/index.d.mts`
- **Problem**: Old `tsup --dts` left `index.d.mts`. New `tsc --emitDeclarationOnly` doesn't generate `.d.mts`.
- **Investigation**: Attempted `--clean` flag on tsup, but discovered it conflicts with `incremental: true` (inherited from root `tsconfig.json:16`). `--clean` wipes dist, but tsbuildinfo tells tsc files are "up-to-date" → `.d.ts` files silently not regenerated. This was a **new Critical bug** that would have broken all builds.
- **Fix applied**: Removed `--clean`, resolved stale artifact by one-time `tsbuildinfo` deletion. Matches `shared-utils` pattern exactly.
- **Beads**: mc2-ifjta (closed)

## Positive Patterns

1. **Correct pattern matching**: Fix mirrors `shared-utils/package.json:15`, maintaining monorepo consistency.
2. **Root cause addressed**: Separates JS bundling (tsup) from type generation (tsc) — idiomatic per tsup docs.
3. **Proper type exports**: `package.json` exports with `"types"` condition correctly point to `./dist/index.d.ts`.

## Validation

- Type Check: PASS (all 5 packages)
- Build (shared-logger): PASS
- Declarations present: PASS (`index.d.ts`, `transports.d.ts`, `types.d.ts`, `utils.d.ts`)
- No test leaks: PASS (no `__tests__/` in dist)
- Idempotent rebuild: PASS (second build also succeeds)
- Build (full monorepo): FAIL — `packages/web` PostCSS error (pre-existing, unrelated)

## Files Changed

| File                                          | Change                                             |
| --------------------------------------------- | -------------------------------------------------- |
| `packages/shared-logger/package.json:15`      | `tsup --dts` → `tsup && tsc --emitDeclarationOnly` |
| `packages/shared-logger/tsconfig.json:12`     | Added `exclude` for test files                     |
| `packages/shared-logger/tsconfig.tsbuildinfo` | Deleted (stale cache)                              |
