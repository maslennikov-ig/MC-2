# Plan: mc2-1fsg — Доделать остатки Budget Allocator wiring

## Context

Задача mc2-1fsg в основном выполнена (коммиты ac50c93e, 41a50c79, 89ed4f56). Осталось 2 gap'а:

1. **Phase 3 (Expert)** — хардкодит `Math.floor(25000 / documentCount)` для truncation вместо использования решений Budget Allocator
2. **Budget Allocator** — нет SYSTEM_PROMPT_RESERVE (~10K токенов) для системного промпта

## Pre-step

```bash
bd update mc2-03z1 --defer "+3m"
bd update mc2-1fsg --status in_progress
```

---

## Step 1: Budget-aware truncation в Phase 3

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-3-expert.ts`

### 1a. Add `budget_context` to Phase3Input (~line 39)

```typescript
export interface Phase3Input {
  // ... existing fields ...
  budget_context?: {
    documents: Array<{
      file_name: string;
      mode: 'full_text' | 'summary';
      priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
      tokens: number;
    }>;
    totalTokens: number;
  };
}
```

### 1b. Update `buildPhase3Prompt()` (~line 100-115)

Replace hardcoded 25K calculation:

```typescript
// Current:
const tokensPerDocument = documentCount > 0 ? Math.floor(25000 / documentCount) : 0;

// After:
const DEFAULT_TOTAL_DOC_TOKENS = 25_000;
const budgetDocs = input.budget_context?.documents;

// If budget context available, use allocator's per-document token budget
// Otherwise fallback to equal 25K split
const getTokenBudget = (idx: number) => {
  if (budgetDocs && budgetDocs[idx]) return budgetDocs[idx].tokens;
  return documentCount > 0 ? Math.floor(DEFAULT_TOTAL_DOC_TOKENS / documentCount) : 0;
};
```

Update document context building to use per-document budgets:

```typescript
document_summaries
  .map((summary, idx) => {
    const budget = getTokenBudget(idx);
    const priorityLabel = budgetDocs?.[idx]
      ? ` [${budgetDocs[idx].priority}, ${budgetDocs[idx].mode}]`
      : '';
    return `\n[Document ${idx + 1}${priorityLabel}]\n${truncateSummary(summary, budget)}`;
  })
  .join('\n\n');
```

### 1c. Wire in orchestrator (`orchestrator-phase-helpers.ts`)

In `runExpertPhase()` (~line 499), add `budget_context` to `runPhase3Expert()` call:

```typescript
budget_context: context.budgetAllocation ? {
  documents: context.budgetAllocation.documents.map((d, i) => ({
    file_name: context.resolvedDocumentSummaries[i]?.file_name || d.file_id,
    mode: d.mode,
    priority: d.priority,
    tokens: d.tokens,
  })),
  totalTokens: context.budgetAllocation.totalTokens,
} : undefined,
```

---

## Step 2: Add SYSTEM_PROMPT_RESERVE to Budget Allocator

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/stage4-budget-allocator.ts`

At ~line 167, add reserve before calculating effective max context:

```typescript
// Current:
const effectiveMaxContext = Math.min(modelSelection.maxContext, STAGE4_HARD_TOKEN_LIMIT);

// After:
const SYSTEM_PROMPT_RESERVE = 10_000;
const effectiveMaxContext =
  Math.min(modelSelection.maxContext, STAGE4_HARD_TOKEN_LIMIT) - SYSTEM_PROMPT_RESERVE;
```

Export the constant for testing:

```typescript
export const SYSTEM_PROMPT_RESERVE = 10_000;
```

---

## Critical files

| File                                                                                        | Change                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-3-expert.ts`          | Add budget_context to input, replace 25K hardcode |
| `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts`     | Wire budget_context to Phase 3 call               |
| `packages/course-gen-platform/src/stages/stage4-analysis/phases/stage4-budget-allocator.ts` | Add SYSTEM_PROMPT_RESERVE                         |

## Verification

1. `pnpm type-check` — типы компилируются
2. `pnpm build` — build проходит
3. `pnpm --filter course-gen-platform test` — тесты проходят (особенно budget allocator тесты)
4. Проверить что Budget Allocator тесты не ломаются из-за нового reserve (может потребоваться обновить test expectations)
