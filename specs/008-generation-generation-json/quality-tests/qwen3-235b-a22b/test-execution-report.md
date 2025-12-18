# Test Execution Report: Qwen3 235B A22B Quality Evaluation

**Agent**: LLM Model Quality Testing Agent
**Date**: 2025-11-13
**Duration**: ~10 minutes (test execution) + ~5 minutes (analysis)
**Model Tested**: qwen/qwen3-235b-a22b
**Status**: COMPLETE

---

## 1. Executive Summary

Executed quality-focused testing for **qwen/qwen3-235b-a22b** model with 3 runs per scenario across 4 test scenarios (12 API calls total).

**Key Findings**:
- **Success Rate**: 16.7% (2/12 runs passed)
- **Quality Score**: 0.885 / 1.00 (when successful)
- **Tier**: C-TIER (CONFIRMED)
- **Production Ready**: NO
- **Critical Issue**: Reasoning model that hits token limit during thinking phase, resulting in 83.3% failure rate

**Previous Expectation**: 0/4 FAILED (all tests failed)
**Actual Result**: 2/12 PASSED (16.7% success rate) - slight improvement but still unusable

---

## 2. Work Performed

### Phase 0: Environment Setup
- Created output directory: `/tmp/quality-tests/qwen3-235b-a22b/`
- Verified OpenRouter API key present (from `packages/course-gen-platform/.env`)
- Validated test configuration: `docs/llm-testing/test-config-2025-11-13-complete.json`
- Validated methodology: `docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md`

### Phase 1: Test Script Development
- Created quality-focused test script: `packages/course-gen-platform/scripts/test-model-qwen3-235b-a22b-quality.ts`
- Implemented direct fetch API (not LangChain) to handle reasoning models
- Added detection for empty content field
- Added detection for reasoning-only responses (token limit hit)
- Implemented 3 runs per scenario (4 scenarios = 12 API calls)

### Phase 2: Initial Test Run (FAILED)
- Executed 12 API calls
- Discovered all outputs were empty (contentLength: 0)
- Identified root cause: Reasoning model behavior

### Phase 3: Script Fix
- Updated script to detect reasoning model responses
- Added check for empty content even when API returns 200 OK
- Added specific error messages for different failure types

### Phase 4: Final Test Run (SUCCESS)
- Executed 12 API calls with proper error detection
- Results: 2 passed, 10 failed
- Failure reason: "Model only provided reasoning, no actual content (hit token limit during thinking)"

### Phase 5: Quality Analysis
- Validated 2 successful JSON outputs:
  - `metadata-ru-run2.json` (quality: 0.85)
  - `lesson-en-run3.json` (quality: 0.92)
- Analyzed 10 failed runs (all reasoning timeouts)
- Generated comprehensive quality analysis report

### Phase 6: Report Generation
- Created `quality-analysis-report.json` with detailed metrics
- Created `quality-rankings.md` with human-readable analysis
- Created this execution report

---

## 3. Changes Made

### Files Created

