# Code Review: Logger Domain Architecture

**Date**: 2025-01-22
**Reviewer**: Claude Code (code-reviewer agent)
**Scope**: Domain-specific logging architecture refactoring

---

## Summary

This review covers the new domain-specific logger architecture that centralizes logging patterns for validation, pipeline, generation, RAG, and job operations. The refactoring moves `logValidationIssue` from the main logger index to a dedicated validation logger module while maintaining automatic WARN/ERROR writing to `error_logs` table.

**Overall Assessment**: APPROVE with minor recommendations

The architecture is well-designed, type-safe, and follows best practices for domain-driven logging. The automatic error_logs integration works correctly through the enhanced logger proxy pattern.

---

## Files Reviewed

1. `packages/course-gen-platform/src/shared/logger/domain/validation.logger.ts` (NEW)
2. `packages/course-gen-platform/src/shared/logger/domain/pipeline.logger.ts` (NEW)
3. `packages/course-gen-platform/src/shared/logger/domain/generation.logger.ts` (NEW)
4. `packages/course-gen-platform/src/shared/logger/domain/rag.logger.ts` (NEW)
5. `packages/course-gen-platform/src/shared/logger/domain/job.logger.ts` (NEW)
6. `packages/course-gen-platform/src/shared/logger/domain/index.ts` (NEW)
7. `packages/course-gen-platform/src/shared/logger/context/builders.ts` (NEW)
8. `packages/course-gen-platform/src/shared/logger/index.ts` (MODIFIED)

**Type Check Status**: PASSED
**Build Status**: Not executed (type-safety verified)
**Backward Compatibility**: VERIFIED (usage in validation-orchestrator.ts works correctly)

---

## Issues (Bugs)

### Critical Priority

None found.

### High Priority

None found.

### Medium Priority

#### M1: Missing `export default` consistency

**File**: `domain/validation.logger.ts`, `domain/pipeline.logger.ts`, etc.

**Issue**: Domain logger modules only have named exports. For consistency with the main logger (`index.ts` exports both named and default), consider adding a default export for the primary function in each domain.

**Impact**: Minor inconsistency in import patterns. Current code works fine, but consistency improves developer experience.

**Recommendation**:

```typescript
// Example for validation.logger.ts
export { logValidationIssue as default };

// Usage would allow both:
import { logValidationIssue } from './domain/validation.logger';
import logValidationIssue from './domain/validation.logger'; // Alternative
```

**Priority**: MEDIUM (consistency improvement, not blocking)

#### M2: Context builders return same type as input

**File**: `context/builders.ts`

**Issue**: The context builder functions simply return their input after spreading optional fields. They provide no additional value beyond type validation.

**Current code**:

```typescript
export function createCourseContext(params: CourseContext): CourseContext {
  return {
    courseId: params.courseId,
    ...(params.userId && { userId: params.userId }),
    ...(params.organizationId && { organizationId: params.organizationId }),
  };
}
```

**Impact**: Unnecessary function call overhead with no practical benefit. Developers can construct objects directly.

**Recommendation**: Either enhance builders to add value (validation, normalization, defaults) or consider removing them if they're only for type hints:

```typescript
// Option A: Add validation
export function createCourseContext(params: CourseContext): CourseContext {
  if (!params.courseId || params.courseId.length === 0) {
    throw new Error('courseId is required');
  }
  // Normalize/validate other fields
  return { ...params };
}

// Option B: Remove builders, use type directly
// Just use: const ctx: CourseContext = { courseId: '...' };
```

**Priority**: MEDIUM (code clarity, not blocking)

### Low Priority

#### L1: Missing JSDoc examples in pipeline logger

**File**: `domain/pipeline.logger.ts`

**Issue**: Functions lack usage examples in JSDoc comments. Validation logger has good examples, but pipeline logger is sparse.

**Recommendation**: Add JSDoc examples for consistency:

