# INV-2025-11-19-003: Thinking Model Performance Issue - Wrong Model Variant Used

**Date**: 2025-11-19
**Status**: READY FOR EXECUTION
**Priority**: CRITICAL (blocks production performance - 521s vs 15-29s spec)
**Category**: Performance / Model Selection Bug

---

## Executive Summary

**Problem**: Stage 5 generation uses thinking mode model (`qwen/qwen3-235b-a22b-thinking-2507`) instead of regular model (`qwen/qwen3-235b-a22b-2507`), causing 17x-35x performance degradation (521s vs 15-29s).

**Root Cause**: Model selection configuration uses incorrect variant with `-thinking` suffix.

**Solution**: Replace all occurrences of `qwen3-235b-a22b-thinking-2507` with `qwen3-235b-a22b-2507` (remove `-thinking` suffix, keep `-2507` suffix).

**Impact**:
- ✅ Fixes 10-minute E2E test timeout
- ✅ Achieves <150s generation time spec (SC-003)
- ✅ Reduces OpenRouter costs (faster execution = lower token usage over time)
- ✅ No quality degradation (both models show 100% success rate)

---

## Performance Analysis

### E2E Test Evidence

**Test**: `t053-synergy-sales-course.test.ts`
**Timeout**: 10 minutes (600,000ms)

**Observed Behavior**:
```
Stage 5 (Generate Course Structure): started
Stage 5: Phase 2 (Generate Metadata): started
Stage 5: Phase 2 (Generate Metadata): completed (521058ms) ← 8.7 MINUTES!
[test timed out]
```

**Expected Behavior** (with correct model):
```
Stage 5: Phase 2 (Generate Metadata): completed (~15-30s)
Stage 5: Phase 3 (Generate Sections): completed (~60-120s)
Total Stage 5 time: <150s ✅
```

---

## LLM Testing Results Comparison

### Regular Model: `qwen/qwen3-235b-a22b-2507` ✅

**Test Results**: `/docs/llm-testing/test-run-5/qwen3-235b-a22b-2507/summary.json`

**Performance**:
- Success Rate: 100.00%
- Average Test Duration: 28.2s
- Metadata Generation (Russian):
  - Run 1: 28.9s
  - Run 2: 19.7s
  - Run 3: 18.2s
- **Range**: 15-29 seconds ✅

**Quality**: Excellent
- All schema validations passed
- All required fields present
- Correct Russian language output

---

### Thinking Model: `qwen/qwen3-235b-thinking-2507` ❌

**Test Results**: `/docs/llm-testing/test-run-5/qwen3-235b-thinking/summary.json`

**Performance**:
- Success Rate: 100.00%
- Average Test Duration: 53.7s
- Metadata Generation (Russian):
  - Run 1: 39.1s
  - Run 2: 109.5s (1.8 minutes!)
  - Run 3: 48.0s
- **Range**: 30-110 seconds ❌ (2-4x slower)

**E2E Context** (larger input):
- Metadata Generation: 521 seconds (8.7 minutes!) ❌
- **Degradation Factor**: 17x-35x slower than regular model

**Quality**: Also excellent (100% success)
- All schema validations passed
- All required fields present
- Correct Russian language output

**Conclusion**: Thinking mode provides NO quality benefit but MASSIVE performance penalty.

---

## Root Cause Analysis

### What is Thinking Mode?

**Thinking models** (`-thinking` suffix) use chain-of-thought reasoning:
- Generate internal reasoning steps before final output
- More thorough analysis of complex problems
- Significantly higher token usage
- 2-35x slower execution time

**When to use thinking mode**:
- Complex logical reasoning tasks
- Mathematical problem solving
- Multi-step decision making
- Tasks requiring explicit reasoning chain

**When NOT to use thinking mode**:
- Template-based generation (like course structure)
- Well-defined schema output
- Performance-sensitive workflows
- Production systems with time constraints

### Why This Bug Exists

**Hypothesis**: During model testing/evaluation, thinking mode was tested alongside regular mode. Configuration accidentally retained `-thinking` suffix when moving to production.

**Evidence**:
- Both models tested in `/docs/llm-testing/test-run-5/`
- Both show 100% success rate
- Decision docs may not specify which variant to use in production

---

## Bug Locations

### Confirmed Locations

