# INV-2025-11-24-001: Stage 5 Alignment Validation Failure for Multilingual Content

---
investigation_id: INV-2025-11-24-001
status: RESOLVED
timestamp: 2025-11-24T13:00:00Z
resolved_at: 2025-11-24T14:15:00Z
priority: HIGH
related_course: 6a71b727-73a8-43b3-8218-133d4fa026fa
---

## Executive Summary

**Problem**: E2E test fails at Stage 5 (Structure Generation) with "Generation failed: Unknown error". All 3+ models fail quality validation despite generating valid JSON output.

**Root Cause**: The `validateMetadataQuality()` method contains a hardcoded title substring check that assumes the generated title will contain the input title. This assumption is INVALID for multilingual content generation where input title is English but output is Russian.

**Recommended Solution**: Make the title alignment check language-aware by skipping it when target language is not English.

**Key Findings**:
1. Title check at lines 614-622 applies -0.3 penalty when Russian title doesn't contain English substring
2. Difficulty mismatch check at lines 629-635 applies additional -0.2 penalty
3. Combined penalties drop alignment from 1.0 to 0.5, far below the 0.85 threshold
4. Model parameter fix and quality logging already applied, but alignment logic is the actual blocker

---

## Problem Statement

### Observed Behavior
- E2E test completes Stages 1-4 successfully
- Stage 5 fails with error: "Generation failed: Unknown error"
- All 5 UnifiedRegenerator layers exhaust without success
- Quality validation returns false for all model outputs

### Expected Behavior
- Stage 5 should generate valid course metadata
- Quality validation should pass for legitimate multilingual content
- Russian titles should not be penalized for not containing English test title

### Impact
- E2E test cannot complete
- Production course generation for Russian content may fail
- All 3+ models marked as failing despite generating valid output

### Environment
- Branch: 010-stages-456-pipeline
- E2E test title: "E2E Test Course - 2025-11-24T12:46"
- Target language: Russian (ru)
- Course ID: 6a71b727-73a8-43b3-8218-133d4fa026fa

---

## Investigation Process

### Hypotheses Tested

| # | Hypothesis | Evidence | Result |
|---|------------|----------|--------|
| 1 | Missing `model` parameter in UnifiedRegenerator | Line 229 shows `model: model` already present | REJECTED |
| 2 | Quality logging not enabled | Lines 213-221 show logging already implemented | REJECTED |
| 3 | Alignment title check too strict for multilingual | Lines 614-622 show substring check fails for Russian | CONFIRMED |
| 4 | Difficulty mismatch adds additional penalty | Lines 629-635 apply -0.2 for difficulty mismatch | CONFIRMED |
| 5 | Thresholds too high | 0.85 alignment threshold cannot be met with -0.3 + -0.2 penalties | CONFIRMED |

### Files Examined

1. `/home/me/code/megacampus2/packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts`
   - Lines 51-61: Quality thresholds (0.85 alignment)
   - Lines 199-230: UnifiedRegenerator configuration (model parameter present)
   - Lines 213-221: Quality logging (already implemented)
   - Lines 500-646: validateMetadataQuality() method
   - Lines 614-622: Title substring check (ROOT CAUSE)
   - Lines 629-635: Difficulty mismatch check (contributing factor)

2. `/home/me/code/megacampus2/.tmp/current/TASK-FIX-STAGE5-METADATA-QUALITY.md`
   - Identified suspected root cause correctly
   - Suggested lowering thresholds as one option

3. `/home/me/code/megacampus2/docs/investigations/INV-2025-11-19-006-stage5-quality-validation-failure.md`
   - Previous investigation focused on semantic similarity (Jina-v3)
   - Different issue - that was about section content quality
   - This investigation focuses on metadata alignment validation

4. `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts`
   - Confirmed UnifiedRegenerator architecture
   - Verified model parameter is used for Layers 2-3

### Commands Executed

1. Grep for quality validation patterns
2. Read investigation reports
3. Sequential thinking analysis (5 steps)

---

## Root Cause Analysis

### Primary Cause: Hardcoded Title Substring Check