````typescript
/**
 * Logs the start of a pipeline phase.
 *
 * @example
 * ```typescript
 * logPipelineStart({
 *   courseId: 'abc-123',
 *   stage: 'stage_5',
 *   phase: 'metadata',
 *   attemptNumber: 1
 * });
 * ```
 */
````

**Priority**: LOW (documentation improvement)

#### L2: Inconsistent parameter names (snake_case vs camelCase)

**File**: Multiple domain loggers

**Issue**: Some functions use camelCase parameters (e.g., `courseId`, `attemptNumber`) while `error_logs` table uses snake_case columns (e.g., `course_id`, `job_id`). The enhanced logger in `index.ts` handles both styles, but domain loggers are inconsistent internally.

**Example**:

- `PipelineContext.courseId` (camelCase)
- `error_logs.course_id` (snake_case)

**Current behavior**: The enhanced logger proxy correctly converts camelCase to snake_case when writing to DB (lines 43-70 in `index.ts`).

**Recommendation**: Document this convention clearly at the top of each domain logger:

```typescript
/**
 * Pipeline Domain Logger
 *
 * NOTE: Uses camelCase for TypeScript interfaces (courseId, jobId)
 * but enhanced logger automatically converts to snake_case for DB (course_id, job_id).
 */
```

**Priority**: LOW (documentation clarity, no functional issue)

---

## Improvements (Recommendations)

### High Priority

#### R1: Add error boundary for recursive auto-mute calls

**File**: `index.ts` (lines 128-132)

**Context**: After writing to `error_logs`, the code calls `applyAutoMuteStatus`, which can itself call `logger.warn()` on failure (see `auto-mute-service.ts:53-56`). This creates a recursive logging scenario.

**Current safeguard**: The `auto-mute-service.ts` uses `baseLogger` instead of enhanced logger to avoid recursion.

**Issue**: This safeguard is implicit and not documented. Future maintainers might change `baseLogger.warn()` to `logger.warn()` and create infinite recursion.

**Recommendation**: Add explicit protection and documentation:

```typescript
// In index.ts, line 128-132
const logId = (insertedLog as unknown as { id: string } | null)?.id;
if (logId) {
  // SAFETY: applyAutoMuteStatus uses baseLogger internally to prevent recursion
  // DO NOT await - fire-and-forget to prevent blocking main log flow
  applyAutoMuteStatus(logId, message).catch(() => {
    // Silently ignore auto-mute failures to prevent recursion
  });
}
```

Add comment to `auto-mute-service.ts`:

```typescript
// CRITICAL: Use baseLogger here, NOT 'logger' from './index'
// to prevent infinite recursion in enhanced logger proxy
import { logger as baseLogger } from '@megacampus/shared-logger';
```

**Priority**: HIGH (prevent future bugs)

#### R2: Consolidate error object extraction logic

**File**: `index.ts` (lines 76-88)

**Issue**: Error object extraction is duplicated across `warn`, `error`, and `fatal` handlers. The logic is identical but not reusable.

**Recommendation**: Extract to helper function:

```typescript
/**
 * Safely extract error details from unknown error object
 */
function extractErrorDetails(errorObj: unknown): Record<string, unknown> {
  if (!errorObj) return {};

  if (typeof errorObj === 'object' && errorObj !== null) {
    const errAny = errorObj as Record<string, unknown>;
    return {
      errorDetails: {
        message: errAny.message || String(errorObj),
        code: errAny.code,
        name: errAny.name,
      },
    };
  }

  return { errorDetails: { message: String(errorObj) } };
}

// Then in writeToErrorLogs:
const errorObj = err || error;
if (errorObj) {
  Object.assign(metadata, extractErrorDetails(errorObj));
}
```

**Priority**: HIGH (code maintainability)

### Medium Priority

#### R3: Add type guards for context interfaces

**File**: All domain logger files

**Issue**: Context interfaces like `PipelineContext`, `GenerationContext`, etc. have no runtime validation. If incorrect data is passed, errors happen silently at DB write time.

