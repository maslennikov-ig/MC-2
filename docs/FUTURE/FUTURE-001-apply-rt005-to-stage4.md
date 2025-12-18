# FUTURE-001: Apply RT-005 Pragmatic Hybrid to Stage 4 Analysis

**Priority**: MEDIUM
**Effort**: 34 hours (Week 1: 10h, Week 2-3: 24h)
**Context**: Enhance existing Stage 4 Analysis JSON repair with RT-005 decisions
**Dependency**: RT-005 research complete ✅ (2025-11-08)

---

## OBJECTIVE

Apply RT-005 Pragmatic Hybrid approach to Stage 4 Analysis orchestration (`packages/course-gen-platform/src/orchestrator/services/analysis/`) to improve JSON repair success rate from 85-90% to 95-97%.

---

## SCOPE

**Files to Modify**:
1. `json-repair.ts` - Replace custom FSM with jsonrepair library
2. `field-name-fix.ts` - NEW utility (camelCase ↔ snake_case)
3. `partial-regenerator.ts` - Add multi-step pipeline (critique → revise)
4. `langchain-models.ts` - Add `generateWithSchema()` helper
5. `langchain-observability.ts` - Add repair strategy metrics

**Keep Unchanged**:
- LangChain/LangGraph orchestration (ADR-001)
- `analysis-validators.ts` (layered validation)
- Custom Supabase observability

---

## IMPLEMENTATION ROADMAP

### Week 1: Quick Wins (10 hours)

**T-STAGE4-001: jsonrepair Integration** (4h):
- Install `pnpm add jsonrepair`
- Replace custom 6-strategy FSM in `json-repair.ts`
- Keep fallback to custom strategies
- Expected: +5-8% parse success (85-90% → 95-98%)

**T-STAGE4-002: Field Name Auto-Fix** (2h):
- Create `field-name-fix.ts` utility
- camelCase ↔ snake_case converter
- 100% success, zero cost

**T-STAGE4-003: Repair Metrics** (4h):
- Add Prometheus/Pino metrics:
  - `json_repair_attempts_total`
  - `json_repair_success_total`
  - `json_repair_duration_ms`
  - `json_repair_cost_usd_total`
- Log to Supabase `llm_phase_metrics`

### Week 2-3: Advanced Features (24 hours)

**T-STAGE4-004: Multi-Step Pipeline** (12h):
- Add `regenerateWithCritique()` to `partial-regenerator.ts`
- Trigger: `errorCount >3` OR `semanticValidationFailed >=2`
- Pattern: Step 1 (critique) → Step 2 (revise)
- Expected: +2-4% complex error success (90-95% → 95-99%)

**T-STAGE4-005: Instructor Pattern Helper** (8h):
- Add `generateWithSchema()` to `langchain-models.ts`
- Use for: classification, contextual_language (simple single-phase)
- Keep LangGraph for: full 6-phase orchestration

**T-STAGE4-006: Testing** (4h):
- Unit tests: jsonrepair vs custom strategies
- Integration tests: 100 test courses with injected errors
- Edge cases: large JSON, deep nesting, concurrent errors

---

## SUCCESS CRITERIA

- ✅ Parse error success: 95-98% (jsonrepair)
- ✅ Complex error success: 95-99% (multi-step)
- ✅ Overall success rate: 95-97%
- ✅ Cost: No increase (Stage 4 has no strict budget)
- ✅ All existing tests pass
- ✅ No regression in quality scores

---

## REFERENCE

**Implementation Prompt**: `specs/008-generation-generation-json/research-decisions/rt-005-pragmatic-hybrid-implementation-prompt.md`

**Key Sections**:
- KEEP: LangChain orchestration, partial regeneration, layered validation
- UPGRADE: jsonrepair library, multi-step pipeline, Instructor pattern
- REJECT: Full Instructor-TS migration

---

**Status**: PENDING
**Created**: 2025-11-08
**Related**: RT-005 ✅, FUTURE-002 (Stage 5 application)
