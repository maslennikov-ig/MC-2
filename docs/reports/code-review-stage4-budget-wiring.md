# Code Review: Stage 4 Budget Allocator Wiring

## Summary

**Commit**: 9b3e5407
**Date**: 2026-02-16
**Author**: maslennikov-ig
**Files Changed**: 3

This review examines the integration of Stage 4 Budget Allocator decisions into Phase 3 Expert Analysis. The change replaces hardcoded equal document token allocation (25K split) with budget-aware per-document allocations based on document priority (CORE, IMPORTANT, SUPPLEMENTARY). Additionally, a 10K token system prompt reserve was added to prevent context overflow.

### Key Changes

1. **phase-3-expert.ts**: Added `budget_context` to `Phase3Input` interface, replaced hardcoded `tokensPerDocument` calculation with budget-aware `getTokenBudget()` function
2. **orchestrator-phase-helpers.ts**: Wired `context.budgetAllocation` to Phase 3 call with file_name mapping
3. **stage4-budget-allocator.ts**: Added `SYSTEM_PROMPT_RESERVE = 10_000` constant and subtracted it from `effectiveMaxContext`

### Overall Assessment

**Status**: ✅ **APPROVED WITH RECOMMENDATIONS**

The implementation is fundamentally sound with proper fallback handling and clear architecture. A few minor issues should be addressed for robustness and consistency.

---

## Issues Found

### Critical (must fix)

**None found.** The implementation handles edge cases appropriately and maintains backward compatibility.

---

### Important (should fix)

#### 1. Array Length Mismatch Risk Between `budgetAllocation.documents` and `resolvedDocumentSummaries`

**File**: `orchestrator-phase-helpers.ts:510-522`

**Issue**: The code maps `budgetAllocation.documents` to build `budget_context.documents`, using `resolvedDocumentSummaries.find()` to look up file names by `document_id`. If the arrays are misaligned or a document is missing from `resolvedDocumentSummaries`, the fallback is `d.file_id` (UUID), which is less readable in prompts.

**Current Code**:

```typescript
budget_context: context.budgetAllocation
  ? {
      documents: context.budgetAllocation.documents.map((d) => ({
        file_name:
          resolvedDocumentSummaries.find((ds) => ds.document_id === d.file_id)?.file_name ||
          d.file_id,  // ← Fallback to UUID if not found
        mode: d.mode,
        priority: d.priority,
        tokens: d.tokens,
      })),
      totalTokens: context.budgetAllocation.totalTokens,
    }
  : undefined,
```

**Risk Scenario**:

- Budget allocator processes documents in a different order than orchestrator
- A document is removed between budget allocation and Phase 3
- `find()` fails and falls back to UUID, making prompts less readable

**Recommendation**:
Add validation after the mapping:

```typescript
budget_context: context.budgetAllocation
  ? {
      documents: context.budgetAllocation.documents.map((d) => {
        const docSummary = resolvedDocumentSummaries.find((ds) => ds.document_id === d.file_id);
        if (!docSummary) {
          orchestrationLogger.warn(
            { file_id: d.file_id, priority: d.priority },
            'Budget document not found in resolvedDocumentSummaries, using file_id as name'
          );
        }
        return {
          file_name: docSummary?.file_name || d.file_id,
          mode: d.mode,
          priority: d.priority,
          tokens: d.tokens,
        };
      }),
      totalTokens: context.budgetAllocation.totalTokens,
    }
  : undefined,
```

Alternatively, assert array length equality:

```typescript
if (context.budgetAllocation.documents.length !== resolvedDocumentSummaries.length) {
  orchestrationLogger.error(
    {
      budgetDocsCount: context.budgetAllocation.documents.length,
      resolvedDocsCount: resolvedDocumentSummaries.length,
    },
    'Document count mismatch between budget allocation and resolved summaries'
  );
  // Consider throwing or continuing with warning
}
```

---

#### 2. Array Index Assumption in `phase-3-expert.ts`

**File**: `phase-3-expert.ts:123-126`

**Issue**: The code assumes `budgetDocs` array indices match `document_summaries` array indices. This is fragile if document ordering changes between budget allocation and Phase 3 call.

**Current Code**:

