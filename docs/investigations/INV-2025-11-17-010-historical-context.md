# Investigation: T053 Generation Failures - Historical Context Analysis

**ID**: INV-2025-11-17-010
**Date**: 2025-11-17
**Status**: Complete
**Priority**: High
**Related Issue**: T053 E2E test failures (Task 1.4 - Historical Problem Search)

---

## Executive Summary

Comprehensive historical analysis reveals **NO direct regressions** for T053 generation failures, but identifies **critical architectural patterns** and **4 similar issues** that inform the current fix strategy.

**Key Findings**:
1. **Phase 2 Safety Net (v0.18.3)** - Recent fix for missing fields is WORKING as designed
2. **Unified Regeneration System** - 5-layer JSON repair system exists but underutilized in Stage 5
3. **Model Selection Evolution** - Qwen3-235B-Thinking chosen for metadata, NOT for section generation (reliability issues)
4. **Quality Gate Philosophy** - Fail-fast with repair layers vs silent failures

**Critical Lesson**: The **hybrid approach** (improved prompts + comprehensive post-processing) proven in Phase 2 should be applied to Stage 5 generation phases.

---

## Previous Similar Issues

### Issue #1: Phase 2 Missing Fields (FIXED - v0.18.3)

**Date**: 2025-11-16
**Investigation**: `INV-2025-11-16-004-t053-phase2-missing-fields.md`
**Status**: ✅ RESOLVED

**Problem**:
- LLM generated incomplete `sections_breakdown` array missing required fields
- Fields: `key_topics`, `pedagogical_approach`, `difficulty_progression`
- Root cause: LLM occasionally generates incomplete JSON, JSON repair fixes structure but doesn't add missing schema fields

**Fix Applied** (commit `8284c10`):
```typescript
// Add comprehensive post-processing safety net
const fixedSections = phase2Output.recommended_structure.sections_breakdown.map((section, idx) => ({
  ...section,
  key_topics: section.key_topics || [],
  pedagogical_approach: section.pedagogical_approach || 'hands-on practice',
  difficulty_progression: section.difficulty_progression || 'gradual',
  // ... 8 more fields
}));
```

**Outcome**:
- Zero validation failures after fix
- 100% test pass rate
- Hybrid approach: improved prompt + post-processing safety net

**Relevance to T053**:
- ✅ **SAME PATTERN**: Stage 5 generation likely has similar incomplete field issues
- ✅ **PROVEN FIX**: Post-processing safety net works
- ⚠️ **NOT A REGRESSION**: Phase 2 fix is in different stage (Stage 4 Analyze vs Stage 5 Generation)

---

### Issue #2: Phase 4 JSON Repair Missing (FIXED - 2025-11-02)

**Date**: 2025-11-02
**Investigation**: `INV-2025-11-02-003-phase4-json-repair.md`
**Status**: ✅ RESOLVED

**Problem**:
- Phase 4 (Document Synthesis) used raw `JSON.parse()` without 5-layer repair system
- Test failures: "Unexpected end of JSON input"
- Phase 2 had comprehensive 5-layer repair, Phase 4 didn't

**Root Cause**:
> "Phase 4 was implemented before the JSON repair system existed and was never retrofitted to use it."

**Fix Applied**:
- Integrated full 5-layer repair cascade into Phase 4
- Copied pattern from Phase 2 (lines 91-208)
- Added repair metadata tracking

**Outcome**:
- 40/40 tests passing after integration
- 99%+ success rate handling malformed JSON

**Relevance to T053**:
- ✅ **ARCHITECTURAL LESSON**: All LLM JSON parsing should use repair cascade
- ✅ **PATTERN REUSE**: Copy proven Phase 2 pattern
- ⚠️ **DIFFERENT ISSUE**: Phase 4 is Stage 4 Analyze, T053 is Stage 5 Generation

---

### Issue #3: UnifiedRegenerator Model Instance Missing (FIXED - 2025-11-11)

