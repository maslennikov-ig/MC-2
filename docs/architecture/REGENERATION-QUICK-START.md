# JSON Regeneration Quick Start

**For:** New LLM stage development (Stage 6, 7+)
**Location:** `packages/course-gen-platform/src/shared/regeneration/`
**Status:** ✅ Production (deployed in Analyze + Generation)

---

## TL;DR

Use `UnifiedRegenerator` for all LLM JSON parsing. It handles 5 progressive repair layers from free auto-repair to emergency fallback. Configure which layers based on reliability vs cost needs.

---

## 5-Layer Strategy

| Layer | Method | Success | Cost | When to Use |
|-------|--------|---------|------|-------------|
| 1 | Auto-repair (jsonrepair + field-fix) | 95-98% | FREE | Always enabled |
| 2 | Critique-revise (LLM feedback) | +70-80% | ~$0.01 | Critical stages |
| 3 | Partial regen (field-level atomic) | +60-70% | ~$0.005 | Complex schemas |
| 4 | Model escalation (20B→120B) | +50-60% | ~$0.03 | Guaranteed reliability |
| 5 | Emergency (Gemini fallback) | +40-50% | ~$0.05 | Last resort |

**Cumulative:** Layer 1 alone = 95-98% success. All 5 layers = 99.9%+ success.

---

## Quick Integration

### Step 1: Import
```typescript
import { UnifiedRegenerator } from '@/shared/regeneration';
import type { RegenerationConfig } from '@/shared/regeneration/types';
```

### Step 2: Configure
```typescript
const regenerator = new UnifiedRegenerator<YourOutputType>({
  // Choose layers (see examples below)
  enabledLayers: ['auto-repair'], // Start with Layer 1

  // Optional: Add quality validation
  qualityValidator: (data, input) => {
    // Return true if data meets quality thresholds
    return validateYourQuality(data, input);
  },

  // Optional: Provide schema for Layer 3 (partial regen)
  schema: YourZodSchema,

  // Optional: Provide model for Layers 2-5
  model: await getModelForPhase('your_phase', courseId),

  // Metadata
  maxRetries: 2,
  metricsTracking: true,
  stage: 'your-stage',
  courseId: courseId,
  phaseId: 'your_phase_id',
});
```

### Step 3: Execute
```typescript
try {
  const result = await regenerator.regenerate({
    rawOutput: llmResponse.content as string,
    originalPrompt: yourPromptText,
    parseError: error?.message, // Optional: from initial parse attempt
  });

  if (result.success && result.data) {
    // Success! Use result.data
    const validated = result.data;

    // Optional: Track which layer succeeded
    console.log(`Repaired via: ${result.metadata.layerUsed}`);
    console.log(`Attempts: ${result.metadata.retryCount}`);

    return validated;
  } else {
    // All layers exhausted
    throw new Error(`Regeneration failed: ${result.error}`);
  }
} catch (error) {
  // Handle failure
}
```

---

## Configuration Examples

### Example 1: Cost-Optimized (Generation)
**Use case:** High volume, quality-validated elsewhere, cost-sensitive

```typescript
const regenerator = new UnifiedRegenerator<CourseMetadata>({
  enabledLayers: ['auto-repair'], // Layer 1 only = FREE
  maxRetries: 2,
  qualityValidator: (data, input) => {
    const quality = validateMetadataQuality(data, input);
    return quality.completeness >= 0.85 && quality.coherence >= 0.90;
  },
  metricsTracking: true,
  stage: 'generation',
  courseId: input.course_id,
  phaseId: 'metadata_generator',
});
```

**Cost:** $0 per course
**Success:** 95-98%
**Example:** `packages/course-gen-platform/src/services/stage5/metadata-generator.ts:169-225`

---

### Example 2: Maximum Reliability (Analyze)
**Use case:** Critical infrastructure, must never fail, cost acceptable

```typescript
const regenerator = new UnifiedRegenerator<Phase2Output>({
  enabledLayers: [
    'auto-repair',      // Layer 1: FREE (95-98%)
    'critique-revise',  // Layer 2: ~$0.01 (+70-80%)
    'partial-regen',    // Layer 3: ~$0.005 (+60-70%)
    'model-escalation', // Layer 4: ~$0.03 (+50-60%)
    'emergency'         // Layer 5: ~$0.05 (+40-50%)
  ],
  maxRetries: 2,
  schema: Phase2OutputSchema, // Required for Layer 3
  model: model,               // Required for Layers 2-5
  metricsTracking: true,
  stage: 'analyze',
  courseId: validatedInput.course_id,
  phaseId: 'phase_2_scope',
});
```

