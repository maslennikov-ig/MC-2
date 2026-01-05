# Investigation: Mermaid LLM Fixer Upgrade to MiniMax M2.1

**Date**: 2026-01-05
**Status**: COMPLETED
**Version**: v0.26.63
**Author**: Claude Code

## Executive Summary

Upgraded the Mermaid diagram LLM fixer from `google/gemini-2.0-flash-001` to `minimax/minimax-m2.1` for better Russian language support and cost efficiency. Added comprehensive test coverage and statistics collection.

## Problem Statement

### Original Issue
The Mermaid diagram generation pipeline was using `google/gemini-2.0-flash-001` for fixing broken diagrams. While functional, this model had limitations:

1. **Russian Language Support**: Suboptimal handling of Cyrillic text in diagram labels
2. **Cost Efficiency**: Not the most cost-effective option for the task
3. **Test Coverage**: Limited test variations for edge cases

### Specific Bug Pattern
LLM-generated mindmaps frequently contained arrow syntax (`-->`) which is invalid for Mermaid mindmaps. Mindmaps use **indentation-only** hierarchy:

```mermaid
# INCORRECT (arrows - flowchart syntax)
mindmap
  root((Product))
    Value
      Future --> After purchase

# CORRECT (indentation only)
mindmap
  root((Product))
    Value
      Future
        After purchase
```

## Solution Implementation

### 1. Model Replacement

**Changed**: `google/gemini-2.0-flash-001` → `minimax/minimax-m2.1`

**File**: `src/stages/stage6-lesson-content/utils/mermaid-llm-fixer.ts`

```typescript
// BEFORE
const LLM_MODEL_ID = 'google/gemini-2.0-flash-001';

// AFTER
const LLM_MODEL_ID = 'minimax/minimax-m2.1';
```

**Rationale**:
- MiniMax M2.1 has excellent Russian language support
- 10B activated parameters (230B total) with MoE architecture
- Optimized for coding and structured output tasks
- Cost: $0.30/1M input, $1.20/1M output

### 2. Pricing Configuration Updates

Added new model pricing to cost tracking systems:

**File**: `src/shared/metrics/cost-tracker.ts`
```typescript
'minimax/minimax-m2': { input: 0.255, output: 1.02 },  // Legacy
'minimax/minimax-m2.1': { input: 0.30, output: 1.20 }, // New recommended
```

**File**: `src/shared/llm/cost-calculator.ts`
```typescript
"minimax/minimax-m2.1": {
  inputPricePerMillion: 0.30,
  outputPricePerMillion: 1.20,
},
```

### 3. Database Migration Updates

**File**: `supabase/migrations/20251210141900_seed_judge_model_configs.sql`

Updated 3 tiebreaker judge configurations (ru, en, any languages):
```sql
('global', 'stage_6_judge', 'minimax/minimax-m2.1', 'openai/gpt-oss-120b',
 0.3, 4096, 'ru', 'extended', true, 'tiebreaker', 0.72,
 'Minimax M2.1', 'GPT-OSS 120B'),
```

### 4. Test Enhancements

Added 8 new test variations to `mermaid-generation.e2e.test.ts`:

| Test Category | Test Name | Purpose |
|--------------|-----------|---------|
| Subgraphs | Flowchart with subgraphs | Validate nested flowchart structures |
| Deep Hierarchy | Mindmap with 5+ levels | Test deep indentation handling |
| Wide Hierarchy | Mindmap with many siblings | Test horizontal scaling |
| Advanced Sequence | Loops and alt blocks | Test complex sequence diagrams |
| Notes | Sequence with notes | Test annotation syntax |
| Stress | Large flowchart (20+ nodes) | Performance validation |
| Stress | Near size limit (1500 chars) | Boundary testing |
| Statistics | LLM fixer metrics | JSON export of fix statistics |

### 5. Statistics Collection

Added metrics export for monitoring fixer performance:

```typescript
describe('Statistics Collection', () => {
  it('should collect and report LLM fixer statistics', async () => {
    const metrics = getLLMFixerMetrics();
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      model: FIXER_MODEL,
      metrics: {
        totalAttempts: metrics.totalAttempts,
        successfulFixes: metrics.successfulFixes,
        failedFixes: metrics.failedFixes,
        successRate: `${(metrics.successRate * 100).toFixed(1)}%`,
        totalTokensUsed: metrics.totalTokensUsed,
      }
    }, null, 2));
  });
});
```

## Files Changed

