# FUTURE-002: Apply RT-005 Pragmatic Hybrid to Stage 5 Generation

**Priority**: HIGH (Blocks Stage 5 production)
**Effort**: 46 hours (reuse Stage 4 implementation + adaptations)
**Context**: Apply RT-005 to Stage 5 Generation (T015, T019, T020, T029-B)
**Dependency**: RT-005 ✅, FUTURE-001 (Stage 4 enhancement recommended but not required)

---

## OBJECTIVE

Apply RT-005 Pragmatic Hybrid approach to Stage 5 Generation services to achieve 90-95% success rate at $0.35-0.38/course cost with RT-003 token budget compliance (120K total, 90K input max).

---

## SCOPE

**Files to Create/Modify** (per tasks.md):
1. **T015**: `json-repair.ts` - Reuse Stage 4 implementation + RT-003 budget checks
2. **T016**: `field-name-fix.ts` - Reuse Stage 4 implementation
3. **T019**: `metadata-generator.ts` - Integrate repair cascade
4. **T020**: `section-batch-generator.ts` - Integrate repair cascade
5. **T029-B**: `generation-phases.ts` - RT-004 retry + repair hooks

---

## ADAPTATIONS FROM STAGE 4

### 1. Token Budget Integration (RT-003)

**Stage 4**: No strict token budget (analysis)
**Stage 5**: RT-003 constants enforced

```typescript
// Before repair attempt, check budget headroom
const TOTAL_BUDGET = 120_000; // RT-003
const INPUT_MAX = 90_000;     // RT-003
const REPAIR_OVERHEAD = 250;   // RT-005 LLM repair tokens

if (tokensUsed + REPAIR_OVERHEAD > INPUT_MAX) {
  // Skip LLM repair, use FSM only
  return fsmRepair(json);
}
```

### 2. Quality Gates Integration (RT-004)

**Stage 4**: Semantic similarity (contextual_language, synthesis)
**Stage 5**: RT-004 thresholds

```typescript
// Metadata quality gate (RT-004)
const METADATA_QUALITY_THRESHOLD = 0.85; // completeness, coherence
const SECTION_QUALITY_THRESHOLD = 0.75;  // semantic similarity

// Multi-step trigger adapted for RT-004
const shouldUseMultiStep =
  errorCount >3 ||
  semanticSimilarity <0.75 ||  // RT-004 threshold
  retryCount >=2;               // RT-004 retry count
```

### 3. Model Routing Integration (RT-001)

**Stage 4**: OSS 20B → 120B → Gemini
**Stage 5**: RT-001 hybrid routing

```typescript
// Metadata: critical fields → qwen3-max, non-critical → OSS 120B + escalation
// Sections: OSS 120B primary (70-75%), qwen3-max complex (20-25%), Gemini overflow (5%)
// Repair model selection follows RT-001 strategy
```

---

## IMPLEMENTATION ROADMAP

### Week 1: Foundation (10 hours)

**T015-RT005: json-repair.ts + field-name-fix.ts**:
- Copy from Stage 4 (FUTURE-001)
- Add RT-003 token budget checks
- Add RT-001 model routing awareness
- Add repair strategy metrics

### Week 2-3: Service Integration (24 hours)

**T019-RT005: metadata-generator.ts**:
- Integrate `parseMetadata()` with repair cascade
- RT-004 retry logic (10 attempts) + repair hooks
- RT-001 hybrid routing (critical/non-critical fields)
- Monitoring: repair success rate, token savings

**T020-RT005: section-batch-generator.ts**:
- Integrate `parseSections()` with repair cascade
- RT-004 retry logic + semantic similarity validation
- Multi-step pipeline for complex sections

**T029-B-RT005: generation-phases.ts**:
- Wrap `generateMetadata()` with repair-aware retry
- Wrap `generateSections()` with repair-aware retry
- Track: modelUsed, escalation counts, repair strategy
- Cost tracking: accumulate per phase

### Week 4: Testing (12 hours)

**T015-TESTING**:
- Unit tests: Each repair layer (FSM, cascade, LLM, multi-step)
- Integration tests: 100 test courses (title-only, full Analyze, different languages)
- Edge cases: Large JSON (>10K), deep nesting (>50), concurrent errors (>3)
- Budget compliance: Verify RT-003 limits not exceeded

---

## SUCCESS CRITERIA (from RT-005)

- ✅ Success rate: 90-95% (target from RT-005)
- ✅ Cost: $0.35-0.38/course (within RT-001/RT-004 budgets)
- ✅ Token budget: ≤95% of 90K input max (RT-003)
- ✅ Parse errors: 95-98% repaired (jsonrepair)
- ✅ Complex errors: 95-99% repaired (multi-step)
- ✅ Token savings: 20-30% vs full regeneration

---

## MONITORING METRICS

**Add to Supabase `generation_metadata` (T001 schema)**:
```typescript
{
  repair_strategy_used: {
    metadata: 'jsonrepair_fsm' | 'custom_cascade' | 'llm_repair' | 'multistep',
    sections: ['jsonrepair_fsm', 'llm_repair', ...]
  },
  repair_attempts: {
    metadata: 2,
    sections: [1, 3, 1, ...]
  },
  repair_cost_usd: 0.05, // Separate from generation cost
  repair_success_rate: 0.95
}
```

---

## REFERENCE

**Implementation Prompt**: `specs/008-generation-generation-json/research-decisions/rt-005-pragmatic-hybrid-implementation-prompt.md`

**Key Sections**:
- MIGRATION NOTES FOR STAGE 4 → STAGE 5
- Adapt Token Budgets (RT-003)
- Adapt Quality Gates (RT-004)
- Reuse jsonrepair, multi-step, Instructor pattern

**Related Research**:
- RT-001: Multi-model orchestration (model routing for repair)
- RT-003: Token budget validation (repair overhead limits)
- RT-004: Quality validation & retry logic (escalation integration)
- RT-005: JSON repair strategy (Pragmatic Hybrid)

---

**Status**: PENDING (BLOCKED by T015, T019, T020, T029-B tasks)
**Created**: 2025-11-08
**Related**: RT-005 ✅, FUTURE-001 (Stage 4 enhancement)