**Location**: `metadata-generator.ts:614-622`

```typescript
// Check title matches
if (
  metadata.course_title &&
  input.frontend_parameters.course_title &&
  !metadata.course_title.toLowerCase().includes(
    input.frontend_parameters.course_title.toLowerCase().substring(0, 10)
  )
) {
  alignmentScore -= 0.3;  // <-- PROBLEM: -0.3 penalty
}
```

**Why This Fails**:

| Step | Value |
|------|-------|
| Input title | "E2E Test Course - 2025-11-24T12:46" |
| First 10 chars (lowercase) | "e2e test c" |
| Target language | Russian ("ru") |
| Generated title | "Полный курс по продажам образовательных мероприятий" |
| Substring check | "полный курс..." does NOT contain "e2e test c" |
| Result | alignmentScore -= 0.3 |

**The check assumes the LLM will preserve English title fragments even when generating in Russian, which is incorrect.**

### Contributing Factor: Difficulty Mismatch Check

**Location**: `metadata-generator.ts:629-635`

```typescript
if (
  analysisDifficulty &&
  metadata.difficulty_level &&
  analysisDifficulty !== metadata.difficulty_level
) {
  alignmentScore -= 0.2;  // <-- Additional penalty
}
```

**Combined Impact**:
- Starting alignment: 1.0
- Title mismatch: -0.3 (CERTAIN for Russian)
- Difficulty mismatch: -0.2 (POSSIBLE)
- Final alignment: 0.5 to 0.7

**Threshold**: 0.85

**Result**: ALWAYS FAILS for Russian content (0.5-0.7 < 0.85)

### Mechanism of Failure

```
1. E2E test creates course with:
   - Title: "E2E Test Course - 2025-11-24T12:46" (English)
   - Language: "ru" (Russian)

2. Stage 5 MetadataGenerator:
   - Extracts language = "ru"
   - Builds prompt instructing LLM to generate in Russian
   - LLM generates Russian title: "Полный курс по продажам..."

3. validateMetadataQuality() runs:
   - Title check: "Полный курс..." does NOT contain "e2e test c" → -0.3
   - Difficulty check: May mismatch → -0.2
   - Final alignment: 0.5

4. qualityValidator in UnifiedRegenerator:
   - Checks: alignment >= 0.85
   - Result: 0.5 < 0.85 → FAIL

5. All 5 layers fail quality validation → "All regeneration layers exhausted"
```

---

## Proposed Solutions

### Solution 1: Language-Aware Title Check (RECOMMENDED)

**Description**: Skip or weaken the title substring check when target language is not English.

**Implementation Steps**:

1. Modify `validateMetadataQuality()` to accept language parameter:

```typescript
private validateMetadataQuality(
  metadata: Partial<CourseStructure>,
  input: GenerationJobInput,
  language: string = 'en'  // ADD language parameter
): QualityMetrics {
```

2. Make title check language-aware (lines 614-622):

```typescript
// Check title matches - ONLY for English content
// For multilingual, the LLM legitimately generates localized titles
if (
  language === 'en' &&  // ADD language check
  metadata.course_title &&
  input.frontend_parameters.course_title &&
  !metadata.course_title.toLowerCase().includes(
    input.frontend_parameters.course_title.toLowerCase().substring(0, 10)
  )
) {
  alignmentScore -= 0.3;
}
```

3. Update caller to pass language:

```typescript
const quality = this.validateMetadataQuality(metadataFields, input, language);
```

**Pros**:
- Fixes the root cause
- No impact on English content validation
- Semantically correct for multilingual generation

**Cons**:
- Requires signature change
- Need to update both call sites (lines 205 and 305)

**Complexity**: Low
**Risk**: Low
**Estimated Effort**: 15 minutes

---

### Solution 2: Lower Alignment Threshold

**Description**: Reduce alignment threshold from 0.85 to 0.70.

**Implementation Steps**:

1. Modify `QUALITY_THRESHOLDS` (lines 51-61):

```typescript
const QUALITY_THRESHOLDS = {
  critical: {
    completeness: 0.85,
    coherence: 0.90,
    alignment: 0.70,  // Changed from 0.85
  },
  // ...
};
```

