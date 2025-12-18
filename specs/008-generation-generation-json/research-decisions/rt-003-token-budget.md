# Token Budget Allocation Validation (T003-R)

**Date**: 2025-11-07
**Feature**: Stage 5 - Generation Phase
**Status**: Validated

---

## 1. Context

**CRITICAL CLARIFICATION**: The 120K token budget is TOTAL (input + output combined), not just input budget.

**Per-Batch Architecture**:
- SECTIONS_PER_BATCH = 1 (each batch generates 1 section)
- Each batch has independent 120K total budget
- Budget breakdown: Input ≤90K tokens, Output ≤30K tokens

**Available Models**:
- OSS 20B/120B, qwen3-max: 128K context window → 120K usable (leaving 8K safety margin)
- Gemini 2.5 Flash: 1M context window (fallback for overflow)

---

## 2. Token Budget Scenarios

### Scenario 1: Standard Generation (No RAG, Full Analyze Results)

**Components**:
```
Base metadata prompt:        ~5,000 tokens
Style prompt:                ~1,000 tokens
Analyze results context:    ~10,000-15,000 tokens
  ├─ Course category:        ~500 tokens
  ├─ Contextual language:    ~1,500 tokens
  ├─ Topic analysis:         ~2,000 tokens
  ├─ Recommended structure:  ~3,000 tokens
  ├─ Pedagogical strategy:   ~1,500 tokens
  └─ Scope instructions:     ~1,500 tokens
Section batch prompt:        ~3,000 tokens per section
RAG context:                 0 tokens (no documents)

TOTAL INPUT:                 ~24,000 tokens
Expected output:             ~15,000-25,000 tokens (section + lessons)
TOTAL PER BATCH:            ~39,000-49,000 tokens
```

**Result**: ✅ **PASS** - Well within 120K limit (32-40% utilization)

---

### Scenario 2: RAG-Heavy Generation (40K Document Context)

**Components**:
```
Base + Style + Analyze:      ~21,000 tokens (from Scenario 1)
Section batch prompt:        ~3,000 tokens
RAG context:                ~40,000 tokens (max from research.md)
  ├─ File catalog summaries: ~5,000 tokens
  └─ Qdrant chunks (top 5):  ~35,000 tokens

TOTAL INPUT:                ~64,000 tokens
Expected output:            ~20,000-30,000 tokens
TOTAL PER BATCH:            ~84,000-94,000 tokens
```

**Result**: ✅ **PASS** - Within 120K limit (70-78% utilization), approaching threshold

**Warning Threshold**: 90% of 120K = 108K tokens total
- Current usage: 84-94K
- Safety margin: 14-26K tokens remaining
- **Action**: Monitor closely, no Gemini fallback needed yet

---

### Scenario 3: Minimal Analyze Output (Edge Case)

**Context**: Analyze ran but provided minimal information (e.g., only title + basic category)

**Components**:
```
Base metadata prompt:        ~5,000 tokens
Style prompt:                ~1,000 tokens
Analyze results (minimal):   ~3,000 tokens (only basic fields)
Section batch prompt:        ~3,000 tokens
RAG context:                 0 tokens

TOTAL INPUT:                ~12,000 tokens
Expected output:            ~15,000-25,000 tokens
TOTAL PER BATCH:            ~27,000-37,000 tokens
```

**Result**: ✅ **PASS** - Minimal budget usage (22-30% utilization)

**Note**: This is where qwen3-max helps - compensates for missing Analyze context with knowledge synthesis

---

### Scenario 4: RAG Overflow (>50K Context)

**Context**: Large documents, many relevant chunks retrieved

**Components**:
```
Base + Style + Analyze:      ~21,000 tokens
Section batch prompt:        ~3,000 tokens
RAG context (overflow):     ~60,000 tokens (hypothetical)

TOTAL INPUT:                ~84,000 tokens
Expected output:            ~30,000-35,000 tokens
TOTAL PER BATCH:            ~114,000-119,000 tokens
```

**Result**: ⚠️ **WARNING** - Approaching 120K limit (95-99% utilization)

**Mitigation Strategy**:
1. Trigger: Total tokens > 115K (96% threshold) → use Gemini fallback
2. OR: Input tokens > 108K (90% threshold) → use Gemini fallback
3. Gemini 2.5 Flash has 1M context window → can handle overflow

---

## 3. RAG Token Budget Management

