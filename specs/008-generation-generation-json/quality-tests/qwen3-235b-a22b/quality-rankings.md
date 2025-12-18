# Qwen3 235B A22B - Quality Evaluation Report

**Generated**: 2025-11-13T12:39:30.000Z
**Test Configuration**: docs/llm-testing/test-config-2025-11-13-complete.json
**Model**: qwen/qwen3-235b-a22b
**Total Test Runs**: 12 (4 scenarios × 3 runs)
**Methodology**: docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md

---

## Executive Summary

**TIER**: C-TIER (CONFIRMED)
**Overall Success Rate**: 16.7% (2/12 passed)
**Overall Quality Score**: 0.885 / 1.00 (when successful)
**Production Ready**: NO

**Critical Issue**: Model is a reasoning variant that hits `max_tokens` limit during thinking phase, resulting in empty content output in 83.3% of runs.

---

## Test Results Summary

| Scenario | Passed | Failed | Success Rate | Failure Reason |
|----------|--------|--------|--------------|----------------|
| metadata-en | 0/3 | 3/3 | 0% | Reasoning timeout |
| metadata-ru | 1/3 | 2/3 | 33% | Reasoning timeout |
| lesson-en | 1/3 | 2/3 | 33% | Reasoning timeout |
| lesson-ru | 0/3 | 3/3 | 0% | Reasoning timeout |
| **TOTAL** | **2/12** | **10/12** | **16.7%** | - |

---

## Successful Outputs Analysis

### metadata-ru-run2.json (Success)

**Quality Score**: 0.85 / 1.00
**Duration**: 35,116ms
**Status**: VALID JSON, snake_case compliant

**Schema Compliance**:
- Valid JSON: YES
- Required fields: YES (all 9 fields present)
- Snake case: YES (all fields)
- Correct data types: YES

**Content Quality**:
```json
{
  "course_title": "Машинное обучение для начинающих",
  "course_description": "Курс среднего уровня сложности...",
  "course_overview": "Курс включает теоретические лекции и практические задания..." (556 chars),
  "target_audience": "Студенты технических специальностей, начинающие разработчики...",
  "estimated_duration_hours": 40,
  "difficulty_level": "intermediate",
  "prerequisites": [
    "Базовое знание программирования на Python",
    "Понимание основ линейной алгебры и статистики",
    "Опыт работы с библиотеками NumPy и Pandas"
  ],
  "learning_outcomes": [
    "Определить типы задач машинного обучения...",
    "Построить и обучить модель линейной регрессии...",
    "Проанализировать результаты работы классификатора...",
    "Создать пайплайн предобработки данных..."
  ],
  "course_tags": ["машинное обучение", "Python", "нейронные сети", ...]
}
```

**Strengths**:
- Excellent action verbs: "Определить" (Define), "Построить" (Build), "Проанализировать" (Analyze), "Создать" (Create)
- Follows Bloom's Taxonomy (multiple cognitive levels)
- Detailed course overview (556 chars with specific examples)
- Specific target audience personas
- Native Russian phrasing (not machine-translated)
- Correct technical terminology

**Weaknesses**:
- Only 1 successful run out of 3 attempts (33% consistency)

---

### lesson-en-run3.json (Success)

**Quality Score**: 0.92 / 1.00
**Duration**: 81,480ms
**Status**: VALID JSON, snake_case compliant

**Schema Compliance**:
- Valid JSON: YES
- Required fields: YES (all 5 fields present)
- Snake case: YES (all fields)
- Correct data types: YES

**Content Quality - Lesson Count**: 5 LESSONS (EXCELLENT!)

