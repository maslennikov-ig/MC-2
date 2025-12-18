# Prompt for Continuing Stage 4 Integration Testing

**Date**: 2025-11-02
**Session Goal**: Complete integration testing for Stage 4 Analysis feature

---

## Quick Context

We are testing the **Stage 4 Analysis** feature - a 5-phase LLM orchestration workflow that analyzes course topics and generates structured recommendations.

### What's Been Completed ✅

1. **All 95 unit tests PASSING**
2. **T034 (Full workflow test) PASSING** - Fixed BullMQ cleanup issue
3. **Critical bug fixes completed**:
   - Phase 3 schema mismatch fixed (`progression_logic` character limit)
   - FR-015 requirement clarified (always generate ≥10 lessons, never reject)
   - Test infrastructure improved (BullMQ queue cleanup)
4. **Release v0.14.4 published** with all fixes

### What Needs to Be Done Today ⏳

Run the remaining integration tests in this order:

1. **T040**: Multi-document synthesis test (`tests/integration/stage4-multi-document-synthesis.test.ts`)
2. **T041**: Detailed requirements test (`tests/integration/stage4-detailed-requirements.test.ts`)
3. **T042**: Research flag detection test (`tests/integration/stage4-research-flag-detection.test.ts`)
4. **T036**: Contract tests (`tests/integration/stage4-contract.test.ts`)
5. **E2E test**: Manual live test with UI
6. **Summary report**: Create final testing summary

---

## Commands to Run

```bash
# Change to project directory
cd /home/me/code/megacampus2/packages/course-gen-platform

# Pre-check: Verify environment
pnpm type-check  # Should pass
docker ps | grep redis  # Should show running Redis container

# Run tests sequentially (DO NOT run in parallel - LLM API calls)
pnpm test tests/integration/stage4-multi-document-synthesis.test.ts
pnpm test tests/integration/stage4-detailed-requirements.test.ts
pnpm test tests/integration/stage4-research-flag-detection.test.ts
pnpm test tests/integration/stage4-contract.test.ts

# After all tests pass, create summary report
```

---

## Important Notes

### Test Characteristics
- **Duration**: Each test takes 1-3 minutes (real LLM API calls)
- **Cost**: Each test costs ~$0.01-0.02 (OpenRouter API)
- **Non-deterministic**: LLM output varies slightly between runs (normal)

### Expected Behavior
- Tests use real LLM APIs (OpenRouter: `openai/gpt-oss-20b` and `openai/gpt-oss-120b`)
- Phase 3 ALWAYS uses 120B model (quality critical)
- Phase 4 adaptive: 20B for <3 docs, 120B for ≥3 docs
- Minimum 10 lessons enforced by FR-015 (system expands scope creatively)

### Known Non-Blocking Issues
1. Progress update function signature mismatch (cosmetic)
2. System metrics logging failure (cosmetic)
3. BullMQ sourcemap warnings (ignore)

---

## Files to Reference

### Main Documentation
- **Progress Tracker**: `STAGE4-TESTING-TASKS.md` (this directory)
- **Test Files**: `tests/integration/stage4-*.test.ts`
- **Fixtures**: `tests/fixtures/index.ts`

### Key Implementation Files
- **Phase 1**: `src/orchestrator/services/analysis/phase-1-classification.ts`
- **Phase 2**: `src/orchestrator/services/analysis/phase-2-scope.ts`
- **Phase 3**: `src/orchestrator/services/analysis/phase-3-expert.ts`
- **Phase 4**: `src/orchestrator/services/analysis/phase-4-synthesis.ts`
- **Orchestrator**: `src/orchestrator/services/analysis/analysis-orchestrator.ts`

### Schema Files
- **Shared Types**: `../../shared-types/src/analysis-result.ts`
- **Shared Schemas**: `../../shared-types/src/analysis-schemas.ts`
- **Local Types**: `src/types/analysis-result.ts`

---

## Troubleshooting Guide

### If a test fails with "Phase 3 validation failed: progression_logic exceeds 500 characters"
- **Cause**: LLM generated text > 500 chars (rare after prompt fix)
- **Solution**: Re-run test (LLM output varies). If persists 3+ times, we need to add retry logic.

### If a test fails with "Minimum 10 lessons required"
- **Cause**: LLM generated <10 lessons (rare after prompt fix)
- **Solution**: Re-run test. If persists, check Phase 2 prompt guidance.

### If test hangs for >5 minutes
- **Cause**: LLM API timeout or Redis connection issue
- **Solution**:
  1. Check OpenRouter API key: `echo $OPENROUTER_API_KEY`
  2. Check Redis: `docker ps | grep redis`
  3. Kill test and re-run

### If BullMQ jobs not cleaning up
- **Cause**: Redis queue not cleared between tests
- **Solution**: Already fixed in v0.14.4. If issue persists, run:
  ```bash
  docker restart $(docker ps -q --filter name=redis)
  ```

---

## Success Criteria

### For Each Test
- ✅ All assertions pass
- ✅ No validation errors
- ✅ Analysis result stored in database
- ✅ Job status updates correctly
- ✅ Model selection correct (20B vs 120B)

### For Overall Testing
- ✅ T040, T041, T042, T036 all PASSING
- ✅ E2E manual test successful
- ✅ Summary report created
- ✅ Type-check passing
- ✅ Build passing

---

## After All Tests Pass

1. **Update `STAGE4-TESTING-TASKS.md`** with results
2. **Create summary report** in `docs/reports/summaries/2025-11-02-stage4-testing-summary.md`
3. **Run final validation**:
   ```bash
   pnpm type-check
   pnpm build
   ```
4. **Commit changes**:
   ```bash
   git add .
   git commit -m "test(stage-4): complete integration testing - all tests passing

   - T040: Multi-document synthesis ✅
   - T041: Detailed requirements ✅
   - T042: Research flag detection ✅
   - T036: Contract tests ✅
   - E2E manual test ✅

   All integration tests passing with real LLM API calls.
   Phase 3 schema fixes (v0.14.4) resolved validation issues.

   🤖 Generated with Claude Code

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

5. **Create release** (if needed):
   ```bash
   /push patch  # If only test updates
   # OR
   /push minor  # If significant improvements discovered during testing
   ```

---

## Quick Start Command for Tomorrow

Copy and paste this into Claude Code:

```
Please continue Stage 4 integration testing. Read STAGE4-TESTING-TASKS.md for context, then run tests T040, T041, T042, T036 sequentially. After all pass, create summary report and commit changes. Use the task list from the file to track progress.

Environment:
- Working dir: /home/me/code/megacampus2/packages/course-gen-platform
- All fixes from v0.14.4 are in place
- Redis should be running (verify first)
- OpenRouter API key configured

DO NOT run tests in parallel (LLM API calls). Run one at a time and verify results before proceeding.
```

---

**Prepared by**: Claude Code
**Session Date**: 2025-11-01
**Next Session**: 2025-11-02
**Status**: Ready to continue testing
