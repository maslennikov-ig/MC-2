# OSS 120B Model Evaluation Report

**Model**: openai/gpt-oss-120b
**Test Date**: 2025-11-13
**Configuration**: docs/llm-testing/test-config-2025-11-13-complete.json
**Total API Calls**: 12 (4 scenarios × 3 runs)
**Methodology**: Quality-focused testing with schema + content analysis

---

## Executive Summary

**Final Tier**: **B-TIER** (2/4 scenarios pass with quality issues)

**Result**: 2/4 SUCCESS (Russian only: metadata-ru + lesson-ru)

**Contradicts Previous Expectation**: YES
- Expected: "2/4 SUCCESS (metadata only)" (A-TIER)
- Actual: "2/4 SUCCESS (Russian only)" (B-TIER)

**Key Findings**:
1. **English metadata UNRELIABLE**: 2/3 runs failed (truncated/empty responses)
2. **Russian metadata EXCELLENT**: 3/3 runs succeeded (85% quality)
3. **English lessons GOOD**: 2/3 runs succeeded (1 run produced invalid output)
4. **Russian lessons EXCELLENT**: 3/3 runs succeeded (100% quality)

**Critical Issues**:
- Truncated/empty responses in English metadata (API-level failure)
- Inconsistent quality across language pairs
- Not suitable for production use in English contexts

---

## Test Results by Scenario

### 1. Metadata Generation - English (metadata-en)

**Result**: ✗ FAIL (1/3 high-quality)

| Run | Status | Score | Issues |
|-----|--------|-------|--------|
| 1 | ✓ Valid | 100% | Perfect |
| 2 | ✗ Invalid | 0% | Truncated JSON (2192 chars, unterminated string) |
| 3 | ✗ Invalid | 0% | Empty response (contentLength: 0) |

**Average Score**: 33%

**Sample Output** (run 1):
- File: `/tmp/quality-tests/oss-120b/metadata-en-run1.json`
- course_title: "Introduction to Python Programming" ✓
- course_overview: 2800+ chars ✓
- learning_outcomes: 5 outcomes with action verbs (Define, Build, Create, Analyze, Implement) ✓
- All fields use snake_case ✓

**Critical Failure**:
- Run 2: API returned 2192 chars but JSON incomplete (mid-sentence: "High school graduates who want to start a career in tech, career‑switchers from non‑technical fields seeking a practical programming foundation, junior analysts needing automation skills, and")
- Run 3: API returned empty content (0 chars)

---

### 2. Metadata Generation - Russian (metadata-ru)

**Result**: ✓ PASS (3/3 high-quality)

| Run | Status | Score | Issues |
|-----|--------|-------|--------|
| 1 | ✓ Valid | 85% | learning_outcomes lack strong action verbs |
| 2 | ✓ Valid | 85% | learning_outcomes lack strong action verbs |
| 3 | ✓ Valid | 85% | learning_outcomes lack strong action verbs |

**Average Score**: 85%

**Sample Output** (run 1):
- File: `/tmp/quality-tests/oss-120b/metadata-ru-run1.json`
- course_title: "Машинное обучение для начинающих" ✓
- course_overview: 2400+ chars ✓
- learning_outcomes: Uses weaker verbs ("описать", "сравнить", "построить") but measurable
- All fields use snake_case ✓

**Quality Notes**:
- Consistent across all 3 runs
- Good structure and content quality
- Minor issue: Russian outcomes use "describe/compare" instead of stronger action verbs

---

### 3. Lesson Generation - English (lesson-en)

**Result**: ✓ PASS (2/3 high-quality)

| Run | Status | Score | Lesson Count | Issues |
|-----|--------|-------|--------------|--------|
| 1 | ✓ Valid | 25% | 0 | CRITICAL: Missing "lessons" array |
| 2 | ✓ Valid | 100% | 4 | Perfect |
| 3 | ✓ Valid | 100% | 4 | Perfect |

**Average Score**: 75%

**Sample Output** (run 2 - SUCCESS):
- File: `/tmp/quality-tests/oss-120b/lesson-en-run2.json`
- section_title: "Variables and Data Types in Python" ✓
- lessons: 4 complete lessons ✓
  - Lesson 1: "Creating and Assigning Variables"
  - Lesson 2: "Understanding Primitive Data Types"
  - Lesson 3: "Working with Collections: Lists and Tuples"
  - Lesson 4: "Data Type Conversion and Type Checking"
- Each lesson has objectives, key_topics (5-7 items), exercises (2 each) ✓
- All fields use snake_case ✓