### 3.1 RAG_MAX_TOKENS Constant

**Recommendation**: `RAG_MAX_TOKENS = 40,000 tokens`

**Rationale**:
- Scenario 2 validation shows 40K is feasible within 90K input budget
- Provides room for Analyze context (~21K) + section prompt (~3K) + RAG (40K) = ~64K input
- Leaves ~26K buffer below 90K input threshold
- Allows ~30K output before hitting 120K total

**Implementation**:
```typescript
const RAG_MAX_TOKENS = 40_000; // Maximum tokens for RAG context per batch
```

---

### 3.2 Dynamic RAG Adjustment

**Strategy**: Reduce RAG context if total input exceeds threshold

```typescript
function calculateRAGBudget(
  baseTokens: number,      // ~5K
  styleTokens: number,     // ~1K
  analyzeTokens: number,   // ~10-15K
  sectionTokens: number    // ~3K
): number {
  const INPUT_THRESHOLD = 90_000; // 90K input limit
  const usedTokens = baseTokens + styleTokens + analyzeTokens + sectionTokens;
  const availableForRAG = INPUT_THRESHOLD - usedTokens;

  // Cap RAG to available budget
  const ragTokens = Math.min(RAG_MAX_TOKENS, Math.max(0, availableForRAG));

  return ragTokens;
}
```

**Example**:
```typescript
// Scenario: Analyze provided 15K tokens
const ragBudget = calculateRAGBudget(5000, 1000, 15000, 3000);
// usedTokens = 24K
// availableForRAG = 90K - 24K = 66K
// ragBudget = min(40K, 66K) = 40K ✅

// Edge case: Analyze provided 30K tokens (hypothetical)
const ragBudget2 = calculateRAGBudget(5000, 1000, 30000, 3000);
// usedTokens = 39K
// availableForRAG = 90K - 39K = 51K
// ragBudget = min(40K, 51K) = 40K ✅
```

---

### 3.3 RAG Overflow Handling

**Trigger Conditions**:
```typescript
const GEMINI_TRIGGER_INPUT = 108_000;  // 90% of 120K
const GEMINI_TRIGGER_TOTAL = 115_000;  // 96% of 120K (safety margin for output variability)

function shouldUseGeminiFallback(
  inputTokens: number,
  estimatedOutputTokens: number
): boolean {
  const totalTokens = inputTokens + estimatedOutputTokens;

  return (
    inputTokens > GEMINI_TRIGGER_INPUT ||
    totalTokens > GEMINI_TRIGGER_TOTAL
  );
}
```

**Fallback Action**:
```typescript
if (shouldUseGeminiFallback(inputTokens, estimatedOutput)) {
  logger.warn({
    inputTokens,
    estimatedOutput,
    totalTokens: inputTokens + estimatedOutput,
    threshold: GEMINI_TRIGGER_TOTAL
  }, 'Token budget overflow, switching to Gemini 2.5 Flash');

  // Switch to Gemini for THIS BATCH ONLY
  model = 'google/gemini-2.5-flash';

  // Subsequent batches revert to OSS models
}
```

---

## 4. Token Budget Constants (Implementation)

### 4.1 Defined Constants

```typescript
// Token Budget Constants
export const TOKEN_BUDGET = {
  // Total budget per batch (input + output)
  TOTAL_BUDGET: 120_000,

  // Input budget (leaving room for output)
  INPUT_BUDGET_MAX: 90_000,  // 75% of total

  // Expected output range
  OUTPUT_BUDGET_MIN: 15_000,  // Minimum expected
  OUTPUT_BUDGET_MAX: 30_000,  // Maximum expected

  // RAG configuration
  RAG_MAX_TOKENS: 40_000,     // Maximum RAG context per batch

  // Gemini fallback triggers
  GEMINI_TRIGGER_INPUT: 108_000,   // 90% of total budget
  GEMINI_TRIGGER_TOTAL: 115_000,   // 96% of total budget

  // Estimated component sizes
  ESTIMATED_BASE_PROMPT: 5_000,
  ESTIMATED_STYLE_PROMPT: 1_000,
  ESTIMATED_ANALYZE_MIN: 10_000,
  ESTIMATED_ANALYZE_MAX: 15_000,
  ESTIMATED_SECTION_PROMPT: 3_000,
} as const;
```

---

### 4.2 Validation Function

