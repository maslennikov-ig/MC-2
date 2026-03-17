# Code Review: Stage 2 Sandbox Error Capture Fix (prependListener + Dead Code Removal)

**Date**: 2026-03-17
**Commit**: `affbb29c` — `fix(pipeline): fix sandbox error capture with prependListener and cleanup dead code`
**Scope**: Single commit on `develop`, reviewed against prior commits `44c1d688` and `cee6a008` for regression context
**Files**: 2 | **Changes**: +27 / -20

---

## Summary

|              | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Issues       | 0        | 1    | 1      | 1   |
| Improvements | —        | 1    | 2      | 1   |

**Verdict**: NEEDS WORK

One high-severity issue: the `updateData()` call in `captureUncaughtError` is a Promise that is
fire-and-forgotten with `.catch(() => {})`, yet `process.exit()` in BullMQ's handler fires
immediately after the current synchronous handler returns. The comment says "postMessage() is
synchronous on the sender side" — this is true for worker threads but NOT for child-process IPC
(where `send()` uses a libuv socket write). Whether this project actually uses worker threads or
forked processes is the deciding factor; right now that context is missing from the code and comment.

The `prependListener` fix itself is correct, well-reasoned, and verified against the actual BullMQ
source (`main-base.js:31`).

---

## Issues

### High

#### 1. `updateData()` race condition is only safe in worker-thread mode; child-process mode is not documented

- **File**: `packages/course-gen-platform/src/orchestrator/processor.ts:264-290`
- **Problem**: The comment at line 270-274 correctly identifies that `postMessage()` on a
  `MessagePort` (worker threads) is synchronous on the sender side. However, BullMQ also supports
  running sandboxed processors as forked child processes (the default when `useWorkerThreads` is not
  set). In that mode, `updateData()` calls `ChildProcessor.send()` (child-processor.js:166-172),
  which in turn calls `childProcess.send()` (child.js:102), a libuv-backed IPC socket write. That
  write is asynchronous — the message is only queued in the OS socket buffer, not guaranteed
  delivered before `process.exit()` drains it.

  Confirmed from `child.js:73-80`: the `useWorkerThreads` option is explicit opt-in. Without it,
  `fork()` is used.

  Verified via `worker.ts:297`: `useWorkerThreads: !process.env.VITEST` — in production this
  evaluates to `true`, so the project IS running in worker-thread mode. The fix therefore works
  correctly in production. However, in the test environment (`VITEST` is set), `useWorkerThreads`
  is `false`, meaning tests run as forked child processes where the `updateData()` IPC write is
  async and may not complete before `process.exit()`. This is acceptable for tests (they don't
  test the uncaughtException path this way), but it should be documented.

- **Impact**: Medium in production (worker-thread mode is confirmed). High risk if someone changes
  `useWorkerThreads` without updating the assumption in `processor.ts`. The code has no comment
  cross-referencing `worker.ts`, so the dependency is invisible.

- **Fix**: Add a cross-reference comment to make the assumption explicit and verifiable:
  ```typescript
  // REQUIRES worker-thread mode (useWorkerThreads: true — see worker.ts:297).
  // In that mode, postMessage() is synchronous on the sender side: the Update message
  // is enqueued in the MessagePort before this handler returns.
  // In forked-process mode (tests, VITEST set), childProcess.send() is async and this
  // is best-effort only — acceptable since tests don't exercise this uncaught path.
  if (currentJob) {
  ```

---

### Medium

#### 2. `normalizeError` in `connect()` catch logs `normalized.message` but the `DoclingError` constructor receives the raw `error` as the cause — stack trace context may be lost

- **File**: `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts:186-192`
- **Problem**: After normalization, `logger.error` is called with `{ err: normalized.message }` (a
  string field). The pino logger pattern for rich error serialization is `{ err: errorObject }` —
  passing a string suppresses the stack trace and error metadata from the log entry. This is a
  pre-existing pattern inconsistency that the new line perpetuates.

  ```typescript
  // Current (string — loses stack trace in log):
  logger.error({ err: normalized.message }, 'Failed to connect to Docling MCP server');

  // Better (full error object):
  logger.error({ err: normalized }, 'Failed to connect to Docling MCP server');
  ```

- **Impact**: When `connect()` fails, logs show a message string but not the stack trace, making
  production debugging harder.
- **Fix**: Change `{ err: normalized.message }` to `{ err: normalized }` on line 187.

---

### Low

#### 3. `[DIAG]` console.error lines on every job entry are permanently on in production

- **File**: `packages/course-gen-platform/src/orchestrator/processor.ts:330-333` and `414-415`
- **Problem**: `console.error('[DIAG] processJob entered: ...')` fires for every single job in
  production. This bypasses pino's log-level configuration. Three `[DIAG]` lines were added: one in
  `captureUncaughtError` (acceptable — only fires on actual exceptions), and two that fire on every
  job entry and every caught exception. The per-job entry log is the concern: a busy worker running
  100 jobs/hour will write 100 raw stderr lines with no log-level gate.
- **Impact**: Low in practice (stderr is captured), but inconsistent with the codebase's pino-based
  logging discipline. Cannot be silenced without code change.
- **Fix**: These are clearly intended as temporary diagnostic lines. Either gate them on an
  environment variable, convert them to `baseLogger.debug(...)`, or create a follow-up chore to
  remove them after the fix is confirmed in production:
  ```typescript
  // Option A: gate
  if (process.env.PROCESSOR_DIAG === '1') {
    console.error(`[DIAG] processJob entered: jobId=${job.id}...`);
  }
  // Option B: use pino debug (respects log level)
  baseLogger.debug({ jobId: job.id, jobName: job.name }, '[DIAG] processJob entered');
  ```

