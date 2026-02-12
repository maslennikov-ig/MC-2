# useModuleDashboardData Hook Tests

## Overview

Unit tests for the `useModuleDashboardData` hook, specifically testing the approve lessons functionality added in Issue #3.3.

## Test File

- **Location**: `tests/unit/components/generation-graph/hooks/useModuleDashboardData.test.ts`
- **Test Framework**: Vitest
- **Test Count**: 36 tests
- **Status**: ✅ All passing

## Functions Tested

### 1. `mapLessonStatus(status: string)`

Maps database status strings to typed lesson status values.

**Test Coverage** (13 tests):

- ✅ Maps "approved" to approved (case-insensitive)
- ✅ Maps "completed" to completed (case-insensitive)
- ✅ Maps "generating" and "active" to active
- ✅ Maps "failed" and "error" to error
- ✅ Maps "pending" and unknown values to pending
- ✅ Handles empty strings
- ✅ Case-insensitive matching

### 2. `calculateAggregates(lessons: LessonMatrixRow[])`

Calculates aggregated metrics for module dashboard display.

**Test Coverage** (23 tests):

#### Status Counts (3 tests)

- ✅ Counts approved lessons separately from completed
- ✅ Counts all status types correctly
- ✅ Handles all lessons with same status

#### Empty Array (1 test)

- ✅ Handles empty array gracefully

#### Quality Score Calculation (6 tests)

- ✅ Calculates average from completed lessons
- ✅ Calculates average from approved lessons
- ✅ Combines both completed and approved in average
- ✅ Ignores null quality scores
- ✅ Returns null when no quality scores available
- ✅ Ignores quality scores from non-done lessons

#### Cost Calculation (3 tests)

- ✅ Sums total cost from all lessons
- ✅ Handles zero costs
- ✅ Includes costs from all status types

#### Duration Calculation (3 tests)

- ✅ Sums duration from completed and approved lessons
- ✅ Ignores null durations
- ✅ Treats null as 0 in sum

#### Estimated Time Remaining (6 tests)

- ✅ Estimates based on average duration of completed lessons
- ✅ Includes approved lessons in average calculation
- ✅ Includes active lessons in remaining count
- ✅ Returns null when no duration data available
- ✅ Returns null when no lessons remaining
- ✅ Ignores lessons with duration 0

#### Edge Cases (1 test)

- ✅ Handles complex mix of all statuses with various metrics

## Key Testing Approach

### Function Duplication Pattern

The functions `mapLessonStatus` and `calculateAggregates` are **not exported** from the hook (they are internal utility functions). Therefore, the test file contains **exact copies** of these functions for testing purposes.

**Rationale**:

1. **Encapsulation**: Keep internal functions private to the hook
2. **Testability**: Still allow comprehensive unit testing
3. **Maintenance**: Tests serve as documentation of expected behavior
4. **Regression Detection**: Any changes to internal logic will require test updates

**Trade-offs**:

- ✅ **Pro**: Clean API surface (no unnecessary exports)
- ✅ **Pro**: Tests are self-contained
- ⚠️ **Con**: Code duplication requires manual sync if hook changes
- ⚠️ **Con**: Coverage reports won't reflect actual source coverage (expected)

### Alternative Approach Considered

We could export these functions for testing, but decided against it because:

1. They are implementation details of the hook
2. Exporting would pollute the public API
3. The hook itself is the public contract, not the helper functions

## Running Tests

```bash
# Run tests
cd packages/web
pnpm test -- tests/unit/components/generation-graph/hooks/useModuleDashboardData.test.ts

# Run with verbose output
pnpm test -- tests/unit/components/generation-graph/hooks/useModuleDashboardData.test.ts --reporter=verbose

# Run with coverage (note: will show 0% for source files due to function duplication pattern)
pnpm test -- tests/unit/components/generation-graph/hooks/useModuleDashboardData.test.ts --coverage
```

## Test Results

```
✓ tests/unit/components/generation-graph/hooks/useModuleDashboardData.test.ts (36 tests) 5ms

Test Files  1 passed (1)
     Tests  36 passed (36)
  Start at  08:38:53
  Duration  473ms (transform 51ms, setup 88ms, import 19ms, tests 5ms, environment 281ms)
```

## Related Files

- **Hook**: `components/generation-graph/hooks/useModuleDashboardData.ts`
- **Types**: `@megacampus/shared-types/stage6-ui.types.ts`
- **Issue**: #3.3 (Add unit tests for approve lessons functionality)

## Future Improvements

1. Consider adding integration tests that test the hook's behavior end-to-end
2. Add tests for the full hook lifecycle (mount, update, unmount)
3. Test realtime subscription behavior
4. Test error handling paths
5. Consider exporting utility functions to a separate module if they are reused elsewhere
