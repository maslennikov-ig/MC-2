# Regeneration Strategy Guide

## Overview

This document defines the unified regeneration strategy for all LLM-based stages (Analyze, Generation, and future stages). It provides guidelines for handling two distinct failure scenarios and implementing the 5-layer regeneration system.

## Two Failure Scenarios

### 1. Context Overflow (Input Too Large)

**Problem**: Input exceeds model's context window (e.g., qwen3-235B has ~32K context limit)

**Solution**: Use `emergency` phase before LLM invocation
- **Primary Model**: `x-ai/grok-4-fast` (2M tokens context)
- **Fallback Model**: `google/gemini-2.5-flash` (1M tokens context)
- **Temperature**: 0.7
- **Max Tokens**: 30,000

**When to Use**: Before LLM invocation, check input token count. If exceeding model limits, switch to emergency phase.

**Configuration** (in `langchain-models.ts`):
```typescript
emergency: {
  modelId: 'x-ai/grok-4-fast',
  temperature: 0.7,
  maxTokens: 30000,
}
```

---

### 2. Quality/Validation Failure (Normal Input Size)

**Problem**: Model generates invalid output (RT-006 validation errors, quality gate failures)

**Solution**: Use UnifiedRegenerator's 5-layer system after LLM invocation

**When to Use**: After LLM invocation, during parsing and validation phases.

---

## UnifiedRegenerator Layers

The UnifiedRegenerator provides 5 progressive repair layers, each with increasing cost and capability:

| Layer | Strategy | Cost | Success Rate | Use Case |
|-------|----------|------|--------------|----------|
| **Layer 1** | Auto-repair (jsonrepair + field-name-fix) | **FREE** | **95-98%** | Malformed JSON, camelCase→snake_case |
| **Layer 2** | Critique-revise (LLM feedback loop) | 1x cost | +2-3% | Logical errors, missing fields |
| **Layer 3** | Partial regeneration (field-level atomic repair) | 0.5x cost | +5-10% | Specific field validation failures |
| **Layer 4** | Model escalation (20B → 120B) | 6x cost | +10-15% | Complex reasoning failures |
| **Layer 5** | Quality fallback (Kimi K2) | 2x cost | +5-8% | Last resort, high quality needed |

### Layer Details

#### Layer 1: Auto-Repair (FREE, 95-98% Success)
- **jsonrepair**: Fixes malformed JSON (missing quotes, trailing commas, etc.)
- **field-name-fix**: Converts camelCase to snake_case
- **No LLM calls**: Synchronous, deterministic
- **Best for**: Syntax errors, formatting issues

#### Layer 2: Critique-Revise (1x cost, +2-3%)
- **LLM feedback loop**: Same model critiques and revises output
- **Best for**: Logical errors, incomplete fields
- **Requires**: Original prompt + error message

#### Layer 3: Partial Regeneration (0.5x cost, +5-10%)
- **Field-level repair**: Regenerates only failed fields
- **Atomic operation**: Keeps valid fields, fixes invalid ones
- **Best for**: Specific field validation failures (e.g., RT-006 enum errors)

#### Layer 4: Model Escalation (6x cost, +10-15%)
- **Larger model**: 20B → 120B (OpenAI GPT-OSS)
- **Higher capability**: Better reasoning, more reliable
- **Best for**: Complex validation failures requiring advanced reasoning

#### Layer 5: Quality Fallback (2x cost, +5-8%)
- **High-quality model**: Kimi K2 (S-TIER multilingual model)
- **Last resort**: When all other layers fail
- **NOT for context overflow**: Use `emergency` phase instead
- **Best for**: Quality failures with normal-sized input

---

## Three-Tier Validation Architecture

Our validation strategy uses three complementary tiers applied **before and around** UnifiedRegenerator:

### Tier 1: Preprocessing (FREE, instant, 60-80% success)

Zero-cost string normalization applied **BEFORE** UnifiedRegenerator:

- **Lowercase + trim whitespace**: `'Self-Assessment'` → `'self_assessment'`
- **Fix typos**: Hyphen → underscore (`'self-assessment'` → `'self_assessment'`)
- **Map synonyms**: `'analysis'` → `'case_study'`, `'practice'` → `'hands_on'`

**Cost**: FREE (string operations)
**Success rate**: 60-80% of variations fixed
**Implementation**: `src/shared/validation/preprocessing.ts`

