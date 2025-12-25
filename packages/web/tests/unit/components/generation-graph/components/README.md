# ProgressSummaryDisplay Test Suite

## Overview

Comprehensive test suite for the `ProgressSummaryDisplay` component, which displays user-friendly progress summaries from `selfReviewer` and `judge` nodes in the generation pipeline.

## Test Coverage

**Total Tests**: 48 tests (all passing ✅)

### Component: ProgressSummaryDisplay (20 tests)

#### Null/Empty States (2 tests)
- ✅ Renders null without crashing when `progressSummary` is null
- ✅ Renders null when `progressSummary` is undefined

#### Compact View (4 tests)
- ✅ Renders compact view with status icon and phase
- ✅ Includes outcome in compact view when provided
- ✅ Shows status icon for `generating` status
- ✅ Shows status icon for `reviewing` status

#### Full View (4 tests)
- ✅ Renders full view with attempts
- ✅ Shows status badge with correct styling
- ✅ Shows "No attempts yet" when attempts array is empty
- ✅ Renders multiple attempts

#### Localization (4 tests)
- ✅ Displays Russian labels when `language='ru'` (e.g., 'Самопроверка')
- ✅ Displays English labels when `language='en'` (e.g., 'Self-Review')
- ✅ Displays Russian result labels (e.g., 'Пройдено' for PASS)
- ✅ Displays Russian judge node label ('Оценка')

#### Status Colors (5 tests)
- ✅ Shows green for `completed` status
- ✅ Shows red for `failed` status
- ✅ Shows amber for `fixing` status
- ✅ Shows blue for `reviewing` status
- ✅ Shows blue for `generating` status

#### Custom Styling (2 tests)
- ✅ Applies custom className in compact view
- ✅ Applies custom className in full view

### Component: AttemptSummaryCard (28 tests)

#### Node Labels (4 tests)
- ✅ Renders `selfReviewer` node with correct label
- ✅ Renders `judge` node with correct label
- ✅ Renders selfReviewer with Russian label
- ✅ Renders judge with Russian label

#### Latest Badge (3 tests)
- ✅ Shows "Current" badge when `isLatest=true`
- ✅ Does not show badge when `isLatest=false`
- ✅ Shows Russian "Текущая" badge when `language=ru`

#### Issues and Actions (6 tests)
- ✅ Shows issues found with severity icons (error, warning, info)
- ✅ Shows actions performed
- ✅ Shows outcome message
- ✅ Does not show issues section when empty
- ✅ Does not show actions section when empty
- ✅ Handles multiple severity icons correctly

#### Metrics (6 tests)
- ✅ Shows duration in seconds (e.g., "2.5s")
- ✅ Shows tokens with locale formatting (English: "1,234 tok")
- ✅ Shows tokens with Russian locale formatting (Russian: "1 234 tok")
- ✅ Shows both duration and tokens
- ✅ Does not show tokens when zero
- ✅ Does not show metrics section when no metrics provided

#### Result Labels (5 tests)
- ✅ Shows English result label for PASS
- ✅ Shows Russian result label for PASS
- ✅ Shows English result label for PASS_WITH_FLAGS
- ✅ Shows Russian result label for ACCEPT
- ✅ Shows Russian result label for ESCALATE_TO_HUMAN

#### Custom Styling & Defaults (4 tests)
- ✅ Applies custom className
- ✅ Defaults to English when language not provided
- ✅ Applies blue styling when `isLatest=true`
- ✅ Applies slate styling when `isLatest=false`

## Test Fixtures

The test suite includes reusable fixtures:

```typescript
createSummaryItem(text: string, severity?: 'info' | 'warning' | 'error'): SummaryItem
createAttemptSummary(overrides?: Partial<NodeAttemptSummary>): NodeAttemptSummary
createProgressSummary(overrides?: Partial<ProgressSummary>): ProgressSummary
```

## Key Testing Patterns

1. **Localization Testing**: Tests verify both Russian ('ru') and English ('en') labels across all components
2. **Status-Based Styling**: Tests verify correct color classes (emerald, red, amber, blue) for different statuses
3. **Conditional Rendering**: Tests verify sections only render when data is present
4. **Icon Rendering**: Tests verify correct icons for severity levels and status types
5. **Metric Formatting**: Tests verify locale-specific number formatting for tokens

## Running Tests

```bash
# Run all ProgressSummaryDisplay tests
pnpm test ProgressSummaryDisplay

# Run tests in watch mode
pnpm test:watch ProgressSummaryDisplay

# Run with coverage
pnpm test:coverage ProgressSummaryDisplay
```

## Dependencies

- `@testing-library/react` - React component testing utilities
- `vitest` - Test framework
- `@megacampus/shared-types/judge-types` - Type definitions

## Related Files

- **Component**: `packages/web/components/generation-graph/components/ProgressSummaryDisplay.tsx`
- **Types**: `packages/shared-types/src/judge-types.ts`
- **Tests**: `packages/web/tests/unit/components/generation-graph/components/ProgressSummaryDisplay.test.tsx`