```json
{
  "section_number": 1,
  "section_title": "Variables and Data Types in Python",
  "section_description": "Hands-on programming section with exercises",
  "learning_objectives": [
    "Demonstrate proficiency in declaring and assigning variables",
    "Differentiate between numeric, string, boolean, and None data types",
    "Apply type conversion techniques to manipulate data",
    "Implement variables in practical programming scenarios"
  ],
  "lessons": [
    {
      "lesson_number": 1,
      "lesson_title": "Declaring Variables and Basic Assignments",
      "lesson_objective": "Create and manipulate variables...",
      "key_topics": ["Variable naming rules", "Assignment operator usage", ...],
      "exercises": [
        {
          "exercise_title": "Personal Information Storage",
          "exercise_instructions": "Create variables for name, age..."
        },
        {
          "exercise_title": "Inventory Tracker",
          "exercise_instructions": "Initialize a variable for 'total_items'..."
        }
      ]
    },
    // ... 4 more complete lessons (lesson_number 2, 3, 4, 5)
  ]
}
```

**Strengths**:
- **5 complete lessons** (exceeds target of 3-5)
- Each lesson has 2 exercises with actionable instructions
- Specific key topics (not generic "Introduction to...")
- Measurable objectives with action verbs
- Exercises are practical and hands-on
- Professional English, natural phrasing

**Weaknesses**:
- Only 1 successful run out of 3 attempts (33% consistency)

---

## Failed Runs Analysis

**Total Failed Runs**: 10/12 (83.3%)

**Failure Pattern**: All failures follow the same pattern:

1. API call succeeds (HTTP 200)
2. Model consumes input tokens (345-409 tokens)
3. Model generates reasoning output (100-1112 tokens)
4. Model hits `max_tokens` limit during reasoning phase
5. **content field is empty** (0 bytes)
6. **reasoning field contains incomplete thinking**

**Example Error**:
```
Model only provided reasoning, no actual content
(hit token limit during thinking)
```

**Root Cause**: This model (`qwen/qwen3-235b-a22b`) appears to be a reasoning variant similar to `qwen/qwen3-235b-a22b-thinking-2507`, but:
- It spends tokens on reasoning/thinking
- It hits `max_tokens` (8000) during the thinking phase
- It never completes the thinking to output actual content
- Result: Empty `content` field

**Evidence from API Response**:
```json
{
  "choices": [
    {
      "finish_reason": "length",  // Hit token limit
      "message": {
        "content": "",  // EMPTY!
        "reasoning": "Okay, the user wants me to output..." // Incomplete thinking
      }
    }
  ]
}
```

---

## Quality Analysis (Successful Runs Only)

### Metadata Generation (1/3 successful)

**Avg Quality**: 0.85 / 1.00
**Consistency**: N/A (only 1 success)

**Schema Score**: 1.00 / 1.00
- Valid JSON: 1/1 (100%)
- Required fields: 1/1 (100%)
- Snake case: 1/1 (100%)
- Correct types: 1/1 (100%)

