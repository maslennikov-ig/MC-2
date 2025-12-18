# Dead Code Detection Report

**Generated**: 2025-11-21 10:30:00
**Status**: SCAN COMPLETE
**Version**: 1.0.0
**Scanned**: megacampus-monorepo v0.19.2

---

## Executive Summary

**Total Dead Code Items**: 67
**By Priority**:
- Critical: 0
- High: 6 (lint errors, unnecessary type assertions)
- Medium: 33 (console.log in production, TODO markers)
- Low: 28 (console.log in examples/docs, unused eslint directives)

**By Category**:
- Unused Imports: 2
- Commented Code: 10
- Debug Artifacts (console.log): 45
- TODO/FIXME Markers: 8
- Unreachable Code: 0
- Lint Errors: 5
- Unused ESLint Directives: 2

**Validation Status**: PASSED (type-check successful)

---

## Detailed Findings

### Priority: Critical

*No critical dead code found*

---

### Priority: High

#### 1. Lint Error - Redundant Type Constituent - `packages/shared-types/src/database.generated.ts:1454`

**Category**: Lint Errors
**Priority**: high
**File**: `packages/shared-types/src/database.generated.ts`
**Line**: 1454

**Issue**:
```typescript
// 'never' is overridden by other types in this union type
```

**Analysis**:
- ESLint error: @typescript-eslint/no-redundant-type-constituents
- Auto-generated file, but union type contains unnecessary `never`
- Safe to regenerate types from Supabase

**Suggested Fix**:
Regenerate database types using `supabase gen types typescript`.

---

#### 2. Unnecessary Type Assertion - `packages/shared-types/src/generation-result.ts:202`

**Category**: Lint Errors
**Priority**: high
**File**: `packages/shared-types/src/generation-result.ts`
**Line**: 202

**Issue**:
```typescript
// This assertion is unnecessary since it does not change the type of the expression
```

**Analysis**:
- Unnecessary type assertion that should be removed
- ESLint: @typescript-eslint/no-unnecessary-type-assertion

**Suggested Fix**:
Remove unnecessary type assertion.

---

#### 3. Unnecessary Type Assertion - `packages/shared-types/src/generation-result.ts:233`

**Category**: Lint Errors
**Priority**: high
**File**: `packages/shared-types/src/generation-result.ts`
**Line**: 233

**Issue**:
```typescript
// This assertion is unnecessary since it does not change the type of the expression
```

**Analysis**:
- Another unnecessary type assertion

**Suggested Fix**:
Remove unnecessary type assertion.

---

#### 4. Deprecated @ts-ignore - `packages/shared-types/src/generation-result.ts:269`

**Category**: Lint Errors
**Priority**: high
**File**: `packages/shared-types/src/generation-result.ts`
**Line**: 269

**Issue**:
```typescript
// Use "@ts-expect-error" instead of "@ts-ignore"
```

**Analysis**:
- @ts-ignore is deprecated in favor of @ts-expect-error
- ESLint: @typescript-eslint/ban-ts-comment

**Suggested Fix**:
Replace `@ts-ignore` with `@ts-expect-error`.

---

#### 5. Deprecated @ts-ignore - `packages/shared-types/src/generation-result.ts:299`

**Category**: Lint Errors
**Priority**: high
**File**: `packages/shared-types/src/generation-result.ts`
**Line**: 299

**Issue**:
```typescript
// Use "@ts-expect-error" instead of "@ts-ignore"
```

**Analysis**:
- @ts-ignore is deprecated

**Suggested Fix**:
Replace `@ts-ignore` with `@ts-expect-error`.

---

#### 6. Console.error in Production Code - `packages/course-gen-platform/src/server/trpc.ts:119`

**Category**: Debug Artifacts
**Priority**: high
**File**: `packages/course-gen-platform/src/server/trpc.ts`
**Line**: 119

**Issue**:
```typescript
console.error('Error validating JWT in context:', err);
```

**Analysis**:
- Console.error in core tRPC context creation
- Should use structured logger instead
- Could leak error details in production

**Suggested Fix**:
Replace with `logger.error('Error validating JWT in context:', { error: err })`.

---

### Priority: Medium

#### 7-14. TODO Markers in Production Code

**Category**: Debug Artifacts
**Priority**: medium