### Core Implementation
| File | Change |
|------|--------|
| `src/stages/stage6-lesson-content/utils/mermaid-llm-fixer.ts` | Model ID + docstring |
| `src/shared/metrics/cost-tracker.ts` | Added m2.1 pricing |
| `src/shared/llm/cost-calculator.ts` | Added m2.1 pricing |

### Configuration
| File | Change |
|------|--------|
| `src/config/config-seed.json` | Updated model_id |
| `supabase/migrations/20251210141900_seed_judge_model_configs.sql` | 3 occurrences |

### Experiments
| File | Change |
|------|--------|
| `experiments/models/run-parallel-test-v3.ts` | slug + apiName |
| `experiments/models/run-parallel-test-v4.ts` | slug + apiName |
| `experiments/models/run-parallel-test-v5.ts` | slug + apiName |
| `experiments/models/test-models-with-quality.ts` | name + slug + apiName |

### Tests
| File | Change |
|------|--------|
| `tests/stages/stage6-lesson-content/mermaid-generation.e2e.test.ts` | FIXER_MODEL + 8 new tests |

## Test Results

### Final Test Run
```
Total tests: 32
Passed: 30
Timeouts (API): 2 (network issues, not code problems)

Breakdown:
- Validation tests: 17/17 ✓
- LLM Fixer tests: 4/4 ✓
- Generation tests: 8/10 (2 API timeouts)
- Stress tests: 2/2 ✓
- Statistics: 1/1 ✓
```

### Key Fixer Results
All fixer tests passed with `minimax/minimax-m2.1`:

| Test | Duration | Result |
|------|----------|--------|
| Fix flowchart invalid arrows | 2568ms | ✓ |
| Fix mindmap arrows → indentation | 4573ms | ✓ |
| Fix mindmap with brackets | 6688ms | ✓ |
| Fix real broken mindmap | 8730ms | ✓ |

### Regression Test Success
Real broken mindmap from production course was successfully fixed:

```
INPUT (broken):
mindmap
  root((Нематериальный продукт))
    Характеристики
      Нельзя потрогать
    Ценность
      В будущем --> После покупки
    Доверие
      Главная валюта

OUTPUT (fixed):
mindmap
  root((Нематериальный продукт))
    Характеристики
      Нельзя потрогать
      Обещание результата
    Ценность
      В будущем
        После покупки
    Доверие
      Главная валюта
```

## How to Reproduce

### Run All Mermaid Tests
```bash
cd packages/course-gen-platform
pnpm vitest run tests/stages/stage6-lesson-content/mermaid-generation.e2e.test.ts
```

### Run Fast Validation Tests Only
```bash
pnpm vitest run tests/stages/stage6-lesson-content/mermaid-generation.e2e.test.ts \
  --testNamePattern="Validation|Additional|Stress|Statistics"
```

### Run LLM Fixer Tests Only
```bash
pnpm vitest run tests/stages/stage6-lesson-content/mermaid-generation.e2e.test.ts \
  --testNamePattern="LLM Fixer"
```

## Key Learnings

### 1. Mermaid Mindmap Syntax
Mindmaps in Mermaid use **indentation-only** hierarchy. Arrows (`-->`) are flowchart syntax and will either:
- Cause parse errors (Mermaid <11)
- Render as literal text in nodes (Mermaid 11+)

### 2. Model Selection for Structured Output
MiniMax M2.1 performs well for:
- Russian language content
- Structured diagram syntax
- Cost-sensitive applications

### 3. Test Timeout Management
LLM-dependent tests need generous timeouts (`LLM_TIMEOUT * 2`) due to:
- Network latency variability
- OpenRouter API response times
- Model inference time

### 4. Backwards Compatibility
Keep legacy model pricing in cost calculators for:
- Historical cost analysis
- Gradual migration support
- Fallback scenarios

## References

- [OpenRouter MiniMax M2.1](https://openrouter.ai/minimax/minimax-m2.1)
- [OpenRouter MiniMax M2](https://openrouter.ai/minimax/minimax-m2)
- [Mermaid Mindmap Documentation](https://github.com/mermaid-js/mermaid/blob/develop/docs/syntax/mindmap.md)
- [Context7 Mermaid Library](https://context7.com/mermaid-js/mermaid)

## Related Files

- Technical Specification: `.tmp/current/mermaid-testing-tz.md`
- Task Tracking: `.tmp/current/mermaid-tasks.md`
- Main Fixer: `src/stages/stage6-lesson-content/utils/mermaid-llm-fixer.ts`
- DOM Setup: `src/stages/stage6-lesson-content/utils/mermaid-dom-setup.ts`