**Pros**:
- Simple one-line change
- Provides buffer for edge cases

**Cons**:
- May allow lower quality content to pass
- Doesn't fix the underlying logic issue
- Band-aid solution

**Complexity**: Low
**Risk**: Medium (quality degradation)
**Estimated Effort**: 2 minutes

---

### Solution 3: Remove Title Penalty Entirely

**Description**: Remove the title substring check and rely on other alignment factors.

**Implementation Steps**:

1. Comment out or remove lines 614-622:

```typescript
// Title check removed - LLM may legitimately generate localized titles
// Alignment now based on difficulty and other factors only
```

**Pros**:
- Simplest fix
- Title matching is low-value for course quality

**Cons**:
- Loses title alignment check for English content
- May miss actual title-related issues

**Complexity**: Low
**Risk**: Low-Medium
**Estimated Effort**: 2 minutes

---

## Implementation Guidance

### Priority
**Solution 1 (Language-Aware)** is the recommended approach.

### Files to Change

| File | Change |
|------|--------|
| `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts` | Modify `validateMetadataQuality()` signature and add language check |

### Specific Code Locations

1. **Line 205** (qualityValidator call inside UnifiedRegenerator config):
   ```typescript
   const quality = this.validateMetadataQuality(metadataFields, input);
   ```
   Change to:
   ```typescript
   const quality = this.validateMetadataQuality(metadataFields, input, language);
   ```
   Note: `language` is already available in scope from line 155.

2. **Line 305** (post-regeneration quality check):
   ```typescript
   const quality = this.validateMetadataQuality(metadataFields, input);
   ```
   Change to:
   ```typescript
   const quality = this.validateMetadataQuality(metadataFields, input, language);
   ```

3. **Line 500** (method signature):
   ```typescript
   private validateMetadataQuality(
     metadata: Partial<CourseStructure>,
     input: GenerationJobInput
   ): QualityMetrics {
   ```
   Change to:
   ```typescript
   private validateMetadataQuality(
     metadata: Partial<CourseStructure>,
     input: GenerationJobInput,
     language: string = 'en'
   ): QualityMetrics {
   ```

4. **Lines 614-622** (title check):
   Add language guard:
   ```typescript
   // Check title matches - only for English content
   if (
     language === 'en' &&
     metadata.course_title &&
     input.frontend_parameters.course_title &&
     !metadata.course_title.toLowerCase().includes(
       input.frontend_parameters.course_title.toLowerCase().substring(0, 10)
     )
   ) {
     alignmentScore -= 0.3;
   }
   ```

### Validation Criteria

1. Type-check passes: `pnpm -F course-gen-platform exec tsc --noEmit`
2. E2E test passes Stage 5
3. Quality logging shows alignment >= 0.85 for Russian content
4. English content still validates title correctly

### Testing Requirements

1. Run E2E test with Russian language course
2. Verify quality logs show:
   - completeness >= 0.85
   - coherence >= 0.90
   - alignment >= 0.85 (no longer penalized for Russian title)
3. Run E2E test with English language course to confirm no regression

---

## Risks and Considerations

### Implementation Risks
- **Low**: Simple conditional logic change
- **No breaking changes**: Default parameter maintains backward compatibility

### Performance Impact
- **None**: Single string comparison added

### Breaking Changes
- **None**: English content validation unchanged

### Side Effects
- Russian, Chinese, Japanese, and other non-English content will no longer be penalized for localized titles
- This is the INTENDED behavior

---

## Documentation References

### Tier 0: Project Internal

**Task Document**:
- `/home/me/code/megacampus2/.tmp/current/TASK-FIX-STAGE5-METADATA-QUALITY.md`
- Correctly identified the title check as suspected root cause
- Suggested lowering thresholds as fallback option

**Previous Investigation**:
- `docs/investigations/INV-2025-11-19-006-stage5-quality-validation-failure.md`
- Focused on semantic similarity (Jina-v3) for sections
- Different issue than this metadata alignment validation

