# Qwen3 32B - Quality Ranking Summary

**Model**: qwen/qwen3-32b
**Test Date**: 2025-11-13
**Previous Tier**: A-TIER (2/4 SUCCESS, metadata only)
**Current Assessment**: A-TIER quality, D-TIER reliability

---

## Overall Scores

| Metric | Score | Rank |
|--------|-------|------|
| **Raw Quality** | 0.875 / 1.00 | A-Tier |
| **Schema Compliance** | 50% | D-Tier |
| **Adjusted Quality** | 0.44 / 1.00 | D-Tier |
| **Consistency** | 0.79 / 1.00 | B-Tier |
| **Cost Efficiency** | $0.40/$0.40 | A-Tier |

---

## Metadata Generation Rankings

### Overall Metadata Quality: **0.85 / 1.00** (A-Tier)

**Breakdown**:
- Schema Compliance: 67% (4/6 valid JSON)
- Content Quality: 0.90 / 1.00
- Language Quality: 0.85 / 1.00

**Strengths**:
- Detailed course_overview (500+ chars)
- Action verbs in learning outcomes (Write, Build, Analyze)
- Specific target audience personas
- Native Russian language quality

**Weaknesses**:
- 33% markdown wrapper issue (Russian scenarios)
- Occasional truncation (course_overview cuts off)

**Sample Output**: `/tmp/quality-tests/qwen3-32b/metadata-en-run1.json`

**Best Run**: metadata-en-run2 (1710 tokens, valid JSON, detailed content)

**Worst Run**: metadata-ru-run2 (markdown wrapper, but content quality high)

---

## Lesson Structure Rankings

### Overall Lesson Quality: **0.90 / 1.00** (A-Tier)

**Breakdown**:
- Schema Compliance: 50% (3/6 valid JSON)
- Lesson Count: 5/5/5 (PERFECT - always 5 lessons!)
- Content Quality: 0.95 / 1.00
- Language Quality: 0.90 / 1.00

**Strengths**:
- ALWAYS generates 5 complete lessons (target: 3-5)
- Specific lesson titles (NOT "Introduction to...")
- Measurable objectives per lesson
- Detailed exercises with clear instructions
- Excellent key_topics specificity

**Weaknesses**:
- 50% markdown wrapper issue
- Lower schema compliance than metadata

**Sample Output**: `/tmp/quality-tests/qwen3-32b/lesson-en-run1.json`

**Best Run**: lesson-en-run3 (2707 tokens, valid JSON, 5 lessons)

**Worst Run**: lesson-en-run2 (markdown wrapper, but 5 lessons with good content)

---

## Comparison with Expected Results

### Expected: "2/4 SUCCESS (metadata only, lessons HTML/HTTP 500)"

**Actual**: **4/4 SUCCESS** (all scenarios work!)

| Scenario | Expected | Actual | Notes |
|----------|----------|--------|-------|
| metadata-en | ✓ SUCCESS | ✓ SUCCESS | 3/3 runs successful |
| metadata-ru | ✓ SUCCESS | ✓ SUCCESS | 3/3 runs successful (1/3 valid JSON) |
| lesson-en | ✗ HTML/500 | ✓ SUCCESS | 3/3 runs successful (2/3 valid JSON) |
| lesson-ru | ✗ HTML/500 | ✓ SUCCESS | 3/3 runs successful (1/3 valid JSON) |

**Conclusion**: Model endpoint has been fixed or improved significantly!

---

## Cost-Adjusted Rankings

### Quality per Dollar

**Total Cost**: $0.010 (12 runs)
**Quality Score**: 0.875 (raw) / 0.44 (adjusted for schema)

**Quality per Dollar**:
- Raw: 0.875 / $0.010 = **87.5 quality/dollar** (EXCELLENT)
- Adjusted: 0.44 / $0.010 = **44 quality/dollar** (GOOD)

**Comparison with Competitors**:
- DeepSeek v3.2 Exp: ~90 quality/dollar (cheaper, similar quality)
- Kimi K2 0905: ~50 quality/dollar (more expensive, higher quality)
- OSS 120B: Unknown (similar tier, similar cost)

**Ranking**: 2nd-3rd in cost efficiency among A/S-TIER models

---

## Tier Assignment

### Quality Tiers

**A-Tier** (0.75-0.89 quality):
- Raw quality: 0.875 ✓
- Content quality: Excellent
- Language quality: Excellent

**D-Tier** (<0.60 reliability):
- Schema compliance: 50% ✗
- Markdown wrapper issue: Critical
- Production readiness: Poor

### Final Recommendation

**Tier**: **A-TIER with D-TIER reliability**

**Use Case Fit**:
- ✓ Budget testing
- ✓ Content quality evaluation
- ✗ Production use (unreliable schema)
- ✗ Direct API integration (needs manual parsing)

---

## Competitive Positioning

### Among A-TIER Models

1. **Qwen3 235B Thinking** - Expected: Higher quality, higher cost
2. **OSS 120B** - Expected: Similar quality, similar cost
3. **Qwen3 32B** - Current: Good quality, poor reliability ← YOU ARE HERE

**Advantage**: Lowest cost in A-TIER
**Disadvantage**: 50% schema failure rate

### Among S-TIER Models

**Qwen3 32B vs. S-TIER**:
- Lower cost (✓ $0.40/$0.40 vs. $0.35-$1.40)
- Lower quality (✗ 0.875 vs. 0.90-0.95)
- Lower reliability (✗ 50% vs. 100%)

**Verdict**: Not competitive with S-TIER due to schema issues

---

## Next Steps

### Immediate Actions

1. **Test stricter prompt** (5 runs per scenario, 20 total)
   - Hypothesis: "NEVER use markdown" instruction may fix issue
   - Success metric: ≥80% schema compliance

2. **Manual JSON cleaning test**
   - Strip markdown wrappers from invalid runs
   - Revalidate content quality
   - Estimate effort for production use

3. **Compare with A-TIER peers**
   - Test qwen3-235b-thinking (same provider)
   - Test oss-120b (similar cost)
   - Rank by quality AND reliability

### Long-Term Recommendations

1. **Production Use**: Not recommended (use DeepSeek v3.2 Exp instead)
2. **Development/Testing**: Recommended (good quality, low cost)
3. **Prompt Engineering**: Invest effort to fix markdown issue
4. **Fallback Strategy**: Implement JSON cleaning pipeline if using

---

## Key Takeaways

1. **Major Discovery**: Qwen3 32B now works for ALL scenarios (not just metadata)
2. **Critical Issue**: 50% markdown wrapper problem makes it unreliable
3. **Quality**: Strong content quality (A-Tier) when JSON is valid
4. **Cost**: Very competitive ($0.40/$0.40, cheapest in A-TIER)
5. **Recommendation**: Good for testing, poor for production

**Status Change**: A-TIER (metadata only) → A-TIER (full functionality, poor reliability)

---

## Artifacts

- Full analysis: `/tmp/quality-tests/qwen3-32b/QUALITY-ANALYSIS-REPORT.md`
- Sample outputs: `/tmp/quality-tests/qwen3-32b/*.json`
- Logs: `/tmp/quality-tests/qwen3-32b/*.log`
- Test script: `packages/course-gen-platform/scripts/test-model-qwen3-32b-quality.ts`
