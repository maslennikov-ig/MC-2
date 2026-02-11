# Fix ModelConfigBunker: LKG race condition + error serialization

## Context

During local course generation (SHG-3558), logs show two recurring issues in ModelConfigBunker:

1. **ENOENT on `.tmp` file** (WARN, repeated) - Multiple workers (main, stage6, stage7) all write to the same `lkg-config.json.tmp` path. Race condition: Worker A writes `.tmp`, Worker B overwrites, Worker B renames to final → Worker A tries to `stat`/`rename` the now-gone `.tmp` → ENOENT.

2. **Empty `{}` in error logs** (ERROR) - `[ModelConfigBunker] DB sync failed` shows `error: {}` because the code uses `{ error: err }` key, but pino's serializer is only configured for the `err` key. Non-enumerable Error properties (`message`, `stack`) are invisible to `JSON.stringify()`.

Both issues are non-blocking (fallback layers work) but pollute logs and lose diagnostic info.

## Files to modify

| File                                                                 | Changes                                |
| -------------------------------------------------------------------- | -------------------------------------- |
| `packages/course-gen-platform/src/shared/llm/model-config-bunker.ts` | PID-unique tmp files + fix error key   |
| `packages/shared-logger/src/index.ts`                                | Add `error` serializer alongside `err` |

## Changes

### 1. Fix LKG race condition (model-config-bunker.ts:820)

**Current:**

```ts
const tmpPath = `${LKG_PATH}.tmp`;
```

**Fix:**

```ts
const tmpPath = `${LKG_PATH}.${process.pid}.tmp`;
```

Each worker process gets its own temp file (`lkg-config.json.12345.tmp`). After atomic rename, the PID-specific temp is gone. No cross-process collision.

### 2. Fix error serialization - add `error` serializer (shared-logger/src/index.ts:80)

**Current (line 80-92):**

```ts
serializers: {
  err: (err: Error) => ({
    type: err.constructor.name,
    message: err.message,
    stack: err.stack,
    code: (err as NodeJS.ErrnoException).code,
    cause: err.cause ? { ... } : undefined,
  }),
},
```

**Fix - add `error` key that reuses the same serializer:**

```ts
const errSerializer = (err: Error) => ({
  type: err.constructor?.name,
  message: err.message,
  stack: err.stack,
  code: (err as NodeJS.ErrnoException).code,
  cause: err.cause
    ? {
        message: (err.cause as Error).message,
        stack: (err.cause as Error).stack,
      }
    : undefined,
});

// In pino options:
serializers: {
  err: errSerializer,
  error: errSerializer,  // Same serializer for `error` key
},
```

This way both `{ err: e }` and `{ error: e }` patterns are serialized properly project-wide. No changes needed in call sites.

**Important**: Must also handle non-Error objects (fetch errors, Supabase errors) gracefully since the serializer receives `Error` type but might get a plain object. Add a guard:

```ts
const errSerializer = (err: unknown) => {
  if (!err || typeof err !== 'object') return err;
  const e = err as Record<string, unknown>;
  return {
    type: (err as Error).constructor?.name,
    message: e.message || String(err),
    stack: e.stack,
    code: e.code,
    cause: (err as Error).cause
      ? {
          message: ((err as Error).cause as Error).message,
          stack: ((err as Error).cause as Error).stack,
        }
      : undefined,
  };
};
```

## What NOT to change

- Do NOT change `{ error: err }` → `{ err }` in model-config-bunker.ts call sites. Adding the serializer at logger level is more robust (fixes the issue project-wide).
- Do NOT touch the auto-classification rules in `auto-classification.ts` — the ENOENT pattern is already handled there as `graceful_fallback`.

## Verification

1. **Build check:**

   ```bash
   pnpm --filter @megacampus/shared-logger build
   pnpm type-check
   ```

2. **Unit tests:**

   ```bash
   pnpm --filter @megacampus/shared-logger test
   ```

   Existing tests validate `err` serializer — need to verify `error` serializer works identically.

3. **Local smoke test:**
   - Start dev environment (`pnpm dev`)
   - Check that ModelConfigBunker logs no more ENOENT warnings
   - If DB sync fails (force disconnect), verify error object is properly serialized (not `{}`)

4. **Safety:**
   - shared-logger change is additive (new serializer key, no existing behavior changes)
   - tmp file path change only affects local file I/O race, no functional impact
   - Both dev and staging use same code paths — safe to deploy