**Date**: 2025-11-11
**Investigation**: `INV-2025-11-11-001-generation-test-failures.md`
**Status**: ✅ RESOLVED

**Problem**:
- SectionBatchGenerator created UnifiedRegenerator with Layer 2 enabled but no model instance
- Layer 1 (auto-repair) failed → Layer 2 required model but threw error
- All regeneration layers exhausted

**Root Cause**:
```typescript
// ❌ MISSING: model parameter despite enabling 'critique-revise' layer
const regenerator = new UnifiedRegenerator<{ sections: Section[] }>({
  enabledLayers: ['auto-repair', 'critique-revise'], // Layer 2 enabled!
  // model: model, // ← MISSING
});
```

**Fix Applied** (commit `8284c10`):
```typescript
// ✅ ADDED: Pass model instance for Layer 2
const regenerator = new UnifiedRegenerator<{ sections: Section[] }>({
  enabledLayers: ['auto-repair', 'critique-revise'],
  model: model, // ✅ Now Layer 2 can execute
  ...
});
```

**Outcome**:
- Section regeneration now succeeds
- Layer 2 critique-revise available when Layer 1 fails

**Relevance to T053**:
- ✅ **DIRECTLY RELATED**: This is Stage 5 generation code
- ✅ **SAME SERVICE**: SectionBatchGenerator is used in T053 test
- ⚠️ **DIFFERENT SYMPTOM**: T053 fails at quality validation, not Layer 2 model missing

---

### Issue #4: Schema Mismatch Stage 4 → Stage 5 (IDENTIFIED - 2025-11-11)

**Date**: 2025-11-11
**Investigation**: `INV-2025-11-11-003-regenerate-section-validation-failures.md`
**Status**: ⚠️ DESIGN ISSUE (not a bug)

**Problem**:
- Stage 4 outputs rich nested analysis result:
  ```typescript
  {
    course_category: { primary, confidence, reasoning }, // Object
    contextual_language: { why_matters_context, ... },   // Object
    pedagogical_strategy: { teaching_style, ... }        // Object
  }
  ```
- Stage 5 expects simplified flattened schema:
  ```typescript
  {
    category: string,              // String
    contextual_language: string,   // String
    pedagogical_strategy: string   // String
  }
  ```

**Root Cause**:
> "Stage 4 and Stage 5 use different analysis_result schemas. This is intentional schema evolution."

**Fix Applied**:
- Updated test fixtures to match Stage 5 simplified schema
- No production code changes (design is correct)

**Outcome**:
- Tests now pass with correct schema
- Documented schema transformation expectations

**Relevance to T053**:
- ⚠️ **SCHEMA AWARENESS**: Stage 5 has simplified input schema
- ✅ **VALIDATION LESSON**: Input validation is strict (good for quality gates)
- ℹ️ **NOT A BUG**: This is intentional design

---

## Regression Analysis

### Was T053 Issue Fixed Before?

**Answer**: ❌ **NO - This is NOT a regression**

**Evidence**:
1. **No previous fix for T053 generation failures** in git history
2. **Phase 2 fix (v0.18.3)** is in **different stage** (Stage 4 Analyze, not Stage 5 Generation)
3. **Phase 4 JSON repair** was also Stage 4, not Stage 5
4. **UnifiedRegenerator model fix** was for section *regeneration*, not initial generation

**Timeline Analysis**:
```
2025-11-02: Phase 4 JSON repair integrated (Stage 4 Analyze)
2025-11-11: UnifiedRegenerator model instance added (Stage 5 section regeneration)
2025-11-11: Schema mismatch identified (test fixture issue)
2025-11-16: Phase 2 post-processing safety net added (Stage 4 Analyze)
2025-11-17: T053 generation failures observed (Stage 5 generation metadata/sections)
```

**Conclusion**: Each fix addressed **different components**. No evidence of regression.

---

## Design Decisions Context

### Why Qwen3-235B-Thinking for Generation?

**Decision**: `docs/MODEL-SELECTION-DECISIONS.md` (2025-11-13)