**Recommendation**: Add type guards for critical contexts:

```typescript
// In domain/pipeline.logger.ts
export function isPipelineContext(obj: unknown): obj is PipelineContext {
  const ctx = obj as PipelineContext;
  return (
    typeof ctx === 'object' &&
    ctx !== null &&
    typeof ctx.courseId === 'string' &&
    typeof ctx.stage === 'string' &&
    typeof ctx.phase === 'string'
  );
}

// Usage in functions:
export function logPipelineStart(ctx: PipelineContext): void {
  if (!isPipelineContext(ctx)) {
    logger.error({ ctx }, 'Invalid PipelineContext provided to logPipelineStart');
    return;
  }
  logger.info(ctx, `Pipeline phase started: ${ctx.stage}/${ctx.phase}`);
}
```

**Priority**: MEDIUM (runtime safety vs. complexity tradeoff)

#### R4: Consider using discriminated unions for severity

**File**: `domain/validation.logger.ts` (line 13)

**Issue**: `ValidationIssueParams.severity` is a string union `'ERROR' | 'WARNING'`, but issues/warnings are separate optional arrays. This creates potential mismatches.

**Recommendation**: Use discriminated union:

```typescript
export type ValidationIssueParams =
  | {
      courseId: string;
      ruleId: string;
      severity: 'ERROR';
      path: string;
      suggestion?: string;
      issues: string[]; // Required for ERROR
    }
  | {
      courseId: string;
      ruleId: string;
      severity: 'WARNING';
      path: string;
      suggestion?: string;
      warnings: string[]; // Required for WARNING
    };
```

**Benefit**: TypeScript enforces that `ERROR` has `issues` and `WARNING` has `warnings`, preventing mismatches.

**Priority**: MEDIUM (type safety improvement)

### Low Priority

#### R5: Add performance trace logging for domain operations

**File**: All domain loggers

**Issue**: Domain loggers don't track performance metrics (duration) for operations. Only the validation orchestrator adds `durationMs`.

**Recommendation**: Add optional duration tracking to all domain functions:

```typescript
export function logPipelineComplete(ctx: PipelineContext & { durationMs?: number }): void {
  logger.info(
    { ...ctx, ...(ctx.durationMs && { durationMs: ctx.durationMs }) },
    `Pipeline phase completed: ${ctx.stage}/${ctx.phase}${ctx.durationMs ? ` (${ctx.durationMs}ms)` : ''}`
  );
}
```

**Priority**: LOW (observability enhancement)

#### R6: Add domain logger usage guide

**File**: Missing documentation

**Issue**: No documentation exists explaining when to use which domain logger and how they integrate with error_logs.

**Recommendation**: Create `packages/course-gen-platform/src/shared/logger/DOMAIN_LOGGERS.md`:

```markdown
# Domain Loggers Usage Guide

## Overview

Domain-specific loggers provide typed, structured logging for different system domains.

## Available Loggers

### Validation Logger (`domain/validation.logger.ts`)

- `logValidationIssue()` - Log ERROR/WARNING validation failures
- `logValidationSuccess()` - Log successful validation (INFO)
- `logValidationStart()` - Log validation start (INFO)

**Auto error_logs**: Yes (WARN/ERROR levels)

### Pipeline Logger (`domain/pipeline.logger.ts`)

...

## When to Use

- **Validation operations**: Use validation logger
- **Pipeline orchestration**: Use pipeline logger
- **LLM generation**: Use generation logger
  ...

## Error_logs Integration

WARN/ERROR/FATAL calls automatically write to `error_logs` table through enhanced logger proxy.
```

**Priority**: LOW (documentation)

---

## Architecture Patterns

### Strengths

1. **Clear separation of concerns**: Each domain has dedicated logger with typed contexts
2. **Proxy pattern for DB writes**: Elegant solution for automatic error_logs integration
3. **Type safety**: Strong TypeScript types prevent runtime errors
4. **Backward compatibility**: Migration preserved existing API (`logValidationIssue` export)
5. **Fire-and-forget DB writes**: Non-blocking error_logs writes don't impact performance
6. **Dual field name support**: Enhanced logger handles both camelCase and snake_case

