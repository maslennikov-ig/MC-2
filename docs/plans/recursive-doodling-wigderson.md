# Plan: mc2-7tsl — Fix 40 failing tests in web package

## Context

40 tests fail across 17 files in `packages/web`. Root causes: duplicate test files (`tests/unit/` vs co-located `__tests__/`), component refactoring without test updates, API route renames, and assertion drift. This task is independent of the parallel mc2-1fsg (Stage 4 Budget Allocator) work.

**Current state**: 17 failed files, 40 failed tests, 793 passing.

---

## Step 1: Delete 5 duplicate old-location test files (-19 failures, -5 files)

The `vitest.config.ts` discovers tests in both `tests/unit/components/` and `components/__tests__/`. The `__tests__/` copies are canonical (co-located pattern). Delete old duplicates:

```
rm packages/web/tests/unit/components/course/viewer/EnrichmentGeneratingCard.test.tsx
rm packages/web/tests/unit/components/course/viewer/EnrichmentPlaceholderCard.test.tsx
rm packages/web/tests/unit/components/markdown/MarkdownRenderer.test.tsx
rm packages/web/tests/unit/components/markdown/MarkdownRendererClient.test.tsx
rm packages/web/tests/unit/components/generation-celestial/components.test.tsx
```

---

## Step 2: Delete orphaned test for removed component (-1 failure, -1 file)

`EnrichmentPlaceholderCard` was replaced by `UnifiedEnrichmentCard`. Test crashes at import.

```
rm packages/web/components/course/viewer/__tests__/EnrichmentPlaceholderCard.test.tsx
```

---

## Step 3: Simple assertion fixes (-4 failures, -4 files)

### 3a. MarkdownRenderer — link text includes icon text

**File**: `packages/web/components/markdown/__tests__/MarkdownRenderer.test.tsx` ~line 122

`Link.tsx` appends `<ExternalLinkIcon>` + `<span class="sr-only">(opens in new tab)</span>` to external links, so `textContent` is `"OpenAI(opens in new tab)"`, not `"OpenAI"`.

```diff
- expect(link?.textContent).toBe('OpenAI')
+ expect(link?.textContent).toContain('OpenAI')
```

### 3b. MarkdownRendererClient — whitespace-only content is empty

**File**: `packages/web/components/markdown/__tests__/MarkdownRendererClient.test.tsx` ~line 315-323

Component does `if (!content?.trim()) return <div />`. Whitespace-only → no Streamdown.

```diff
- expect(screen.getByTestId('streamdown')).toBeInTheDocument()
+ expect(screen.queryByTestId('streamdown')).not.toBeInTheDocument()
```

### 3c. course-data-utils — order_index 0 is valid

**File**: `packages/web/tests/unit/course-data-utils.test.ts` ~line 543-544

Code checks `!== null && !== undefined` so `order_index: 0` → `'0'`, not `''`.

```diff
- // Note: order_index of 0 is treated as falsy, so becomes ''
- expect(result[0].lesson_number).toBe('')
+ // order_index: 0 is correctly preserved as '0'
+ expect(result[0].lesson_number).toBe('0')
```

### 3d. validate-webhook-url — error message changed

**File**: `packages/web/lib/__tests__/validate-webhook-url.test.ts` ~line 90

```diff
- expect(result.error).toContain('Failed to validate')
+ expect(result.error).toContain('could not be resolved')
```

---

## Step 4: Fix MissionControlBanner i18n test (-1 failure, -1 file)

**File**: `packages/web/components/generation-celestial/__tests__/components.test.tsx` ~line 167-195

Two issues:

1. Missing i18n keys in mock: `automatic.*`, `clarifying.*`, `aria.*`
2. Wrong expected label: `'Развернуть панель подтверждения'` → `'Развернуть панель управления'`

**Source of truth**: `packages/web/messages/ru/generation.json` lines 345-373

Add to mock messages object:

```ts
automatic: {
  title: 'Автоматическая генерация',
  hint: 'Можно закрыть страницу',
  titlePaused: 'Генерация приостановлена',
  hintPaused: 'Нажмите Продолжить',
  // ... other keys as needed
},
clarifying: {
  title: 'Уточняющие вопросы',
  hint: 'Ответьте на вопросы',
  // ... other keys as needed
},
aria: {
  expand: 'Развернуть панель управления',
  collapse: 'Свернуть панель',
  collapseHint: 'Свернуть (или смахните влево)',
  swipeHint: 'Смахните влево, чтобы свернуть',
},
```

Fix label assertion:

```diff
- screen.getByLabelText('Развернуть панель подтверждения')
+ screen.getByLabelText('Развернуть панель управления')
```

---

## Step 5: Fix file-level crash tests (0 test failures, -5 files)

### 5a. Delete obsolete api-routes integration test

**File**: `packages/web/tests/integration/api-routes.test.ts`

Imports `@/app/api/courses/create/route` — this route no longer exists (no `/api/courses/create`). Delete entirely.

### 5b. Fix pause-resume import paths

**File**: `packages/web/tests/unit/api/courses/pause-resume.test.ts`

Routes moved from `[slug]` to `[orgSlug]/[courseSlug]`:

```diff
- import { POST as pauseHandler } from '@/app/api/courses/[slug]/pause/route'
+ import { POST as pauseHandler } from '@/app/api/courses/[orgSlug]/[courseSlug]/pause/route'
```

Same for resume route. May also need to update mock params.

### 5c. Fix rate-limit test — `server-only` import

**File**: `packages/web/tests/unit/rate-limit.test.ts`

`rate-limit.ts` → `redis-client.ts` → `import 'server-only'`. Add mock at top:

```ts
vi.mock('server-only', () => ({}));
```

Or mock `@/lib/redis-client` entirely.

### 5d. Fix DraftSessionManager tests — RedisCache mock

**Files**:

- `packages/web/tests/unit/draft-session.test.ts`
- `packages/web/tests/integration/draft-session-workflow.test.ts`

Both fail with `is not a constructor` at `new RedisCache()`. Need to verify mock matches actual export shape. Also need `vi.mock('server-only', () => ({}))` since `redis-client.ts` imports `server-only`.

---

## Step 6: Rewrite EnrichmentGeneratingCard tests (-15 failures, -1 file)

**File**: `packages/web/components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx`

Component (`packages/web/components/course/viewer/components/EnrichmentGeneratingCard.tsx`) was refactored from simple progress bar to stepper UI with:

- `StagedProgress` component with 3 stages (Подготовка, Генерация, Сохранение)
- `useSmoothProgress` hook (asymptotic progress animation)
- `useRotatingStatusMessage` hook (maps currentStep to rotating Russian messages)
- `getNextMilestone` from shared-types

**Approach**: Rewrite all 15 tests to match new API:

- Mock: `useSmoothProgress`, `useRotatingStatusMessage`, `framer-motion`, `@megacampus/shared-types`
- Test stage indicator rendering (3 stages)
- Test cancel button (still `aria-label="Cancel ${type} generation"`)
- Test syncing state (`progress === -1`)
- Test title rendering (`{type title} - Generating...`)

**Delegate to**: `test-writer` subagent with full component source as context.

---

## Verification

```bash
# After all fixes:
pnpm --filter web test
# Expected: 0 failed, ~793+ passed

# Also verify:
pnpm type-check
pnpm build
```

---

## Summary

| Step      | Action                               | Failures fixed | Files fixed |
| --------- | ------------------------------------ | -------------- | ----------- |
| 1         | Delete 5 duplicate test files        | -19            | -5          |
| 2         | Delete orphaned PlaceholderCard test | -1             | -1          |
| 3         | Fix 4 assertions                     | -4             | -4          |
| 4         | Fix MissionControlBanner i18n        | -1             | -1          |
| 5         | Fix 5 file-level crashes             | 0              | -5          |
| 6         | Rewrite EnrichmentGeneratingCard     | -15            | -1          |
| **Total** |                                      | **-40**        | **-17**     |
