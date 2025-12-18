# Unified Regeneration System

**Version**: MVP (A31)
**Status**: ✅ Implemented
**Location**: `packages/course-gen-platform/src/shared/regeneration/`

---

## Executive Summary

The Unified Regeneration System provides a single, reusable JSON repair utility for all LLM-based stages (Analyze, Generation, Lesson, etc.). It combines best practices from existing implementations into a configurable, layered approach.

**Current Implementation (MVP)**:
- ✅ Layer 1: Auto-repair (jsonrepair + field-name-fix) - 95-98% success, FREE
- ✅ Quality validation hooks
- ✅ Metrics tracking (console logging, future: Supabase)
- ✅ Configurable per-stage
- ✅ Type-safe TypeScript implementation

**Future Expansion (A31 Phase 2)**:
- ⏳ Layer 2: Critique-revise (LLM feedback loop)
- ⏳ Layer 3: Partial regeneration (field-level atomic repair)
- ⏳ Layer 4: Model escalation (20B → 120B → qwen3-max)
- ⏳ Layer 5: Emergency fallback (Gemini/Claude)

---

## Architecture

### Layer Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                    Unified Regenerator                        │
│                                                                │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Layer 1: Auto-Repair (FREE)                          │     │
│  │ - jsonrepair library (95-98% success)                │     │
│  │ - field-name-fix (camelCase → snake_case)            │     │
│  │ - Cost: $0                                            │     │
│  └─────────────────────────────────────────────────────┘     │
│                          ↓ (if failure)                       │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Layer 2: Critique-Revise (FUTURE)                    │     │
│  │ - LLM critique → revise pattern                       │     │
│  │ - 70-80% of remaining failures                        │     │
│  │ - Cost: ~2-4K tokens                                  │     │
│  └─────────────────────────────────────────────────────┘     │
│                          ↓ (if failure)                       │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Layer 3: Partial Regeneration (FUTURE)               │     │
│  │ - Field-level atomic repair                           │     │
│  │ - 60-70% of remaining failures                        │     │
│  │ - Cost: ~1-2K tokens (optimized)                      │     │
│  └─────────────────────────────────────────────────────┘     │
│                          ↓ (if failure)                       │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Layer 4: Model Escalation (FUTURE)                   │     │
│  │ - Escalate to more capable model                      │     │
│  │ - 50-60% of remaining failures                        │     │
│  │ - Cost: ~5-10K tokens                                 │     │
│  └─────────────────────────────────────────────────────┘     │
│                          ↓ (if failure)                       │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ Layer 5: Emergency Fallback (FUTURE)                 │     │
│  │ - Emergency model (Gemini/Claude)                     │     │
│  │ - 40-50% of remaining failures                        │     │
│  │ - Cost: ~5-15K tokens (last resort)                   │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### Configuration by Stage

| Stage | Enabled Layers | Success Rate | Token Cost | Use Case |
|-------|----------------|--------------|------------|----------|
| **Generation** (MVP) | Layer 1 only | 97-98% | ~0 tokens | Cost-optimized, high volume |
| **Analyze** (Future) | Layers 1-5 | 99.5% | ~0-40K tokens | Maximum reliability, lower volume |
| **Lesson** (Future) | Layers 1-2 | 98-99% | ~0-4K tokens | Balanced approach |

---

## Usage

### Basic Example (Generation Stage)

```typescript
import { UnifiedRegenerator } from '@/shared/regeneration';

// Create regenerator with auto-repair only
const regenerator = new UnifiedRegenerator({
  enabledLayers: ['auto-repair'],
  maxRetries: 2,
  metricsTracking: true,
  stage: 'generation',
  courseId: 'uuid',
});

// Regenerate malformed JSON
const result = await regenerator.regenerate({
  rawOutput: malformedJSON,
  originalPrompt: prompt,
  parseError: error.message,
});

if (result.success) {
  console.log('Repaired:', result.data);
  console.log('Layer used:', result.metadata.layerUsed); // 'auto-repair'
  console.log('Token cost:', result.metadata.tokenCost); // 0
} else {
  console.error('Failed:', result.error);
}
```

### With Quality Validation