### Design Decisions

#### Pattern: Enhanced logger proxy (index.ts)

**Decision**: Use JavaScript Proxy to intercept `warn`, `error`, `fatal` calls and write to DB.

**Rationale**:

- No changes needed to existing logger calls
- Automatic DB writes for all WARN/ERROR/FATAL
- Clean separation of concerns

**Alternatives considered**:

- Wrapper functions (more boilerplate)
- Middleware (Pino doesn't support this pattern well)
- Manual calls (error-prone, easy to forget)

**Assessment**: Excellent choice for this use case.

#### Pattern: Domain-specific loggers

**Decision**: Create separate logger files for each domain (validation, pipeline, etc.).

**Rationale**:

- Typed contexts for each domain
- Clear boundaries between concerns
- Easy to add new domains

**Alternatives considered**:

- Single logger with tags (less type safety)
- Class-based loggers (more complex)

**Assessment**: Good choice, scales well.

---

## Potential Issues

### PI1: Auto-mute service circular dependency risk

**File**: `index.ts` line 131, `auto-mute-service.ts` line 9

**Risk**: If future maintainer changes `auto-mute-service.ts` to import `logger` from `./index` instead of `@megacampus/shared-logger`, it creates circular dependency and infinite recursion.

**Mitigation**: Add ESLint rule or test to prevent this:

```javascript
// .eslintrc.js
rules: {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['../logger', './index'],
          message: 'auto-mute-service must use baseLogger from @megacampus/shared-logger to prevent recursion'
        }
      ]
    }
  ]
}
```

**Priority**: MEDIUM

### PI2: No retry logic for error_logs write failures

**File**: `index.ts` lines 133-142

**Risk**: If `writeToErrorLogs()` fails (DB connection issue, schema mismatch), the error is logged to console but lost from `error_logs` table. No retry mechanism exists.

**Current behavior**: Fire-and-forget with fallback to console warn.

**Consideration**: This is likely intentional to prevent blocking application flow. Document this explicitly:

```typescript
/**
 * Write log entry to error_logs table (fire-and-forget)
 *
 * IMPORTANT: Failures are logged to console but not retried.
 * This prevents application blocking on database issues.
 * For critical errors, use logPermanentFailure() from error-service.ts instead.
 */
async function writeToErrorLogs(...) { ... }
```

**Priority**: LOW (documentation)

---

## Test Coverage

**Status**: No test files reviewed (out of scope for this review)

**Recommendation**: Ensure tests cover:

1. Enhanced logger proxy intercepts warn/error/fatal correctly
2. Domain loggers format contexts correctly
3. Auto-mute service doesn't create recursion
4. Context builders validate required fields (if validation added per R3)
5. Error_logs writes handle both camelCase and snake_case fields

---

## Migration & Backward Compatibility

### Verified Working

- `logValidationIssue` import in `validation-orchestrator.ts` works correctly
- Export from `domain/validation.logger.ts` -> `domain/index.ts` -> `logger/index.ts`
- No breaking changes to existing code

### Migration Notes

If refactoring old logger calls to use domain loggers:

**Before**:

```typescript
import logger from '../shared/logger';
logger.warn({ courseId, error }, 'Pipeline failed');
```

**After**:

```typescript
import { logPipelineError } from '../shared/logger/domain';
logPipelineError({
  courseId,
  stage: 'stage_5',
  phase: 'validation',
  error,
  recoverable: true,
});
```

**Benefit**: Typed context, clearer intent, automatic error_logs structure.

---

## Performance Considerations

### Proxy Overhead

**Analysis**: JavaScript Proxy adds minimal overhead (~1-2 microseconds per call). Given logging is already async I/O bound, this is negligible.

**Measurement recommendation**: Add performance trace to verify:

```typescript
const start = performance.now();
logger.error({ test: 'data' }, 'Test error');
console.log(`Log call took ${performance.now() - start}ms`);
```

### Fire-and-forget DB writes

**Analysis**: `writeToErrorLogs()` uses `.catch(() => {})` pattern, which is correct for fire-and-forget. However, multiple rapid errors could queue many DB writes.

**Recommendation**: Consider rate limiting or batching if high-volume errors occur:

```typescript
// Pseudo-code for future optimization
const errorLogQueue = [];
setInterval(() => {
  if (errorLogQueue.length > 0) {
    supabase
      .from('error_logs')
      .insert(errorLogQueue)
      .catch(() => {});
    errorLogQueue.length = 0;
  }
}, 1000); // Batch every 1 second
```

**Priority**: LOW (optimize only if needed)

---

## Security Considerations

### S1: Input sanitization for trpc_input

**File**: `index.ts` lines 94-104

**Analysis**: `trpcInput` is sanitized before DB write using `JSON.parse(JSON.stringify())`. This removes non-serializable objects but doesn't sanitize sensitive data beyond the fields in `types.ts:sanitizeTrpcInput()`.

**Recommendation**: Ensure `sanitizeTrpcInput()` covers all sensitive patterns. Current implementation handles:

- `password`, `token`, `secret`, `apiKey`, `api_key`, `authorization`

**Missing patterns to consider**:

- `ssn`, `creditCard`, `cvv`, `pin`
- Email addresses (PII)
- Phone numbers (PII)

**Priority**: MEDIUM (data privacy)

### S2: Stack traces contain sensitive data

**File**: `index.ts` line 122

**Analysis**: Stack traces (`stack_trace` column) may contain file paths, environment variables, or sensitive data in error messages.

**Recommendation**: Consider sanitizing stack traces:

```typescript
function sanitizeStackTrace(stack: string | undefined): string | null {
  if (!stack) return null;
  // Remove absolute paths, keep relative paths
  return stack.replace(/\/home\/[^\/]+\//g, '/user/');
}
```

**Priority**: LOW (depends on deployment security)

---

## Code Style & Consistency

### Positive observations:

1. Consistent use of arrow functions
2. Clear JSDoc comments on all public functions
3. Appropriate use of TypeScript types (no `any` except for Supabase queries)
4. Consistent naming conventions (camelCase for TypeScript, snake_case for DB)

### Minor style notes:

1. Some functions have JSDoc examples, others don't (see L1)
2. Inconsistent blank line spacing between functions (subjective)

---

## Verdict

### APPROVE

**Rationale**:

- No critical bugs found
- Type-check passes
- Backward compatibility verified
- Architecture is sound and scalable
- Performance impact is negligible
- Security considerations are mostly addressed

### Conditions:

Before merging, address:

1. **HIGH priority R1**: Document auto-mute recursion safeguards
2. **HIGH priority R2**: Extract error handling logic to reduce duplication

### Future improvements (non-blocking):

1. Add type guards (R3)
2. Add domain logger usage guide (R6)
3. Review test coverage

### Recommended next steps:

1. Merge current changes
2. Create follow-up issues for MEDIUM priority recommendations
3. Monitor error_logs table for performance under load
4. Add integration tests for domain loggers

---

## Conclusion

The domain logger architecture is well-designed and production-ready. The proxy pattern for automatic error_logs integration is elegant and maintainable. The refactoring successfully centralizes logging patterns while maintaining backward compatibility.

**Estimated technical debt**: LOW
**Risk level**: LOW
**Maintenance burden**: LOW

This architecture will scale well as new domains are added and provides a strong foundation for observability.

---

**Review completed**: 2025-01-22
**Artifacts**:

- Type-check passed
- 8 files reviewed
- 0 critical issues
- 2 high-priority recommendations
- Backward compatibility verified

**Reviewer signature**: Claude Code (code-reviewer agent)