```typescript
export function validateTokenBudget(input: {
  basePromptTokens: number;
  stylePromptTokens: number;
  analyzeTokens: number;
  sectionPromptTokens: number;
  ragTokens: number;
  estimatedOutputTokens: number;
}): {
  valid: boolean;
  totalInput: number;
  totalTokens: number;
  usagePercent: number;
  recommendation: 'OK' | 'WARNING' | 'GEMINI_FALLBACK';
  message: string;
} {
  const totalInput =
    input.basePromptTokens +
    input.stylePromptTokens +
    input.analyzeTokens +
    input.sectionPromptTokens +
    input.ragTokens;

  const totalTokens = totalInput + input.estimatedOutputTokens;
  const usagePercent = (totalTokens / TOKEN_BUDGET.TOTAL_BUDGET) * 100;

  // Determine recommendation
  let recommendation: 'OK' | 'WARNING' | 'GEMINI_FALLBACK';
  let message: string;

  if (totalTokens > TOKEN_BUDGET.GEMINI_TRIGGER_TOTAL) {
    recommendation = 'GEMINI_FALLBACK';
    message = `Total ${totalTokens} exceeds ${TOKEN_BUDGET.GEMINI_TRIGGER_TOTAL} threshold (${usagePercent.toFixed(1)}% usage). Use Gemini 2.5 Flash.`;
  } else if (totalInput > TOKEN_BUDGET.GEMINI_TRIGGER_INPUT) {
    recommendation = 'GEMINI_FALLBACK';
    message = `Input ${totalInput} exceeds ${TOKEN_BUDGET.GEMINI_TRIGGER_INPUT} threshold. Use Gemini 2.5 Flash.`;
  } else if (usagePercent > 85) {
    recommendation = 'WARNING';
    message = `Token usage at ${usagePercent.toFixed(1)}% (${totalTokens}/${TOKEN_BUDGET.TOTAL_BUDGET}). Consider reducing RAG context.`;
  } else {
    recommendation = 'OK';
    message = `Token usage at ${usagePercent.toFixed(1)}% (${totalTokens}/${TOKEN_BUDGET.TOTAL_BUDGET}). Within budget.`;
  }

  return {
    valid: totalTokens <= TOKEN_BUDGET.TOTAL_BUDGET,
    totalInput,
    totalTokens,
    usagePercent,
    recommendation,
    message,
  };
}
```

---

## 5. Summary

### 5.1 Key Decisions

✅ **RAG_MAX_TOKENS = 40,000** (validated in Scenario 2)
- Provides sufficient context without overwhelming budget
- Dynamic adjustment if Analyze context is large

✅ **GEMINI_TRIGGER_INPUT = 108,000** (90% of 120K)
- Trigger when input tokens exceed threshold
- Safety margin for output variability

✅ **GEMINI_TRIGGER_TOTAL = 115,000** (96% of 120K)
- Trigger when total (input + estimated output) exceeds threshold
- Prevents budget overflow

✅ **Dynamic RAG Reduction**
- If base + style + analyze + section > 50K → reduce RAG to fit
- If still exceeds 108K → skip RAG, trigger Gemini fallback

---

### 5.2 Validation Results

| Scenario | Input | Output | Total | Usage | Status |
|----------|-------|--------|-------|-------|--------|
| Standard (no RAG) | 24K | 20K | 44K | 37% | ✅ PASS |
| RAG-heavy (40K) | 64K | 25K | 89K | 74% | ✅ PASS |
| Minimal Analyze | 12K | 20K | 32K | 27% | ✅ PASS |
| RAG overflow (60K) | 84K | 32K | 116K | 97% | ⚠️ GEMINI |

---

### 5.3 Implementation Files

**Constants**:
- Location: `packages/course-gen-platform/src/services/stage5/token-budget.ts`
- Export: `TOKEN_BUDGET` constant, `validateTokenBudget()` function

**Usage**:
- `metadata-generator.ts`: Validate metadata prompt tokens
- `section-batch-generator.ts`: Validate per-batch tokens, trigger Gemini if needed
- `qdrant-search.ts`: Cap RAG to dynamic budget

---

## 6. Next Steps

1. ✅ **T003-R COMPLETE** - Token budget validated
2. ⏭️ Wait for DeepResearch results (T001-R, T002-R, T004-R, T006-R)
3. ⏭️ Create architecture design document based on DeepResearch findings
4. ⏭️ Implement token budget constants and validation function