```typescript
const getTokenBudget = (idx: number): number => {
  if (budgetDocs?.[idx]) return budgetDocs[idx].tokens; // ← Assumes idx matches
  return documentCount > 0 ? Math.floor(DEFAULT_TOTAL_DOC_TOKENS / documentCount) : 0;
};
```

**Risk Scenario**:

- Documents are reordered between budget allocation and Phase 3
- `budgetDocs[0]` corresponds to document X, but `document_summaries[0]` is document Y
- Wrong token budget is applied to wrong document

**Actual Risk Assessment**: LOW — The orchestrator passes `resolvedDocumentSummaries` in the same order throughout (lines 497, 506). Budget allocator and Phase 3 both process the same array in order. However, this implicit coupling is undocumented.

**Recommendation**:
Add a comment documenting the ordering invariant:

```typescript
// Build document context with budget-aware truncation
// Uses per-document token allocation from Budget Allocator when available
// INVARIANT: budgetDocs array order MUST match document_summaries array order
// Both are derived from resolvedDocumentSummaries in orchestrator
const documentCount = document_summaries?.length || 0;
const budgetDocs = input.budget_context?.documents;
const DEFAULT_TOTAL_DOC_TOKENS = 25_000;

const getTokenBudget = (idx: number): number => {
  if (budgetDocs?.[idx]) return budgetDocs[idx].tokens;
  return documentCount > 0 ? Math.floor(DEFAULT_TOTAL_DOC_TOKENS / documentCount) : 0;
};
```

Alternatively, use a Map for robust lookup:

```typescript
const budgetMap = new Map(input.budget_context?.documents.map(d => [d.file_name, d.tokens]) || []);

const getTokenBudget = (summary: string, idx: number): number => {
  const fileName = budgetDocs?.[idx]?.file_name;
  if (fileName && budgetMap.has(fileName)) return budgetMap.get(fileName)!;
  return documentCount > 0 ? Math.floor(DEFAULT_TOTAL_DOC_TOKENS / documentCount) : 0;
};
```

---

#### 3. Inconsistent Document Priority Display Format

**File**: `phase-3-expert.ts:132-134`

**Issue**: Priority label format `[CORE, full_text]` is only shown when `budgetDocs` is available. When fallback is used, no priority is shown. This inconsistency could confuse LLMs trained on the budget-aware format.

**Current Code**:

```typescript
const priorityLabel = budgetDocs?.[idx]
  ? ` [${budgetDocs[idx].priority}, ${budgetDocs[idx].mode}]`
  : ''; // ← No label in fallback mode
return `\n[Document ${idx + 1}${priorityLabel}]\n${truncateSummary(summary, budget)}`;
```

**Recommendation**:
Always show priority in consistent format (even if generic in fallback):

```typescript
const priorityLabel = budgetDocs?.[idx]
  ? ` [${budgetDocs[idx].priority}, ${budgetDocs[idx].mode}]`
  : ' [STANDARD, summary]'; // Fallback uses equal split + summary assumption
```

Or omit entirely when using fallback (current behavior is fine, just document it):

```typescript
// Priority label only shown when Budget Allocator is available
// Fallback mode uses equal token split without priority hints
const priorityLabel = budgetDocs?.[idx]
  ? ` [${budgetDocs[idx].priority}, ${budgetDocs[idx].mode}]`
  : '';
```

---

### Minor (nice to have)

#### 4. Missing Null Check for `resolvedDocumentSummaries` in Orchestrator

**File**: `orchestrator-phase-helpers.ts:514`

**Issue**: The code calls `resolvedDocumentSummaries.find()` without checking if `resolvedDocumentSummaries` is defined. While the context type guarantees it's always an array, defensive programming is safer.

**Current Code**:

```typescript
file_name:
  resolvedDocumentSummaries.find((ds) => ds.document_id === d.file_id)?.file_name ||
  d.file_id,
```

**Recommendation**:
Add optional chaining or assertion:

```typescript
file_name:
  resolvedDocumentSummaries?.find((ds) => ds.document_id === d.file_id)?.file_name ||
  d.file_id,
```

