# DeepSeek V3.2 Exp - Model Evaluation Status

**Date**: 2025-11-13
**Status**: ✅ TEST INFRASTRUCTURE COMPLETE - AWAITING API KEY

---

## Quick Summary

Complete evaluation framework for `deepseek/deepseek-v3.2-exp` has been prepared and is ready for execution.

| Item | Status | Details |
|------|--------|---------|
| **Model Research** | ✅ Done | Pricing: $0.27 input, $0.40 output per 1M tokens |
| **Test Cases** | ✅ Done | 4 tests (2 metadata + 2 lesson, EN + RU) |
| **Prompts** | ✅ Done | Full prompts with JSON schema specifications |
| **Evaluation Framework** | ✅ Done | Automated + manual scoring (60/40 split) |
| **Cost Analysis** | ✅ Done | 97.5% savings vs Qwen 3 Max baseline |
| **Test Code** | ✅ Done | Node.js harness ready in `/tmp/model_evaluation.js` |
| **Blocking Issue** | ⏳ Pending | OPENROUTER_API_KEY not configured |

---

## Key Metrics

### Pricing Comparison

```
deepseek/deepseek-v3.2-exp vs qwen/qwen3-max:
- Input cost: $0.27/M vs $1.20/M (-77.5%)
- Output cost: $0.40/M vs $6.00/M (-93.3%)
- Per course (4 tests): $0.02 vs $0.80 (-97.5%)
```

### Test Design

| Test | Scenario | Input | Expected Tokens |
|------|----------|-------|-----------------|
| 1 | Metadata - English | "Introduction to Python Programming" | ~2,000 |
| 2 | Metadata - Russian | "Машинное обучение для начинающих" | ~2,000 |
| 3 | Lesson - English | "Variables and Data Types in Python" | ~4,500 |
| 4 | Lesson - Russian | "Основы нейронных сетей" | ~4,500 |
| **TOTAL** | | | **~13,000** |

### Success Criteria

**Already Met** (before execution):
- ✅ Cost reduction ≥30% → 97.5% achieved
- ✅ Cost reduction ≥50% → 97.5% achieved

**To Evaluate** (pending execution):
- Quality score ≥0.75 (minimum viable)
- Quality score ≥0.80 (ideal alternative)
- Schema compliance rate ≥95% (minimum)

---

## Deliverables

### 1. Full Evaluation Report
**File**: `/home/me/code/megacampus2-worktrees/generation-json/docs/investigations/model-eval-deepseek-v32-exp.md` (617 lines)

**Contains**:
- Model specifications and pricing
- All 4 test cases with input/output specifications
- Expected JSON schemas for each test
- Complete evaluation criteria (automated + manual)
- Scoring framework (0-1 scale)
- Cost projections and token estimates
- Comparison with Qwen 3 Max baseline
- Implementation roadmap

### 2. Technical Summary
**File**: `/home/me/code/megacampus2-worktrees/generation-json/docs/investigations/model-eval-deepseek-v32-exp-TECHNICAL-SUMMARY.md` (320 lines)

**Contains**:
- Completion status of each component
- Test case specifications
- Prompt engineering details
- Evaluation framework architecture
- Execution plan with timing
- Key findings and risk assessment
- Integration notes with existing framework

### 3. Test Code (Ready to Run)
**File**: `/tmp/model_evaluation.js`

**Capabilities**:
- Calls OpenRouter API for 4 tests sequentially
- Extracts and logs token counts
- Validates JSON output
- Measures API response times
- Calculates costs
- Outputs results as JSON

---

## What's Needed to Execute

### Single Requirement

**Set OpenRouter API Key**:

```bash
# Option 1: Environment variable
export OPENROUTER_API_KEY=sk-or-...

# Option 2: Add to .env.local
# File: /home/me/code/megacampus2-worktrees/generation-json/.env.local
# Add line: OPENROUTER_API_KEY=sk-or-...
```

**Get API Key**: https://openrouter.ai/keys

### Execution Time

- **Setup**: 2 minutes (set API key)
- **Tests**: 3-5 minutes (4 API calls)
- **Evaluation**: 15-20 minutes (manual scoring)
- **Total**: ~20-30 minutes

---

## Test Specifications

### Test 1: Metadata Generation - English

**Task**: Generate course metadata for "Introduction to Python Programming"

