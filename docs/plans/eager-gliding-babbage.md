# Plan: Fix Refinement Chat Not Responding

## Problem

При отправке уточняющего запроса в панели "Уточнение" (RefinementChat) система не отвечает. Сообщения пользователя отображаются (optimistic update), но ответа от AI нет. В Network tab **нет HTTP запроса** к бэкенду.

## ROOT CAUSE

**Баг в `NodeDetailsDrawer.tsx:747-748`:**

```typescript
const handleRefine = async (message: string, intent) => {
  if (!data || !selectedAttemptNum) return; // <-- BUG!
  // ... запрос никогда не отправляется
};
```

**Почему `selectedAttemptNum` = null:**

В строках 562-576, когда нода имеет phases (Stage 4, 5, 6):

```typescript
if (hasPhases && phases.length > 0) {
  setSelectedAttemptNum(null); // <-- Устанавливается null для phase nodes
}
```

**Результат:** Для всех нод Stage 4, 5, 6 (которые используют phases вместо attempts), `handleRefine` выходит рано и HTTP запрос НЕ отправляется.

## Solution

Изменить проверку в `handleRefine` - убрать обязательную проверку `selectedAttemptNum` и использовать значение по умолчанию.

## File to Modify

`packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx` (строки 747-761)

## Changes

**Before (lines 747-761):**

```typescript
const handleRefine = async (message: string, intent: 'refine' | 'regenerate' = 'refine') => {
  if (!data || !selectedAttemptNum) return;

  // Get current output to refine
  const currentOutput = JSON.stringify(displayData?.outputData || {});

  await refine(
    `stage_${data.stageNumber}`,
    selectedNodeId || undefined,
    selectedAttemptNum,
    message,
    currentOutput,
    intent
  );
};
```

**After:**

```typescript
const handleRefine = async (message: string, intent: 'refine' | 'regenerate' = 'refine') => {
  if (!data) return;

  // Use attemptNum or default to 1 for phase-based nodes
  const attemptNum = selectedAttemptNum || 1;
  // Get current output to refine
  const currentOutput = JSON.stringify(displayData?.outputData || {});

  await refine(
    `stage_${data.stageNumber}`,
    selectedNodeId || undefined,
    attemptNum,
    message,
    currentOutput,
    intent
  );
};
```

## Verification

1. Run type-check: `pnpm type-check`
2. Build: `pnpm build` (in packages/web)
3. Deploy to dev or test locally
4. Open course generation page
5. Click on Stage 4/5/6 node to open drawer
6. Expand "Уточнение" panel
7. Select "Уточнить" mode
8. Type message and send
9. **Check Network tab** - should see POST request to `/trpc/generation.chat`
10. Verify AI response appears in chat within 30 seconds

## Risk Assessment

**Low risk change:**

- Only affects `handleRefine` function
- Fallback to `1` is safe - attemptNumber is only used for context/logging
- No breaking changes to API contract