**Test Script**:
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/scripts/test-model-qwen3-235b-a22b-quality.ts`
  - 450 lines
  - TypeScript, uses direct fetch API
  - Handles reasoning models
  - 3 runs per scenario

**Test Outputs** (14 files total):
- `/tmp/quality-tests/qwen3-235b-a22b/metadata-ru-run2.json` (VALID, 1.2KB)
- `/tmp/quality-tests/qwen3-235b-a22b/metadata-ru-run2.log` (metadata)
- `/tmp/quality-tests/qwen3-235b-a22b/lesson-en-run3.json` (VALID, 4.5KB)
- `/tmp/quality-tests/qwen3-235b-a22b/lesson-en-run3.log` (metadata)
- 10 × `*-ERROR.json` files (failed runs)

**Analysis Reports**:
- `/tmp/quality-tests/qwen3-235b-a22b/quality-analysis-report.json` (5.2KB, structured data)
- `/tmp/quality-tests/qwen3-235b-a22b/quality-rankings.md` (12.8KB, human-readable)
- `/tmp/quality-tests/qwen3-235b-a22b/test-execution-report.md` (this file)

### Files Modified
None (all new files created)

---

## 4. Validation Results

### Schema Validation (2/2 successful runs)
- Valid JSON: 2/2 (100%)
- Required fields present: 2/2 (100%)
- Snake case compliance: 2/2 (100%)
- Correct data types: 2/2 (100%)

### Content Quality Validation

**Metadata (1 successful run)**:
- Learning outcomes count: 4 (target: 3-8) ✓
- Action verbs used: YES (Определить, Построить, Проанализировать, Создать) ✓
- Bloom's taxonomy: YES (multiple cognitive levels) ✓
- Overview length: 556 chars (target: 500+) ✓
- Target audience: Specific personas ✓
- Language: Native Russian phrasing ✓

**Lesson Structure (1 successful run)**:
- Lesson count: 5 (target: 3-5) ✓✓ EXCELLENT
- Objectives present: 5/5 lessons (100%) ✓
- Objectives measurable: YES (action verbs) ✓
- Topics specific: YES (not generic) ✓
- Exercises present: 10/10 exercises (2 per lesson) ✓
- Exercise instructions: Clear and actionable ✓
- Language: Natural English, professional tone ✓

### Error Validation (10 failed runs)
- All failures logged with error details ✓
- Error pattern identified: Reasoning timeout ✓
- Root cause documented ✓

---

## 5. Metrics

### Test Execution Metrics
- **Total API Calls**: 12
- **Passed**: 2
- **Failed**: 10
- **Success Rate**: 16.7%
- **Avg Duration**: 50,058ms (~50 seconds per call)
- **Total Duration**: ~10 minutes (including 2s delays between calls)

### Success Rate by Scenario
- metadata-en: 0/3 (0%)
- metadata-ru: 1/3 (33%)
- lesson-en: 1/3 (33%)
- lesson-ru: 0/3 (0%)

### Quality Scores (Successful Runs Only)
- Metadata quality: 0.85 / 1.00
- Lesson quality: 0.92 / 1.00
- Overall quality: 0.885 / 1.00

### Token Usage (Sample)
- Metadata run: 345 input tokens, 678 output tokens
- Lesson run: 409 input tokens, 1112 output tokens

---

## 6. Errors Encountered

### Primary Error (10/12 runs)
**Error**: "Model only provided reasoning, no actual content (hit token limit during thinking)"

**Root Cause**: Model is a reasoning variant that:
1. Spends tokens on internal thinking/reasoning
2. Hits max_tokens limit (8000) during reasoning phase
3. Never completes thinking to output actual content
4. Returns empty `content` field

**Evidence**:
```json
{
  "finish_reason": "length",
  "message": {
    "content": "",  // EMPTY!
    "reasoning": "Okay, the user wants me to..." // Incomplete
  }
}
```

**Impact**: 83.3% failure rate, model unusable for production

### Secondary Errors
None (all failures follow same pattern)

---

## 7. Quality Analysis Summary

### When Successful (2/12 runs)
- Schema compliance: EXCELLENT (1.00 / 1.00)
- Content quality: EXCELLENT (0.875 / 1.00)
- Language quality: EXCELLENT (0.875 / 1.00)
- Overall quality: 0.885 / 1.00 (A-TIER when it works)

### Overall (including failures)
- Success rate: 16.7% (FAILING)
- Consistency: N/A (insufficient successful runs)
- Production ready: NO
- **Final Tier: C-TIER**

### Key Findings

**Strengths** (when successful):
- Valid JSON with perfect snake_case compliance
- Excellent learning outcomes with action verbs
- Bloom's taxonomy compliance
- 5 complete lessons (exceeds target of 3-5)
- Specific, non-generic content
- Native language phrasing (both English and Russian)

**Critical Weaknesses**:
- **83.3% failure rate** (systematic, not random)
- Reasoning model that hits token limits
- Unpredictable behavior (sometimes works, usually fails)
- No workaround available

---

## 8. Next Steps

### Immediate Actions
1. ✅ Review quality rankings report (`quality-rankings.md`)
2. ✅ Inspect successful outputs:
   - `metadata-ru-run2.json` (quality: 0.85)
   - `lesson-en-run3.json` (quality: 0.92)
3. ✅ Document failure pattern for future reference

### Recommendations for User

**DO NOT USE** this model for production:
- 83.3% failure rate is unacceptable
- Reasoning timeout is systematic and unpredictable

**Use Instead**:
- For metadata: `moonshotai/kimi-k2-0905` (S-TIER, 100% success)
- For lessons: `moonshotai/kimi-k2-0905` (S-TIER, 100% success)
- For reasoning: `qwen/qwen3-235b-a22b-thinking-2507` (dedicated thinking model)

### Future Testing
If retesting this model:
1. Try with `max_tokens: 16000` or higher (cost-prohibitive)
2. Try with shorter prompts (may reduce quality)
3. Compare with `qwen/qwen3-235b-a22b-thinking-2507` (dedicated thinking variant)

---

## 9. Artifacts

### Configuration
- **Test Config**: `docs/llm-testing/test-config-2025-11-13-complete.json`
- **Methodology**: `docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md`

### Test Script
- **Script**: `packages/course-gen-platform/scripts/test-model-qwen3-235b-a22b-quality.ts`
- **Language**: TypeScript
- **Lines**: 450
- **API**: Direct fetch (not LangChain)

### Test Outputs
- **Directory**: `/tmp/quality-tests/qwen3-235b-a22b/`
- **Successful Outputs**: 2 JSON files + 2 log files
- **Failed Outputs**: 10 ERROR.json files
- **Total Files**: 14

### Analysis Reports
- **Quality Analysis**: `/tmp/quality-tests/qwen3-235b-a22b/quality-analysis-report.json` (structured)
- **Quality Rankings**: `/tmp/quality-tests/qwen3-235b-a22b/quality-rankings.md` (human-readable)
- **This Report**: `/tmp/quality-tests/qwen3-235b-a22b/test-execution-report.md`

---

## 10. Conclusion

Successfully executed quality-focused testing for **qwen/qwen3-235b-a22b** model. Results confirm **C-TIER** classification with critical reliability issues:

**Quality**: 0.885 / 1.00 (A-TIER when successful)
**Reliability**: 16.7% success rate (FAILING)
**Production Ready**: NO

**Root Cause**: Reasoning model that hits token limit during thinking phase, resulting in empty content output.

**Recommendation**: Use S-TIER models (Kimi K2 0905, DeepSeek v3.2 Exp) for production instead.

All outputs saved to `/tmp/quality-tests/qwen3-235b-a22b/` for review.

---

**Report Generated**: 2025-11-13T12:40:00.000Z
**Agent**: LLM Model Quality Testing
**Status**: COMPLETE ✓
