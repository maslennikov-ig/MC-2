# Code Review: BullMQ Sandbox Error Message Loss Fix

**Commit**: `44c1d688` on `develop`
**Date**: 2026-03-17
**Plan**: `docs/plans/linear-leaping-metcalfe.md`
**Reviewer**: Senior Code Reviewer (Opus 4.6)

---

## Executive Summary

This commit implements the "Error Sandwich" pattern to solve a persistent production issue where all Stage 2 (document processing) jobs fail with empty error messages due to BullMQ's sandbox serialization boundary. The implementation is well-reasoned, demonstrates deep understanding of BullMQ internals, and addresses a real serialization gap. However, there is one **critical race condition** in the uncaughtException handler and several important issues that should be addressed.

**Overall Assessment**: Good fix with strong defensive programming. One critical race condition and several moderate issues to address.

---

## 1. Plan Alignment Analysis

### Implemented as Planned

- [x] Part 1: `processor.ts` -- `currentJob` tracking, `_sandboxError` saved to job data, improved global handler
- [x] Part 2: `worker.ts` -- `extractErrorMessage()` utility, error enrichment before `handleJobFailure`
- [x] Part 3: `client.ts` -- `normalizeError()` method, transport error guards for close/end/abort events
- [x] Part 4: `handler.ts` -- Re-throw transient DoclingErrors for BullMQ retries

### Deviations from Plan

1. **Omitted: `callToolWithTimeout` with `AbortController`** (Part 5 of plan)
   - The plan specified wrapping `client.callTool()` with an AbortController-based timeout guard
   - **Assessment**: This is a **beneficial omission** for this commit. The timeout guard is an independent enhancement that would add complexity. The existing `callWithRetry` with exponential backoff provides adequate timeout protection. Can be added separately.

2. **Global handler changed from `async` to synchronous callback with fire-and-forget**
   - Plan showed `captureUncaughtError` as `async` with `await currentJob.updateData(...)`
   - Implementation uses synchronous callback with `.catch(() => {})` fire-and-forget
   - **Assessment**: This is the **correct deviation** -- the handler MUST be synchronous because `process.on('uncaughtException')` does not `await` async handlers. However, this introduces the race condition discussed below.

---

## 2. Issues

### CRITICAL: Race Condition in Global uncaughtException Handler

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/orchestrator/processor.ts`, lines 263-278

**The Problem**: When an uncaught exception occurs, TWO handlers race:

1. **Our handler** (registered first at module load, line 281): Calls `currentJob.updateData()` fire-and-forget
2. **BullMQ's handler** (registered in `main-base.js`, line 29): `await send({ cmd: ParentCommand.Failed, ... })` then `process.exit()`

The race has three participants on the child side:

- Our `updateData()` sends a `ParentCommand.Update` message
- BullMQ's handler sends a `ParentCommand.Failed` message then exits

On the **parent side** (`sandbox.js`), both messages are processed via the same `msgHandler`. The `ParentCommand.Failed` handler calls `reject(err)`, which resolves the promise. The `ParentCommand.Update` handler calls `job.updateData(msg.value)` which does a Redis write.

The issue is ordering. Since both `process.on('uncaughtException')` handlers are synchronous up to the point of the `send` call, and BullMQ's handler uses `await send(...)` followed by `process.exit()`:

- If `useWorkerThreads: true` (production): Messages go through `MessagePort`. Our fire-and-forget `updateData` posts to the port, then BullMQ's `await send(Failed)` posts next. The parent processes them in order, so `updateData` arrives first. **This likely works, but is NOT guaranteed** -- the parent's `msgHandler` for `Update` does `await job.updateData(msg.value)` which is async. If the `Failed` message arrives while the `Update` is mid-flight, both are processed concurrently.

- If `useWorkerThreads: false` (child processes): `send` uses IPC. Same ordering issue.

- **Worst case**: BullMQ's handler fires, sends `Failed`, calls `process.exit()`. Our handler's `updateData` message never reaches the parent because the process dies before the IPC/MessagePort buffer is flushed.

**Impact**: In the uncaughtException path, `_sandboxError` may not be written to Redis before the job fails. The `worker.on('failed')` handler would then see stale `job.data` without `_sandboxError`.

**Mitigating factor**: The catch-block path in `processJob()` (lines 401-416) is NOT affected by this race -- it `await`s the `updateData` call before re-throwing. The race only affects the uncaughtException path (errors that bypass try/catch entirely, like unhandled EventEmitter errors).

**Recommendation**: Since this is best-effort by design and the comment explicitly says so, I recommend:

1. Add a comment documenting the specific race condition
2. Consider adding a `RESPONSE_TIMEOUT`-like mechanism: in the uncaughtException handler, call `await currentJob.updateData(...)` with a short timeout (e.g., 500ms) BEFORE returning. Node.js will process both handlers for the same uncaughtException event in registration order, and BullMQ's handler won't fire until ours returns. Since our handler is NOT async (it returns `void`, not `Promise<void>`), the `await` inside it is ignored by the event loop.

Actually, on re-reading the code more carefully: the handler signature is `(err: unknown) => { ... }`, returning `void`. The `.catch()` makes the promise fire-and-forget. BullMQ's handler IS async: `async (err) => { await send(...); process.exit(); }`. Both are registered on the same `uncaughtException` event. Node.js calls them sequentially. Our handler starts the `updateData` send but does NOT await it. BullMQ's handler then starts, `await`s its send, and calls `process.exit()`. The `updateData` message may or may not have been delivered before exit.

**Suggested fix**: Make the handler synchronous-only. Instead of fire-and-forget async updateData, use a synchronous mechanism. Since `updateData` in the sandbox child uses the same `send` function (which for worker threads is `postMessage`), and `postMessage` is synchronous for the sender (the data is copied/transferred synchronously), the message WILL be enqueued before our handler returns. This means BullMQ's handler runs after the message is in the port queue. **The current code may actually work correctly for worker threads** because `postMessage` is synchronous. However, this reasoning is subtle and fragile. Add a detailed comment explaining why it works.

### IMPORTANT: `job.data` Staleness in `worker.on('failed')` Handler

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/orchestrator/worker.ts`, lines 153-165