Or add assertion at function start (since it's required by context):

```typescript
if (!resolvedDocumentSummaries || resolvedDocumentSummaries.length === 0) {
  throw new Error('resolvedDocumentSummaries required for Phase 3 with budget allocation');
}
```

---

#### 5. SYSTEM_PROMPT_RESERVE Should Be Configurable

**File**: `stage4-budget-allocator.ts:118`

**Issue**: `SYSTEM_PROMPT_RESERVE = 10_000` is hardcoded. Different phases might need different reserves (e.g., Phase 3 has longer system prompts than Phase 2).

**Current Code**:

```typescript
export const SYSTEM_PROMPT_RESERVE = 10_000;
```

**Recommendation**:
Make it a parameter with default:

```typescript
/**
 * Default token reserve for system prompt and phase-specific instructions.
 */
export const DEFAULT_SYSTEM_PROMPT_RESERVE = 10_000;

export function allocateStage4Budget(
  documents: Stage4DocumentInfo[],
  language: 'ru' | 'en',
  tierConfig?: Stage4TierConfig,
  systemPromptReserve: number = DEFAULT_SYSTEM_PROMPT_RESERVE // ← New parameter
): Stage4BudgetAllocation {
  // ...
  const effectiveMaxContext =
    Math.min(modelSelection.maxContext, STAGE4_HARD_TOKEN_LIMIT) - systemPromptReserve;
  // ...
}
```

Then each phase can specify its reserve:

```typescript
// Phase 3 has longer prompts
const allocation = allocateStage4Budget(documents, 'ru', tierConfig, 12_000);

// Phase 2 has shorter prompts
const allocation = allocateStage4Budget(documents, 'ru', tierConfig, 5_000);
```

---

#### 6. Truncation Feedback Could Be More Informative

**File**: `phase-3-expert.ts:101`

**Issue**: The truncation message shows token counts but doesn't indicate which document or why it was truncated (budget constraint vs. content length).

**Current Code**:

```typescript
return `${truncated}\n[... Truncated from ${estimatedTokens} to ${maxTokens} tokens ...]`;
```

**Recommendation**:
Add context about budget:

```typescript
return `${truncated}\n[... Truncated from ${estimatedTokens} to ${maxTokens} tokens due to budget allocation (${priority || 'standard'} priority) ...]`;
```

Call site would need to pass priority:

```typescript
function truncateSummary(summary: string, maxTokens: number, priority?: string): string {
  // ...
}

// Usage
return `\n[Document ${idx + 1}${priorityLabel}]\n${truncateSummary(summary, budget, budgetDocs?.[idx]?.priority)}`;
```

---

#### 7. DEFAULT_TOTAL_DOC_TOKENS Magic Number

**File**: `phase-3-expert.ts:121`

**Issue**: `DEFAULT_TOTAL_DOC_TOKENS = 25_000` is hardcoded. This duplicates knowledge that exists in Budget Allocator.

**Current Code**:

```typescript
const DEFAULT_TOTAL_DOC_TOKENS = 25_000;
```

**Recommendation**:
Export from budget allocator as named constant:

```typescript
// stage4-budget-allocator.ts
export const PHASE3_FALLBACK_DOCUMENT_BUDGET = 25_000;

// phase-3-expert.ts
import { PHASE3_FALLBACK_DOCUMENT_BUDGET } from './stage4-budget-allocator';

const getTokenBudget = (idx: number): number => {
  if (budgetDocs?.[idx]) return budgetDocs[idx].tokens;
  return documentCount > 0 ? Math.floor(PHASE3_FALLBACK_DOCUMENT_BUDGET / documentCount) : 0;
};
```

---

#### 8. Phase 2 and Phase 4 Don't Use Budget Allocator

**Files**: `phase-2-scope.ts`, `phase-4-synthesis.ts`

**Issue**: Phase 2 (Scope) and Phase 4 (Synthesis) still use hardcoded token splits. Phase 3 is now budget-aware, but other phases are not. This inconsistency could be intentional (different phases have different needs), but it's undocumented.

**Current State**:

- **Phase 2**: Uses `document_summaries` (summary strings only) — no full text
- **Phase 3**: Uses `budget_context` — can use full text or summary per document
- **Phase 4**: Uses `tokensPerDocument = Math.floor(25000 / documentCount)` hardcoded

**Recommendation**:
Document the rationale in each phase's header comments:

```typescript
/**
 * Phase 2: Scope Analysis
 *
 * Document Handling:
 * - Uses ONLY summaries (no full text)
 * - Budget Allocator not used (scope estimation doesn't need full text)
 * - Hardcoded 25K total budget for simplicity
 */
```

```typescript
/**
 * Phase 3: Expert Analysis
 *
 * Document Handling:
 * - Uses Budget Allocator decisions (full_text vs summary per document)
 * - CORE documents get full text, SUPPLEMENTARY get minimal summaries
 * - Supports budget_context from orchestrator (optional fallback to 25K split)
 */
```

```typescript
/**
 * Phase 4: Synthesis
 *
 * Document Handling:
 * - Currently uses hardcoded 25K split (not budget-aware)
 * - TODO: Consider integrating Budget Allocator for consistency?
 * - Uses summary_metadata.summary_tokens for accurate counts
 */
```

---

## Recommendations

### Architecture

1. **Document Ordering Invariant**: Add comments documenting that `budgetAllocation.documents`, `resolvedDocumentSummaries`, and `document_summaries` MUST maintain the same ordering. Consider adding runtime assertions in development mode.

2. **Budget Allocator Integration Path**: Consider extending Budget Allocator to Phase 2 and Phase 4 for consistency, or document why each phase uses different strategies.

3. **System Prompt Reserve**: Make `SYSTEM_PROMPT_RESERVE` configurable per-phase if different phases have significantly different prompt lengths.

### Code Quality

4. **Defensive Programming**: Add logging/warnings when `resolvedDocumentSummaries.find()` fails to find a document (Issue #1).

5. **Magic Numbers**: Extract `DEFAULT_TOTAL_DOC_TOKENS = 25_000` to shared constant in budget allocator module (Issue #7).

6. **Type Safety**: Consider adding Zod validation for `budget_context` in `Phase3Input` instead of relying on interface-only type safety.

### Testing

7. **Edge Case Tests**: Add unit tests for:
   - `budget_context` is `undefined` (fallback behavior)
   - `budgetDocs` array is shorter than `document_summaries` (index out of bounds)
   - `resolvedDocumentSummaries.find()` returns `undefined` (missing document)
   - Zero documents case (`documentCount === 0`)

8. **Integration Tests**: Add test verifying that Phase 3 prompt includes correct priority labels for CORE/IMPORTANT/SUPPLEMENTARY documents.

### Performance

9. **Lookup Optimization**: If `resolvedDocumentSummaries` is large (>100 docs), consider building a Map for O(1) lookups instead of O(n) `find()` calls (currently not an issue since max ~30 docs expected).

---

## Files Reviewed

### Modified Files

1. **packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-3-expert.ts** (32 lines changed)
   - Added `budget_context` field to `Phase3Input` interface (lines 53-62)
   - Replaced hardcoded `tokensPerDocument` with `getTokenBudget()` function (lines 119-126)
   - Updated prompt building to show priority labels (lines 130-136)
   - Updated comment from "DOCUMENT SUMMARIES" to "DOCUMENT CONTEXT" (line 130)

2. **packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts** (13 lines changed)
   - Wired `context.budgetAllocation` to `runPhase3Expert()` call (lines 510-522)
   - Maps `budgetAllocation.documents` to `budget_context.documents` with file_name lookup
   - Conditional: only passes `budget_context` if `context.budgetAllocation` is non-null

3. **packages/course-gen-platform/src/stages/stage4-analysis/phases/stage4-budget-allocator.ts** (10 lines changed)
   - Added `SYSTEM_PROMPT_RESERVE = 10_000` constant (line 118)
   - Updated `effectiveMaxContext` calculation to subtract reserve (line 173)
   - Added JSDoc comment explaining the reserve (lines 114-117)

### Related Files Examined (for context)

4. **orchestrator-helpers.ts**: Validated that `budgetAllocation` and `resolvedDocumentSummaries` are created in correct sequence
5. **phase-2-scope.ts**: Confirmed Phase 2 doesn't use Budget Allocator (by design)
6. **phase-0.5-clarifying.ts**: Confirmed clarifying phase uses `budgetAllocation` for condensed context
7. **phase-4-synthesis.ts**: Confirmed Phase 4 still uses hardcoded token split (not budget-aware)

---

## Comparison with Other Phases

### Phase 2 (Scope Analysis)

**Document Handling**:

```typescript
// Phase 2 uses summaries only, no budget allocator
document_summaries: resolvedDocumentSummaries?.map(ds => ds.processed_content) || null;
```

**Rationale**: Scope estimation doesn't need full text, summaries are sufficient.

### Phase 3 (Expert Analysis) — This PR

**Document Handling**:

```typescript
// Phase 3 uses budget-aware allocation
document_summaries: documentSummariesText,  // Can be full_text or summary
budget_context: {
  documents: [{ file_name, mode, priority, tokens }, ...],
  totalTokens
}
```

**Rationale**: Expert analysis benefits from full text of CORE documents, summaries for SUPPLEMENTARY.

### Phase 4 (Synthesis)

**Document Handling**:

```typescript
// Phase 4 uses hardcoded equal split (like old Phase 3)
const tokensPerDocument = documentCount > 0 ? Math.floor(25000 / documentCount) : 0;
```

**Rationale**: Not documented. Candidate for future budget allocator integration.

### Phase 0.5 (Clarifying Questions)

**Document Handling**:

```typescript
// Phase 0.5 uses condensed context from budget allocator
const condensedContext = buildCondensedContext(budgetAllocation, document_summaries);
```

**Rationale**: Clarifying questions need high-level overview, not full details.

---

## Edge Cases Handled

✅ **No budget_context provided**: Falls back to equal 25K split (backward compatible)
✅ **budgetDocs array shorter than document_summaries**: Uses fallback for out-of-bounds indices
✅ **Zero documents**: `getTokenBudget()` returns 0, prompt has empty `documentContext`
✅ **Missing file_name in resolvedDocumentSummaries**: Falls back to `d.file_id` UUID
✅ **budgetAllocation is null**: `budget_context` is `undefined`, Phase 3 uses fallback

---

## Type Safety Validation

**TypeScript Check**: ✅ PASSED (`pnpm --filter course-gen-platform type-check`)

**Type Correctness**:

- `budget_context` is optional in `Phase3Input` (correct)
- `budget_context.documents` matches `Stage4DocumentBudget` structure (correct)
- `resolvedDocumentSummaries` is `DocumentSummaryResult[]` (correct)
- `budgetAllocation.documents` uses `file_id` matching `document_id` (correct)

---

## Summary of Risk Assessment

| Issue                                                   | Severity | Likelihood | Impact                             | Mitigation                             |
| ------------------------------------------------------- | -------- | ---------- | ---------------------------------- | -------------------------------------- |
| Array index mismatch (budgetDocs vs document_summaries) | Medium   | Low        | Wrong token budget applied         | Add ordering invariant comment + tests |
| Missing file_name lookup fails silently                 | Low      | Very Low   | UUID in prompt instead of filename | Add logging when fallback occurs       |
| Document count mismatch                                 | Low      | Very Low   | Partial priority labels            | Add count assertion                    |
| Hardcoded SYSTEM_PROMPT_RESERVE                         | Low      | Low        | Suboptimal budget allocation       | Make configurable (future improvement) |

---

## Conclusion

The implementation is **production-ready** with minor improvements recommended. The core logic is sound:

1. ✅ **Backward Compatible**: Falls back gracefully when `budget_context` is unavailable
2. ✅ **Type Safe**: No TypeScript errors, proper optional handling
3. ✅ **Well-Documented**: Clear comments explaining budget-aware truncation
4. ✅ **Consistent with Budget Allocator**: Uses same `tokens` values from allocator
5. ✅ **Edge Cases Handled**: Zero docs, missing budget context, out-of-bounds indices

**Recommended Action Items** (in priority order):

1. Add warning logs when `resolvedDocumentSummaries.find()` fails (Important #1)
2. Document ordering invariant between arrays (Important #2)
3. Add unit tests for edge cases (Recommendation #7)
4. Consider making `SYSTEM_PROMPT_RESERVE` configurable (Minor #5)
5. Extract `DEFAULT_TOTAL_DOC_TOKENS` to shared constant (Minor #7)
6. Document phase-specific document handling strategies (Minor #8)

**Overall Rating**: ⭐⭐⭐⭐☆ (4/5 stars)

Excellent architectural integration with room for minor polish.