```typescript
import { UnifiedRegenerator, createQualityValidator } from '@/shared/regeneration';

const regenerator = new UnifiedRegenerator({
  enabledLayers: ['auto-repair'],
  maxRetries: 2,
  qualityValidator: (data, input) => {
    // Custom validation logic
    const hasRequiredFields = data.course_title && data.course_description;
    const meetsLengthRequirements = data.course_description.length >= 50;
    return hasRequiredFields && meetsLengthRequirements;
  },
  metricsTracking: true,
  stage: 'generation',
});

const result = await regenerator.regenerate({
  rawOutput: malformedJSON,
  originalPrompt: prompt,
});

if (result.success && result.metadata.qualityPassed) {
  // Quality validation passed
  console.log('High-quality data:', result.data);
}
```

### Simplified Quality Validator

```typescript
import { createQualityValidator } from '@/shared/regeneration';

const regenerator = new UnifiedRegenerator({
  enabledLayers: ['auto-repair'],
  qualityValidator: createQualityValidator({
    completeness: 0.85, // 85% of expected fields present
  }),
  metricsTracking: true,
  stage: 'generation',
});
```

---

## Migration Guide

### Migrating metadata-generator.ts

See `packages/course-gen-platform/src/services/stage5/metadata-generator-unified.example.ts` for complete migration example.

**Before** (original implementation):
```typescript
const extracted = extractJSON(rawContent);
const parsed = safeJSONParse(extracted);
const fixed = fixFieldNames<Partial<CourseStructure>>(parsed);

const quality = this.validateMetadataQuality(fixed, input);

if (quality.completeness >= 0.85 && quality.coherence >= 0.90) {
  // Success
  return { metadata: fixed, quality, ... };
} else {
  // Retry
  retryCount++;
}
```

**After** (unified regeneration):
```typescript
const regenerator = new UnifiedRegenerator<Partial<CourseStructure>>({
  enabledLayers: ['auto-repair'],
  maxRetries: 2,
  qualityValidator: (data) => {
    const quality = this.validateMetadataQuality(data, input);
    return quality.completeness >= 0.85 && quality.coherence >= 0.90;
  },
  metricsTracking: true,
  stage: 'generation',
  courseId: input.course_id,
});

const result = await regenerator.regenerate({
  rawOutput: rawContent,
  originalPrompt: prompt,
});

if (result.success) {
  return { metadata: result.data, ... };
}
```

**Benefits**:
- ✅ Less code (regenerator handles retry logic)
- ✅ Unified metrics tracking
- ✅ Consistent behavior across stages
- ✅ Easy to add future layers

---

## API Reference

### UnifiedRegenerator Class

```typescript
class UnifiedRegenerator<T = any> {
  constructor(config: RegenerationConfig);
  regenerate(input: RegenerationInput): Promise<RegenerationResult<T>>;
}
```

### RegenerationConfig

```typescript
interface RegenerationConfig {
  enabledLayers: RegenerationLayer[];    // ['auto-repair'] for MVP
  maxRetries?: number;                   // Default: 1
  qualityValidator?: QualityValidator;   // Optional quality check
  metricsTracking: boolean;              // Enable metrics logging
  stage: RegenerationStage;              // 'analyze' | 'generation' | 'lesson' | 'other'
  courseId?: string;                     // For metrics tracking
  phaseId?: string;                      // For metrics tracking
}
```

### RegenerationResult

```typescript
interface RegenerationResult<T = any> {
  success: boolean;
  data?: T;
  metadata: {
    layerUsed: string;         // 'auto-repair' | 'failed'
    tokenCost: number;         // 0 for auto-repair
    retryCount: number;        // Number of attempts
    qualityPassed?: boolean;   // If quality validator was used
  };
  error?: string;
}
```

### QualityValidator Type

```typescript
type QualityValidator<T = any> = (
  data: T,
  input: RegenerationInput
) => boolean | Promise<boolean>;
```

---

## Metrics Tracking

The UnifiedRegenerator logs structured metrics for observability:

```typescript
{
  type: 'regeneration_metrics',
  stage: 'generation',
  phaseId: 'metadata_generator',
  courseId: 'uuid',
  layerUsed: 'auto-repair',
  success: true,
  tokenCost: 0,
  retryCount: 1,
  qualityPassed: true,
  level: 'info'
}
```

**Future Integration**: Metrics will be written to `system_metrics` table (A30 observability).

---

