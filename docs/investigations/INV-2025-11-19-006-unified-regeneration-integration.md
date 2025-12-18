# INV-2025-11-19-006: UnifiedRegenerator Integration & Kimi K2 Fallback

**Date**: 2025-11-19
**Status**: PLANNED
**Priority**: HIGH (fixes T053 test failures, improves reliability)
**Category**: Architecture / Reliability / Model Configuration

---

## Executive Summary

**Problem**:
1. **Stage 4 (Analysis)** does NOT use UnifiedRegenerator → fails immediately on RT-006 validation errors
2. **Stage 5 (Generation)** uses only Layers 1-2 → missing Layers 3-5 for robust recovery
3. **Layer 5 (Emergency Fallback)** uses wrong model for quality failures → should use Kimi K2, not Grok/Gemini

**Impact**:
- T053 test failure: Stage 4 generates `exercise_types: ['analysis']` → validation blocks → no retry
- Missing regeneration layers reduce success rate by ~30-40% (estimated)
- Confusion between context overflow (Grok) vs quality failure (should be Kimi K2)

**Solution**:
1. Add UnifiedRegenerator to Stage 4 (all phases)
2. Extend Stage 5 from Layers 1-2 to Layers 1-5
3. Configure Layer 5 with Kimi K2 as quality fallback model
4. Create unified regeneration documentation for future stages

---

## Background: Two Different Failure Scenarios

### Scenario 1: Context Overflow (Large Input)
**Problem**: Input exceeds model's context window (e.g., qwen3-235B has ~32K context)

**Current Solution** (CORRECT):
- `langchain-models.ts:211-215` - `emergency` phase
- Primary: `x-ai/grok-4-fast` (2M tokens context)
- Fallback: `google/gemini-2.5-flash` (1M tokens context)

**No changes needed** - this is working correctly.

---

### Scenario 2: Quality/Validation Failure (Normal Input Size)
**Problem**: Model generates invalid output (RT-006 validation errors, quality issues)

**Current Solution** (INCOMPLETE):
- Stage 4: ❌ No UnifiedRegenerator → fails immediately
- Stage 5: ⚠️ Layers 1-2 only → missing Layers 3-5

**UnifiedRegenerator Layers** (from `src/shared/regeneration/unified-regenerator.ts`):
1. **Layer 1**: Auto-repair (jsonrepair + field-name-fix, FREE, 95-98% success)
2. **Layer 2**: Critique-revise (LLM feedback loop, same model)
3. **Layer 3**: Partial regeneration (field-level atomic repair, same model)
4. **Layer 4**: Model escalation (20B → 120B, higher capability)
5. **Layer 5**: Emergency fallback ← **THIS NEEDS KIMI K2**