---

## Improvements

### High

#### 1. The `prependListener` fix does not handle the `async` behavior of BullMQ's own handler

- **File**: `packages/course-gen-platform/src/orchestrator/processor.ts:297-298`
- **Current**: BullMQ's `uncaughtException` handler in `main-base.js:31-42` is declared `async` and
  `await`s `send()` before calling `process.exit()`. Our `prependListener` handler is synchronous
  and returns `undefined` (the `captureUncaughtError` function returns void — the Promise from
  `updateData()` is detached). Node.js does not await handlers; all registered handlers are called
  sequentially but synchronously chained (the next handler runs immediately when the current one
  returns, not when its returned Promise resolves).

  This means the actual execution interleaving is:
  1. Our handler runs, fires `updateData().catch(...)` — returns immediately (Promise is floating)
  2. BullMQ's `async` handler starts, calls `await send({ cmd: Failed, ... })`
  3. Both the `updateData` postMessage and BullMQ's `send` are now racing in the microtask queue
  4. `process.exit()` is called after BullMQ's `await send()` resolves

  For worker threads: `postMessage()` is synchronous (message enqueued before the call returns), so
  our Update message IS enqueued before BullMQ's Failed. The race is won by the message queue order.
  For child processes: `childProcess.send()` schedules a socket write; ordering is not guaranteed.

- **Recommended**: The comment at line 270-274 should be updated to reflect the actual async
  interleaving, replacing "For worker threads (production): postMessage() is synchronous on the
  sender side — the Update message is enqueued in the MessagePort before our handler returns." with
  a more precise description that acknowledges the async nature of BullMQ's handler. This ensures
  future maintainers understand the actual timing model.

---

### Medium

#### 2. `errorName` is extracted at line 253 but never used in the log call at line 259-262

- **File**: `packages/course-gen-platform/src/orchestrator/processor.ts:253`
- **Current**: `const errorName = err instanceof Error ? err.name : typeof err;` is declared and
  then only used in the `_sandboxError` object on line 282. The `baseLogger.error` call on line
  259-262 logs `{ error, stack, type }` but not `name`. For custom error classes
  (`UnrecoverableError`, `DoclingError`), the `name` is the most important discriminating field.
- **Recommended**: Add `name: errorName` to the logger call:
  ```typescript
  baseLogger.error(
    { error: errorMessage, stack: errorStack, type, name: errorName },
    `Processor: ${type} in worker thread`
  );
  ```

#### 3. `connect()` in `client.ts` resets `this.connectionPromise = null` in BOTH `catch` and `finally` blocks — double-reset

- **File**: `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts:183,193`
- **Current**: Line 183 (catch block): `this.connectionPromise = null`. Line 193 (finally block):
  `this.connectionPromise = null`. The `finally` block always runs, making the `catch` reset
  redundant. This is a pre-existing pattern that the new `normalizeError` code was inserted into
  without cleaning up.
- **Impact**: Benign but misleading — a reader may think the catch reset is load-bearing.
- **Recommended**: Remove line 183 from the catch block; keep only the finally reset.

---

### Low

#### 4. Comment at `processor.ts:243-248` describes BullMQ's handler incorrectly after the fix

- **File**: `packages/course-gen-platform/src/orchestrator/processor.ts:243-248`
- **Current**: The block comment above `captureUncaughtError` still says "Our handler runs first
  (registered at module load) and captures full details." This was the old (incorrect) claim. The
  commit message and the inline comment at line 293-296 correctly explain that BullMQ registers
  BEFORE we do. The block comment at 243 was not updated and now contradicts the inline comment.
- **Recommended**: Update or remove the block comment so both comments agree:
  ```
  // BullMQ's main-base.js also registers these, and it does so BEFORE importing processor.ts.
  // We use prependListener() to insert our handler before BullMQ's so we run first.
  ```

---

## Positive Patterns

1. **Direct BullMQ source verification**: The fix is grounded in reading `main-base.js` directly
   (it is referenced in the commit message) rather than making assumptions about library behavior.
   The claim "BullMQ registers BEFORE importing our processor" is precisely correct as verified:
   `main-base.js:31` registers `process.on('uncaughtException')`, then `child-processor.js:29`
   uses `await import(processorFile)` to load our code. This is the right way to reason about
   library internals.

2. **EventEmitter guard removal is correctly verified**: Both `StreamableHTTPClientTransport` and
   `SSEClientTransport` declare `implements Transport` and expose only `onclose?`, `onerror?`,
   `onmessage?` as callback properties — confirmed from the TypeScript declaration files. Neither
   extends `EventEmitter`. The old guards (`typeof (this.transport as any).on === 'function'`) were
   based on a false assumption. Removing them is correct and the replacement comment accurately
   describes the actual error-handling mechanism.

3. **Error sandwich with `_sandboxError`**: The pattern of writing structured error data to
   Redis-backed job data before the serialization boundary is pragmatic and production-tested.
   Backing it with both a `catch`-block write (for caught errors) and a `captureUncaughtError` write
   (for uncaught exceptions) provides defense in depth.

---

## Escalation

**Shared utility change**: `processor.ts` is the single entry point for all BullMQ sandboxed jobs
(stages 2–6 + block regeneration). Any regression here silently affects all stage processing. The
fix is correct for the current deployment configuration.

**Worker-thread mode confirmed**: `worker.ts:297` sets `useWorkerThreads: !process.env.VITEST`,
which is `true` in production. The `postMessage()` synchrony assumption is valid. The only
remaining action (Issue #1) is adding a cross-reference comment so the assumption is visible at
the point it is relied upon in `processor.ts`.

---

## Validation

- Type Check: PASS
- Build: PASS
