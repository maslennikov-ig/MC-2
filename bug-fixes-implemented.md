# Bug Fixes Report - Deprecated API Usages

**Generated**: 2026-01-06
**Status**: All fixes completed successfully

---

## Summary

| Metric                  | Count  |
| ----------------------- | ------ |
| **Total Fixes Applied** | 7      |
| **Files Modified**      | 7      |
| **Files Deleted**       | 4      |
| **Files Created**       | 0      |
| **Type Check**          | PASSED |
| **Build**               | PASSED |

---

## Fixes Implemented

### 1. Replace hybridSearch with hybridSearchWithFallback

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/shared/qdrant/search.ts`

**Before**:

```typescript
import { denseSearch, hybridSearch } from './search-operations';
// ...
searchResults = await hybridSearch(queryText, config);
```

**After**:

```typescript
import { denseSearch, hybridSearchWithFallback } from './search-operations';
// ...
searchResults = await hybridSearchWithFallback(queryText, config);
```

**Reason**: `hybridSearch` is marked as deprecated in favor of `hybridSearchWithFallback` which provides explicit fallback behavior.

---

### 2. Remove clearSettingsCache() call

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/pipeline-admin/global-settings.ts`

**Changes**:

- Removed import: `import { clearSettingsCache } from '../../../services/prompt-loader';`
- Removed call: `clearSettingsCache();`

**Reason**: `clearSettingsCache()` is a no-op function (feature flags were removed). The call was unnecessary.

---

### 3. Update test imports from deprecated utils

**File**: `/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage5/json-repair.test.ts`

**Before**:

```typescript
import { extractJSON, safeJSONParse } from '@/stages/stage5-generation/utils/json-repair';
import type { RepairResult } from '@/stages/stage5-generation/utils/json-repair';
```

**After**:

```typescript
import { extractJSON, safeJSONParse } from '@/shared/utils/json-repair';
import type { RepairResult } from '@/shared/utils/json-repair';
```

---

**File**: `/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage5/field-name-fix.test.ts`

**Before**:

```typescript
import {
  fixFieldNames,
  fixFieldNamesWithLogging,
} from '@/stages/stage5-generation/utils/field-name-fix';
```

**After**:

```typescript
import { fixFieldNames, fixFieldNamesWithLogging } from '@/shared/utils/field-name-fix';
```

**Reason**: These utilities were moved to `@/shared/utils/` for centralized access across all stages.

---

### 4. Replace ApiErrors.\* with jsonError() + ERROR_CODES

**File**: `/home/me/code/mc2/packages/web/app/api/organizations/[orgId]/transfer/route.ts`

**Import Change**:

```typescript
// Before
import { getRequestId, getClientInfo, ApiErrors } from '@/lib/api-utils';

// After
import { getRequestId, getClientInfo } from '@/lib/api-utils';
import { jsonError, ERROR_CODES } from '@/lib/api-response';
```

**Usage Changes**:
| Before | After |
|--------|-------|
| `ApiErrors.unauthorized(requestId)` | `jsonError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401)` |
| `ApiErrors.badRequest(message, requestId)` | `jsonError(ERROR_CODES.VALIDATION_ERROR, message, 400)` |
| `ApiErrors.forbidden(message, requestId)` | `jsonError(ERROR_CODES.FORBIDDEN, message, 403)` |
| `ApiErrors.validationError(errors, requestId)` | `jsonError(ERROR_CODES.VALIDATION_ERROR, 'Validation failed', 400, errors)` |
| `ApiErrors.databaseError(requestId)` | `jsonError(ERROR_CODES.INTERNAL_ERROR, 'Database operation failed', 500)` |
| `ApiErrors.internal(requestId)` | `jsonError(ERROR_CODES.INTERNAL_ERROR, 'An unexpected error occurred', 500)` |

---

**File**: `/home/me/code/mc2/packages/web/app/api/organizations/[orgId]/invitations/bulk/route.ts`

Same pattern applied as above.

---

### 5. Update phase-6-rag-planning.ts import (discovered during type-check)

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts`

**Before**:

```typescript
import { fixFieldNames } from '../utils/field-name-fix';
```

**After**:

```typescript
import { fixFieldNames } from '@/shared/utils/field-name-fix';
```

**Reason**: The relative import pointed to a deprecated re-export file that was deleted.

---

### 6. Delete deprecated re-export files

The following deprecated re-export files were deleted:

| File                                                                                | Reason                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/course-gen-platform/src/stages/stage4-analysis/utils/langchain-models.ts` | Deprecated re-export to `@/shared/llm/langchain-models` |
| `packages/course-gen-platform/src/stages/stage4-analysis/utils/field-name-fix.ts`   | Deprecated re-export to `@/shared/utils/field-name-fix` |
| `packages/course-gen-platform/src/stages/stage5-generation/utils/field-name-fix.ts` | Deprecated re-export to `@/shared/utils/field-name-fix` |
| `packages/course-gen-platform/src/stages/stage5-generation/utils/json-repair.ts`    | Deprecated re-export to `@/shared/utils/json-repair`    |

---

## Validation

| Check                           | Status |
| ------------------------------- | ------ |
| Type Check (`pnpm type-check`)  | PASSED |
| Production Build (`pnpm build`) | PASSED |

---

## Changes Log

- **Modified files**: 7
- **Deleted files**: 4
- **Backup directory**: `.tmp/current/backups/.rollback/`
- **Changes log**: `.tmp/current/changes/bug-changes.json`

**Rollback Available**: Use `rollback-changes` Skill if needed

---

## Risk Assessment

- **Regression Risk**: Low - All changes are import/API modernization, functionality unchanged
- **Performance Impact**: None
- **Breaking Changes**: None - Internal API changes only
- **Side Effects**: None

---

## Modified Files Summary

1. `/home/me/code/mc2/packages/course-gen-platform/src/shared/qdrant/search.ts`
2. `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/pipeline-admin/global-settings.ts`
3. `/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage5/json-repair.test.ts`
4. `/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage5/field-name-fix.test.ts`
5. `/home/me/code/mc2/packages/web/app/api/organizations/[orgId]/transfer/route.ts`
6. `/home/me/code/mc2/packages/web/app/api/organizations/[orgId]/invitations/bulk/route.ts`
7. `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts`

## Deleted Files Summary

1. `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/utils/langchain-models.ts`
2. `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/utils/field-name-fix.ts`
3. `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage5-generation/utils/field-name-fix.ts`
4. `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage5-generation/utils/json-repair.ts`
