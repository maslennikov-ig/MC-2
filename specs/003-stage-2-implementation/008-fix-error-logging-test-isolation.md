# 008: Fix Error Logging Test Isolation

**Status**: 🟡 TODO
**Created**: 2025-10-26
**Parent**: 003-stage-2-implementation
**Priority**: MEDIUM

## Overview

Fix error_logs test that fails due to dirty data from previous tests.

**Current**: 1 test failing (Error Logging)
**Target**: Error Logging test passing
**Impact**: +1 test → 13/17 passing (76.5%, or 14/17 if PDF fixed first → 82.4%)

## Current State

### Failing Test
**Test**: `Error Logging > should log permanent failures to error_logs table`

### Error
```
AssertionError: expected 'sample-course-material.pdf' to be 'sample.pdf'

Expected: "sample.pdf"
Received: "sample-course-material.pdf"

At: tests/integration/document-processing-worker.test.ts:3082
```

## Root Cause

### Execution Flow

1. **Stalled Job Detection test runs FIRST**:
   - Uploads `sample-course-material.pdf`
   - Simulates worker crash
   - Logs error to `error_logs` table
   - Error entry: `{ file_name: "sample-course-material.pdf", organization_id: "..." }`

2. **Error Logging test runs SECOND**:
   - Uploads `sample.pdf`
   - Simulates Qdrant connection failure
   - Tries to log error to `error_logs` table
   - Queries error_logs by organization_id
   - **BUG**: Finds BOTH errors (from Stalled Job AND current test)
   - Takes first error (from Stalled Job test)
   - Assertion fails: expected `sample.pdf`, got `sample-course-material.pdf`

### Why This Happens

**Test isolation broken**:
- Tests share same database
- `error_logs` table NOT cleaned between tests
- Query filters only by `organization_id` (multiple tests can have same org)
- Test assumes it will find its OWN error, but finds PREVIOUS test's error

## Solution

### Add Cleanup Hook

**File**: `tests/integration/document-processing-worker.test.ts`

**Location**: Inside `describe('Error Logging', () => { ... })` block

**Add this before the test**:
```typescript
describe('Error Logging', () => {
  // Clean up error_logs before each test in this suite
  beforeEach(async () => {
    // Delete all error logs (test data only)
    const { error } = await supabaseAdmin
      .from('error_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Keep structure, delete data

    if (error) {
      console.warn('⚠️ Could not clean error_logs:', error.message)
    } else {
      console.log('✅ Cleaned error_logs table before test')
    }
  })

  it('should log permanent failures to error_logs table', async () => {
    // ... existing test code ...
  })
})
```

---

## Alternative Solution (More Specific)

If cleanup breaks other tests, use more specific query in the assertion:

### Current Code (Wrong)
```typescript
// Line ~3045: Query by organization_id only
const { data: errorLogs } = await supabaseAdmin
  .from('error_logs')
  .select('*')
  .eq('organization_id', orgId)
  .order('created_at', { ascending: false })

// Takes first error (may be from different test!)
const errorLog = errorLogs![0]
```

### Fixed Code (Specific)
```typescript
// Query by BOTH organization_id AND job_id
const { data: errorLogs } = await supabaseAdmin
  .from('error_logs')
  .select('*')
  .eq('organization_id', orgId)
  .eq('job_id', jobId)  // 👈 ADD THIS - ensures we get OUR error
  .order('created_at', { ascending: false })

// Now guaranteed to be our test's error
const errorLog = errorLogs![0]
```

---

## Validation

### Success Criteria
- [ ] Error Logging test passes
- [ ] Test finds correct error (with `sample.pdf`)
- [ ] Assertion passes: `expect(errorLog.file_name).toBe('sample.pdf')`
- [ ] No interference from other tests

### Test Command
```bash
pnpm test tests/integration/document-processing-worker.test.ts -t "should log permanent failures"
```

### Expected Output
```
✓ Error Logging > should log permanent failures to error_logs table

Tests  1 passed (1)
```

---

## Implementation Steps

1. **Locate test** (line ~2960):
```bash
grep -n "describe('Error Logging'" tests/integration/document-processing-worker.test.ts
```

2. **Add beforeEach cleanup**:
   - Insert cleanup hook before `it('should log...')`
   - Use provided code above

3. **Run test**:
```bash
pnpm test tests/integration/document-processing-worker.test.ts -t "Error Logging"
```

4. **Verify**:
   - Check test passes
   - Check console shows "Cleaned error_logs table"
   - Check assertion finds correct file_name

---

## Rollback Plan

If cleanup causes issues:
1. Remove `beforeEach` hook
2. Use Alternative Solution (query by job_id)
3. Both solutions are backwards compatible

---

## Files to Modify

**Primary**:
- `tests/integration/document-processing-worker.test.ts` - Add beforeEach cleanup

**Line Numbers** (approximate):
- Line ~2960: `describe('Error Logging')`
- Line ~2975: Add `beforeEach` here
- Line ~3045: Assertion location (if using Alternative Solution)

---

## Notes

**Why This Wasn't Caught Earlier**:
- Tests were run individually during development
- Full suite run revealed the interference
- Stalled Job Detection test added recently (Task 006)

**Best Practice**:
- Always clean up shared tables between tests
- Use `beforeEach` for test-specific cleanup
- Use `beforeAll` for suite-wide cleanup
- Query by unique identifiers (job_id, file_id) not just org_id

## References

- Test File: `tests/integration/document-processing-worker.test.ts`
- Error Logs Table: `packages/course-gen-platform/src/orchestrator/types/error-logs.ts`
- Previous Fix: `006-fix-qdrant-scroll-inconsistency.md`
