# Stage 4 → Post-Review Fixes Handoff

**Date**: 2025-11-03
**Status**: Stage 4 COMPLETE (9.2/10) - Post-review fixes needed
**Task File**: `specs/007-stage-4-analyze/POST-REVIEW-FIXES.md`

---

## Quick Context

**What was done**:
- Stage 4 (Course Content Analysis) implemented (52/52 tasks)
- Multi-phase multi-model architecture (5 phases, 20B/120B/Gemini)
- Code review completed: 9.2/10, APPROVED FOR PRODUCTION
- Found 4 issues (3 medium, 1 low) requiring fixes

**What needs to be done**:
Execute POST-REVIEW-FIXES.md (3 priority tasks, 11-15 hours)

---

## Critical Fixes (Production-blocking)

### 1. Split orchestrator file (2-3h) [P1]
- **File**: `src/orchestrator/services/analysis/analysis-orchestrator.ts`
- **Problem**: 555 lines (exceeds 300 line limit)
- **Action**: Split into orchestrator (300 lines) + validators (255 lines)

### 2. Add LLM output sanitization (3-4h) [P1]
- **Security risk**: XSS via unsanitized LLM outputs
- **Action**: Add `dompurify` sanitization in phase-5-assembly.ts
- **Test**: Verify XSS protection works

### 3. Optional LangSmith integration (6-8h) [P2]
- **Enhancement**: Add trace visualization (feature-flagged)
- **Action**: Implement `LANGSMITH_ENABLED` flag
- **Non-blocking**: Can deploy without this

---

## Execution Command

```bash
# In new Claude Code session, run:
cd /home/me/code/megacampus2
cat specs/007-stage-4-analyze/POST-REVIEW-FIXES.md
```

Then execute Phase 1 (P1 tasks) before production deployment.

---

## Files to Modify

1. `src/orchestrator/services/analysis/analysis-orchestrator.ts` (split)
2. `src/orchestrator/services/analysis/analysis-validators.ts` (NEW)
3. `src/orchestrator/services/analysis/phase-5-assembly.ts` (add sanitization)
4. `src/shared/utils/sanitize-llm-output.ts` (NEW)
5. `src/orchestrator/services/analysis/langchain-observability.ts` (LangSmith flag)

---

## Validation Checklist

After fixes:
- [ ] Type-check: 0 errors
- [ ] Build: Success
- [ ] Tests: 20/20 contract + 7 integration passing
- [ ] No files > 350 lines
- [ ] XSS test cases pass
- [ ] Target score: 9.5+/10

---

## Branch Info

- Current branch: `007-stage-4-analyze`
- Base: main
- Status: Ready for fixes → merge

**Full details**: `POST-REVIEW-FIXES.md`
