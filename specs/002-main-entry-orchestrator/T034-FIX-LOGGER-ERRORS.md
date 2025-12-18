# T034: Fix Logger API Errors in uploadFile Endpoint

**Priority**: 🟡 **MEDIUM** (Technical debt, not blocking)
**Status**: Pending
**Executor**: api-builder OR fullstack-nextjs-specialist
**Estimated Time**: 15 minutes
**Blocks**: None (cleanup task)

---

## Problem Statement

The `generation.uploadFile` endpoint has **7 TypeScript errors** due to incorrect Pino logger API usage.

**Current (incorrect)**:
```typescript
logger.error('Failed to rollback quota', {
  error: rollbackError,
  organizationId: currentUser.organizationId
});
```

**Expected (correct)**:
```typescript
logger.error({
  error: rollbackError,
  organizationId: currentUser.organizationId
}, 'Failed to rollback quota');
```

**Pino Logger Signature**: `logger.error(object, message)` - object first, message second.

---

## Type Errors to Fix

All 7 errors are in `packages/course-gen-platform/src/server/routers/generation.ts`:

1. **Line 559** - "Failed to rollback quota after path validation error"
2. **Line 578** - "Failed to rollback quota after base64 decode error"
3. **Line 597** - "Failed to rollback quota after size mismatch error"
4. **Line 615** - "Failed to rollback quota after mkdir error"
5. **Line 635** - "Failed to rollback quota after file write error"
6. **Line 676** - "Failed to rollback after database insert error"
7. **Line 707** - "Unexpected error in uploadFile"

---

## Implementation Steps

### Step 1: Fix Each Logger Call

For each of the 7 errors, swap the parameter order:

**Before (line 559)**:
```typescript
logger.error('Failed to rollback quota after path validation error', {
  error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
  organizationId: currentUser.organizationId,
  fileSize,
});
```

**After**:
```typescript
logger.error({
  error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
  organizationId: currentUser.organizationId,
  fileSize,
}, 'Failed to rollback quota after path validation error');
```

### Step 2: Verify Type Check

Run type check to confirm all 7 errors are resolved:

```bash
cd packages/course-gen-platform
pnpm type-check
```

Expected result: **0 errors in generation.ts (uploadFile endpoint)**

---

## Verification Checklist

- [ ] All 7 logger.error calls fixed (object first, message second)
- [ ] Type check passes (0 errors in lines 559, 578, 597, 615, 635, 676, 707)
- [ ] No new errors introduced
- [ ] Logger output format unchanged (Pino JSON structured logging)
- [ ] Error messages remain the same (only parameter order changed)

---

## Expected Changes

**File**: `packages/course-gen-platform/src/server/routers/generation.ts`

**Lines to modify**: 559, 578, 597, 615, 635, 676, 707

**Pattern**:
```typescript
// BEFORE
logger.error('message', { ...context });

// AFTER
logger.error({ ...context }, 'message');
```

---

## Context

These errors are **pre-existing** from the original `uploadFile` endpoint implementation. They were **NOT** introduced by T033 (consolidate API logic).

**Why now?** T033 fixed logger calls in the new `initiate` mutation correctly. This task cleans up the remaining errors in `uploadFile` for consistency.

---

## Testing

**Manual test** (verify logger output is correct):

1. Call `generation.uploadFile` with valid file
2. Trigger rollback scenario (e.g., invalid path)
3. Check logs output in JSON format:
   ```json
   {
     "level": "error",
     "time": 1234567890,
     "error": "Invalid file path",
     "organizationId": "uuid",
     "fileSize": 12345,
     "msg": "Failed to rollback quota after path validation error"
   }
   ```

---

## Benefits

✅ **Type safety**: 0 TypeScript errors in generation.ts
✅ **Consistency**: All logger calls follow Pino API correctly
✅ **Maintainability**: Future developers see correct logger pattern
✅ **No functional changes**: Only parameter order, same log output

---

## Related Tasks

- **T033**: Consolidate API logic into tRPC (fixed logger in `initiate` mutation)
- This task cleans up remaining errors in `uploadFile` endpoint

---

## Dependencies

**Requires**: None (independent cleanup task)
**Unblocks**: None (technical debt reduction)