**Primary Model for Metadata**: `qwen/qwen3-235b-a22b-thinking-2507`
- Quality: 9/10 for EN and RU
- Reliability: **100% success rate on metadata**
- Price: $0.11 input / $0.60 output per 1M tokens (cheapest)

**Primary Model for Lessons**: `minimax/minimax-m2`
- Quality: 9.5/10 (EN), 10/10 (RU)
- Reliability: **100% success rate**
- **NOT Qwen3-235B-Thinking** due to "постоянные глюки при генерации структуры уроков" (constant glitches in lesson structure generation)

**Key Insight**:
> **Qwen3 235B Thinking - только для метадаты (надежна только там)**

**Relevance to T053**:
- ✅ **CRITICAL**: Qwen3 is ONLY reliable for metadata, NOT for section generation
- ⚠️ **POTENTIAL ROOT CAUSE**: If T053 uses Qwen3 for sections → explains failures
- ✅ **FIX DIRECTION**: Use MiniMax M2 for section generation per MODEL-SELECTION-DECISIONS.md

---

### Why Unified Regeneration System?

**Decision**: `docs/architecture/UNIFIED-REGENERATION-SYSTEM-PRODUCTION.md` (2025-11-10)

**Design**: 5-layer cascading repair system
- **Layer 1**: Auto-repair (FREE, 95-98% success)
- **Layer 2**: Critique-revise (LLM feedback, 70-80% of remaining failures)
- **Layer 3**: Partial regeneration (field-level atomic, 60-70%)
- **Layer 4**: Model escalation (20B → 120B, 50-60%)
- **Layer 5**: Emergency fallback (Gemini, 40-50%)

**Cumulative Success**: 99.9%+ after all layers

**Configuration Philosophy**:
- **Analyze (Stage 4)**: ALL 5 layers (critical infrastructure)
- **Generation (Stage 5)**: Only Layer 1 (cost-optimized)

**Rationale**:
> "Analysis failures дорого обходятся (влияют на Generation, Lesson, Quiz). Лучше потратить $0.10 на repair, чем пропустить ошибку."

**Relevance to T053**:
- ✅ **ARCHITECTURE EXISTS**: Full repair system available
- ⚠️ **UNDERUTILIZED**: Stage 5 only uses Layer 1 (auto-repair)
- ✅ **FIX OPTION**: Enable Layers 2-3 for critical generation phases

---

### Why LangChain + LangGraph?

**Decision**: `docs/ADR-001-LLM-ORCHESTRATION-FRAMEWORK.md` (2025-11-01)

**Chosen**: LangChain + LangGraph StateGraph
- Retry with model escalation (20B → 120B → Gemini)
- Conditional routing for quality validation gates
- Production-proven (LinkedIn, Uber, Klarna)

**Observability**: Custom Supabase (NOT LangSmith)
- Full control over metrics tracking
- No SaaS dependency

**Relevance to T053**:
- ✅ **NATIVE PATTERNS**: Retry/fallback mechanisms built-in
- ✅ **QUALITY GATES**: Conditional edges for validation
- ℹ️ **FRAMEWORK AVAILABLE**: Can leverage for T053 fix

---

## Known Workarounds in Code

### TODO Comments Analysis

**Stage 5 Generation**:
```typescript
// src/services/stage5/section-regeneration-service.ts:394
// TODO: implement proper cost calculation from tokens + model pricing
const costUsd = 0;

// src/services/stage5/metadata-generator.ts:330
// TODO: Consider adding language detection from contextual_language content
return 'en';
```

**Analysis Services**:
```typescript
// src/orchestrator/services/analysis/workflow-graph.ts:95
// TODO: Implement Stage 3 barrier check

// src/orchestrator/services/analysis/langchain-models.ts:103
// TODO: Enable database lookup after llm_model_config table is added
```

**Findings**:
- ❌ **No workarounds related to generation failures**
- ✅ **Cost calculation TODO** is non-blocking (uses placeholder)
- ✅ **Language detection TODO** is non-blocking (defaults to 'en')

