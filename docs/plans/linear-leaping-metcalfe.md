# Fix: Stage 2 Document Processing — Root Cause Investigation & Fix

## Context

**Problem**: ALL document processing jobs (Stage 2) fail. After deploying v0.31.22 (Error Sandwich Pattern), error messages improved to `"Worker thread crashed (error details lost in sandbox serialization)"` but `_sandboxError` is NEVER saved — meaning the error bypasses ALL our error handling.

**Evidence from UEE-1826** (created AFTER v0.31.22 deploy):

- `error_message`: "Worker thread crashed..." (fallback #4 from `extractErrorMessage`)
- `_sandboxError`: NOT in job data (never saved)
- No `[Sandbox]` prefix entries in error_logs (processJob catch block never executes)
- `attemptsMade: 3` — all attempts fail identically
- Stack: `sandbox.ts:38` — BullMQ parent-side `new Error()` + `Object.assign(err, msg.value)`

**Root cause analysis** (verified by reading BullMQ v5.66.3 source code):

1. BullMQ `main-base.js:31` registers `process.on('uncaughtException')` **BEFORE** importing processor.ts
2. Our processor.ts:290-291 registers handlers with `process.on()` — appends to END of listener array
3. When uncaught exception fires, BullMQ's handler runs FIRST → `send({cmd: Failed})` → `process.exit()`
4. Our handler runs SECOND → tries `updateData()` → but `process.exit()` kills the thread
5. Parent receives Failed with empty error (no Update message with `_sandboxError`)
6. `extractErrorMessage` can't find `_sandboxError` → returns generic fallback

**Why processJob catch block never runs**:

- If it ran, `logPermanentFailure` would write `[Sandbox]` entries — none exist in error_logs
- Error bypasses try/catch entirely → uncaught exception

**MCP SDK finding**: Neither `Protocol` nor transports extend EventEmitter. All errors go through `onerror`/`onclose` callbacks. The `.on('error')` guards we added in client.ts are dead code (transports don't have `.on`).

## Solution

### Part 1: Code Fixes (before local testing)

#### Fix 1: `process.prependListener` — processor.ts:290-291

**File**: `packages/course-gen-platform/src/orchestrator/processor.ts`

Change `process.on` to `process.prependListener` so our handler fires BEFORE BullMQ's:

```typescript
// BEFORE (broken — fires AFTER BullMQ's handler which calls process.exit())
process.on('uncaughtException', captureUncaughtError('uncaughtException'));
process.on('unhandledRejection', captureUncaughtError('unhandledRejection'));

// AFTER (fires FIRST → postMessage(Update) enqueued before BullMQ's Failed + exit)
process.prependListener('uncaughtException', captureUncaughtError('uncaughtException'));
process.prependListener('unhandledRejection', captureUncaughtError('unhandledRejection'));
```

Also fix incorrect comment at lines 264-267.

#### Fix 2: Add diagnostic `console.error` — processor.ts

Add synchronous `console.error` at key points (visible in local pino output):

- Top of `processJob()`: confirm function is called
- In catch block: confirm errors are caught
- In `captureUncaughtError`: see actual uncaught error details

#### Fix 3: Remove dead transport EventEmitter guards — client.ts:169-180

**File**: `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts`

MCP transports don't extend EventEmitter — `typeof (this.transport as any).on === 'function'` is always false. Remove dead code, add comment explaining callback-based error handling.

#### Fix 4: Wrap `client.connect()` more defensively — client.ts

In `connect()` method, ensure ALL errors from `this.client.connect(this.transport)` are wrapped with `normalizeError` to guarantee a meaningful message.

### Part 2: Local Testing

1. **Check Docker services**: `docker compose up -d redis docling-mcp`
2. **Verify Docling MCP**: `curl http://localhost:8000/mcp`
3. **User runs**: `./start-dev.sh`
4. **Create test course** with document upload in UI
5. **Observe console** for `[DIAG]` lines — actual error will be visible
6. **Fix root cause** based on findings

### Part 3: Fix Root Cause (TBD after local testing)

Likely candidates:

- Docling MCP server not running / wrong URL
- MCP SDK connection error producing non-Error throw
- Missing env var (DOCLING_MCP_URL, DOCLING_UPLOADS_BASE_PATH)

## Files to Modify

| File                                                                                   | Changes                                                                      |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/course-gen-platform/src/orchestrator/processor.ts`                           | `prependListener` (fix handler order), diagnostic console.error, fix comment |
| `packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts` | Remove dead transport guards, defensive connect() wrapping                   |

## Verification

1. `pnpm --filter course-gen-platform type-check`
2. `pnpm --filter course-gen-platform test`
3. Local test via `start-dev.sh` — observe console output
4. Only push to remote after local verification succeeds