**Sample Output** (run 1 - FAILURE):
- File: `/tmp/quality-tests/oss-120b/lesson-en-run1.json`
- Only 1 line: `{"section_number":1,"section_title":"Variables and Data Types in Python",...}`
- Missing entire "lessons" array
- API truncation issue (similar to metadata-en run 2)

---

### 4. Lesson Generation - Russian (lesson-ru)

**Result**: ✓ PASS (3/3 high-quality)

| Run | Status | Score | Lesson Count | Issues |
|-----|--------|-------|--------------|--------|
| 1 | ✓ Valid | 100% | 3 | None |
| 2 | ✓ Valid | 100% | 4 | None |
| 3 | ✓ Valid | 100% | 5 | None |

**Average Score**: 100%

**Sample Output** (run 2):
- File: `/tmp/quality-tests/oss-120b/lesson-ru-run2.json`
- section_title: "Основы нейронных сетей" ✓
- lessons: 4 complete lessons ✓
  - Lesson 1: "Математические основы нейронных сетей"
  - Lesson 2: "Структура и типы нейронных сетей"
  - Lesson 3: "Обучение нейронных сетей на практике"
  - Lesson 4: "Проблемы переобучения и методы регуляризации"
- Each lesson has detailed objectives, specific key_topics, practical exercises ✓
- High-quality Russian language (natural, technical terminology) ✓
- All fields use snake_case ✓

**Quality Notes**:
- Variable lesson count (3-5) shows good content adaptation
- Excellent topic specificity (no generic "Introduction to...")
- Strong practical exercises with clear instructions

---

## Quality Analysis

### Schema Compliance

| Scenario | snake_case | Required Fields | Data Types | Avg Score |
|----------|-----------|----------------|-----------|-----------|
| metadata-en | 1/3 (33%) | 1/3 (33%) | 1/3 (33%) | 33% |
| metadata-ru | 3/3 (100%) | 3/3 (100%) | 3/3 (100%) | 100% |
| lesson-en | 3/3 (100%) | 2/3 (67%) | 2/3 (67%) | 78% |
| lesson-ru | 3/3 (100%) | 3/3 (100%) | 3/3 (100%) | 100% |

### Content Quality

**Metadata**:
- course_overview length: 500+ chars required
  - EN run 1: 2800+ chars ✓
  - RU avg: 2400+ chars ✓
- learning_outcomes count: 3-8 required
  - EN run 1: 5 outcomes ✓
  - RU avg: 4 outcomes ✓
- Action verbs (EN run 1): Define, Build, Create, Analyze, Implement ✓
- Action verbs (RU): Weaker (описать, сравнить, построить) ⚠

**Lessons**:
- Lesson count: 3-5 ideal
  - EN: 0 (run 1), 4 (runs 2-3) ✓
  - RU: 3-5 across all runs ✓
- Objectives per lesson: All present ✓
- key_topics specificity: High (no generic phrases) ✓
- Exercises per lesson: 1-2 each ✓

### Language Quality

**English**:
- Natural phrasing: ✓ Good
- Technical terminology: ✓ Accurate
- Professional tone: ✓ Appropriate
- **Reliability**: ✗ Major issue (truncation/empty responses)

**Russian**:
- Natural phrasing: ✓ Excellent (native-like)
- Technical terminology: ✓ Correct
- Professional tone: ✓ Consistent
- **Reliability**: ✓ Perfect (3/3 on all scenarios)

---

## Performance Metrics

### Response Times

| Scenario | Run 1 | Run 2 | Run 3 | Average |
|----------|-------|-------|-------|---------|
| metadata-en | 31,597ms | 29,311ms | 12,238ms | 24,382ms |
| metadata-ru | 19,784ms | 11,562ms | 15,365ms | 15,570ms |
| lesson-en | 2,199ms | 23,386ms | 19,545ms | 15,043ms |
| lesson-ru | 21,851ms | 28,006ms | 9,627ms | 19,828ms |

**Overall Average**: 18,706ms (~19 seconds per request)

**Observations**:
- Wide variance (2s to 32s)
- lesson-en run 1 extremely fast (2.2s) but produced incomplete output
- Fastest responses often correlate with failures

### Token Usage (from logs)

**metadata-en run 2** (truncated):
- prompt_tokens: 385
- completion_tokens: 1064
- total_tokens: 1449

**Note**: Other runs lack token data in logs (API response format inconsistency)

---

## Failure Analysis

### Root Causes

