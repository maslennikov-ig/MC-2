# Code Review: Chat UX Changes (QGN-6607)

**Date**: 2026-02-10
**Commits**: `a745089a`, `22dd7ef4`
**Scope**: RefinementChat, useRefinement, NodeDetailsDrawer
**Reviewer**: Claude Opus 4.6

---

## Summary

Two commits improving chat UX: (1) remove toast, keep proposal after accept, add Stage 6 per-lesson chat; (2) add Reject button + post-accept guidance message.

**Verdict**: Overall good quality. 2 bugs found, 3 improvements recommended.

---

## Issues (Bugs)

### BUG-1: Loading skeleton shows 2 button placeholders, actual UI has 3 buttons [P3]

**File**: `RefinementChat.tsx:387-390`

The loading skeleton renders 2 placeholder buttons, but the actual proposal box now has 3 buttons (Принять / Дополнить / Отклонить). Skeleton should match to avoid layout shift.

```tsx
// Current (2 buttons):
<div className="mt-4 flex gap-2">
  <div className="h-9 w-24 rounded bg-gray-300 dark:bg-gray-600" />
  <div className="h-9 w-24 rounded bg-gray-200 dark:bg-gray-700" />
</div>

// Should be (3 buttons):
<div className="mt-4 flex gap-2">
  <div className="h-9 w-24 rounded bg-gray-300 dark:bg-gray-600" />
  <div className="h-9 w-24 rounded bg-gray-200 dark:bg-gray-700" />
  <div className="h-9 w-24 rounded bg-gray-200 dark:bg-gray-700" />
</div>
```

**Fix**: Add 3rd skeleton button element.

---

### BUG-2: Redundant abort/unmount check in `refine()` [P4]

**File**: `useRefinement.ts:191,194`

Lines 191 and 194 perform identical checks. Line 191 returns early if aborted/unmounted, then line 194 checks the same condition redundantly (will never be false at that point).

```typescript
// Line 191 - early return
if (controller.signal.aborted || !isMountedRef.current) return

// Line 194 - same check again (always true here)
if (!controller.signal.aborted && isMountedRef.current) {
```

**Fix**: Remove the `if` wrapper on line 194 (keep its body).

---

## Improvements (Recommendations)

### REC-1: Hardcoded Russian strings bypass i18n system [P2]

**Files**: `RefinementChat.tsx`, `useRefinement.ts`

The app uses `next-intl` with `ru/en` message files. Several new/existing strings are hardcoded in Russian:

**RefinementChat.tsx** (UI labels):

- "Принять", "Применяю...", "Дополнить", "Отклонить"
- "Предложенные изменения", "Показать детали", "Изменения применены"

**useRefinement.ts** (system messages):

- `"✅ Изменения применены (N полей обновлено)..."`
- `"❌ Изменения отклонены..."`
- `"❌ Ошибка: ..."`

**Impact**: EN locale users see Russian text. Not a regression (these strings were hardcoded before our changes too), but adding more of them increases tech debt.

**Fix**: Add i18n keys to `messages/ru/generation.json` and `messages/en/generation.json`, use `useTranslations` in component. For hook system messages, pass locale or use a message factory.

---

### REC-2: Duplicate `ChatMessage` interface [P4]

**Files**: `useRefinement.ts:19-23`, `RefinementChat.tsx:27-32`

Same interface defined in two files. The RefinementChat version has an extra `pending?` field.

**Fix**: Extract to shared type (low priority, no runtime impact).

---

### REC-3: Post-accept message references "вкладка «Результат»" regardless of stage [P3]

**File**: `useRefinement.ts:94`

The guidance message always says "Проверьте обновлённую структуру во вкладке «Результат»", but for Stage 6 the lesson content is shown in LessonPanelWithTabs, not an "Output" tab.

**Fix**: Make message context-aware based on `stageId` from the proposal, or use a generic message like "Проверьте обновлённые данные".

---

## Pre-existing Issues (Not from these commits)

- `getUpdatedFieldsForProposal` returns `['course_structure']` for `lesson_patch` type, but Stage 6 patches update `lesson_contents` table. This may cause incorrect event dispatch for graph view refetch.
- `refine()` function has `conversationId` in deps but `conversationId` changes after first response, causing the callback to be recreated.

---

## Fixes Applied

| ID    | Status       | Action                                  |
| ----- | ------------ | --------------------------------------- |
| BUG-1 | Fixed        | Added 3rd skeleton button               |
| BUG-2 | Fixed        | Removed redundant check                 |
| REC-1 | Task created | i18n extraction (beads task)            |
| REC-2 | Skipped      | Low priority, no runtime impact         |
| REC-3 | Fixed        | Generic message instead of tab-specific |