When `worker.on('failed')` fires, the `job` object is the same instance that was in memory in the parent process. For `_sandboxError` to be present in `job.data`, the `ParentCommand.Update` message from the sandbox must have been received AND processed by the parent's `sandbox.js` message handler, which calls `await job.updateData(msg.value)` -- this writes to Redis AND updates the local job object.

The question is: does BullMQ guarantee that all pending messages from the sandbox are processed before `worker.on('failed')` fires?

Looking at `sandbox.js` (lines 23-27):

```javascript
case ParentCommand.Failed:
case ParentCommand.Error: {
    const err = new Error();
    Object.assign(err, msg.value);
    reject(err);
    break;
}
```

And `worker.js` line 629-630:

```javascript
const result = await job.moveToFailed(err, token, ...);
this.emit('failed', job, err, 'active');
```

The `reject(err)` from `sandbox.js` propagates to the worker which then calls `moveToFailed` then `emit('failed')`. If the `Update` message was already enqueued on the message port, it might be processed during one of the `await` points in `moveToFailed`. But there is no guarantee.

**Recommendation**: In `extractErrorMessage`, after checking `job.data._sandboxError`, consider adding a fallback that calls `await job.reload()` (if available in BullMQ) to fetch fresh data from Redis. This would ensure the sandwich data is recovered even if the local object is stale. If `reload()` is not available, use `Job.fromId()` to fetch fresh job data from Redis.

### IMPORTANT: Error Wrapping Loses Original Error Type Information

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/orchestrator/processor.ts`, lines 461-468

```typescript
if (error instanceof Error && !error.message) {
  const wrapped = new Error(
    `[${error.name || 'Error'}] ${errorStack?.split('\n')[0] || 'Unknown error in sandbox'}`
  );
  wrapped.stack = error.stack;
  throw wrapped;
}
```

This wrapping creates a plain `Error`, losing the original error's type. If the original error was an `UnrecoverableError`, the wrapped error won't be recognized as such by BullMQ, and the job will be retried when it shouldn't be. Similarly, if it was a `JobCancelledError`, the cancellation logic in `worker.on('failed')` won't detect it.

**Recommendation**: Preserve the constructor:

```typescript
if (error instanceof Error && !error.message) {
    const ErrorClass = error.constructor as ErrorConstructor;
    try {
        const wrapped = new ErrorClass(
            `[${error.name || 'Error'}] ${errorStack?.split('\n')[0] || 'Unknown error in sandbox'}`
        );
        wrapped.stack = error.stack;
        throw wrapped;
    } catch {
        // Constructor may not accept a single string argument
        const wrapped = new Error(...);
        wrapped.name = error.name;
        wrapped.stack = error.stack;
        throw wrapped;
    }
}
```

Or at minimum, copy the `name` property:

```typescript
wrapped.name = error.name;
```

### IMPORTANT: `_sandboxError` Pollutes Job Data Permanently

**Files**: `processor.ts` (lines 404-416, 264-277), `worker.ts` (lines 153-165)

The `_sandboxError` field is written to the job's Redis data via `updateData()`. This data persists for the lifetime of the job in Redis. For retried jobs, the `_sandboxError` from a previous attempt will remain in `job.data` on the next attempt, potentially causing confusion if the next attempt fails with a different error.

**Additionally**: The `{ ...job.data, _sandboxError: errorInfo }` spread creates a new object. If `job.data` is large (e.g., contains embedded document content), this doubles memory usage briefly.

**Recommendation**:

1. Clear `_sandboxError` at the start of `processJob()`:
   ```typescript
   if ((job.data as any)._sandboxError) {
     const { _sandboxError, ...cleanData } = job.data as any;
     await job.updateData(cleanData as JobData);
   }
   ```
2. Or use a namespaced key with attempt number: `_sandboxError_attempt_${job.attemptsMade}`

### IMPORTANT: Dynamic Import of DoclingError in handler.ts Hot Path

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage2-document-processing/handler.ts`, lines 132-135

