# Fix: BullMQ Sandbox Error Message Loss + Document Processing Failures

## Context

**Problem**: ALL document processing jobs (Stage 2) fail with empty error messages. 11 consecutive `document_processing` entries in `error_logs` have `error_message: ""` and stack from `sandbox.ts:38`. This has been happening since at least March 13, 2026. Multiple previous fix attempts (mc2-9ghq2, mc2-bh6aq, mc2-n4xkb, mc2-mkuzh) did NOT solve the root cause.

**Affected courses**: ZKM-2474, FSD-1144, DFH-2287, and many others — every course with documents fails at Stage 2.

**Root cause chain (verified by reading BullMQ source)**:

1. Error occurs inside sandbox worker thread (likely MCP transport/Docling error)
2. Error bypasses `processor.ts` try/catch (EventEmitter 'error' event → uncaught exception)
3. BullMQ's `main-base.js` `uncaughtException` handler fires FIRST → sends `{cmd: Failed, value: errorToJSON(err)}` → calls `process.exit()`
4. Our `processor.ts` uncaughtException handler fires SECOND → tries `logPermanentFailure()` → process exits before DB write completes
5. Parent process receives the Failed message → `sandbox.js` creates `new Error()` + `Object.assign(err, msg.value)`
6. If the original error had no `.message` (MCP SDK errors, plain objects), the final error has `message: ""`
7. `worker.on('failed')` receives error with empty message → logs empty `error_message` to `error_logs`

**Why previous fixes didn't work**:

- mc2-9ghq2 (enumerable properties): Only works if error reaches `processor.ts` catch → it doesn't (uncaught exception)
- mc2-bh6aq (global handlers): `logPermanentFailure` is async → `process.exit()` from BullMQ handler kills it
- mc2-n4xkb (RPC params): Fixed param extraction but error message was already empty

## Solution: Error Sandwich Pattern

### Principle

Store error details in a RELIABLE channel (job Redis data) INSIDE the sandbox BEFORE the error crosses the serialization boundary. Recover on the other side.

### Part 1: Reliable error capture inside sandbox — `processor.ts`

**File**: `packages/course-gen-platform/src/orchestrator/processor.ts`

**Changes**:

1. Track current job reference globally so uncaughtException handler can access it:

```typescript
let currentJob: SandboxedJob<JobData> | null = null;
```

2. In `processJob()`, set/clear currentJob:

```typescript
async function processJob(job, token) {
  currentJob = job;
  try { ... } finally { currentJob = null; }
}
```

3. In processJob catch block, BEFORE re-throw, save error to job data via `job.updateData()`:

```typescript
catch (error) {
  const errorInfo = {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : typeof error,
    stack: error instanceof Error ? error.stack : undefined,
  };

  // Save to job data — goes to Redis via BullMQ message (reliable, sync for worker threads)
  try {
    await job.updateData({ ...job.data, _sandboxError: errorInfo });
  } catch { /* best-effort */ }

  // Also make Error properties enumerable for BullMQ serialization
  if (error instanceof Error && !error.message) {
    const wrapped = new Error(`[${error.name || 'Error'}] ${errorInfo.stack?.split('\n')[0] || 'Unknown error in sandbox'}`);
    wrapped.stack = error.stack;
    throw wrapped;
  }

  throw error;
}
```

4. In `captureUncaughtError`, save to currentJob if available:

```typescript
const captureUncaughtError = (type: string) => async (err: unknown) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack : undefined;
  const errorName = err instanceof Error ? err.name : typeof err;

  // Save to current job data — this is the ONLY reliable way to pass error out
  // because process.exit() from BullMQ handler will kill our logPermanentFailure
  if (currentJob) {
    try {
      await currentJob.updateData({
        ...currentJob.data,
        _sandboxError: {
          message: errorMessage || `Uncaught ${type}`,
          name: errorName,
          stack: errorStack,
          type,
        },
      });
    } catch {
      /* best-effort */
    }
  }

  // Log to stdout (pino) — synchronous, always works
  baseLogger.error(
    { error: errorMessage, stack: errorStack, type },
    `Processor: ${type} in worker thread`
  );

  // Don't call logPermanentFailure — process.exit() from BullMQ will kill it
};
```

### Part 2: Recover error on parent side — `worker.ts`

**File**: `packages/course-gen-platform/src/orchestrator/worker.ts`

**Changes** in `worker.on('failed')` handler:

1. Extract a utility function `extractErrorMessage`:

```typescript
function extractErrorMessage(job: Job<JobData>, error: Error): string {
  // 1. Try BullMQ error message
  if (error?.message && error.message !== 'Error' && error.message.trim() !== '') {
    return error.message;
  }

  // 2. Try sandbox error stashed in job data
  const sandboxError = (job.data as Record<string, unknown>)?._sandboxError as
    | {
        message?: string;
        name?: string;
        stack?: string;
        type?: string;
      }
    | undefined;

  if (sandboxError?.message) {
    return sandboxError.message;
  }

  // 3. Try first line of stack trace
  if (error?.stack) {
    const firstLine = error.stack.split('\n')[0]?.trim();
    if (firstLine && firstLine !== 'Error') {
      return firstLine;
    }
  }

  // 4. Fallback
  return 'Worker thread crashed (error details lost in sandbox serialization)';
}
```

2. Use it in safety net:

```typescript
const safetyNetErrorMsg = extractErrorMessage(job, error);
```

3. Use it in `handleJobFailure` call — pass enriched error:

```typescript
// Enrich error with recovered message before passing to handleJobFailure
if (!error?.message || error.message === 'Error') {
  const recovered = extractErrorMessage(job, error);
  if (recovered !== error?.message) {
    error = new Error(recovered);
    error.stack = originalError?.stack;
  }
}
handleJobFailure(job, error);
```