**Usage**:
```typescript
import { preprocessObject } from '@/shared/validation/preprocessing';

// BEFORE UnifiedRegenerator
let preprocessedOutput = rawOutput;
try {
  const parsedRaw = JSON.parse(rawOutput);
  const preprocessed = preprocessObject(parsedRaw, {
    exercise_type: 'enum',
    difficulty_level: 'enum',
    primary_strategy: 'enum',
  });
  preprocessedOutput = JSON.stringify(preprocessed);
} catch (error) {
  console.warn('Preprocessing failed, using raw output:', error);
}

// Then pass to UnifiedRegenerator
const result = await regenerator.regenerate({
  rawOutput: preprocessedOutput,  // Use preprocessed output
  originalPrompt: prompt,
});
```

### Tier 2: Semantic Matching ($0.00002, 50ms, 12-15% success)

After UnifiedRegenerator exhausts all 5 layers, use embeddings to find semantically similar valid enum values:

- **Get embeddings**: OpenAI `text-embedding-3-small` model
- **Find closest match**: Cosine similarity between invalid value and all valid values
- **Accept if similarity > 0.85**: Replace with matched valid value

**Cost**: $0.00002 per validation
**Latency**: ~50ms
**Success rate**: +12-15% additional fixes
**Implementation**: `src/shared/validation/semantic-matching.ts`

**Note**: Currently implemented but NOT yet integrated into validation flow. Reserved for future Phase 2 implementation.

### Tier 3: Warning Fallback (Stage 4 only)

When all else fails for **Stage 4 advisory fields**, accept with warning:

- **Log WARNING** (not error)
- **Accept value as-is**
- **Mark**: `validated: false` in metadata
- **Continue execution** (no pipeline failure)

**Applies to**: Stage 4 ONLY (Stage 5 database fields must stay strict)

**Implementation**:
```typescript
// Stage 4: Warning fallback enabled
const regenerator = new UnifiedRegenerator<Phase1Output>({
  enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
  allowWarningFallback: true,  // Stage 4 advisory fields
  // ... other config
});

// Stage 5: NO warning fallback (strict database validation)
const regenerator = new UnifiedRegenerator<CourseStructure>({
  enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
  allowWarningFallback: false,  // Stage 5 must be strict
  // ... other config
});
```

### Validation Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. LLM generates raw JSON                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. PREPROCESSING (Tier 1 - FREE, instant)                  │
│    - Normalize: lowercase, trim whitespace                  │
│    - Fix typos: 'self-assessment' → 'self_assessment'       │
│    - Map synonyms: 'analysis' → 'case_study'                │
│    Result: 60-80% of variations fixed                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. UnifiedRegenerator.regenerate() (5 layers)              │
│    - Layer 1: Auto-repair (jsonrepair)                      │
│    - Layer 2: Critique-revise                               │
│    - Layer 3: Partial regeneration                          │
│    - Layer 4: Model escalation (20B → 120B)                 │
│    - Layer 5: Quality fallback (Kimi K2)                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. SEMANTIC MATCHING (Tier 2 - $0.00002, 50ms)             │
│    [RESERVED FOR FUTURE] Not yet integrated                 │
│    - Get embeddings for invalid value                       │
│    - Find closest valid value (cosine similarity)           │
│    - If similarity > 0.85 → replace with valid value        │
│    Result: +12-15% additional fixes                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
                    ┌─────────┐
                    │ Stage?  │
                    └─────────┘
                   /           \
              Stage 4          Stage 5
                 ↓                ↓
┌──────────────────────────┐  ┌───────────────────────┐
│ WARNING FALLBACK         │  │ THROW ERROR           │
│ (Tier 3)                 │  │ (No fallback)         │
│ - Log warning            │  │ Database integrity    │
│ - Accept as-is           │  │ must be maintained    │
│ - Mark: validated=false  │  └───────────────────────┘
└──────────────────────────┘
```

### Cost Analysis

**Current costs** (per 10,000 requests with 35% requiring retries):
- Retries: 10,000 × 0.35 × 2.35 attempts × $0.01 = $235/month
- **Annual**: $2,820

**With three-tier validation** (Tier 1 + UnifiedRegenerator + Tier 3):
- Preprocessing: FREE (85% of retries eliminated)
- UnifiedRegenerator Layers 1-5: ~103 API calls
- Warning Fallback (Stage 4): FREE (accepts remaining failures)
- **Total cost**: ~$10/month
- **Annual**: $120

**Savings**: $2,820 - $120 = **$2,700 annual savings** (96% cost reduction)

**Note**: Tier 2 (Semantic Matching) is implemented but not yet integrated. When added, it will provide an additional 12-15% success rate for $0.00002 per validation.

### Startup Configuration

Embedding cache is warmed up at server startup for optimal latency:

```typescript
// In src/server/index.ts
import { warmupEmbeddingCache } from '@/shared/validation/semantic-matching';