```typescript
const { DoclingError, DoclingErrorCode } = await import('./docling/types.js');
const isTransient =
  error instanceof DoclingError &&
  [DoclingErrorCode.NETWORK_ERROR, DoclingErrorCode.TIMEOUT].includes(error.code);
```

This uses a dynamic `import()` in the error-handling path, which:

1. Adds latency to error handling (module resolution + potential I/O)
2. More critically, `instanceof` may not work correctly across module boundaries if the module was already imported statically elsewhere. The `DoclingError` from the dynamic import MUST be the same module instance as the one that created the error. Since `handler.ts` does not statically import `DoclingError`, but the error was created by code that imported it statically (via `client.ts`), the `instanceof` check depends on Node.js module caching guaranteeing the same module instance.

In practice, this works because Node.js caches modules by resolved path. But it's fragile.

**Recommendation**: Add a static import at the top of `handler.ts`:

```typescript
import { DoclingError, DoclingErrorCode } from './docling/types.js';
```

Then use it directly in the catch block. This is simpler, faster, and avoids the module-identity risk.

### SUGGESTION: `extractErrorMessage` Should Clean `_sandboxError` After Use

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/orchestrator/worker.ts`, lines 147-177

After successfully extracting the error message from `_sandboxError`, the stale data remains in the job. Consider cleaning it up:

```typescript
if (sandboxError?.message) {
  // Clean up sandbox error from job data (best-effort)
  const { _sandboxError, ...cleanData } = job.data as Record<string, unknown>;
  job.updateData(cleanData as JobData).catch(() => {});
  return sandboxError.message;
}
```

### SUGGESTION: Transport Event Handlers May Mask Real Issues

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts`, lines 169-178

```typescript
for (const event of ['error', 'close', 'end', 'abort']) {
  (this.transport as any).on(event, (err: unknown) => {
    logger.warn({ err, event }, `Docling MCP transport ${event} event`);
    this.isConnected = false;
  });
}
```

The `close` and `end` events are normal lifecycle events for streams/transports. Logging them at `warn` level will create noise. Only `error` and `abort` events are truly concerning.

**Recommendation**: Use different log levels:

```typescript
const level = event === 'error' || event === 'abort' ? 'warn' : 'debug';
logger[level]({ err, event }, `Docling MCP transport ${event} event`);
```