**Cost:** $0.01-0.05 per course
**Success:** 99.9%+
**Example:** `packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts:100-142`

---

### Example 3: Balanced (Lesson - Recommended for Stage 6)
**Use case:** Moderate reliability needs, reasonable cost

```typescript
const regenerator = new UnifiedRegenerator<LessonContent>({
  enabledLayers: [
    'auto-repair',      // Layer 1: FREE (95-98%)
    'critique-revise',  // Layer 2: ~$0.01 (+70-80%)
  ],
  maxRetries: 2,
  model: model,
  metricsTracking: true,
  stage: 'lesson',
  courseId: input.course_id,
  phaseId: 'lesson_generator',
});
```

**Cost:** $0.005-0.015 per lesson
**Success:** 98.4-99.4%
**Recommended for:** Stage 6 (Lesson), Stage 7 (Quiz)

---

## Layer Details

### Layer 1: Auto-Repair (Always Use)
**File:** `packages/course-gen-platform/src/shared/regeneration/layers/layer-1-auto-repair.ts`

**What it does:**
- Uses `jsonrepair` library (FSM-based parser, handles malformed JSON)
- Fixes field names: `camelCase` → `snake_case`
- Zero token cost (local processing)

**When it fails:**
- Severely malformed JSON (missing brackets, broken structure)
- Non-JSON response from LLM
- Field validation failures (schema mismatch)

---

### Layer 2: Critique-Revise (Critical Stages)
**File:** `packages/course-gen-platform/src/shared/regeneration/layers/layer-2-critique-revise.ts`

**What it does:**
- Shows LLM its failed output + parse error
- Asks LLM to generate valid JSON
- Uses LangChain `PromptTemplate` + chain pattern
- Up to N retries (configurable)

**Requirements:**
- `model` parameter (ChatOpenAI instance)
- `originalPrompt` (to provide context)

**When to use:**
- Critical stages where Layer 1 failures are unacceptable
- Stages with complex JSON schemas
- Stages where 95-98% success is insufficient

---

### Layer 3: Partial Regeneration (Complex Schemas)
**File:** `packages/course-gen-platform/src/shared/regeneration/layers/layer-3-partial-regen.ts`

**What it does:**
- Uses Zod `safeParse()` to identify failed fields
- Regenerates ONLY failed fields (preserves successful ones)
- Merges results and validates
- Atomic field-level repair (cost-optimized)

**Requirements:**
- `schema` parameter (Zod schema)
- `model` parameter (ChatOpenAI instance)
- `originalPrompt` (to provide context)

**When to use:**
- Stages with large, complex schemas (>10 fields)
- When partial success is common (some fields valid, some invalid)
- Cost-optimization for retry scenarios

---

### Layer 4: Model Escalation (Guaranteed Success)
**File:** `packages/course-gen-platform/src/shared/regeneration/layers/layer-4-model-escalation.ts`

**What it does:**
- Escalates from 20B → 120B model
- Configurable escalation chains
- Tracks which model succeeded

**Requirements:**
- `model` parameter (ChatOpenAI instance)
- `originalPrompt` (to provide context)
- `courseId` (for model selection)

**When to use:**
- Critical infrastructure where failure is not an option
- After Layers 1-3 have failed
- Budget allows for occasional escalation

---

### Layer 5: Emergency Fallback (Last Resort)
**File:** `packages/course-gen-platform/src/shared/regeneration/layers/layer-5-emergency.ts`

**What it does:**
- Invokes Gemini 2.5 Flash (highest context, most reliable)
- Last resort for all-layer failures
- Configurable emergency model

**Requirements:**
- `originalPrompt` (to provide context)
- `courseId` (for model selection)

**When to use:**
- Only for Analyze stage (critical infrastructure)
- Never for cost-sensitive stages (Generation, Lesson)

---

## Migration Pattern

### Before (Manual Retry Loop)
```typescript
let retryCount = 0;
while (retryCount <= maxRetries) {
  try {
    const parsed = JSON.parse(rawOutput);
    const validated = YourSchema.parse(parsed);
    return validated;
  } catch (error) {
    retryCount++;
    if (retryCount > maxRetries) {
      throw new Error('Max retries exceeded');
    }
    // Manual repair logic...
  }
}
```

### After (UnifiedRegenerator)
```typescript
const regenerator = new UnifiedRegenerator<YourType>({
  enabledLayers: ['auto-repair'], // Or more layers
  maxRetries: 2,
  metricsTracking: true,
  stage: 'your-stage',
  courseId: courseId,
});

const result = await regenerator.regenerate({
  rawOutput,
  originalPrompt,
});

if (result.success) {
  return result.data;
} else {
  throw new Error(result.error);
}
```