1. **`/packages/course-gen-platform/src/services/stage5/metadata-generator.ts:93`**
   ```typescript
   // ❌ WRONG
   ru_metadata_primary: 'qwen/qwen3-235b-a22b-thinking-2507',

   // ✅ CORRECT
   ru_metadata_primary: 'qwen/qwen3-235b-a22b-2507',
   ```

2. **`/packages/course-gen-platform/src/services/stage5/section-batch-generator.ts:53`**
   ```typescript
   // ❌ WRONG
   ru_lessons_primary: 'qwen/qwen3-235b-a22b-thinking-2507',

   // ✅ CORRECT
   ru_lessons_primary: 'qwen/qwen3-235b-a22b-2507',
   ```

### Potential Other Locations

**Need to audit**:
- Stage 2 (Document Processing)
- Stage 3 (Chunking/Indexing)
- Stage 4 (Analysis)
- Any utility services using model routing
- Configuration files
- Environment variable definitions
- Decision documentation

**Search Pattern**:
```bash
grep -r "thinking-2507" --include="*.ts" --include="*.md" --include="*.json"
```

---

## Fix Plan

### Phase 1: Codebase Audit

**Delegate to**: `fullstack-nextjs-specialist` or `code-reviewer` sub-agent

**Tasks**:
1. Search entire codebase for `thinking-2507` occurrences
2. Identify ALL files using incorrect model variant
3. Verify correct `-2507` suffix (don't accidentally remove it!)
4. Create comprehensive list of affected files

**Search Commands**:
```bash
# TypeScript files
grep -r "thinking-2507" --include="*.ts" src/

# Config files
grep -r "thinking-2507" --include="*.json" --include="*.env*" .

# Documentation
grep -r "thinking-2507" --include="*.md" docs/
```

### Phase 2: Code Fixes

**For each affected file**:
1. Replace `qwen/qwen3-235b-a22b-thinking-2507` with `qwen/qwen3-235b-a22b-2507`
2. Add comment explaining why regular model is used:
   ```typescript
   // Using regular model (not -thinking variant) for performance (RT-007)
   // Regular: 15-29s, Thinking: 30-110s (test), 521s (production context)
   // Both achieve 100% success rate, no quality difference for structured generation
   ```

### Phase 3: Documentation Updates

**Update decision documentation** to reflect correct model:
1. Search for RT-001 (model routing decision)
2. Search for any docs mentioning `qwen3-235b`
3. Update to specify:
   - Regular model: `qwen/qwen3-235b-a22b-2507` (production)
   - Thinking model: `qwen/qwen3-235b-a22b-thinking-2507` (NOT used)
   - Rationale: Performance requirements (SC-003: <150s)

### Phase 4: Verification

1. **Type-check**: `pnpm type-check` (all packages)
2. **Unit tests**: `pnpm test` (Stage 5 integration tests)
3. **E2E test**: `t053-synergy-sales-course.test.ts` (verify <150s completion)
4. **Performance benchmark**: Measure actual metadata generation time

---

## Critical Instructions for Sub-Agent

**⚠️ IMPORTANT**: When fixing model references, be VERY CAREFUL with suffixes:

### ✅ CORRECT Transformations:
```
qwen/qwen3-235b-a22b-thinking-2507  →  qwen/qwen3-235b-a22b-2507  ✅
qwen/qwen-2.5-coder-32b-instruct    →  (no change, different model)  ✅
```

### ❌ INCORRECT Transformations:
```
qwen/qwen3-235b-a22b-thinking-2507  →  qwen/qwen3-235b-a22b         ❌ (missing -2507!)
qwen/qwen3-235b-a22b-thinking-2507  →  qwen/qwen3-235b-a22b-think   ❌ (typo)
qwen/qwen3-235b-a22b-thinking-2507  →  qwen/qwen3-235b-thinking     ❌ (removed wrong suffix)
```

**Rule**: Remove ONLY the `-thinking` part, KEEP the `-2507` suffix!

---

## Expected Results After Fix

### Performance Improvements

**Before** (with `-thinking`):
```
Stage 5 Phase 2 (Metadata): 521s (8.7 min)  ❌ TIMEOUT
Total Stage 5: >600s (estimated)            ❌ TIMEOUT
```

**After** (regular model):
```
Stage 5 Phase 2 (Metadata): ~20-30s         ✅
Stage 5 Phase 3 (Sections): ~60-120s        ✅
Stage 5 Phase 4 (Validation): ~3-5s         ✅
Total Stage 5: ~90-160s                     ✅ (meets <150s spec)
```

### Test Success

**E2E Test**: `t053-synergy-sales-course.test.ts`
- ✅ No timeout (completes within 10 min)
- ✅ Stage 5 completes within 150s
- ✅ All quality validations pass
- ✅ Final course structure generated

---

## Risk Assessment

**Risk Level**: 🟡 MEDIUM-LOW

**Why Safe**:
- ✅ Both models achieve 100% success rate (no quality risk)
- ✅ Only changing model identifier string (no logic changes)
- ✅ Type-check will catch syntax errors
- ✅ E2E tests will validate functionality

**Potential Risks**:
- ⚠️ Accidentally removing `-2507` suffix (wrong model version)
- ⚠️ Missing some occurrences in codebase
- ⚠️ Model identifier typos

**Mitigation**:
- ✅ Use regex search to find ALL occurrences
- ✅ Careful review of each replacement
- ✅ Comprehensive type-check and testing
- ✅ Run E2E test to validate performance

**Rollback Plan**:
```bash
git checkout HEAD -- src/services/stage5/metadata-generator.ts
git checkout HEAD -- src/services/stage5/section-batch-generator.ts
# (repeat for any modified files)
```

---

## Success Criteria

- [ ] All occurrences of `thinking-2507` removed from codebase
- [ ] Correct model `qwen3-235b-a22b-2507` used everywhere
- [ ] Type-check passes (`pnpm type-check`)
- [ ] Integration tests pass (`pnpm test`)
- [ ] E2E test completes successfully (<10 min)
- [ ] Stage 5 generation time <150s (SC-003 spec)
- [ ] Decision documentation updated
- [ ] Code comments explain why regular model is used

---

## References

- **E2E Test Log**: `/tmp/t053-FINAL-with-all-fixes.log`
- **LLM Test Results**: `/docs/llm-testing/test-run-5/`
- **Performance Spec**: SC-003 (Generation Time Target <150s)
- **Related Investigation**: INV-2025-11-18-005 (Stage 5 performance issue)
- **Architecture Doc**: `/packages/course-gen-platform/docs/architecture/STAGE5-ARCHITECTURE.md`

---

## Execution Checklist

### Sub-Agent Tasks:
- [ ] Search codebase for all `thinking-2507` occurrences
- [ ] Create comprehensive list of affected files
- [ ] Replace with `2507` (verify `-2507` suffix preserved!)
- [ ] Add explanatory comments to changed files
- [ ] Update decision documentation
- [ ] Run type-check (verify no errors)
- [ ] Run integration tests (verify all pass)
- [ ] Report back with summary of changes

### Main Agent Tasks:
- [ ] Receive sub-agent report
- [ ] Review all changes
- [ ] Run E2E test (`t053-synergy-sales-course.test.ts`)
- [ ] Verify Stage 5 completion time <150s
- [ ] Commit changes with clear message
- [ ] Close investigation
- [ ] Update RT-007 decision record (create if needed)

---

## Decision Record Update Required

**Action**: Create or update RT-007 (Model Selection for Russian Generation)

**Content**:
```markdown
# RT-007: Russian Generation Model Selection

**Status**: APPROVED
**Date**: 2025-11-19
**Context**: Stage 5 Russian course generation

## Decision

Use **regular model** `qwen/qwen3-235b-a22b-2507` (NOT thinking variant).

## Rationale

1. **Performance**: 15-29s vs 30-110s (test), 521s (production) for thinking mode
2. **Quality**: Both achieve 100% success rate, no difference in output quality
3. **Spec Compliance**: Required for SC-003 (<150s generation time)
4. **Cost**: Faster execution = lower operational costs

## Test Evidence

- Regular model: `/docs/llm-testing/test-run-5/qwen3-235b-a22b-2507/`
- Thinking model: `/docs/llm-testing/test-run-5/qwen3-235b-thinking/`
- E2E evidence: INV-2025-11-19-003

## Alternatives Considered

- **Thinking mode** (`-thinking-2507`): Rejected due to 17-35x performance degradation
- **qwen3-max**: Abandoned (previous decision, not in scope here)
- **OSS 120B**: Used for non-critical content, qwen3 for metadata/critical content
```