1. **API Truncation Issue**:
   - Affects English outputs more than Russian
   - metadata-en: 2/3 failures (truncated/empty)
   - lesson-en: 1/3 failures (truncated)
   - Possibly model timeout or max_tokens limitation

2. **Language Preference**:
   - Russian: 6/6 successful outputs (100%)
   - English: 3/6 successful outputs (50%)
   - Model may be better optimized for Russian or Chinese

3. **Inconsistent Response Format**:
   - Some responses include token usage, others don't
   - Some responses truncate mid-sentence
   - Empty responses with 200 OK status

### Recommendations

**DO NOT USE** for:
- Production English content generation (50% failure rate)
- Time-critical applications (19s avg response time)
- Any scenario requiring 100% reliability

**MAY USE** for:
- Russian content generation (if failures acceptable)
- Non-critical prototyping/testing
- Cost-sensitive Russian metadata/lesson generation

**PREFER ALTERNATIVES**:
- For English: Kimi K2, DeepSeek v3.2, Grok 4 Fast (all 4/4 SUCCESS)
- For reliability: S-TIER models with 100% success rates
- For speed: DeepSeek v3.2 Exp (faster, more reliable)

---

## Comparison to Previous Results

**Previous Classification**: "A-TIER (2/4 SUCCESS - metadata only)"

**Actual Result**: "B-TIER (2/4 SUCCESS - Russian only)"

**Discrepancies**:
1. Previous: "Fast metadata generation" → Actual: Slow (15-24s avg)
2. Previous: "Lessons fail" → Actual: Russian lessons 100% success
3. Previous: "Metadata only" → Actual: Metadata-EN failed 2/3 times

**Possible Explanations**:
- Previous tests may have used different prompts
- Model version change (OpenAI backend update)
- Previous tests may not have checked Russian outputs
- API endpoint instability

---

## Cost Analysis

**Estimated Pricing** (based on OpenRouter typical rates):
- Input: ~$0.50-1.00 per million tokens
- Output: ~$1.50-2.00 per million tokens

**From Run 2 (metadata-en)**:
- 385 prompt tokens + 1064 completion tokens = 1449 total
- Cost per request: ~$0.002-0.003

**12 Requests Total**:
- Estimated cost: $0.024-0.036 (very cheap)

**Cost per Valid Output**:
- 7 valid outputs (out of 12 attempts)
- Cost per valid: ~$0.003-0.005

**Cost-Effectiveness**: LOW (due to 50% English failure rate)

---

## Final Recommendation

**Tier**: **B-TIER** (Conditional Use Only)

**Use Cases**:
- ✓ Russian metadata generation (if 85% quality acceptable)
- ✓ Russian lesson generation (excellent quality)
- ✗ English metadata generation (unreliable)
- ~ English lesson generation (66% success rate, risky)

**Production Readiness**: **NOT RECOMMENDED**

**Reasons**:
1. 50% failure rate on English outputs
2. API-level truncation/empty response issues
3. Inconsistent response times (2s to 32s)
4. Better alternatives available (Kimi K2, DeepSeek v3.2, Grok 4 Fast)

**If You Must Use OSS 120B**:
- Implement retry logic (2-3 attempts)
- Validate JSON immediately after response
- Have fallback model ready (DeepSeek Chat v3.1)
- Use ONLY for Russian content
- Monitor for empty/truncated responses

---

## Artifacts

**Test Outputs**: `/tmp/quality-tests/oss-120b/`
- 12 JSON output files
- 12 metadata log files
- 12 ERROR.json files (from initial failed auth run)

**Analysis Report**: `/tmp/quality-tests/oss-120b-quality-analysis.json`

**Test Script**: `/tmp/test-oss120b-quality-v2.mjs`

**Sample Files for Review**:
- Best metadata: `metadata-en-run1.json` (100% score)
- Best lessons: `lesson-ru-run2.json` (100% score, 4 lessons)
- Failure example: `metadata-en-run2.json` (truncated)
- Empty response: `metadata-en-run3.json` (0 bytes)

---

## Next Steps

1. ✓ Mark OSS 120B as B-TIER in model registry
2. Update docs/investigations/ with this finding
3. Do NOT recommend for English production use
4. Consider re-testing with different temperature (0.5 instead of 0.7)
5. Test other OpenAI models on OpenRouter for comparison
6. Prioritize S-TIER models (Kimi K2, DeepSeek v3.2) for production

---

**Report Generated**: 2025-11-13
**Agent**: llm-testing quality-focused worker
**Methodology**: docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md