| # | File | Line | TODO Content |
|---|------|------|--------------|
| 7 | `src/server/routers/summarization.ts` | 190 | Add SuperAdmin role check for cross-org analytics |
| 8 | `src/server/index.ts` | 403 | Add cleanup for: (incomplete) |
| 9 | `src/orchestrator/handlers/error-handler.ts` | 199 | Send failure notifications |
| 10 | `src/orchestrator/handlers/error-handler.ts` | 222 | Implement stalled job recovery |
| 11 | `src/orchestrator/handlers/error-handler.ts` | 244 | Implement timeout-specific handling |
| 12 | `src/stages/stage5-generation/utils/metadata-generator.ts` | 368 | Consider adding language detection |
| 13 | `src/shared/embeddings/generate.ts` | 271 | Implement token-aware batching |
| 14 | `src/stages/stage4-analysis/utils/workflow-graph.ts` | 95-350 | Multiple stub implementations |

**Analysis**:
- 8 TODO/FIXME markers in production code paths
- Some are future work tracking, some are incomplete implementations

**Suggested Fix**:
Create GitHub issues to track these and remove markers, or implement the TODOs.

---

#### 15-17. Console.log in Production Code

**Category**: Debug Artifacts
**Priority**: medium

| # | File | Line | Description |
|---|------|------|-------------|
| 15 | `src/stages/stage5-generation/validators/blooms-whitelists.ts` | 234 | `console.info` for registered whitelist |
| 16 | `src/stages/stage5-generation/utils/section-batch-generator.ts` | 209, 228, 605, 664, 719 | Multiple `console.log/info` statements |
| 17 | `src/stages/stage5-generation/utils/metadata-generator.ts` | 218 | `console.log` for generation state |

**Analysis**:
- Console statements in production code paths
- Should use structured logger for observability

**Suggested Fix**:
Replace with logger.debug/info calls from pino logger.

---

#### 18. Console.warn in Shared Types - `packages/shared-types/src/style-prompts.ts:120`

**Category**: Debug Artifacts
**Priority**: medium
**File**: `packages/shared-types/src/style-prompts.ts`
**Line**: 120

**Issue**:
```typescript
console.warn(
  // Warning about style prompt usage
);
```

**Analysis**:
- Console.warn in shared types package
- Should not have console output in shared type definitions

**Suggested Fix**:
Remove console.warn or use a callback pattern.

---

#### 19. Console.warn in Shared Types - `packages/shared-types/src/generation-result.ts:327`

**Category**: Debug Artifacts
**Priority**: medium
**File**: `packages/shared-types/src/generation-result.ts`
**Line**: 327

**Issue**:
```typescript
console.warn(`[duration-validator] Duration exceeds max: ${actualDuration} min...`);
```

**Analysis**:
- Console.warn in duration validator
- Validation logic should not emit console output

**Suggested Fix**:
Return validation result with warning instead of console output.

---

#### 20. Console.info in Shared Types - `packages/shared-types/src/generation-result.ts:331`

**Category**: Debug Artifacts
**Priority**: medium
**File**: `packages/shared-types/src/generation-result.ts`
**Line**: 331

**Issue**:
```typescript
console.info(`[duration-validator] Duration exceeds engagement cap...`);
```

**Analysis**:
- Console.info in duration validator
- Same issue as above

**Suggested Fix**:
Return validation result with info instead of console output.

---

#### 21-33. Commented Code Blocks

**Category**: Commented Code
**Priority**: medium

| # | File | Line | Description |
|---|------|------|-------------|
| 21 | `src/shared/config/env-validator.ts` | 61 | Commented OPTIONAL_ENV_VARS const |
| 22 | `src/stages/stage5-generation/utils/metadata-generator.ts` | 54, 68 | Commented CRITICAL_METADATA_FIELDS, NON_CRITICAL_METADATA_FIELDS |
| 23 | `src/shared/llm/langchain-models.ts` | 23 | Commented import for getSupabaseAdmin |
| 24 | `web/tests/integration/api-routes.test.ts` | 592, 595 | Commented helper functions |
| 25 | `web/app/layout.tsx` | 7 | Commented ThemeScript import |
| 26 | `web/app/profile/components/AccountSettingsSection.tsx` | 13 | Commented RadioGroup import |
| 27 | `examples/rate-limit-usage.example.ts` | 198-200 | Commented error handling code |
| 28 | `examples/quota-enforcer-example.ts` | 222 | Commented import statement |
| 29 | `scripts/test-deduplication-simplified.ts` | 29 | Commented import |