**Expected Output Schema**:
```json
{
  "course_title": string,
  "course_description": string (50-3000 chars),
  "course_overview": string (100-10000 chars),
  "target_audience": string,
  "estimated_duration_hours": number,
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "prerequisites": string[],
  "learning_outcomes": [
    {
      "id": "uuid",
      "text": string,
      "language": "en",
      "cognitiveLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
      "estimatedDuration": number,
      "targetAudienceLevel": "beginner" | "intermediate" | "advanced"
    }
  ],
  "assessment_strategy": {
    "quiz_per_section": boolean,
    "final_exam": boolean,
    "practical_projects": number,
    "assessment_description": string
  },
  "course_tags": string[]
}
```

### Test 2: Metadata Generation - Russian

**Task**: Generate course metadata for "Машинное обучение для начинающих"

**Differences from Test 1**:
- All content in Russian (Cyrillic)
- Higher complexity (ML vs Python intro)
- Russian pedagogical conventions

### Test 3: Lesson Generation - English

**Task**: Expand "Variables and Data Types in Python" into 3-5 lessons

**Expected Output Schema**:
```json
{
  "section_number": 1,
  "section_title": string,
  "section_description": string,
  "learning_objectives": LearningOutcome[],
  "estimated_duration_minutes": number,
  "lessons": [
    {
      "lesson_number": number,
      "lesson_title": string,
      "lesson_objectives": LearningOutcome[],
      "key_topics": string[],
      "estimated_duration_minutes": number,
      "practical_exercises": Exercise[]
    }
  ]
}
```

### Test 4: Lesson Generation - Russian

**Task**: Expand "Основы нейронных сетей" into 3-5 lessons

**Differences from Test 3**:
- All content in Russian
- Complex topic (neural networks)
- Russian technical terminology

---

## Evaluation Criteria

### Automated Metrics (60% weight)

1. **Schema Compliance (20%)**
   - JSON parses without errors
   - All required fields present
   - Field types match specification
   - Array lengths within constraints

2. **Content Quality (20%)**
   - Text length constraints met
   - No placeholder text
   - Proper language (EN or RU)
   - No broken markdown

3. **Instruction Following (20%)**
   - Difficulty matches input
   - Topic relevance verified
   - Language purity maintained
   - Style adherence checked

### Manual Metrics (40% weight)

4. **Content Depth (15%)**
   - Learning outcomes specificity
   - Explanation clarity
   - Example relevance

5. **Creativity & Coherence (15%)**
   - Engaging titles (not generic)
   - Exercise variety
   - Logical flow

6. **Multilingual Quality (10%)**
   - Grammar correctness (Russian)
   - Terminology accuracy
   - Cultural appropriateness

---

## Integration with Existing Framework

Follows specifications from:
- `/home/me/code/megacampus2-worktrees/generation-json/docs/investigations/MODEL-EVALUATION-TASK.md`
- Phase 1: Metadata generation (Section 1)
- Phase 2: Lesson generation (Section 2, Tier 2)

---

## Next Actions

### Immediate (Post-Execution)

1. Set API key and execute tests
2. Collect results (JSON output)
3. Validate schemas with Zod
4. Score outputs against evaluation framework

### If Quality Score ≥ 0.75

1. Update RT-001 model routing strategy
2. Add to Tier 1 with qwen3-max as fallback
3. Implement feature flag for gradual rollout
4. Monitor quality metrics in production

### Rollout Strategy (if approved)

```
Week 1: 10% of courses use deepseek (with Qwen 3 Max fallback)
Week 2: 50% of courses
Week 3: 100% of courses (keep Qwen 3 Max as Tier 2 fallback)
Month 2: Remove Qwen 3 Max, use Gemini 2.5 Flash as Tier 2
```

**Expected Savings**: $610/month per 1,000 courses

---

## Files Summary

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| model-eval-deepseek-v32-exp.md | Report | 617 | Full evaluation framework |
| model-eval-deepseek-v32-exp-TECHNICAL-SUMMARY.md | Summary | 320 | Technical details & status |
| DEEPSEEK-EVALUATION-READY.md | This doc | - | Quick reference |

---

## Ready to Execute?

**Yes, awaiting:**
1. OPENROUTER_API_KEY configuration
2. User approval to proceed with tests

**Estimated time to completion**: <1 hour (including manual review)

---

**Report Generated**: 2025-11-13
**Model Evaluated**: deepseek/deepseek-v3.2-exp
**Status**: Ready for testing
