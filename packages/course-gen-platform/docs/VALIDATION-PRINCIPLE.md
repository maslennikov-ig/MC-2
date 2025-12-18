# Validation Schema Architectural Principle

## Core Rule

**Lower bounds (min) are CRITICAL and must block validation.**
**Upper bounds (max) are RECOMMENDATIONS and should NOT block validation.**

## Rationale

LLMs should be encouraged to provide rich, detailed, comprehensive output. We should NOT penalize or block LLM responses for being too detailed.

**Problem**: Blocking .max() constraints caused validation failures when LLMs provided thorough, high-quality responses that exceeded arbitrary character limits.

**Solution**: Remove blocking upper bounds from LLM output validation while preserving minimum quality thresholds.

## Applies To

- All phases (Phase 0-5)
- All stages
- Lesson counts
- Section counts
- Word counts
- Character counts
- Array lengths
- All LLM-generated content

## Implementation

### What to Remove

❌ **REMOVE**: `.max()` constraints on LLM output
- Text fields (progression_logic, assessment_approach, etc.)
- Array lengths (key_topics, learning_objectives, etc.)
- Lesson/section counts (total_lessons, total_sections, etc.)

### What to Keep

✅ **KEEP**: `.min()` constraints (quality gates)
- Ensures minimum detail level
- Prevents empty or inadequate responses

✅ **KEEP**: `.max()` for technical limits
- File upload sizes (infrastructure constraint)
- API rate limits (service constraint)
- Database column limits (storage constraint)
- Pagination limits (performance constraint)
- Probability/percentage bounds (0-1, 0-100)
- Pedagogical constraints (lesson_duration_minutes: max 45 per FR-014)

## Examples

### Before (Blocking)

```typescript
// ❌ OLD - blocks comprehensive output
const Phase3OutputSchema = z.object({
  pedagogical_strategy: z.object({
    progression_logic: z.string().min(100).max(500), // BLOCKS at 501 chars!
    assessment_approach: z.string().min(50).max(200), // BLOCKS at 201 chars!
  }),
  expansion_areas: z.array(
    z.object({
      specific_requirements: z.array(z.string()).min(1).max(5), // BLOCKS at 6 items!
    })
  ),
});

// Prompt warning (fear-based)
CRITICAL CHARACTER LIMITS - STRICTLY ENFORCE:
- progression_logic: MAXIMUM 500 characters (NOT 501, NOT 600!)
- All fields are validated - exceeding limits causes immediate failure
```

### After (Non-blocking)

```typescript
// ✅ NEW - encourages comprehensive output
const Phase3OutputSchema = z.object({
  pedagogical_strategy: z.object({
    progression_logic: z.string().min(100), // No max - encourage detail
    assessment_approach: z.string().min(50), // No max - encourage detail
  }),
  expansion_areas: z.array(
    z.object({
      specific_requirements: z.array(z.string()).min(1), // No max - comprehensive OK
    })
  ),
});

// Prompt guidance (encouragement-based)
NOTE ON FIELD LENGTHS:
- All string fields have minimum lengths to ensure quality
- NO upper limits - provide comprehensive, detailed responses
- Quality over brevity - thorough explanations are encouraged
```

## Technical Constraints (Keep .max())

These represent real system limitations and must remain:

```typescript
// ✅ Keep - technical/infrastructure constraints
fileSize: z.number().max(MAX_FILE_SIZE_BYTES) // Storage limit
limit: z.number().max(100) // Pagination limit
confidence: z.number().min(0).max(1) // Probability bound
information_completeness: z.number().min(0).max(100) // Percentage bound
lesson_duration_minutes: z.number().min(3).max(45) // Pedagogical constraint (FR-014)
temperature: z.number().min(0).max(2) // LLM API constraint
```

## Migration Guide

### For Schema Authors

1. **Identify constraint type**:
   - LLM output validation → Remove .max()
   - Technical constraint → Keep .max()

2. **Update schema**:
   ```typescript
   // Before
   field: z.string().min(100).max(500)

   // After
   field: z.string().min(100) // Removed .max(500) - encourage detail
   ```

3. **Add explanatory comment**:
   ```typescript
   progression_logic: z.string().min(100), // Removed .max(500) - allow detailed logic
   ```

### For Prompt Authors

1. **Remove fear-based warnings**:
   ```typescript
   // ❌ Remove
   CRITICAL CHARACTER LIMITS - STRICTLY ENFORCE:
   - field: MAXIMUM 500 characters!
   ```

2. **Add encouragement**:
   ```typescript
   // ✅ Add
   NOTE ON FIELD LENGTHS:
   - All string fields have minimum lengths to ensure quality
   - NO upper limits - provide comprehensive, detailed responses
   ```

3. **Update field descriptions**:
   ```typescript
   // Before
   progression_logic (100-500 chars): ...

   // After
   progression_logic (min 100 chars): ...
   - Provide comprehensive detail - no upper limit
   ```

## Benefits

### Quality Improvements
- LLMs can provide thorough, comprehensive responses
- No artificial truncation of valuable content
- Better pedagogical strategies with detailed explanations

### Developer Experience
- No mysterious validation failures
- Clear distinction between quality gates (min) and recommendations (max)
- Self-documenting code through comments

### System Reliability
- Fewer false failures from "too good" responses
- Validation focuses on quality (minimum detail) not brevity
- Technical constraints still enforced where needed

## Related Requirements

- **FR-014**: Lesson duration 3-45 minutes (pedagogical constraint - keep .max(45))
- **FR-015**: Minimum 10 lessons (quality gate - keep .min(10))
- **Stage 4 Analysis**: Multi-phase LLM orchestration (remove blocking .max() from all phases)

## Implementation Status

### Completed (2025-11-02)

✅ Core validation schemas updated:
- `packages/course-gen-platform/src/types/analysis-result.ts` (28 .max() removed)
- `packages/shared-types/src/analysis-schemas.ts` (13 .max() removed)
- `packages/course-gen-platform/src/orchestrator/services/analysis/phase-3-expert.ts` (4 .max() removed + prompt updated)

✅ Validation: Type-check and build passed

### Remaining Work

Files with .max() needing review (technical vs LLM output):
- `packages/course-gen-platform/src/types/analysis-job.ts` (mixed constraints)
- Other analysis service files (phase-1-classifier.ts, phase-2-scope.ts, etc.)
- tRPC router input validation
- Prompt files in other phases

## Version History

- **2025-11-02**: Initial implementation (Phase 1-3 schemas, prompt updates)
- Future: Extend to all LLM output validation across project

---

*This document represents a fundamental architectural principle for all validation in MegaCampus2.*