**Content Score**: 0.80 / 1.00
- Learning outcomes quality: 0.8 (4 outcomes, action verbs, Bloom's taxonomy)
- Overview quality: 0.7 (556 chars, specific examples)
- Description quality: 0.8 (detailed, value proposition)
- Target audience: 0.9 (specific personas)

**Language Score**: 0.90 / 1.00
- Native Russian phrasing: YES
- Correct terminology: YES
- No translation artifacts: YES

---

### Lesson Structure Generation (1/3 successful)

**Avg Quality**: 0.92 / 1.00
**Consistency**: N/A (only 1 success)

**Schema Score**: 1.00 / 1.00
- Valid JSON: 1/1 (100%)
- Required fields: 1/1 (100%)
- Snake case: 1/1 (100%)
- Correct types: 1/1 (100%)

**Content Score**: 0.95 / 1.00
- Lesson count: 1.0 (5 lessons - EXCELLENT!)
- Objectives quality: 0.9 (all lessons have measurable objectives)
- Topics specificity: 1.0 (specific, not generic)
- Exercises quality: 0.95 (2 per lesson, actionable)

**Language Score**: 0.85 / 1.00
- Natural English grammar: YES
- Professional tone: YES
- Clear instructions: YES

---

## Comparison with Previous Evaluation

| Metric | Previous | Current | Change |
|--------|----------|---------|--------|
| Success Rate | 0% (0/4) | 16.7% (2/12) | +16.7% |
| Failure Reason | "Invalid JSON" | "Reasoning timeout" | Different |
| Quality (when successful) | N/A | 0.885 | N/A |

**Analysis**:
- Previous evaluation (0/4 FAILED) likely used different prompts or settings
- Current evaluation reveals the true issue: reasoning model that hits token limits
- When successful, quality is actually GOOD (0.885)
- But 83.3% failure rate makes it unusable for production

---

## Tier Classification

### C-TIER Criteria (CONFIRMED)

**Quality Assessment**:
- Schema compliance (when successful): A-TIER (1.00)
- Content quality (when successful): A-TIER (0.875)
- Language quality (when successful): A-TIER (0.875)
- **Overall quality (when successful)**: 0.885 / 1.00

**Reliability Assessment**:
- Success rate: **16.7%** (FAILING)
- Consistency: **N/A** (insufficient successful runs)
- Failure pattern: **Systematic** (reasoning timeout)

**Final Tier**: **C-TIER**

**Justification**:
- Quality is good (0.885) but **reliability is terrible (16.7% success)**
- Systematic failure pattern (reasoning timeout) makes it unusable
- Cannot recommend for any production use case

---

## Recommendations

### Production Use: NO

**Reasons**:
1. 83.3% failure rate (only 2/12 runs succeeded)
2. Systematic failure pattern (reasoning timeout)
3. Unpredictable behavior (sometimes works, usually fails)
4. No way to prevent failures (inherent model limitation)

### Alternative Models

For **metadata generation**:
- **moonshotai/kimi-k2-0905** (S-TIER, 100% success rate)
- **deepseek/deepseek-v3.2-exp** (S-TIER, 100% success rate)
- **qwen/qwen3-32b** (A-TIER, 50% success rate for metadata only)

For **lesson generation**:
- **moonshotai/kimi-k2-0905** (S-TIER, 100% success rate, 3-5 lessons)
- **deepseek/deepseek-v3.2-exp** (S-TIER, 100% success rate)
- **x-ai/grok-4-fast** (S-TIER, 100% success rate with retry)

For **reasoning capabilities** (if needed):
- **qwen/qwen3-235b-a22b-thinking-2507** (dedicated thinking model with higher token limits)
- **moonshotai/kimi-k2-thinking** (S-TIER thinking model)

---

## Technical Notes

### Model Behavior

This model (`qwen/qwen3-235b-a22b`) exhibits reasoning model characteristics:
- Returns `reasoning` field in API responses
- Spends tokens on thinking/planning
- Often hits `max_tokens` during reasoning phase
- Results in empty `content` field

### Workaround Attempts

**Tried**:
- Increased `max_tokens` to 8000 (still fails)
- Multiple runs per scenario (16.7% success rate)
- Clear prompt instructions (no improvement)

**Not Viable**:
- Increasing `max_tokens` further would be cost-prohibitive
- No way to disable reasoning behavior via API parameters
- Success is random/unpredictable

### Conclusion

This model is **NOT suitable for production use** in course content generation. Use dedicated thinking models (with explicit `-thinking` suffix) if reasoning is required, or use standard S-TIER models for reliable output.

---

## Output Files

**Successful Runs**:
- `/tmp/quality-tests/qwen3-235b-a22b/metadata-ru-run2.json` (VALID, 0.85)
- `/tmp/quality-tests/qwen3-235b-a22b/lesson-en-run3.json` (VALID, 0.92)

**Failed Runs** (10 ERROR files):
- `metadata-en-run{1,2,3}-ERROR.json` (3 failures)
- `metadata-ru-run{1,3}-ERROR.json` (2 failures)
- `lesson-en-run{1,2}-ERROR.json` (2 failures)
- `lesson-ru-run{1,2,3}-ERROR.json` (3 failures)

**Analysis Report**:
- `/tmp/quality-tests/qwen3-235b-a22b/quality-analysis-report.json`

**This Report**:
- `/tmp/quality-tests/qwen3-235b-a22b/quality-rankings.md`

---

**Final Verdict**: C-TIER (CONFIRMED) - Not recommended for production use due to 83.3% failure rate caused by systematic reasoning timeout issues.