### Part 3: Ensure Docling client errors always have messages — `docling/client.ts`

**File**: `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts`

**Changes**:

1. Wrap all MCP client calls with error normalization:

```typescript
private normalizeError(error: unknown, context: string): Error {
  if (error instanceof DoclingError) return error;

  if (error instanceof Error) {
    if (!error.message || error.message === 'Error') {
      return new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `${context}: ${error.name || 'Error'} (no message) — stack: ${error.stack?.split('\n').slice(0, 3).join(' | ') || 'none'}`,
        error
      );
    }
    return error;
  }

  // Non-Error objects (MCP SDK can throw these)
  const msg = typeof error === 'object' && error !== null
    ? JSON.stringify(error).substring(0, 500)
    : String(error);
  return new DoclingError(DoclingErrorCode.PROCESSING_ERROR, `${context}: ${msg}`, error);
}
```

2. Apply in `callWithRetry` catch block:

```typescript
catch (error) {
  const normalized = this.normalizeError(error, `callWithRetry attempt ${attempt}`);
  if (attempt >= this.config.maxRetries) throw normalized;
  // ... rest of retry logic using normalized ...
}
```

3. Apply in `convertDocument` catch block:

```typescript
catch (error) {
  const normalized = this.normalizeError(error, `convertDocument(${request.file_path})`);
  // ... rest of error handling ...
}
```

### Part 4: Fix handler error swallowing — `handler.ts`

**File**: `packages/course-gen-platform/src/stages/stage2-document-processing/handler.ts`

**Current issue**: handler.ts catches ALL errors from `orchestrator.execute()` and returns `{ success: false }`. This means BullMQ considers the job COMPLETED (not failed), so no retries happen for transient errors.

BUT: empirically, jobs ARE failing (worker.on('failed') fires), meaning errors escape the try/catch. This is because EventEmitter errors bypass try/catch.

**Changes**:

1. Re-throw transient errors instead of returning `{ success: false }`:

```typescript
catch (error) {
  // ... existing logging ...

  // For transient errors, re-throw to allow BullMQ retries
  const errorMsg = error instanceof Error ? error.message : String(error);
  const isTransient = error instanceof DoclingError && [
    DoclingErrorCode.NETWORK_ERROR,
    DoclingErrorCode.TIMEOUT,
  ].includes(error.code);

  if (isTransient && job.attemptsMade < (job.opts.attempts || 3) - 1) {
    throw error;  // Let BullMQ retry
  }

  // Permanent errors: update status and return failure
  await this.updateVectorStatusOnFailure(fileId, userMessage).catch(...);
  await this.logPermanentFailure(jobData, job, error, filePath);

  return { success: false, message: 'Document processing failed', error: errorMsg };
}
```

### Part 5: Add EventEmitter error guard in Docling client — `client.ts`

**The key issue**: MCP transport EventEmitter can throw 'error' events that bypass ALL try/catch blocks and become uncaught exceptions.

**Changes** in `connect()` method — add more defensive transport error handling:

```typescript
// Prevent ANY unhandled error from transport
if (this.transport && typeof (this.transport as any).on === 'function') {
  // Catch ALL possible error events
  for (const event of ['error', 'close', 'end', 'abort']) {
    (this.transport as any).on(event, (err: unknown) => {
      logger.warn({ err, event }, `Docling MCP transport ${event} event`);
      this.isConnected = false;
    });
  }
}
```

Also wrap `client.callTool()` calls with a timeout guard using `AbortController`:

```typescript
private async callToolWithTimeout(args: { name: string; arguments: Record<string, unknown> }): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), this.config.timeout);

  try {
    return await this.client.callTool(args);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new DoclingError(DoclingErrorCode.TIMEOUT, `Tool call '${args.name}' timed out after ${this.config.timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
```

## Files to Modify

| File                                                                                   | Changes                                                                           |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/course-gen-platform/src/orchestrator/processor.ts`                           | Error sandwich: save to job data, currentJob tracking, improved global handlers   |
| `packages/course-gen-platform/src/orchestrator/worker.ts`                              | Error recovery: extractErrorMessage utility, enrich error before handleJobFailure |
| `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts` | normalizeError utility, timeout guard, transport error guards                     |
| `packages/course-gen-platform/src/stages/stage2-document-processing/handler.ts`        | Re-throw transient errors for BullMQ retries                                      |

## Verification

1. **Type check & build**:

   ```bash
   pnpm --filter course-gen-platform type-check && pnpm --filter course-gen-platform build
   ```

2. **Unit tests**:

   ```bash
   pnpm --filter course-gen-platform test
   ```

3. **Manual test**: Reset ZKM-2474 and retry generation:

   ```sql
   UPDATE courses SET generation_status = 'pending', error_message = NULL, failed_at_stage = NULL
   WHERE generation_code = 'ZKM-2474';
   ```

   Then trigger regeneration and verify:
   - If it succeeds: problem was transient (Docling was down)
   - If it fails: check `error_logs` for non-empty `error_message` (our fix works)
   - Check job data for `_sandboxError` field with real error details

4. **Deploy to dev**: `git push` to develop branch, verify on dev.ai.megacampus.ru

## Expected Outcome

After this fix:

- **Error messages are NEVER empty** — recovered from job data when BullMQ serialization fails
- **Transient Docling errors trigger retries** — instead of silent permanent failures
- **All errors have human-readable messages** — normalizeError wraps cryptic MCP errors
- **Uncaught exceptions preserve context** — saved to job data before process.exit() kills the thread
- **Future debugging is easy** — `_sandboxError` in job data always has the real error