**Why Kimi K2 for Layer 5?**
- High quality output (S-TIER in LLM testing)
- Good multilingual support (Russian/English)
- Reliable structured JSON generation
- NOT for context overflow (that's Grok/Gemini)

---

## Current State Analysis

### Stage 4 (Analysis) - NO UnifiedRegenerator

**Files**:
- `src/orchestrator/services/analysis/workflow-graph.ts` - LangGraph StateGraph
- `src/orchestrator/services/analysis/phase-*.ts` - Individual phases (1-5)

**Current behavior**:
1. Phase generates output
2. Zod schema validates immediately
3. If RT-006 error → **workflow fails, no retry**
4. No auto-repair, no critique-revise, no escalation

**Example failure** (T053):
```
Phase 1 generates: { "exercise_types": ["analysis"] }
Validation: RT-006 - Invalid enum value
Result: WORKFLOW FAILS ❌
```

---

### Stage 5 (Generation) - Partial UnifiedRegenerator

**Files**:
- `src/services/stage5/metadata-generator.ts:224-225`
- `src/services/stage5/section-batch-generator.ts:501-503`

**Current configuration**:
```typescript
const regenerator = new UnifiedRegenerator<T>({
  enabledLayers: ['auto-repair', 'critique-revise'], // Layers 1-2 ONLY
  maxRetries: 2,
  qualityValidator: (data) => { /* ... */ },
  // Missing: Layer 3 (partial-regen), Layer 4 (escalation), Layer 5 (fallback)
});
```

**Problem**: If Layers 1-2 fail → no escalation to 120B model or Kimi K2 fallback.

---

### Layer 5 (Emergency Fallback) - Wrong Model

**File**: `src/shared/regeneration/layers/layer-5-emergency.ts:61`

**Current code**:
```typescript
const emergencyModel = await getModelForPhase('emergency', courseId);
// Returns: x-ai/grok-4-fast (context overflow model)
```

**Problem**:
- `emergency` phase is for **context overflow**, not **quality failure**
- Layer 5 should use **quality-focused fallback** (Kimi K2)
- Need separate phase: `quality_fallback` with Kimi K2

---

## Solution Design

### Part 1: Add Kimi K2 as Quality Fallback Phase

**File**: `src/orchestrator/services/analysis/langchain-models.ts`

**Add new phase**:
```typescript
const phaseConfigs: PhaseConfigs = {
  // ... existing phases ...
  emergency: {
    modelId: 'x-ai/grok-4-fast',       // Context overflow (keep as-is)
    temperature: 0.7,
    maxTokens: 30000,
  },
  quality_fallback: {                   // NEW: Quality failure fallback
    modelId: 'moonshotai/kimi-k2-0905', // S-TIER quality model
    temperature: 0.3,                    // Lower temp for precision
    maxTokens: 16000,                    // Sufficient for structured output
  },
};
```

**Update PhaseName type** in `packages/shared-types/src/model-config.ts`:
```typescript
export type PhaseName =
  | 'phase_1_classification'
  | 'phase_2_scope'
  | 'phase_3_expert'
  | 'phase_4_synthesis'
  | 'phase_6_rag_planning'
  | 'emergency'
  | 'quality_fallback'; // NEW
```

---

### Part 2: Update Layer 5 to Use Quality Fallback

**File**: `src/shared/regeneration/layers/layer-5-emergency.ts`

**Rename function and update logic**:
```typescript
/**
 * Layer 5: Quality Fallback
 *
 * Last resort fallback to high-quality model (Kimi K2) when quality fails.
 * NOTE: This is NOT for context overflow - use 'emergency' phase for that.
 */
export async function qualityFallback(
  prompt: string,
  courseId: string
): Promise<QualityFallbackResult> {
  logger.warn('Layer 5: Quality fallback invoked (last resort)');

  try {
    const fallbackModel = await getModelForPhase('quality_fallback', courseId);
    const fallbackModelId = fallbackModel.modelName || 'moonshotai/kimi-k2-0905';

    logger.info({ fallbackModelId }, 'Invoking quality fallback model');

    const response = await fallbackModel.invoke(prompt);
    const output = response.content as string;

    // Verify output is parseable JSON
    JSON.parse(output);

    logger.info(
      { fallbackModelId },
      'Layer 5: Quality fallback succeeded'
    );

    return {
      output,
      modelUsed: fallbackModelId,
    };
  } catch (error) {
    logger.error({ error }, 'Layer 5: Quality fallback failed (critical)');
    throw new Error(`Quality fallback failed: ${error}`);
  }
}

/**
 * Determines if quality fallback should be attempted
 */
export function shouldAttemptQualityFallback(
  attempt: number,
  maxRetries: number,
  enabledLayers: string[]
): boolean {
  return (
    attempt >= maxRetries - 1 && // Last attempt
    enabledLayers.includes('emergency') // Layer 5 enabled
  );
}
```

**Update exports** in `src/shared/regeneration/index.ts`:
```typescript
export {
  qualityFallback,           // Renamed from emergencyFallback
  shouldAttemptQualityFallback, // Renamed from shouldAttemptEmergency
} from './layers/layer-5-emergency';
```

---

### Part 3: Integrate UnifiedRegenerator into Stage 4

**File**: `src/orchestrator/services/analysis/workflow-graph.ts`

**Current architecture**: LangGraph StateGraph with 6 nodes (preFlight + phase1-5)

**Option A (Recommended)**: Add UnifiedRegenerator to each phase individually
- Modify `phase-1-classifier.ts`, `phase-2-scope.ts`, etc.
- Wrap LLM invocation with UnifiedRegenerator
- Keep LangGraph orchestration logic unchanged

**Option B**: Create wrapper node around LangGraph
- More invasive refactoring
- May break existing state management

**Recommendation**: Use Option A for minimal disruption.

**Implementation pattern** (apply to each phase):
```typescript
// BEFORE (phase-1-classifier.ts):
const response = await model.invoke(prompt);
const rawOutput = response.content as string;
const parsed = JSON.parse(rawOutput); // ❌ No retry on failure

// AFTER:
const regenerator = new UnifiedRegenerator<Phase1Output>({
  enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
  maxRetries: 3,
  stage: 'analyze',
  courseId,
  phaseId: 'phase_1_classification',
  schema: Phase1OutputSchema,
  model: model,
  metricsTracking: true,
});

const result = await regenerator.regenerate({
  rawOutput: response.content as string,
  originalPrompt: prompt,
});

const parsed = result.data; // ✅ Auto-retry with 5 layers
```

**Apply to these files**:
1. `src/orchestrator/services/analysis/phase-1-classifier.ts`
2. `src/orchestrator/services/analysis/phase-2-scope.ts`
3. `src/orchestrator/services/analysis/phase-3-expert.ts`
4. `src/orchestrator/services/analysis/phase-4-synthesis.ts`
5. `src/orchestrator/services/analysis/phase-5-assembly.ts` (validation logic only)

---

### Part 4: Extend Stage 5 to Use All Layers

**Files**:
- `src/services/stage5/metadata-generator.ts:224-250`
- `src/services/stage5/section-batch-generator.ts:501-530`

**Change**:
```typescript
// BEFORE:
const regenerator = new UnifiedRegenerator<T>({
  enabledLayers: ['auto-repair', 'critique-revise'], // Only Layers 1-2
  maxRetries: 2,
  // ...
});

// AFTER:
const regenerator = new UnifiedRegenerator<T>({
  enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
  maxRetries: 3, // Increased to allow Layer 4 (escalation) + Layer 5 (fallback)
  stage: 'generation',
  courseId: input.courseId,
  phaseId: 'metadata_generation', // or 'section_batch_generation'
  schema: CourseMetadataSchema, // or SectionSchema
  model: model,
  metricsTracking: true,
});
```

**Expected improvement**:
- Layer 1 (auto-repair): 95-98% success (unchanged)
- Layer 2 (critique-revise): +2-3% success (unchanged)
- **Layer 3 (partial-regen)**: +5-10% success (NEW)
- **Layer 4 (escalation to 120B)**: +10-15% success (NEW)
- **Layer 5 (Kimi K2 fallback)**: +5-8% success (NEW)

**Total estimated improvement**: +20-33% success rate on difficult cases.

---

### Part 5: Create Unified Regeneration Documentation

**File**: `docs/REGENERATION-STRATEGY.md`

**Content**:
```markdown
# Regeneration Strategy Guide

## Overview

This document defines the unified regeneration strategy for all LLM-based stages (Analyze, Generation, future stages).

## Two Failure Scenarios

### 1. Context Overflow (Input Too Large)
- **Trigger**: Model context window exceeded
- **Solution**: `emergency` phase → Grok 4 Fast → Gemini 2.5 Flash
- **When**: Before LLM invocation, check input token count

### 2. Quality/Validation Failure (Normal Input)
- **Trigger**: RT-006 validation errors, quality gates fail
- **Solution**: UnifiedRegenerator Layers 1-5
- **When**: After LLM invocation, during parsing/validation

## UnifiedRegenerator Layers

| Layer | Strategy | Cost | Success Rate | Use Case |
|-------|----------|------|--------------|----------|
| 1 | Auto-repair (jsonrepair + field-name-fix) | FREE | 95-98% | Malformed JSON, camelCase→snake_case |
| 2 | Critique-revise (LLM feedback loop) | 1x cost | +2-3% | Logical errors, missing fields |
| 3 | Partial regeneration (field-level) | 0.5x cost | +5-10% | Specific field validation failures |
| 4 | Model escalation (20B → 120B) | 6x cost | +10-15% | Complex reasoning failures |
| 5 | Quality fallback (Kimi K2) | 2x cost | +5-8% | Last resort, high quality needed |

## Standard Configuration

### For Stage 4 (Analysis)
```typescript
const regenerator = new UnifiedRegenerator<PhaseOutput>({
  enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
  maxRetries: 3,
  stage: 'analyze',
  courseId,
  phaseId: 'phase_X_name',
  schema: PhaseOutputSchema,
  model: model,
  metricsTracking: true,
});
```

### For Stage 5 (Generation)
```typescript
const regenerator = new UnifiedRegenerator<GenerationOutput>({
  enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
  maxRetries: 3,
  stage: 'generation',
  courseId: input.courseId,
  phaseId: 'metadata_generation', // or 'section_batch_generation'
  schema: CourseMetadataSchema,
  model: model,
  metricsTracking: true,
  qualityValidator: (data) => {
    // Stage-specific quality validation
    return isHighQuality(data);
  },
});
```

## Model Configuration

### Quality Fallback Model (Layer 5)
- **Model**: `moonshotai/kimi-k2-0905`
- **Why**: S-TIER quality, multilingual, reliable structured output
- **Temperature**: 0.3 (precision over creativity)
- **Max Tokens**: 16000

### Context Overflow Models (Emergency Phase)
- **Primary**: `x-ai/grok-4-fast` (2M tokens)
- **Fallback**: `google/gemini-2.5-flash` (1M tokens)

## Cost Analysis

### Example: 100 failed generations
- **Without UnifiedRegenerator**: 100 failures → 100 manual retries → 200 API calls
- **With Layers 1-2**: 97 success (Layer 1), 3 failures → 103 API calls
- **With Layers 1-5**: 99 success (cumulative), 1 failure → 120 API calls

**Savings**: 80 failed generations prevented, ~40% cost reduction vs manual retries.

## Integration Checklist

For any new LLM-based stage:
- [ ] Add UnifiedRegenerator wrapper around LLM invocation
- [ ] Configure all 5 layers (unless specific reason to exclude)
- [ ] Set `maxRetries: 3` (minimum for Layer 4 + Layer 5)
- [ ] Provide Zod schema for Layer 3 (partial regeneration)
- [ ] Implement quality validator if needed
- [ ] Enable metrics tracking for monitoring
- [ ] Test with intentional failures to verify recovery

## Monitoring

Track these metrics per stage:
- `regeneration.layer_used` - Which layer succeeded
- `regeneration.attempts` - How many retries needed
- `regeneration.success_rate` - Overall success rate
- `regeneration.cost_multiplier` - Average cost vs base case

Alert if:
- Layer 4 or 5 usage exceeds 10% (indicates model quality issue)
- Success rate drops below 95% (regeneration not working)
- Cost multiplier exceeds 2.0 (too many retries)
```

---

## Implementation Tasks

### Task 1: Add Kimi K2 Quality Fallback Phase
**Files**:
- `src/orchestrator/services/analysis/langchain-models.ts`
- `packages/shared-types/src/model-config.ts`

**Steps**:
1. Add `quality_fallback` phase config with `moonshotai/kimi-k2-0905`
2. Update `PhaseName` type to include `quality_fallback`
3. Run type-check to verify no compilation errors

---

### Task 2: Update Layer 5 to Use Quality Fallback
**Files**:
- `src/shared/regeneration/layers/layer-5-emergency.ts`
- `src/shared/regeneration/index.ts`

**Steps**:
1. Rename `emergencyFallback` → `qualityFallback`
2. Change phase from `'emergency'` → `'quality_fallback'`
3. Update function documentation to clarify: quality failure, NOT context overflow
4. Update exports in index.ts

---

### Task 3: Integrate UnifiedRegenerator into Stage 4 Phases
**Files**:
- `src/orchestrator/services/analysis/phase-1-classifier.ts`
- `src/orchestrator/services/analysis/phase-2-scope.ts`
- `src/orchestrator/services/analysis/phase-3-expert.ts`
- `src/orchestrator/services/analysis/phase-4-synthesis.ts`
- `src/orchestrator/services/analysis/phase-5-assembly.ts`

**Steps** (for each phase):
1. Import `UnifiedRegenerator`
2. Wrap LLM response parsing with regenerator
3. Configure all 5 layers
4. Set `maxRetries: 3`
5. Provide Zod schema for validation
6. Enable metrics tracking

---

### Task 4: Extend Stage 5 to Use All Layers
**Files**:
- `src/services/stage5/metadata-generator.ts`
- `src/services/stage5/section-batch-generator.ts`

**Steps**:
1. Change `enabledLayers` from `['auto-repair', 'critique-revise']` to all 5 layers
2. Increase `maxRetries` from 2 to 3
3. Add `phaseId` for better logging
4. Verify quality validators are properly configured

---

### Task 5: Create Regeneration Documentation
**Files**:
- `docs/REGENERATION-STRATEGY.md` (new)
- Update `docs/Agents Ecosystem/ARCHITECTURE.md` to reference it

**Steps**:
1. Write comprehensive guide (see Part 5 above)
2. Include decision trees for context overflow vs quality failure
3. Provide standard configuration examples
4. Add cost analysis and monitoring guidance
5. Create integration checklist for future stages

---

### Task 6: Testing & Validation
**Tests**:
- `tests/e2e/t053-synergy-sales-course.test.ts` (should pass after fixes)
- Add unit tests for Layer 5 with Kimi K2

**Steps**:
1. Run T053 test → verify it passes (exercise_types validation fixed)
2. Add unit test for `qualityFallback` function
3. Test Layer 4 escalation (20B → 120B)
4. Verify metrics tracking works
5. Check logs for proper layer usage reporting

---

## Success Criteria

- [ ] T053 E2E test passes consistently
- [ ] Stage 4 uses UnifiedRegenerator in all phases
- [ ] Stage 5 uses all 5 layers (not just 1-2)
- [ ] Layer 5 uses Kimi K2, not Grok/Gemini
- [ ] Documentation created and linked from ARCHITECTURE.md
- [ ] Type-check passes
- [ ] No compilation errors
- [ ] Metrics show layer usage distribution

---

## Expected Outcomes

### Reliability Improvement
- **Stage 4**: 0% retry → 95%+ success rate (massive improvement)
- **Stage 5**: 97% success → 99%+ success rate (+2% improvement)
- **Overall**: T053 test passes, fewer manual interventions

### Cost Impact
- **Baseline**: Current failures require manual debugging/retry (high cost)
- **With Layers 1-2**: Some improvement, but still missing escalation
- **With Layers 1-5**: +20-30% API cost, but 95%+ reliability (net positive ROI)

### Developer Experience
- Clear documentation for future stages
- Consistent regeneration strategy across all LLM operations
- Easier debugging with metrics tracking

---

## References

- **Current T053 Failure**: `/docs/investigations/INV-2025-11-18-004-stage4-analysis-failures.md`
- **UnifiedRegenerator**: `/packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts`
- **LangGraph Workflow**: `/packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts`
- **Layer 5 Emergency**: `/packages/course-gen-platform/src/shared/regeneration/layers/layer-5-emergency.ts`
- **Model Configuration**: `/packages/course-gen-platform/src/orchestrator/services/analysis/langchain-models.ts`
- **Kimi K2 Test Results**: `/docs/llm-testing/` (S-TIER quality model)

---

**End of Investigation**