**Code reduction:** 40-60% fewer lines, unified error handling, comprehensive metrics.

---

## Decision Matrix

| Stage | Reliability Need | Cost Tolerance | Recommended Layers | Expected Cost |
|-------|-----------------|----------------|-------------------|---------------|
| **Analyze** | Critical (99.9%+) | High | All 5 layers | $0.01-0.05/course |
| **Generation** | High (95-98%) | Low | Layer 1 only | $0/course |
| **Lesson** | High (98-99%) | Medium | Layers 1-2 | $0.005-0.015/lesson |
| **Quiz** | High (98-99%) | Medium | Layers 1-2 | $0.005-0.015/quiz |

---

## Type Definitions

```typescript
// Config
interface RegenerationConfig<T> {
  enabledLayers: Array<'auto-repair' | 'critique-revise' | 'partial-regen' | 'model-escalation' | 'emergency'>;
  maxRetries?: number;
  qualityValidator?: (data: T, input: RegenerationInput) => boolean;
  schema?: z.ZodSchema<T>;
  model?: ChatOpenAI;
  metricsTracking?: boolean;
  stage?: string;
  courseId?: string;
  phaseId?: string;
}

// Input
interface RegenerationInput {
  rawOutput: string;
  originalPrompt: string;
  parseError?: string;
}

// Result
interface RegenerationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata: {
    layerUsed: 'auto-repair' | 'critique-revise' | 'partial-regen' | 'model-escalation' | 'emergency' | 'failed';
    retryCount: number;
    modelsUsed?: string[];
    successfulFields?: string[];
    regeneratedFields?: string[];
  };
}
```

---

## Files Reference

**Core Implementation:**
- `packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts` - Main orchestrator
- `packages/course-gen-platform/src/shared/regeneration/types.ts` - Type definitions
- `packages/course-gen-platform/src/shared/regeneration/index.ts` - Public exports

**Layers:**
- `packages/course-gen-platform/src/shared/regeneration/layers/layer-1-auto-repair.ts`
- `packages/course-gen-platform/src/shared/regeneration/layers/layer-2-critique-revise.ts`
- `packages/course-gen-platform/src/shared/regeneration/layers/layer-3-partial-regen.ts`
- `packages/course-gen-platform/src/shared/regeneration/layers/layer-4-model-escalation.ts`
- `packages/course-gen-platform/src/shared/regeneration/layers/layer-5-emergency.ts`

**Production Examples:**
- Analyze: `packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts:100-142`
- Generation: `packages/course-gen-platform/src/services/stage5/metadata-generator.ts:169-225`

**Tests:**
- `packages/course-gen-platform/tests/integration/unified-regeneration.test.ts` - 16 integration tests

**Full Documentation:**
- `docs/architecture/UNIFIED-REGENERATION-SYSTEM-PRODUCTION.md` - Comprehensive guide (Russian)

---

## Common Pitfalls

❌ **Don't:** Skip Layer 1 (always include `'auto-repair'`)
✅ **Do:** Start with Layer 1, add more as needed

❌ **Don't:** Enable all 5 layers for cost-sensitive stages
✅ **Do:** Choose layers based on cost/reliability trade-off

❌ **Don't:** Forget to provide `schema` when using Layer 3
✅ **Do:** Always provide Zod schema for partial regeneration

❌ **Don't:** Forget to provide `model` when using Layers 2-5
✅ **Do:** Always provide ChatOpenAI instance for LLM layers

❌ **Don't:** Hardcode layer configuration
✅ **Do:** Make layers configurable per environment/stage

---

## Metrics Tracking

When `metricsTracking: true`, logs structured data:

```json
{
  "stage": "analyze",
  "courseId": "uuid",
  "phaseId": "phase_2_scope",
  "layerUsed": "auto-repair",
  "retryCount": 0,
  "modelsUsed": ["openai/gpt-oss-20b"],
  "successfulFields": ["field1", "field2"],
  "regeneratedFields": []
}
```

**Future:** Integration with `system_metrics` table (A30 task).

---

## Next Steps for Stage 6

1. **Copy Example 3** (Balanced config) as starting point
2. **Define Zod schema** for lesson output
3. **Test with Layer 1 only** - measure success rate
4. **Add Layer 2 if needed** - if success < 98%
5. **Monitor costs** - track token usage per lesson
6. **Iterate** - adjust layers based on production data

**Estimated effort:** 30-60 minutes for basic integration.

---

**Document Version:** 1.0
**Last Updated:** 2025-11-10
**Token Count:** ~1200 tokens (optimized for context efficiency)