**Related Investigation**:
- `docs/investigations/INV-2025-11-19-006-unified-regeneration-integration.md`
- Documents UnifiedRegenerator architecture
- Confirms model parameter requirement for Layers 2-3

### Tier 1: Context7 MCP

Not queried - issue is project-specific validation logic, not framework-related.

### Tier 2/3: External Documentation

Not needed - root cause identified from internal code analysis.

---

## MCP Server Usage

| Tool | Purpose | Result |
|------|---------|--------|
| Sequential Thinking | Multi-step root cause analysis | Confirmed alignment validation as root cause |
| Supabase (get_logs) | Check edge function logs | Only cleanup-old-drafts logs found |

---

## Next Steps

### For Orchestrator/User
1. Review this investigation report
2. Implement Solution 1 (language-aware title check)
3. Run type-check to verify no compilation errors
4. Re-run E2E test to confirm fix

### Follow-up Recommendations
1. Consider adding integration test for Russian language course generation
2. Review other alignment checks for multilingual compatibility
3. Consider adding language parameter to quality logging for debugging

---

## Investigation Log

### Timeline

| Time | Action |
|------|--------|
| T+0 | Received task specification |
| T+2 | Read metadata-generator.ts (710 lines) |
| T+3 | Read task document TASK-FIX-STAGE5-METADATA-QUALITY.md |
| T+4 | Read investigation reports INV-2025-11-19-006-* |
| T+5 | Read unified-regenerator.ts (654 lines) |
| T+8 | Ran Sequential Thinking analysis (5 steps) |
| T+10 | Root cause confirmed: title substring check |
| T+12 | Generated investigation report |

### Commands Run

1. `mkdir -p docs/investigations` - Create investigations directory
2. Grep for quality validation patterns - Found title check code
3. Supabase get_logs - Retrieved edge function logs (not relevant)

### MCP Calls Made

1. `mcp__sequential-thinking__sequentialthinking` (5 calls) - Root cause analysis
2. `mcp__supabase__get_logs` (1 call) - Log retrieval

---

## Report Summary

| Field | Value |
|-------|-------|
| Investigation ID | INV-2025-11-24-001 |
| Topic | Stage 5 Alignment Validation Multilingual Failure |
| Duration | ~15 minutes |
| Root Cause | Title substring check fails for non-English content |
| Evidence Collected | 4 files examined, 5 hypotheses tested |
| Recommended Solution | Solution 1: Language-aware title check |
| Complexity | Low |
| Risk | Low |
| Estimated Effort | 15 minutes |

---

**Status: RESOLVED**

---

## Resolution

### Implemented Fixes

**Fix 1: Language-aware title alignment check** (Solution 1 from above)
- Modified `validateMetadataQuality()` in `metadata-generator.ts`
- Added `language: string = 'en'` parameter
- Added guard `language === 'en' &&` to title substring check
- Title check now only applies to English content

**Fix 2: Remove NOTE from placeholder patterns** (Additional fix discovered during testing)
- Modified `generation-result.ts` (shared-types) and `placeholder-validator.ts` (course-gen-platform)
- Removed `NOTE` from regex pattern `/\b(TODO|FIXME|XXX|HACK|NOTE|@todo)\b/i`
- `NOTE` is a legitimate word in educational content ("Note: важная информация")

### Verification

E2E test passed all 6 stages after fixes:
```
✅ Stage 1: Document Upload: success (5.5s)
✅ Stage 2: Document Processing: success (32.8s)
✅ Stage 3: Summarization: success (5.7s)
✅ Stage 4: Analysis: success (135.4s)
✅ Stage 5: Structure Generation: success (155.0s)
✅ Stage 6: Lesson Content Generation: success (228.5s)
📊 Total Duration: 564.1s
```

### Files Modified

| File | Change |
|------|--------|
| `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts` | Language parameter + guard for title check |
| `packages/shared-types/src/generation-result.ts` | Removed NOTE from placeholder patterns |
| `packages/course-gen-platform/src/stages/stage5-generation/validators/placeholder-validator.ts` | Removed NOTE from placeholder patterns |