## Future Roadmap

### Phase 2: Advanced Layers (A31-PHASE-2)

1. **Layer 2: Critique-Revise**
   - LLM-based feedback loop
   - Success rate: 70-80% of remaining failures
   - Cost: ~2-4K tokens per attempt

2. **Layer 3: Partial Regeneration**
   - Field-level atomic repair
   - Success rate: 60-70% of remaining failures
   - Cost: ~1-2K tokens (optimized)

3. **Layer 4: Model Escalation**
   - Escalate to more capable models
   - Success rate: 50-60% of remaining failures
   - Cost: ~5-10K tokens

4. **Layer 5: Emergency Fallback**
   - Emergency models (Gemini/Claude)
   - Success rate: 40-50% of remaining failures
   - Cost: ~5-15K tokens (last resort)

### Phase 3: Supabase Integration

- Write metrics to `system_metrics` table
- Dashboard for regeneration success rates
- Cost tracking per stage/course

### Phase 4: Analyze Stage Migration

- Migrate Analyze stage to use UnifiedRegenerator
- Enable all 5 layers for maximum reliability
- Maintain 99.5% success rate

---

## Testing

### Unit Tests

```typescript
import { UnifiedRegenerator } from '@/shared/regeneration';

describe('UnifiedRegenerator', () => {
  it('should parse valid JSON without repair', async () => {
    const regenerator = new UnifiedRegenerator({
      enabledLayers: ['auto-repair'],
      metricsTracking: false,
      stage: 'generation',
    });

    const result = await regenerator.regenerate({
      rawOutput: '{"key": "value"}',
      originalPrompt: 'Test',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ key: 'value' });
    expect(result.metadata.layerUsed).toBe('auto-repair');
    expect(result.metadata.tokenCost).toBe(0);
  });

  it('should repair malformed JSON', async () => {
    const regenerator = new UnifiedRegenerator({
      enabledLayers: ['auto-repair'],
      metricsTracking: false,
      stage: 'generation',
    });

    const result = await regenerator.regenerate({
      rawOutput: '{"key": "value"', // Missing closing brace
      originalPrompt: 'Test',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ key: 'value' });
  });

  it('should validate quality if validator provided', async () => {
    const regenerator = new UnifiedRegenerator({
      enabledLayers: ['auto-repair'],
      qualityValidator: (data) => data.required_field !== undefined,
      maxRetries: 2,
      metricsTracking: false,
      stage: 'generation',
    });

    const result = await regenerator.regenerate({
      rawOutput: '{"optional_field": "value"}', // Missing required_field
      originalPrompt: 'Test',
    });

    expect(result.success).toBe(false); // Quality check failed
  });
});
```

---

## FAQ

### Q: Why only Layer 1 in MVP?

**A**: Layer 1 (auto-repair) handles 95-98% of cases at zero cost. Layers 2-5 require LLM calls and are reserved for future iterations when needed.

### Q: Can I enable multiple layers?

**A**: MVP implementation only supports Layer 1. Layers 2-5 will be added in A31 Phase 2.

### Q: How do I add custom quality validation?

**A**: Pass a `qualityValidator` function to `RegenerationConfig`:

```typescript
qualityValidator: (data, input) => {
  return data.required_field !== undefined;
}
```

### Q: What's the performance impact?

**A**: Zero. The UnifiedRegenerator uses the same underlying utilities (safeJSONParse, fixFieldNames) as the original implementation.

### Q: When should I use this vs manual parsing?

**A**: Use UnifiedRegenerator for:
- New stages (Lesson, Quiz, etc.)
- Consistent metrics tracking
- Quality validation requirements
- Future layer expansion

Continue using manual parsing for:
- Simple one-off parsing
- Legacy code (until migrated)

---

## References

- **Plan**: `.tmp/current/plans/.a31-unified-regeneration-plan.json`
- **Implementation**: `packages/course-gen-platform/src/shared/regeneration/`
- **Example**: `packages/course-gen-platform/src/services/stage5/metadata-generator-unified.example.ts`
- **Research**: `specs/008-generation-generation-json/research-decisions/rt-005-pragmatic-hybrid-implementation-prompt.md`

---

**Last Updated**: 2025-11-10
**Status**: ✅ MVP Complete | ⏳ Phase 2 Pending