async function initializeServices() {
  await warmupEmbeddingCache({
    exercise_type: ['self_assessment', 'case_study', 'hands_on', 'discussion', 'quiz', 'simulation', 'reflection'],
    difficulty_level: ['beginner', 'intermediate', 'advanced'],
    cognitiveLevel: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'],
    // ... all enum fields
  });
}
```

---

## Standard Configuration

### For Stage 4 (Analysis)

All analysis phases (Phase 1-4) now use UnifiedRegenerator:

```typescript
import { UnifiedRegenerator } from '@/shared/regeneration';
import { Phase1OutputSchema } from '@megacampus/shared-types/analysis-schemas';

// Get base model (20B)
const model = await getModelForPhase('phase_1_classification');

// Invoke LLM
const response = await model.invoke(promptMessages);

// Extract core schema (without phase_metadata)
const Phase1CoreSchema = Phase1OutputSchema.omit({ phase_metadata: true });

// Setup UnifiedRegenerator with all 5 layers
const regenerator = new UnifiedRegenerator<Omit<Phase1Output, 'phase_metadata'>>({
  enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
  maxRetries: 3,
  stage: 'analyze',
  courseId,
  phaseId: 'phase_1_classification', // Update per phase
  schema: Phase1CoreSchema,
  model: model,
  metricsTracking: true,
});

// Regenerate with retry layers
const result = await regenerator.regenerate({
  rawOutput: response.content as string,
  originalPrompt: promptMessages.map(m => m.content).join('\n\n'),
});
```

**Phase-specific `phaseId` values**:
- Phase 1: `'phase_1_classification'`
- Phase 2: `'phase_2_scope'`
- Phase 3: `'phase_3_expert'`
- Phase 4: `'phase_4_synthesis'`

---

### For Stage 5 (Generation)

Both metadata and section generation use all 5 layers:

```typescript
import { UnifiedRegenerator } from '@/shared/regeneration';

// Metadata Generation
const regenerator = new UnifiedRegenerator<Partial<CourseStructure>>({
  enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
  maxRetries: 3,
  stage: 'generation',
  courseId: input.courseId,
  phaseId: 'metadata_generation',
  model: model,
  metricsTracking: true,
  qualityValidator: (data) => {
    // Stage-specific quality validation
    return isHighQuality(data);
  },
});

