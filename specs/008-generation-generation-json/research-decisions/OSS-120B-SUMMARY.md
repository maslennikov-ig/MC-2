# OSS 120B - Quick Summary

**Model**: `openai/gpt-oss-120b`
**Test Date**: 2025-11-13
**Final Tier**: **B-TIER** (downgraded from expected A-TIER)

---

## Quick Stats

- **Overall**: 2/4 scenarios pass (50%)
- **Success Rate**: 7/12 valid outputs (58%)
- **Average Response Time**: 19 seconds
- **Cost**: ~$0.003 per request (very cheap, but unreliable)

---

## Results by Scenario

| Scenario | Status | Valid Runs | Quality | Notes |
|----------|--------|-----------|---------|-------|
| metadata-en | ✗ FAIL | 1/3 | 33% | 2 runs truncated/empty |
| metadata-ru | ✓ PASS | 3/3 | 85% | Consistent, good quality |
| lesson-en | ✓ PASS | 3/3 | 75% | 1 run missing lessons array |
| lesson-ru | ✓ PASS | 3/3 | 100% | Excellent, 3-5 lessons |

---

## Key Findings

### Strengths
- ✓ Excellent Russian lesson generation (100% quality, 3-5 lessons)
- ✓ Good Russian metadata (85% quality, 3/3 success)
- ✓ Very low cost per request
- ✓ When it works, outputs are high-quality

### Critical Issues
- ✗ **English metadata UNRELIABLE** (2/3 failures: truncated/empty)
- ✗ 50% failure rate on English outputs overall
- ✗ API returns truncated/empty responses without error codes
- ✗ Slow and inconsistent (2s to 32s response times)

---

## Recommendation

**DO NOT USE** for production English content.

**Use ONLY if**:
- You need Russian content
- You can tolerate 15% quality issues (metadata) or 0% (lessons)
- You have retry logic implemented
- Cost is critical (but S-TIER models are only 2-3x more expensive)

**Better Alternatives**:
- **Kimi K2** (S-TIER, 4/4 SUCCESS, consistent)
- **DeepSeek v3.2 Exp** (S-TIER, 4/4 SUCCESS, fast, cheap)
- **Grok 4 Fast** (S-TIER, 4/4 SUCCESS, fast)

---

## Sample Outputs

**Best English Metadata** (run 1):
```json
{
  "course_title": "Introduction to Python Programming",
  "course_overview": "2800+ character detailed overview with 8 modules...",
  "learning_outcomes": [
    "Define core Python syntax elements...",
    "Build reusable functions and modules...",
    "Create and manipulate data collections...",
    "Analyze program output and debug errors...",
    "Implement a complete, file‑based Python application..."
  ]
}
```
Score: 100% ✓

**Failed English Metadata** (run 2):
```json
{
  "target_audience": "High school graduates who want to start a career in tech, career‑switchers from non‑technical fields seeking a practical programming foundation, junior analysts needing automation skills, and
```
Truncated mid-sentence. Score: 0% ✗

**Best Russian Lessons** (run 2):
- 4 complete lessons on "Основы нейронных сетей"
- Lesson 1: "Математические основы нейронных сетей"
- Each with objectives, 4-5 key_topics, 2 exercises
- Perfect snake_case, native Russian phrasing
Score: 100% ✓

---

## Files

- **Full Report**: `/tmp/quality-tests/oss-120b-EVALUATION-REPORT.md`
- **Analysis JSON**: `/tmp/quality-tests/oss-120b-quality-analysis.json`
- **Test Outputs**: `/tmp/quality-tests/oss-120b/*.json`

---

**Conclusion**: OSS 120B is unreliable for English content and not recommended for production. Use S-TIER models instead.