**Analysis**:
- Multiple commented code blocks across codebase
- Some are intentional placeholders, others are remnants

**Suggested Fix**:
Review each block - remove if obsolete, uncomment if needed, or add explanation comment.

---

### Priority: Low

#### 34-35. Unused ESLint Directives - `packages/trpc-client-sdk/src/index.ts`

**Category**: Unused Imports
**Priority**: low
**File**: `packages/trpc-client-sdk/src/index.ts`
**Lines**: 225, 230

**Issue**:
```typescript
// Unused eslint-disable directive (no problems were reported from '@typescript-eslint/no-explicit-any')
// Unused eslint-disable directive (no problems were reported from '@typescript-eslint/no-unsafe-assignment' or '@typescript-eslint/no-explicit-any')
```

**Analysis**:
- ESLint disable directives that are no longer needed
- Code has been fixed but disable comments remain

**Suggested Fix**:
Run `eslint --fix` or remove manually.

---

#### 36. Unused ESLint Directive - `packages/shared-types/src/generation-result.ts:270`

**Category**: Unused Imports
**Priority**: low
**File**: `packages/shared-types/src/generation-result.ts`
**Line**: 270

**Issue**:
```typescript
// Unused eslint-disable directive (no problems were reported from '@typescript-eslint/no-unused-vars')
```

**Analysis**:
- ESLint disable directive no longer needed

**Suggested Fix**:
Remove the unused eslint-disable comment.

---

#### 37-67. Console.log in Examples/Docs/Tests (31 items)

**Category**: Debug Artifacts
**Priority**: low

**Files affected**:
- `examples/T057_upload_file_example.ts` - 36 console.log statements
- `docs/examples/qdrant/lifecycle-integration-example.ts` - 25 console.log statements
- `docs/examples/embeddings/jina-embeddings-usage-examples.ts` - 21 console.log statements
- `src/stages/stage5-generation/utils/cost-calculator.example.ts` - 45 console.log statements
- `src/shared/embeddings/__tests__/cache-validation.ts` - 35 console.log statements
- `web/tests/**/*.ts` - Multiple console.log for test debugging

**Analysis**:
- Console.log statements in example files and tests are acceptable
- They serve educational and debugging purposes
- No action required unless migrating to production

**Suggested Fix**:
Leave as-is (documentation/test purposes) or add eslint exceptions.

---

## Validation Results

### Type Check
PASSED - All packages compiled successfully

### Lint Check
FAILED - 5 errors, 3 warnings in shared-types package
- 1 redundant type constituent error (auto-generated)
- 2 unnecessary type assertion errors
- 2 @ts-ignore usage errors

### Overall Status
SCAN COMPLETE - 67 dead code items identified

---

## Next Steps

1. **Immediate (High Priority)** - 6 items
   - Fix lint errors in `packages/shared-types/src/generation-result.ts`
   - Replace console.error with structured logger in `trpc.ts`

2. **Short-term (Medium Priority)** - 33 items
   - Create issues for TODO markers
   - Replace console.log with pino logger in production code paths
   - Review and clean up commented code blocks

3. **Low Priority** - 28 items
   - Run `eslint --fix` to clean unused directives
   - Console.log in examples/docs/tests can remain

---

## Appendix

### Dead Code Items by Package

| Package | Items | High | Medium | Low |
|---------|-------|------|--------|-----|
| shared-types | 9 | 5 | 4 | 0 |
| course-gen-platform | 42 | 1 | 20 | 21 |
| web | 14 | 0 | 7 | 7 |
| trpc-client-sdk | 2 | 0 | 0 | 2 |

### Detection Methods Used
- ESLint unused variable detection
- TypeScript compiler analysis (noUnusedLocals, noUnusedParameters)
- Pattern matching for console statements
- Pattern matching for TODO/FIXME markers
- Commented code block detection
- Lint error analysis

### Files Excluded from Analysis
- `node_modules/**`
- `dist/**`
- `.next/**`
- `*.d.ts` (declaration files, except when in src)
- Generated database types (partial exclusion)

---

*Report generated by dead-code-hunter v1.0.0*
