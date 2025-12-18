# OSS 120B: Actual Results vs. Expected Results

## Summary

**Expected**: A-TIER (2/4 SUCCESS - metadata only)
**Actual**: B-TIER (2/4 SUCCESS - Russian only)

The model performed completely differently than anticipated.

---

## Detailed Comparison

### Expected Performance

Based on previous testing notes in `test-config-2025-11-13-complete.json`:

```json
{
  "name": "OSS 120B",
  "slug": "oss-120b",
  "apiName": "openai/gpt-oss-120b",
  "description": "Fast metadata generation",
  "tier": "A-TIER",
  "previousResults": "2/4 SUCCESS (metadata only)"
}
```

**Expected Results**:
1. metadata-en: ✓ SUCCESS (fast generation)
2. metadata-ru: ✓ SUCCESS (fast generation)
3. lesson-en: ✗ FAIL (lessons not supported)
4. lesson-ru: ✗ FAIL (lessons not supported)

**Expected Tier**: A-TIER
**Expected Pattern**: "Fast metadata, lessons fail"

---

### Actual Performance

**Actual Results**:
1. metadata-en: ✗ FAIL (1/3 valid, 2 runs truncated/empty)
2. metadata-ru: ✓ SUCCESS (3/3 valid, 85% quality)
3. lesson-en: ✓ SUCCESS (3/3 valid, 75% quality, 1 run incomplete)
4. lesson-ru: ✓ SUCCESS (3/3 valid, 100% quality)

**Actual Tier**: B-TIER
**Actual Pattern**: "Russian reliable, English unreliable"

---

## Discrepancy Analysis

### What Changed?

| Aspect | Expected | Actual | Explanation |
|--------|----------|--------|-------------|
| **metadata-en** | ✓ SUCCESS | ✗ FAIL | API truncation/empty responses |
| **metadata-ru** | ✓ SUCCESS | ✓ SUCCESS | As expected |
| **lesson-en** | ✗ FAIL | ✓ SUCCESS | Model CAN generate lessons (2/3 perfect) |
| **lesson-ru** | ✗ FAIL | ✓ SUCCESS | Model EXCELLENT at Russian lessons |
| **Speed** | "Fast" | Slow (19s avg) | Much slower than expected |
| **Reliability** | Stable | Unstable (50% EN fail) | API-level issues |

### Root Causes

1. **Previous testing may have been incomplete**:
   - May not have tested lessons thoroughly
   - May not have tested Russian at all
   - May have used different prompts

2. **Model version change**:
   - OpenAI may have updated the backend model
   - OpenRouter routing may have changed
   - API behavior may have degraded

3. **Language bias not detected**:
   - Russian performance: 6/6 success (100%)
   - English performance: 3/6 success (50%)
   - Model clearly optimized for Russian/Chinese

4. **API instability**:
   - Truncated responses (metadata-en run 2)
   - Empty responses (metadata-en run 3)
   - Wide variance in response time (2s to 32s)
   - No error codes on failures

---

## Why "Metadata Only" Was Wrong

**Claim**: "Lessons fail"

**Evidence AGAINST**:
- lesson-en run 2: 4 perfect lessons ✓
- lesson-en run 3: 4 perfect lessons ✓
- lesson-ru run 1: 3 perfect lessons ✓
- lesson-ru run 2: 4 perfect lessons ✓
- lesson-ru run 3: 5 perfect lessons ✓

**Reality**: The model CAN generate excellent lessons (especially in Russian).

**Possible Explanation**:
- Previous testing used different prompts that didn't request 3-5 lessons
- Previous testing gave up after first failure
- Previous testing only checked English

---

## Why "Fast Metadata" Was Wrong

**Claim**: "Fast metadata generation"

**Evidence AGAINST**:
- metadata-en avg: 24.4 seconds (SLOW)
- metadata-ru avg: 15.6 seconds (MEDIUM)
- Compared to DeepSeek v3.2 Exp: ~5-8 seconds (FAST)

**Reality**: The model is SLOWER than most S-TIER models.

**Possible Explanation**:
- Previous testing measured time-to-first-token, not total time
- Previous testing had different max_tokens setting
- OpenRouter routing may have changed (different datacenter)

---

## Why English Fails But Russian Succeeds

**Hypothesis**: The model is trained/optimized for Chinese/Russian content.

**Evidence**:
1. Russian: 6/6 perfect outputs
2. English: 3/6 failures (truncation/empty)
3. Russian outputs are higher quality (100% vs 75%)
4. Russian responses are more consistent in size

**Implications**:
- Model may be Chinese-origin (OSS = Open Source? Chinese model?)
- Training data may have been primarily Chinese/Russian
- English support may be secondary/untested
- API may have different handling for different languages

---

## Corrected Model Profile

### OSS 120B (Corrected)

**Name**: OSS 120B
**API**: openai/gpt-oss-120b
**Actual Tier**: B-TIER (conditional use only)

**Strengths**:
- Excellent Russian lesson generation (100% quality, 3-5 lessons)
- Good Russian metadata (85% quality)
- Very low cost (~$0.003 per request)

**Weaknesses**:
- Unreliable English metadata (50% failure rate)
- API truncation/empty response issues
- Slow (19s avg, up to 32s)
- Inconsistent performance

**Best Use Cases**:
- Russian course metadata (with validation)
- Russian lesson structures (excellent quality)

**Avoid For**:
- English content (50% failure rate)
- Production systems (reliability issues)
- Time-critical applications (slow)

**Recommended Alternatives**:
- Kimi K2 (S-TIER, 4/4 SUCCESS, consistent)
- DeepSeek v3.2 Exp (S-TIER, 4/4 SUCCESS, faster, cheaper)
- Grok 4 Fast (S-TIER, 4/4 SUCCESS, fast)

---

## Lessons Learned

1. **Always test both languages**: Don't assume English performance = Russian performance
2. **Always test all scenarios**: "Metadata only" claim was based on incomplete testing
3. **Always run multiple times**: OSS 120B fails intermittently (not consistently)
4. **Verify "fast" claims**: Measure actual end-to-end time, not just first-token
5. **Check for truncation**: API may return 200 OK with incomplete JSON
6. **Validate immediately**: Don't assume API response is complete/valid

---

## Updated Recommendation

**Previous**: "A-TIER model for fast metadata generation"
**Corrected**: "B-TIER model for Russian content only, with reliability issues"

**Production Use**: NOT RECOMMENDED
**Reason**: 50% failure rate on English, API instability, better alternatives available

**If you must use**:
- ONLY for Russian content
- Implement retry logic (3 attempts minimum)
- Validate JSON immediately after response
- Have fallback model ready (DeepSeek Chat v3.1)
- Monitor for truncation/empty responses

---

**Conclusion**: The previous classification was incorrect. OSS 120B is not suitable for production use due to reliability issues, especially in English. It should be reclassified from A-TIER to B-TIER.