---

## Pattern Recognition

### Recurring Themes Across All Issues

#### Theme 1: LLM Output Incompleteness
**Pattern**: LLMs occasionally generate incomplete JSON missing required fields

**Evidence**:
- Phase 2: Missing `key_topics`, `pedagogical_approach` (Issue #1)
- Phase 4: Incomplete JSON "Unexpected end of JSON input" (Issue #2)
- Stage 5: Likely similar incomplete field issues (T053)

**Fix Pattern**: **Hybrid approach**
1. Improved prompts (emphasize required fields)
2. Post-processing safety net (add defaults for missing fields)
3. Result: Zero validation failures

**Application to T053**:
✅ Use same hybrid approach for metadata/section generation

---

#### Theme 2: Repair System Integration Gaps
**Pattern**: New code doesn't always integrate existing repair systems

**Evidence**:
- Phase 4 used raw `JSON.parse()` instead of 5-layer cascade (Issue #2)
- SectionBatchGenerator created UnifiedRegenerator without model (Issue #3)
- Stage 5 only uses Layer 1 of UnifiedRegenerator (underutilized)

**Fix Pattern**: **Systematic Integration**
1. Search for raw `JSON.parse()` calls
2. Replace with UnifiedRegenerator
3. Enable appropriate layers for criticality level

**Application to T053**:
✅ Audit Stage 5 generation phases for repair system usage

---

#### Theme 3: Schema Evolution Complexity
**Pattern**: Schemas evolve between stages, creating validation mismatches

**Evidence**:
- Stage 4 rich nested schema → Stage 5 simplified flattened schema (Issue #4)
- Test fixtures don't always match current schemas

**Fix Pattern**: **Schema Documentation + Validation**
1. Document schema transformations explicitly
2. Add schema validation tests
3. Update fixtures when schemas change

**Application to T053**:
ℹ️ Ensure Stage 5 generation schemas match actual requirements

---

#### Theme 4: Model Selection Per Task
**Pattern**: Different models have different reliability for different tasks

**Evidence**:
- Qwen3-235B-Thinking: 100% reliable for metadata, "constant glitches" for lessons
- MiniMax M2: 100% reliable for both metadata and lessons
- Grok 4 Fast: Best for large context (2M tokens)

**Fix Pattern**: **Task-Specific Model Routing**
1. Test model reliability per task type
2. Use proven models for each task
3. Configure fallback chains

**Application to T053**:
✅ **CRITICAL**: Use MiniMax M2 for section generation, NOT Qwen3

---

## Lessons Learned for Current Fix

### Lesson 1: Hybrid Approach Works
**From**: Phase 2 fix (v0.18.3)

**What Worked**:
- Improved prompts (emphasize required fields)
- Post-processing safety net (add defaults)
- Result: 100% test pass rate

**Apply to T053**:
1. Improve metadata/section generation prompts
2. Add post-processing validation for all required fields
3. Add defaults for optional fields

---

### Lesson 2: Use Proven Repair Patterns
**From**: Phase 4 JSON repair integration

**What Worked**:
- Copy Phase 2's 5-layer cascade pattern
- Add repair metadata tracking
- Result: 40/40 tests passing

**Apply to T053**:
1. Audit Stage 5 for UnifiedRegenerator usage
2. Enable Layer 2 (critique-revise) for critical phases
3. Track repair metrics for observability

---

### Lesson 3: Model Selection Matters
**From**: MODEL-SELECTION-DECISIONS.md

**What Worked**:
- Qwen3-235B-Thinking: Metadata only (100% reliable)
- MiniMax M2: Lessons and universal (100% reliable)
- Task-specific routing prevents failures

**Apply to T053**:
1. **Verify current model usage in T053 test**
2. **If using Qwen3 for sections → switch to MiniMax M2**
3. Use Qwen3 ONLY for metadata generation

---

### Lesson 4: Fail-Fast with Repair Layers
**From**: Unified Regeneration System

**What Worked**:
- Layer 1 (free) solves 95-98% of issues
- Layers 2-5 handle critical edge cases
- Cumulative success: 99.9%+

**Apply to T053**:
1. Enable Layer 2 (critique-revise) for metadata/section generation
2. Keep Layer 1 always enabled (free)
3. Consider Layer 3 (partial-regen) for complex schemas

---

## Recommended Fix Strategy for T053

Based on historical patterns, apply **4-part fix**:

### Part 1: Model Selection (CRITICAL)
**Action**: Verify T053 uses correct models per task
- ✅ Metadata: `qwen/qwen3-235b-a22b-thinking-2507` (proven reliable)
- ✅ Sections: `minimax/minimax-m2` (NOT Qwen3 - "constant glitches")
- ✅ Fallback: `moonshotai/kimi-k2-thinking`

**Evidence**: MODEL-SELECTION-DECISIONS.md line 50
> "Qwen3 235B Thinking НЕ используется для уроков из-за низкой надежности"

---

### Part 2: Post-Processing Safety Net (PROVEN)
**Action**: Add comprehensive field validation like Phase 2
- Validate all required fields exist
- Add defaults for missing fields
- Ensure minimum length requirements

**Pattern**: Copy from Phase 2 fix (commit `8284c10`)

---

### Part 3: Repair System Integration (ARCHITECTURAL)
**Action**: Enable Layer 2 (critique-revise) for critical phases
- Metadata generation: Layer 1 + Layer 2
- Section generation: Layer 1 + Layer 2
- Track repair metrics

**Pattern**: Copy from Phase 4 integration (INV-2025-11-02-003)

---

### Part 4: Prompt Improvements (PROACTIVE)
**Action**: Emphasize required fields in prompts
- Add explicit reminders about required fields
- Add examples showing complete structure
- Specify minimum length requirements

**Pattern**: Copy from Phase 2 prompt enhancements

---

## Next Steps for Orchestrator

1. **Delegate to debugging-specialist** with:
   - This historical context report
   - T053 test logs from previous tasks
   - Focus areas: model selection, post-processing, repair layers

2. **Verification criteria**:
   - ✅ T053 uses MiniMax M2 for section generation (NOT Qwen3)
   - ✅ Post-processing safety net added for all required fields
   - ✅ UnifiedRegenerator Layer 2 enabled for critical phases
   - ✅ Test passes consistently (10+ runs)

3. **Success metrics**:
   - Zero validation failures
   - 100% test pass rate
   - Quality score ≥0.90 (existing threshold)

---

## References

### Investigation Reports
- `INV-2025-11-16-004-t053-phase2-missing-fields.md` - Phase 2 fix (Issue #1)
- `INV-2025-11-02-003-phase4-json-repair.md` - Phase 4 JSON repair (Issue #2)
- `INV-2025-11-11-001-generation-test-failures.md` - UnifiedRegenerator fix (Issue #3)
- `INV-2025-11-11-003-regenerate-section-validation-failures.md` - Schema mismatch (Issue #4)
- `INV-2025-11-17-006-t053-phase1-reasoning-RESOLVED.md` - False positive (stale job)

### Architecture Documents
- `docs/ADR-001-LLM-ORCHESTRATION-FRAMEWORK.md` - LangChain/LangGraph decision
- `docs/MODEL-SELECTION-DECISIONS.md` - Model selection per task (2025-11-13)
- `docs/architecture/UNIFIED-REGENERATION-SYSTEM-PRODUCTION.md` - 5-layer repair system

### Key Commits
- `8284c10` - Phase 2 post-processing safety net (2025-11-16)
- `4893e2b` - Robust JSON parsing with Zod validation (earlier)
- `8284c10` - UnifiedRegenerator model instance fix (same commit)

---

**Investigation Complete**: 2025-11-17
**Status**: ✅ Comprehensive historical context established
**Next**: Delegate to debugging-specialist for root cause analysis with this context