// Section Batch Generation
const regenerator = new UnifiedRegenerator<{ sections: Section[] } | Section | Section[]>({
  enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
  maxRetries: 3,
  stage: 'generation',
  courseId: input.courseId,
  phaseId: 'section_batch_generation',
  model: model,
  metricsTracking: true,
  qualityValidator: (data) => {
    // Validate section structure
    return validateSections(data);
  },
});
```

---

## Model Configuration

### Quality Fallback Model (Layer 5)

**Model**: `moonshotai/kimi-k2-0905`

**Why Kimi K2?**
- **S-TIER quality**: Excellent performance in LLM testing
- **Multilingual**: Strong support for Russian and English
- **Reliable structured output**: Consistent JSON generation
- **NOT for context overflow**: Use `emergency` phase (Grok/Gemini) for that

**Configuration** (in `langchain-models.ts`):
```typescript
quality_fallback: {
  modelId: 'moonshotai/kimi-k2-0905',
  temperature: 0.3,  // Lower temp for precision
  maxTokens: 16000,  // Sufficient for structured output
}
```

### Context Overflow Models (Emergency Phase)

**Primary**: `x-ai/grok-4-fast` (2M tokens)
**Fallback**: `google/gemini-2.5-flash` (1M tokens)

**When to Use**: BEFORE LLM invocation if input size exceeds model limits.

---

## Cost Analysis

### Example: 100 Failed Generations

**Without UnifiedRegenerator**:
- 100 failures → 100 manual retries → 200 API calls
- High developer time cost (manual debugging)

**With Layers 1-2 Only**:
- Layer 1 (free): 97 successes
- Layer 2 (1x cost): 2 successes
- Total: 99 successes, ~103 API calls

**With Layers 1-5 (Recommended)**:
- Layer 1 (free): 97 successes
- Layer 2 (1x cost): 2 successes
- Layer 3 (0.5x cost): 0.5 success
- Layer 4 (6x cost): 0.4 successes
- Layer 5 (2x cost): 0.1 successes
- Total: ~99.5 successes, ~120 API calls

**Savings**:
- **80 prevented failures** vs manual retry
- **~40% cost reduction** vs manual intervention
- **95%+ success rate** with automated recovery

---

## Integration Checklist

For any new LLM-based stage:

- [ ] Add UnifiedRegenerator wrapper around LLM invocation
- [ ] Configure all 5 layers (unless specific reason to exclude)
- [ ] Set `maxRetries: 3` (minimum for Layer 4 + Layer 5)
- [ ] Provide Zod schema for Layer 3 (partial regeneration)
- [ ] Implement quality validator if needed (optional but recommended)
- [ ] Enable metrics tracking (`metricsTracking: true`)
- [ ] Test with intentional failures to verify recovery
- [ ] Document layer usage in phase comments

---

## Monitoring

### Metrics to Track

Track these metrics per stage/phase:

1. **`regeneration.layer_used`**: Which layer succeeded
   - Most should be Layer 1 (95%+)
   - Layer 4-5 usage >10% indicates model quality issue

2. **`regeneration.retry_count`**: How many retries needed
   - Target: <1 average retry per generation
   - Alert if average >2 retries

3. **`regeneration.success_rate`**: Overall success rate
   - Target: 95%+ success rate
   - Alert if drops below 90%

4. **`regeneration.cost_multiplier`**: Average cost vs base case
   - Target: <1.5x average cost
   - Alert if exceeds 2.0x (too many retries)

### Alert Conditions

- ⚠️ **Layer 4 or 5 usage exceeds 10%**: Indicates primary model quality issue
- ⚠️ **Success rate drops below 95%**: Regeneration system not working effectively
- ⚠️ **Cost multiplier exceeds 2.0**: Too many retries, need model tuning
- 🔴 **Any stage consistently failing Layer 5**: Critical model configuration issue

---

## Decision Tree

```
┌─────────────────────────────────────┐
│ LLM Output Received                 │
└──────────────┬──────────────────────┘
               │
               ▼
      ┌────────────────┐
      │ Input too large? │
      └────────┬────────┘
               │
         ┌─────┴─────┐
         │           │
        YES         NO
         │           │
         ▼           ▼
    ┌─────────┐  ┌──────────────────┐
    │Emergency│  │UnifiedRegenerator│
    │ Phase   │  │ (Layers 1-5)     │
    │(Grok/   │  │                  │
    │Gemini)  │  └────────┬─────────┘
    └─────────┘           │
                          ▼
                  ┌───────────────┐
                  │Layer 1: Auto  │
                  │repair (FREE)  │
                  └───────┬───────┘
                          │
                     Success? ──YES─→ ✅
                          │
                          NO
                          ▼
                  ┌───────────────┐
                  │Layer 2:       │
                  │Critique-Revise│
                  └───────┬───────┘
                          │
                     Success? ──YES─→ ✅
                          │
                          NO
                          ▼
                  ┌───────────────┐
                  │Layer 3:       │
                  │Partial Regen  │
                  └───────┬───────┘
                          │
                     Success? ──YES─→ ✅
                          │
                          NO
                          ▼
                  ┌───────────────┐
                  │Layer 4: Model │
                  │Escalation 120B│
                  └───────┬───────┘
                          │
                     Success? ──YES─→ ✅
                          │
                          NO
                          ▼
                  ┌───────────────┐
                  │Layer 5: Kimi  │
                  │K2 Fallback    │
                  └───────┬───────┘
                          │
                     Success? ──YES─→ ✅
                          │
                          NO
                          ▼
                    ❌ Critical Failure
```

---

## References

- **Investigation**: `/docs/investigations/INV-2025-11-19-006-unified-regeneration-integration.md`
- **UnifiedRegenerator**: `/packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts`
- **Model Configuration**: `/packages/course-gen-platform/src/orchestrator/services/analysis/langchain-models.ts`
- **Layer 5 Implementation**: `/packages/course-gen-platform/src/shared/regeneration/layers/layer-5-emergency.ts`
- **Stage 4 Phases**: `/packages/course-gen-platform/src/orchestrator/services/analysis/phase-*.ts`
- **Stage 5 Services**: `/packages/course-gen-platform/src/services/stage5/`

---

**Last Updated**: 2025-11-19
**Version**: 1.0
**Status**: Production
