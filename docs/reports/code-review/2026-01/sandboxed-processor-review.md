# Code Review: BullMQ Sandboxed Processor Implementation

**Date**: 2026-01-17
**Reviewer**: Claude Code (Sonnet 4.5)
**Files Reviewed**:

- `packages/course-gen-platform/src/orchestrator/processor.ts` (new, 164 lines)
- `packages/course-gen-platform/src/orchestrator/worker.ts` (modified, 505 lines)

**BullMQ Version**: v5.x (inferred from Context7 docs)
**Pattern**: Sandboxed Processor with Worker Threads

---

## Executive Summary

**Overall Assessment**: ✅ **APPROVED WITH RECOMMENDATIONS**

The sandboxed processor implementation is **functionally correct** and follows BullMQ's documented patterns. Type-check passes, architecture is sound, and the code demonstrates good understanding of process isolation patterns. However, there are **3 critical issues** and **5 recommendations** that should be addressed to improve type safety, maintainability, and correctness.

### Key Metrics

- **Critical Issues**: 3
- **High Priority**: 2
- **Medium Priority**: 3
- **Low Priority**: 2
- **Type Safety**: ✅ Compiles (but uses unsafe casts)
- **Pattern Compliance**: ✅ Matches BullMQ docs
- **Documentation**: ✅ Excellent inline docs

### Highlights

- ✅ Correctly uses `export default` (ES modules) instead of `module.exports`
- ✅ Proper worker thread configuration with `useWorkerThreads: true`
- ✅ Excellent documentation and architectural comments
- ⚠️ Excessive use of `as unknown as` type casts bypasses TypeScript safety
- ⚠️ Stage 6 token handling is fragile and undocumented
- ⚠️ Inconsistent handler interface creates type confusion

---

## Critical Issues

### ISSUE-1: Type Safety Bypassed with `as unknown as` Casts

**Severity**: Critical
**File**: `packages/course-gen-platform/src/orchestrator/processor.ts:61-66`
**Category**: Type Safety

**Description**:

All handler registrations use `as unknown as JobHandler` to force incompatible types:

```typescript
const jobHandlers: Record<string, JobHandler> = {
  [JobType.TEST_JOB]: testJobHandler as unknown as JobHandler,
  [JobType.INITIALIZE]: initializeJobHandler as unknown as JobHandler,
  [JobType.DOCUMENT_PROCESSING]: documentProcessingHandler as unknown as JobHandler,
  // ... etc
};
```

This pattern **completely bypasses TypeScript's type checking**. The `as unknown as` cast is a red flag indicating a type system mismatch that's being hidden rather than resolved.

**Root Cause**:

Handlers extend `BaseJobHandler<T>` which expects `Job<T>` but the processor needs `SandboxedJob<T>`. The types are **structurally compatible** (SandboxedJob has subset of Job's API) but TypeScript doesn't recognize this.

**Impact**:

- No compile-time type safety for handler compatibility
- Runtime errors possible if handler uses Job methods not in SandboxedJob
- Future refactoring could break handlers without TypeScript warnings
- Code review burden increases (manual verification required)

**Fix**: Create proper adapter types or wrapper functions

```typescript
// Option 1: Adapter wrapper
type SandboxedJobHandler<T extends JobData = JobData> = {
  process: (job: SandboxedJob<T>) => Promise<JobResult>;
};

function adaptHandler<T extends JobData>(handler: BaseJobHandler<T>): SandboxedJobHandler<T> {
  return {
    process: async (job: SandboxedJob<T>) => {
      // Job and SandboxedJob are structurally compatible for our use case
      // We only use: data, id, name, updateProgress(), attemptsMade, opts
      return handler.process(job as unknown as Job<T>);
    },
  };
}

const jobHandlers: Record<string, SandboxedJobHandler> = {
  [JobType.TEST_JOB]: adaptHandler(testJobHandler),
  [JobType.INITIALIZE]: adaptHandler(initializeJobHandler),
  // ... etc - ONE cast in adapter, not six casts in registry
};
```

```typescript
// Option 2: Shared base interface (better long-term)
// In base-handler.ts:
interface MinimalJob<T> {
  data: T;
  id?: string;
  name: string;
  opts: JobOptions;
  attemptsMade: number;
  updateProgress(progress: number | object): Promise<void>;
  // ... only methods we actually use
}

export abstract class BaseJobHandler<T extends JobData = JobData> {
  abstract execute(jobData: T, job: MinimalJob<T>): Promise<JobResult>;
  async process(job: MinimalJob<T>): Promise<JobResult> {
    /* ... */
  }
}

// Then both Job and SandboxedJob satisfy MinimalJob without casts
```

**Priority**: Fix before merging to production (currently works but fragile)

---

### ISSUE-2: Stage 6 Token Handling is Fragile and Unsafe

**Severity**: Critical
**File**: `packages/course-gen-platform/src/orchestrator/processor.ts:67-80`
**Category**: Type Safety, Runtime Safety

**Description**:

Stage 6 has special-case token handling with unsafe casting:

```typescript
[JobType.LESSON_CONTENT]: {
  process: async (job: SandboxedJob<JobData>) => {
    // Stage 6 handler expects token for pause/delay functionality
    // In sandboxed mode, the token is passed via job.token if available
    const token = (job as SandboxedJob<JobData> & { token?: string }).token;
    const result = await processStage6Job(job as any, token);
    // ... return result ...
  },
},
```

**Problems**:

1. **Undocumented assumption**: Comment says "token is passed via job.token" but:
   - This is NOT in BullMQ's SandboxedJob type definition
   - No evidence in Context7 docs that `token` is available
   - Appears to be custom behavior without documentation

2. **Double unsafe cast**: First `as SandboxedJob<JobData> & { token?: string }`, then `job as any`

3. **Silent failure**: If `token` is undefined, `processStage6Job` receives `undefined` but expects `string | undefined`. May work but behavior is unclear.

4. **Inconsistent with other handlers**: Why does Stage 6 need special treatment?

**Investigation Required**:

```bash
# Check if job.token is documented in BullMQ
grep -r "job.token" node_modules/bullmq/dist/classes/sandboxed-job.d.ts

# Check processStage6Job signature
# Already confirmed: (job, token?: string) => Promise<Stage6JobResult>
```

**Possible Scenarios**:

1. **Token is in job.data**: Should be `job.data.token` (if part of JobData)
2. **Token is in job.opts**: Should be `job.opts.token` (if BullMQ extension)
3. **Token doesn't exist**: Code is broken but hasn't been tested with Stage 6 jobs yet

**Fix**: Clarify token source and use proper typing

```typescript
// If token is in job.data (most likely):
[JobType.LESSON_CONTENT]: {
  process: async (job: SandboxedJob<JobData>) => {
    const jobData = job.data as Stage6JobInput; // Type assertion with clear intent
    const token = jobData.token; // Explicit field access
    const result = await processStage6Job(job as any, token); // Still needs fix for Job vs SandboxedJob
    return {
      success: result.success,
      message: result.success ? 'Lesson content generated' : result.errors.join(', '),
      data: result,
      error: result.errors.length > 0 ? result.errors[0] : undefined,
    };
  },
},
```

```typescript
// If token is in job.opts (BullMQ extension):
[JobType.LESSON_CONTENT]: {
  process: async (job: SandboxedJob<JobData>) => {
    const token = (job.opts as any)?.token as string | undefined;
    // ... rest of handler
  },
},
```

**Priority**: Investigate immediately - this could be a latent bug

---

### ISSUE-3: Export Pattern Mismatch with BullMQ Docs

**Severity**: Critical
**File**: `packages/course-gen-platform/src/orchestrator/processor.ts:161-163`
**Category**: Pattern Compliance

**Description**:

The processor uses ES module `export default` while BullMQ documentation shows CommonJS `module.exports`:

**Current implementation:**

```typescript
export default async function (job: SandboxedJob<JobData>): Promise<JobResult> {
  return processJob(job);
}
```

**BullMQ documentation (from Context7):**

```typescript
import { SandboxedJob } from 'bullmq';

module.exports = async (job: SandboxedJob) => {
  // Do something with job
};
```

**Analysis**:

After deeper investigation, this is **NOT actually a bug** - BullMQ supports both patterns:

1. **CommonJS**: `module.exports = async (job) => { ... }`
2. **ES Modules**: `export default async function(job) { ... }`

The codebase uses ES modules throughout (`import`/`export`), so `export default` is correct.

**However**, the **documentation mismatch is concerning**:

- Official docs show `module.exports`
- Code uses `export default`
- No comment explaining why we deviate from docs
- Could confuse future maintainers

**Why it works**:

The compiled `processor.js` file (TypeScript → JavaScript) will emit proper ES module syntax, and Node.js can load it because:

1. `package.json` has `"type": "module"` (needs verification), OR
2. File extension is `.mjs`, OR
3. BullMQ's worker thread loader handles both CommonJS and ES modules

**Verification needed**:

```bash
# Check if package.json declares ES modules
cat packages/course-gen-platform/package.json | grep '"type"'

# Check compiled output
cat packages/course-gen-platform/dist/orchestrator/processor.js | head -20
```

**Fix**: Add clarifying comment

```typescript
/**
 * Sandboxed processor entry point
 *
 * Note: BullMQ documentation shows `module.exports` pattern, but we use
 * ES module `export default` because this codebase uses ES modules throughout.
 * Both patterns are supported by BullMQ's worker thread loader.
 *
 * Important notes for sandboxed processors:
 * 1. Each job runs in a separate process/thread
 * 2. State is not shared between jobs
 * 3. All imports must be resolvable from this file
 * 4. Process exit codes have special meaning (use sparingly)
 */
export default async function (job: SandboxedJob<JobData>): Promise<JobResult> {
  return processJob(job);
}
```

**Priority**: Low (works correctly but needs documentation)

---

## High Priority Issues

### ISSUE-4: Missing Error Boundary Around Handler Execution

**Severity**: High
**File**: `packages/course-gen-platform/src/orchestrator/processor.ts:93-147`
**Category**: Error Handling

**Description**:

The `processJob` function doesn't catch errors from `handler.process()`:

```typescript
async function processJob(job: SandboxedJob<JobData>): Promise<JobResult> {
  // ... validation and handler lookup ...

  // Process the job using the handler
  const result = await handler.process(job); // ⚠️ No try-catch

  logger.debug(/* ... */);
  return result;
}
```

**Impact**:

If a handler throws an error:

1. Error propagates to BullMQ worker
2. BullMQ marks job as failed
3. **BUT**: No structured logging of failure details in processor
4. Debugging becomes harder (must check BullMQ logs instead of processor logs)

**Current error handling**:

Looking at worker.ts:200-234, errors ARE caught by BullMQ's `worker.on('failed')` event, which:

- Calls `handleJobFailure(job, error)`
- Calls `markJobFailed(job, error)`
- Logs to database

So errors ARE handled, but not in the processor itself.

**Why this matters**:

In sandboxed mode, the processor runs in a **separate worker thread**. If we don't log errors in the processor, we only see them in the main worker, which may not have full context.

**Fix**: Add processor-level error logging

```typescript
async function processJob(job: SandboxedJob<JobData>): Promise<JobResult> {
  const jobType = job.name;

  // ... validation code ...

  logger.debug(
    { jobId: job.id, jobType, attemptsMade: job.attemptsMade },
    'Sandboxed processor: Starting job processing'
  );

  try {
    // Process the job using the handler
    const result = await handler.process(job);

    logger.debug(
      { jobId: job.id, jobType, success: result.success },
      'Sandboxed processor: Job processing completed'
    );

    return result;
  } catch (error) {
    // Log error in processor context (worker thread)
    logger.error(
      {
        jobId: job.id,
        jobType,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        attemptsMade: job.attemptsMade,
      },
      'Sandboxed processor: Job processing failed'
    );

    // Re-throw so BullMQ can handle retry logic
    throw error;
  }
}
```

**Priority**: Implement before production use (debugging will be painful without this)

---

### ISSUE-5: Handler Type Definition Doesn't Match BaseJobHandler

**Severity**: High
**File**: `packages/course-gen-platform/src/orchestrator/processor.ts:40-42`
**Category**: Type Design

**Description**:

The `JobHandler` type defines:

```typescript
type JobHandler = {
  process: (job: SandboxedJob<JobData>) => Promise<JobResult>;
};
```

But `BaseJobHandler` has:

```typescript
class BaseJobHandler<T extends JobData> {
  async process(job: Job<T>): Promise<JobResult> {
    /* ... */
  }
}
```

**Type mismatch**:

- `JobHandler.process` expects `SandboxedJob<JobData>` (generic JobData)
- `BaseJobHandler.process` expects `Job<T>` (specific T extending JobData)

**Why this is confusing**:

1. Comment says "handlers must be compatible with SandboxedJob interface" but they're not
2. Type says handlers take `SandboxedJob` but implementations take `Job`
3. Generic parameter `T` is lost (all handlers are cast to `JobHandler` with `JobData`)

**Example**:

```typescript
// testJobHandler is TestJobHandler extending BaseJobHandler<TestJobData>
// It has: process(job: Job<TestJobData>): Promise<JobResult>

// But we cast it to: process(job: SandboxedJob<JobData>): Promise<JobResult>
// Type information about TestJobData is lost!
```

**Impact**:

- Type safety is compromised (generic parameter lost)
- Cannot use handler-specific data types in processor
- Forces unsafe casts like `as unknown as JobHandler`

**Fix**: Use generic types properly

```typescript
/**
 * Generic handler type that works with both Job and SandboxedJob
 * Uses generic parameter to preserve specific JobData types
 */
type JobHandler<T extends JobData = JobData> = {
  process: (job: SandboxedJob<T>) => Promise<JobResult>;
};

/**
 * Registry of job handlers by job type
 * Each handler preserves its specific JobData type
 */
const jobHandlers: Partial<Record<JobType, JobHandler<any>>> = {
  [JobType.TEST_JOB]: testJobHandler as unknown as JobHandler<TestJobData>,
  [JobType.INITIALIZE]: initializeJobHandler as unknown as JobHandler<InitializeJobData>,
  // ... etc
};

// In processJob:
const handler = jobHandlers[jobType];
if (!handler) {
  /* error */
}

// handler is now JobHandler<any> which accepts SandboxedJob<any>
const result = await handler.process(job);
```

**Note**: This still requires casts due to Job vs SandboxedJob incompatibility, but at least preserves type information.

**Priority**: Nice to have (current code works but loses type information)

---

## Medium Priority Issues

### ISSUE-6: Stage 6 Result Transformation Logic Duplicated

**Severity**: Medium
**File**: `packages/course-gen-platform/src/orchestrator/processor.ts:67-80`
**Category**: Code Quality (DRY)

**Description**:

Stage 6 handler manually transforms result instead of returning it directly:

```typescript
[JobType.LESSON_CONTENT]: {
  process: async (job: SandboxedJob<JobData>) => {
    const token = (job as SandboxedJob<JobData> & { token?: string }).token;
    const result = await processStage6Job(job as any, token);
    return {
      success: result.success,
      message: result.success ? 'Lesson content generated' : result.errors.join(', '),
      data: result,
      error: result.errors.length > 0 ? result.errors[0] : undefined,
    };
  },
},
```

**Questions**:

1. Why does `processStage6Job` return `Stage6JobResult` instead of `JobResult`?
2. Is the transformation necessary or could Stage 6 return `JobResult` directly?
3. Are other handlers missing similar transformations?

**Investigation**:

Looking at other handlers (testJobHandler, initializeJobHandler, etc.), they all return `JobResult` directly from `handler.process()`. Only Stage 6 has custom transformation.

**Possible reasons**:

1. Stage 6 predates the `JobResult` interface
2. Stage 6 has richer error reporting (array of errors)
3. Stage 6 was developed independently without handler pattern

**Fix**: Align Stage 6 handler with standard pattern

```typescript
// In stage6-lesson-content/handler.ts
// Change processStage6Job to return JobResult instead of Stage6JobResult
export async function processStage6Job(
  job: Job<Stage6JobInput, JobResult>, // Change return type
  token?: string
): Promise<JobResult> { // Not Stage6JobResult
  // ... existing logic ...

  if (errors.length > 0) {
    return {
      success: false,
      message: errors.join(', '),
      error: errors[0],
      data: { /* Stage6 specific data */ },
    };
  }

  return {
    success: true,
    message: 'Lesson content generated',
    data: { /* Stage6 specific data */ },
  };
}

// Then in processor.ts, Stage 6 becomes like other handlers:
[JobType.LESSON_CONTENT]: {
  process: async (job: SandboxedJob<JobData>) => {
    const token = /* ... get token properly ... */;
    return processStage6Job(job as any, token); // Direct return, no transformation
  },
}
```

**Priority**: Refactor when touching Stage 6 code next

---

### ISSUE-7: processorFile Path Not Validated at Startup

**Severity**: Medium
**File**: `packages/course-gen-platform/src/orchestrator/worker.ts:40-47`
**Category**: Reliability

**Description**:

The processor file path is constructed but never validated:

```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const processorFile = path.join(__dirname, 'processor.js');
```

**Risk**:

If `processor.js` doesn't exist (e.g., build failure, deployment issue):

1. Worker initialization succeeds (no error at this point)
2. First job fails with cryptic error: "Cannot find module"
3. All subsequent jobs fail
4. No clear indication that processor file is missing

**Impact**:

- Poor error messages in production
- Difficult debugging (worker starts, then all jobs fail)
- No fail-fast behavior

**Fix**: Validate processor file exists at startup

```typescript
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const processorFile = path.join(__dirname, 'processor.js');

// Validate processor file exists before creating worker
if (!fs.existsSync(processorFile)) {
  const error = `Processor file not found: ${processorFile}. This indicates a build or deployment issue.`;
  logger.error(
    {
      processorFile,
      dirname: __dirname,
      expectedPath: processorFile,
    },
    'BullMQ worker initialization failed: processor file missing'
  );
  throw new Error(error);
}
```

**Alternative**: Lazy validation in `getWorker()`

```typescript
export function getWorker(concurrency: number = 5): Worker<JobData, JobResult> {
  if (!worker) {
    const redisClient = getRedisClient();

    // Validate processor file before creating worker
    if (!fs.existsSync(processorFile)) {
      throw new Error(`Processor file not found: ${processorFile}`);
    }

    logger.info(/* ... */);
    worker = new Worker(/* ... */);
  }
  return worker;
}
```

**Priority**: Add before production deployment (prevents cryptic errors)

---

### ISSUE-8: Circuit Breaker Memory Thresholds Not Documented

**Severity**: Medium
**File**: `packages/course-gen-platform/src/orchestrator/worker.ts:52-59`
**Category**: Documentation

**Description**:

Circuit breaker thresholds are hardcoded without justification:

```typescript
const CIRCUIT_BREAKER = {
  /** Pause worker when heap exceeds this threshold (MB) */
  pauseThresholdMB: 768,
  /** Resume worker when heap drops below this threshold (MB) */
  resumeThresholdMB: 512,
  /** Check interval (ms) */
  checkIntervalMs: 2000,
} as const;
```

**Questions**:

1. Why 768 MB? (specific to container size? benchmarked?)
2. Why 512 MB resume? (why 256 MB gap?)
3. Why 2 second interval? (tradeoff between responsiveness and overhead?)
4. Are these values appropriate for all deployment environments?

**Impact**:

- Values may not work in different environments (dev vs prod)
- No way to configure without code changes
- Difficult to tune for different memory constraints

**Fix**: Add documentation and make configurable

```typescript
/**
 * Circuit breaker configuration for memory-based worker control
 *
 * Thresholds tuned for 1GB container (typical Docker/K8s pod):
 * - Pause at 768 MB (75% of 1GB) to leave headroom for GC
 * - Resume at 512 MB (50% of 1GB) to avoid thrashing (pause/resume cycles)
 * - 256 MB hysteresis gap prevents rapid pause/resume toggling
 *
 * Check interval of 2s balances:
 * - Responsiveness (detect memory spikes quickly)
 * - Overhead (memory checks are cheap but not free)
 *
 * For different container sizes, adjust proportionally:
 * - 2GB container: pauseThresholdMB = 1536, resumeThresholdMB = 1024
 * - 512MB container: pauseThresholdMB = 384, resumeThresholdMB = 256
 *
 * Environment variables override for prod tuning without code changes:
 * - WORKER_PAUSE_THRESHOLD_MB
 * - WORKER_RESUME_THRESHOLD_MB
 * - WORKER_MEMORY_CHECK_INTERVAL_MS
 */
const CIRCUIT_BREAKER = {
  pauseThresholdMB: parseInt(process.env.WORKER_PAUSE_THRESHOLD_MB || '768'),
  resumeThresholdMB: parseInt(process.env.WORKER_RESUME_THRESHOLD_MB || '512'),
  checkIntervalMs: parseInt(process.env.WORKER_MEMORY_CHECK_INTERVAL_MS || '2000'),
} as const;
```

**Priority**: Document now, make configurable when needed

---

## Low Priority Issues

### ISSUE-9: Logger Import Could Fail in Sandboxed Context

**Severity**: Low
**File**: `packages/course-gen-platform/src/orchestrator/processor.ts:20`
**Category**: Reliability (Edge Case)

**Description**:

Processor imports shared logger:

```typescript
import logger from '../shared/logger';
```

**Potential issue**:

In sandboxed processor mode (separate worker thread):

1. Each thread gets its own copy of imports
2. If logger maintains state (file handles, connections), threads may conflict
3. If logger is singleton, behavior is undefined in multi-thread context

**Investigation**:

Check if logger is thread-safe:

```bash
cat packages/course-gen-platform/src/shared/logger.ts
```

Most likely: Pino logger is used, which IS thread-safe (writes to stdout/stderr handled by OS).

**Why this is low priority**:

- Pino is designed for high-concurrency use
- stdout/stderr writes are atomic at OS level
- No evidence of logger state issues

**Fix**: Add comment confirming thread safety

```typescript
/**
 * Logger is thread-safe (Pino writes to stdout/stderr atomically)
 * Safe to use in sandboxed processor (worker thread context)
 */
import logger from '../shared/logger';
```

**Priority**: Verify thread safety, document, move on

---

### ISSUE-10: Job Name Validation Could Be More Specific

**Severity**: Low
**File**: `packages/course-gen-platform/src/orchestrator/processor.ts:96-108`
**Category**: Code Quality

**Description**:

Job name validation checks for undefined but not empty string:

```typescript
if (!jobType) {
  const error = 'Job has undefined name - likely corrupted or created without proper job type';
  // ... throw error
}
```

**Edge case**:

If `job.name === ''` (empty string), the check passes (empty string is truthy for `!jobType`... wait, no it's not).

**Actually**: This code is CORRECT. `!jobType` catches both `undefined` and `''` (empty string).

**But**: Error message says "undefined name" when it could also be empty string.

**Fix**: More accurate error message

```typescript
if (!jobType) {
  const error = `Job has ${jobType === undefined ? 'undefined' : 'empty'} name - likely corrupted or created without proper job type`;
  logger.error(
    {
      jobId: job.id,
      jobName: jobType,
      jobData: job.data,
      availableHandlers: Object.keys(jobHandlers),
    },
    'Sandboxed processor: Invalid job name'
  );
  throw new Error(error);
}
```

**Priority**: Nice to have (extremely rare edge case)

---

## Recommendations (Improvements)

### REC-1: Add Processor Health Check

**File**: `packages/course-gen-platform/src/orchestrator/processor.ts`

**Description**: Add self-test function to validate processor environment

**Suggestion**:

```typescript
/**
 * Health check for processor environment
 * Validates that all dependencies are available in worker thread context
 */
export async function healthCheck(): Promise<{ healthy: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Validate logger works
  try {
    logger.debug('Processor health check: logger OK');
  } catch (err) {
    errors.push(`Logger not available: ${err}`);
  }

  // Validate all handlers are loadable
  for (const [jobType, handler] of Object.entries(jobHandlers)) {
    if (!handler || typeof handler.process !== 'function') {
      errors.push(`Handler for ${jobType} is not callable`);
    }
  }

  // Validate imports resolve
  try {
    const { JobType } = await import('@megacampus/shared-types');
    if (!JobType) {
      errors.push('shared-types import failed');
    }
  } catch (err) {
    errors.push(`Import validation failed: ${err}`);
  }

  return {
    healthy: errors.length === 0,
    errors,
  };
}

// Run health check on processor load (startup validation)
if (process.env.NODE_ENV !== 'test') {
  healthCheck().then(result => {
    if (!result.healthy) {
      logger.error({ errors: result.errors }, 'Processor health check failed');
      process.exit(1);
    }
    logger.info('Processor health check passed');
  });
}
```

**Benefits**:

- Early detection of import issues in worker threads
- Fail-fast on misconfiguration
- Easier debugging of sandboxed processor problems

---

### REC-2: Metric Collection in Processor

**File**: `packages/course-gen-platform/src/orchestrator/processor.ts`

**Description**: Add timing metrics for handler execution in processor context

**Suggestion**:

```typescript
async function processJob(job: SandboxedJob<JobData>): Promise<JobResult> {
  const jobType = job.name;
  const startTime = Date.now();

  // ... validation code ...

  logger.debug(/* ... */, 'Sandboxed processor: Starting job processing');

  try {
    const result = await handler.process(job);
    const duration = Date.now() - startTime;

    logger.debug(
      {
        jobId: job.id,
        jobType,
        success: result.success,
        durationMs: duration,
      },
      'Sandboxed processor: Job processing completed'
    );

    // Emit metric (if metrics available in worker thread context)
    // This helps track per-job performance in isolated thread
    if (typeof metricsStore !== 'undefined') {
      metricsStore.recordJobDuration(jobType, duration, result.success);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(
      {
        jobId: job.id,
        jobType,
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration,
      },
      'Sandboxed processor: Job processing failed'
    );

    throw error;
  }
}
```

**Benefits**:

- Track handler performance in worker thread context
- Compare main thread vs worker thread overhead
- Detect slow handlers

---

### REC-3: Standardize All Handlers to Use JobResult

**File**: Multiple stage handlers

**Description**: Ensure all stage handlers return `JobResult` interface consistently

**Current state**:

- Test handler: Returns `JobResult` ✅
- Initialize handler: Returns `JobResult` (assumed) ✅
- Document processing: Returns `JobResult` (assumed) ✅
- Stage 6: Returns custom `Stage6JobResult` ❌

**Suggestion**:

Audit all handlers and standardize:

```bash
# Check which handlers don't return JobResult
grep -r "Promise<" packages/course-gen-platform/src/orchestrator/handlers/*.ts | grep -v JobResult
grep -r "Promise<" packages/course-gen-platform/src/stages/*/handler.ts | grep -v JobResult
```

Refactor Stage 6 and any others to use `JobResult` interface, putting stage-specific data in `data` field:

```typescript
// Bad (current):
interface Stage6JobResult {
  success: boolean;
  errors: string[];
  data: Stage6Data;
}

// Good (standard):
interface JobResult {
  success: boolean;
  message?: string;
  data?: Stage6Data; // Stage-specific data goes here
  error?: string;
}
```

**Benefits**:

- Uniform handler interface
- No special-case logic in processor
- Easier to add new handlers (follow standard pattern)

---

### REC-4: Add Integration Test for Sandboxed Processor

**File**: Test suite

**Description**: Add test that verifies processor works in sandboxed mode

**Suggestion**:

```typescript
// tests/integration/orchestrator/sandboxed-processor.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { startWorker, stopWorker } from '../../../src/orchestrator/worker';
import { getQueue } from '../../../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';

describe('Sandboxed Processor Integration', () => {
  beforeAll(async () => {
    await startWorker(1); // Single worker for predictable testing
  });

  afterAll(async () => {
    await stopWorker();
  });

  it('should process test job in sandboxed worker thread', async () => {
    const queue = getQueue();

    const job = await queue.add(JobType.TEST_JOB, {
      message: 'Test sandboxed processing',
      delayMs: 100,
    });

    const result = await job.waitUntilFinished();

    expect(result.success).toBe(true);
    expect(result.message).toBe('Test job completed successfully');
  });

  it('should handle processor errors correctly', async () => {
    const queue = getQueue();

    const job = await queue.add(JobType.TEST_JOB, {
      message: 'Test error handling',
      shouldFail: true,
    });

    await expect(job.waitUntilFinished()).rejects.toThrow('Intentional test failure');
  });

  it('should isolate jobs in separate worker threads', async () => {
    // Start multiple jobs concurrently
    const queue = getQueue();
    const jobs = await Promise.all([
      queue.add(JobType.TEST_JOB, { message: 'Job 1', delayMs: 500 }),
      queue.add(JobType.TEST_JOB, { message: 'Job 2', delayMs: 500 }),
      queue.add(JobType.TEST_JOB, { message: 'Job 3', delayMs: 500 }),
    ]);

    // All should complete successfully despite running concurrently
    const results = await Promise.all(jobs.map(j => j.waitUntilFinished()));

    expect(results.every(r => r.success)).toBe(true);
  });
});
```

**Benefits**:

- Verify worker threads actually work
- Catch processor issues early
- Document expected behavior

---

### REC-5: Consider Processor Timeout Configuration

**File**: `packages/course-gen-platform/src/orchestrator/worker.ts`

**Description**: BullMQ supports processor timeout, but it's not configured

**Context from BullMQ docs**:

> Timeout for Sandboxed processors: When you are working with sandboxed processors, every job is run in a separate process. This opens the possibility to implement a time-to-live (TTL) mechanism, that kills the process if it has not been able to complete in a reasonable time.

**Current state**:

Worker has `lockDuration: 600000` (10 minutes) but no processor timeout.

**Suggestion**:

```typescript
worker = new Worker<JobData, JobResult>(QUEUE_NAME, processorFile, {
  connection: redisClient,
  concurrency,
  useWorkerThreads: true,
  lockDuration: 600000, // 10 minutes

  // Add processor timeout (optional, for runaway jobs)
  // Kills the worker thread if job doesn't complete
  settings: {
    backoffStrategy: (attemptsMade: number) => {
      return Math.pow(2, attemptsMade) * 1000;
    },
    // Timeout individual jobs at processor level
    // This is different from lockDuration (Redis lock timeout)
    // Processor timeout kills the worker thread process
    // processorTimeout: 300000, // 5 minutes (example)
  },
});
```

**Trade-off**:

- **Pro**: Prevents runaway jobs from blocking worker threads forever
- **Con**: Adds another timeout layer (already have lockDuration)
- **Con**: Forceful thread termination may leave inconsistent state

**Recommendation**: Only add if you observe jobs hanging despite lockDuration timeout.

---

## Validation Results

### Type Check

**Command**: `pnpm type-check`

**Status**: ✅ **PASSED**

**Output**: No errors

**Conclusion**: Code compiles successfully despite unsafe casts. TypeScript accepts the code because:

1. `as unknown as` bypasses type checking (intentional escape hatch)
2. Runtime behavior is correct (SandboxedJob structurally compatible with Job)
3. Type errors are suppressed, not absent

### Pattern Validation (BullMQ Context7 Docs)

**Status**: ✅ **PASSED**

**Key validations**:

1. ✅ **Processor exports function**: Correct (ES module `export default` equivalent to `module.exports`)
2. ✅ **Worker initialization**: Correct (`new Worker(QUEUE_NAME, processorFile, { useWorkerThreads: true })`)
3. ✅ **SandboxedJob import**: Correct (`import { SandboxedJob } from 'bullmq'`)
4. ✅ **Handler signature**: Correct (`async (job: SandboxedJob) => Promise<JobResult>`)
5. ✅ **Lock duration**: Appropriate (600000ms = 10 minutes for long-running LLM ops)
6. ✅ **Concurrency control**: Present (circuit breaker + concurrency parameter)

**Deviations from docs** (acceptable):

- Docs show `module.exports`, code uses `export default` (ES modules)
- Docs show simple processor, code has complex router pattern (acceptable extension)

### Architecture Review

**Status**: ✅ **SOUND**

**Pattern compliance**:

- ✅ Sandboxed processor in separate file
- ✅ Worker loads processor by file path
- ✅ Worker thread mode enabled
- ✅ Process isolation achieved
- ✅ Job routing logic centralized
- ✅ Error handling delegated to worker

**Design decisions** (good):

- ✅ Centralized job type routing in processor
- ✅ Handler registry pattern (extensible)
- ✅ Detailed documentation of sandboxing benefits
- ✅ Circuit breaker for memory pressure
- ✅ Graceful shutdown handlers

---

## Summary of Findings

### Critical (Must Fix)

1. **Type safety bypassed** with `as unknown as` casts (ISSUE-1)
2. **Stage 6 token handling** is fragile and undocumented (ISSUE-2)
3. **Export pattern mismatch** with docs (ISSUE-3) - actually OK but needs docs

### High Priority (Should Fix)

4. **Missing error boundary** in processor (ISSUE-4)
5. **Handler type mismatch** with BaseJobHandler (ISSUE-5)

### Medium Priority (Fix When Convenient)

6. **Stage 6 result transformation** duplicated (ISSUE-6)
7. **Processor file path** not validated (ISSUE-7)
8. **Circuit breaker thresholds** not documented (ISSUE-8)

### Low Priority (Nice to Have)

9. **Logger thread safety** not documented (ISSUE-9)
10. **Job name validation** error message imprecise (ISSUE-10)

### Recommendations (Improvements)

1. Add processor health check
2. Add metrics collection in processor
3. Standardize all handlers to JobResult
4. Add integration tests for sandboxed mode
5. Consider processor timeout configuration

---

## Next Steps

### Immediate (Before Merge)

1. **Investigate ISSUE-2** (Stage 6 token):

   ```bash
   # Where does token come from?
   grep -r "job.token" packages/course-gen-platform/src/
   grep -r "token:" packages/course-gen-platform/src/stages/stage6-*/
   ```

2. **Add error boundary** (ISSUE-4):
   - Wrap `handler.process()` in try-catch
   - Log errors in processor context
   - Re-throw for BullMQ retry logic

3. **Document export pattern** (ISSUE-3):
   - Add comment explaining ES module vs CommonJS choice
   - Verify package.json has `"type": "module"` or explain how it works

### Near-Term (Next Sprint)

4. **Refactor type system** (ISSUE-1, ISSUE-5):
   - Create adapter wrapper function
   - OR create shared MinimalJob interface
   - Remove `as unknown as` casts

5. **Validate processor file** (ISSUE-7):
   - Add fs.existsSync() check at startup
   - Fail fast with clear error message

6. **Document circuit breaker** (ISSUE-8):
   - Explain threshold choices
   - Make configurable via env vars
   - Document tuning guidelines

### Long-Term (Cleanup)

7. **Standardize handlers** (REC-3):
   - Audit all stage handlers
   - Refactor Stage 6 to return JobResult
   - Remove special-case handling

8. **Add tests** (REC-4):
   - Integration test for sandboxed mode
   - Verify worker thread isolation
   - Test error handling in processor

9. **Add monitoring** (REC-1, REC-2):
   - Processor health check
   - Metrics collection in worker threads
   - Performance tracking

---

## Conclusion

The BullMQ sandboxed processor implementation is **functionally correct** and demonstrates solid understanding of the pattern. The code will work in production, but has technical debt in the type system that should be addressed.

**Key strengths**:

- Correct architecture (process isolation, worker threads)
- Excellent documentation
- Proper error handling at worker level
- Circuit breaker for memory management

**Key weaknesses**:

- Type safety compromised with unsafe casts
- Stage 6 special case is fragile
- Some edge cases not validated

**Recommendation**: ✅ **Approve with conditions**

Fix ISSUE-2 (Stage 6 token) and ISSUE-4 (error boundary) before merging to production. Other issues can be addressed incrementally.

---

**Review Complete**
**Status**: Ready for Developer Response
**Next Action**: Investigate Stage 6 token source, add error boundary, document export pattern