### SUGGESTION: `normalizeError` Stack Trace Extraction

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts`, lines 772-792

The `normalizeError` method embeds stack trace lines directly into the error message:

```typescript
`${context}: ${error.name || 'Error'} (no message) -- stack: ${error.stack?.split('\n').slice(0, 3).join(' | ') || 'none'}`;
```

While practical for debugging, this creates very long error messages that may be truncated when stored in database columns with length limits (the `error_message` column update in `updateVectorStatusOnFailure` truncates at 1000 chars). The stack trace in the message is also redundant with the separate stack trace logging.

**Recommendation**: Keep the message concise and let the stack be logged separately:

```typescript
`${context}: ${error.name || 'Error'} (no message)`;
```

### SUGGESTION: No Tests Added

The commit modifies error handling in four files across the orchestrator and pipeline but adds no unit or integration tests. While the fix is primarily defensive and hard to unit-test in isolation (requires BullMQ sandbox infrastructure), the `extractErrorMessage` utility function and `normalizeError` method are pure functions that should have unit tests.

**Recommendation**: Add tests for:

1. `extractErrorMessage()` -- various combinations of error.message, \_sandboxError, stack fallback
2. `DoclingClient.normalizeError()` -- Error with no message, non-Error objects, DoclingError passthrough
3. Transient error re-throw behavior in `handler.ts`

---

## 3. Architecture and Design Assessment

### Error Sandwich Pattern -- Well-Designed

The core pattern is sound: store error details in a reliable side-channel (Redis via job data) before the error crosses the serialization boundary, then recover on the other side. This is a pragmatic solution to a fundamental limitation of BullMQ's sandbox architecture.

**Strengths**:

- Multiple fallback layers in `extractErrorMessage` (BullMQ message -> sandwich data -> stack trace -> fallback)
- Best-effort approach that doesn't block normal error flow if Redis write fails
- `normalizeError` in the Docling client prevents non-Error objects from propagating

**The layered defense is**:

1. Layer 1: `normalizeError()` in client.ts ensures all errors have messages
2. Layer 2: Sandbox catch block saves `_sandboxError` to Redis (awaited)
3. Layer 3: Global handler saves `_sandboxError` to Redis (fire-and-forget)
4. Layer 4: Error wrapping for empty-message Errors before re-throw
5. Layer 5: `extractErrorMessage()` on parent side recovers from sandwich

### Transient Error Re-throw -- Correct Design

The change in `handler.ts` to re-throw transient errors (NETWORK_ERROR, TIMEOUT) instead of returning `{ success: false }` correctly allows BullMQ's retry mechanism to work. The guard `job.attemptsMade < (job.opts.attempts || 3) - 1` prevents rethrowing on the last attempt, allowing the permanent failure path to execute.

### Concurrency Safety

The `currentJob` global variable is safe because BullMQ sandboxed processors run one job at a time per worker thread. There's no concurrency within a single sandbox process.

---

## 4. Code Quality

### Positive Observations

- **Excellent comments**: The "CRITICAL", "IMPORTANT", and "best-effort" annotations clearly communicate intent and constraints
- **Defensive programming**: Multiple fallback layers, try/catch around best-effort operations
- **Deep understanding**: The code shows thorough understanding of BullMQ internals (errorToJSON, sandbox.js message handling, main-base.js uncaughtException)
- **Type safety**: Appropriate use of `as unknown as JobData` for the `_sandboxError` extension, with clear justification

### Areas for Improvement

- The `logPermanentFailure` import in `processor.ts` (line 26) was previously called in the global handler but is no longer called there. It's still used in the catch block (line 433), so it's not dead code, but the comment at line 42 could be misleading since it talks about `logPermanentFailure` in the context of the global handler.
- The `as unknown as JobData` cast (lines 274, 413) bypasses type safety. Consider defining a type like `JobDataWithSandboxError`:
  ```typescript
  type JobDataWithSandboxError = JobData & {
    _sandboxError?: {
      message: string;
      name: string;
      stack?: string;
      type?: string;
      source: string;
    };
  };
  ```

---

## 5. Summary of Issues

| #   | Severity      | File                   | Issue                                                                                                              |
| --- | ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | **Critical**  | processor.ts           | Race condition in uncaughtException handler: `updateData` fire-and-forget may not complete before `process.exit()` |
| 2   | **Important** | worker.ts              | `job.data._sandboxError` may be stale if Update message not yet processed by parent                                |
| 3   | **Important** | processor.ts           | Error wrapping at line 461 loses original error type (UnrecoverableError, etc.)                                    |
| 4   | **Important** | processor.ts/worker.ts | `_sandboxError` persists across retry attempts, potentially showing wrong error                                    |
| 5   | **Important** | handler.ts             | Dynamic `import()` for `DoclingError` in error path -- use static import instead                                   |
| 6   | Suggestion    | client.ts              | `close`/`end` transport events logged at `warn` level -- use `debug`                                               |
| 7   | Suggestion    | client.ts              | `normalizeError` embeds stack trace in message (truncation risk)                                                   |
| 8   | Suggestion    | (all files)            | No unit tests for `extractErrorMessage`, `normalizeError`, transient re-throw                                      |

---

## 6. Verdict

**Approve with reservations**. The fix correctly addresses the root cause (empty error messages due to BullMQ sandbox serialization). The Error Sandwich pattern is a well-designed workaround for a framework limitation. The critical race condition in the uncaughtException handler (Issue #1) is mitigated by the fact that `postMessage` for worker threads is synchronous on the sender side, so the message is likely enqueued before BullMQ's handler runs. However, this relies on Node.js MessagePort implementation details and should at minimum be documented with a comment.

**Must address before production**:

- Issue #3 (error type loss) -- could cause retry loops for UnrecoverableError
- Issue #5 (dynamic import) -- simple fix, eliminates fragility

**Should address soon**:

- Issue #4 (\_sandboxError staleness across retries)
- Issue #1 (add explanatory comment about the race condition and why it works)
- Issue #8 (test coverage)
