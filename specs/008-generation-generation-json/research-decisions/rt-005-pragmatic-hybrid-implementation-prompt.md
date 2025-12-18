# RT-005: Pragmatic Hybrid Implementation Prompt

**Decision Date**: 2025-11-08
**Context**: Stage 5 Generation JSON repair strategy
**Approach**: Hybrid (Current Stage 4 patterns + RT-005 best practices)

---

## OBJECTIVE

Enhance existing LangChain-based Stage 4 JSON repair with proven libraries and patterns from RT-005 research while preserving 90% of working code.

---

## CORE DECISIONS

### ✅ KEEP (From Current Stage 4)

1. **LangChain + LangGraph Orchestration** (ADR-001)
   - StateGraph for multi-phase workflows
   - `withRetry()` + `withFallbacks()` for model escalation (20B → 120B → Gemini)
   - Conditional routing for quality gates
   - **Rationale**: Proven in production, team familiar, better for complex workflows

2. **Partial Regeneration** (`partial-regenerator.ts`)
   - Field-level atomicity: Regenerate ONLY failed fields
   - Zod `.safeParse()` to identify successful vs failed fields
   - **Rationale**: 30-40% cost savings vs full regeneration

3. **Layered Validation** (`LLM-VALIDATION-BEST-PRACTICES.md`)
   - Layer 1: Zod type validation (40% coverage, $0)
   - Layer 2: Rule-based structural (Bloom's, placeholders, 50% coverage, $0)
   - Layer 3: Semantic (Jina-v3 embeddings, 5-10% coverage, conditional)
   - **Rationale**: 3 layers > Instructor 2 layers, comprehensive coverage

4. **Custom Supabase Observability** (`langchain-observability.ts`)
   - No LangSmith dependency
   - Full control over metrics
   - **Rationale**: No SaaS lock-in, existing infrastructure

### ✅ UPGRADE (From RT-005 Research)

1. **Replace Custom FSM with jsonrepair Library**
   - **Current**: `json-repair.ts` custom 6-strategy impl (85-90% success)
   - **New**: `jsonrepair` npm library (95-98% success)
   - **Why**: +5-8% success, 713K weekly downloads, zero dependencies, TypeScript native
   - **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/json-repair.ts`
   - **Effort**: 4 hours
   - **Keep**: Fallback to custom strategies if jsonrepair fails

2. **Add Multi-Step Pipeline for Complex Errors**
   - **Pattern**: Critique (Step 1) → Revise (Step 2)
   - **Trigger**: `errorCount >3` OR `semanticValidationFailed >=2`
   - **Success**: 95-99% (vs 90-95% single-step)
   - **Where**: Add to `partial-regenerator.ts` as optional mode
   - **Effort**: 12 hours
   - **Rationale**: Handles reasoning errors, Constitutional AI pattern

3. **Add Instructor `response_model` Pattern Locally**
   - **Purpose**: Schema-first validation for simple single-phase calls
   - **Where**: New helper in `langchain-models.ts` → `generateWithSchema()`
   - **Use Cases**: Classification, metadata generation (NOT full orchestration)
   - **Effort**: 8 hours
   - **Keep LangGraph**: For multi-phase complex workflows

4. **Add Field-Name Auto-Fix Utility**
   - **Pattern**: camelCase ↔ snake_case converter
   - **Success**: 100%, zero cost
   - **File**: New `field-name-fix.ts` utility
   - **Effort**: 2 hours

### ❌ REJECT (From RT-005 Variant 2)

1. **NO Full Instructor-TS Migration**
   - **Why**: LangChain better for multi-phase workflows (Stage 5-7 extensibility)
   - **Cost**: -8-10% cheaper ($0.35-0.38 vs $0.38-0.42)
   - **Effort**: -53% faster (34h vs 72h)

2. **NO Replace Layered Validation**
   - **Why**: 3-layer coverage > Instructor 2-layer
   - **Keep**: Bloom's Taxonomy, placeholder detection, semantic similarity

---

## IMPLEMENTATION ROADMAP

### Week 1: Quick Wins (10 hours)

**T015-UPGRADE: jsonrepair Integration** (4h):
- Install `pnpm add jsonrepair`
- Replace custom FSM in `json-repair.ts`:
  ```typescript
  import { jsonrepair } from 'jsonrepair';

  export function repairJSON(rawOutput: string): RepairResult {
    // Try jsonrepair first
    try {
      const repaired = jsonrepair(rawOutput);
      const parsed = JSON.parse(repaired);
      return { success: true, repaired: parsed, strategy: 'jsonrepair_fsm' };
    } catch (err) {
      // Fallback to custom strategies
      return tryCustomStrategies(rawOutput);
    }
  }
  ```
- Keep existing 6 custom strategies as fallback

**T016-FIELD-NAME: Field Name Auto-Fix** (2h):
- Create `field-name-fix.ts` utility
- camelCase ↔ snake_case converter
- Language-agnostic (EN/RU/DE/ES)

**T015-MONITORING: Repair Metrics** (4h):
- Add Prometheus/Pino metrics:
  - `json_repair_attempts_total` (strategy: jsonrepair | custom_cascade | llm)
  - `json_repair_success_total` (attempt: 1-10, layer: 1-4)
  - `json_repair_duration_ms`
  - `json_repair_cost_usd_total`
- Log to Supabase `llm_phase_metrics`

### Week 2-3: Advanced Features (24 hours)

**T015-MULTISTEP: Multi-Step Pipeline** (12h):
- Add to `partial-regenerator.ts`:
  ```typescript
  export async function regenerateWithCritique(
    schema: z.ZodSchema,
    partialData: any,
    originalPrompt: string,
    model: ChatOpenAI
  ): Promise<RegenerationResult> {
    // Step 1: Self-critique
    const critiquePrompt = buildCritiquePrompt(partialData, schema);
    const critique = await model.invoke(critiquePrompt);

    // Step 2: Revise based on critique
    const revisePrompt = buildRevisePrompt(originalPrompt, critique);
    const revised = await model.invoke(revisePrompt);

    return parseAndValidate(revised, schema);
  }
  ```
- Trigger conditions:
  - `errorCount >3` (too many concurrent errors)
  - `semanticValidationFailed >=2` (quality issues)
  - `complexityScore >0.75` (complex reasoning required)

**T019-INSTRUCTOR-PATTERN: Structured Output Helper** (8h):
- Add to `langchain-models.ts`:
  ```typescript
  export async function generateWithSchema<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    model: ChatOpenAI,
    options?: { maxRetries?: number }
  ): Promise<T> {
    return model
      .withStructuredOutput(schema)
      .withRetry({ stopAfterAttempt: options?.maxRetries || 3 })
      .invoke(prompt);
  }
  ```
- Use for: classification phase, metadata generation (simple single-phase)
- Keep LangGraph for: full multi-phase orchestration (Stage 5 workflows)

**T015-TESTING: Comprehensive Tests** (4h):
- Unit tests: jsonrepair vs custom strategies
- Integration tests: 100 courses with injected errors
- Edge cases: large JSON (>10K tokens), deep nesting (>50 levels), concurrent errors

---

## EXPECTED RESULTS

| Metric | Target | Achievable |
|--------|--------|------------|
| **Success Rate** | 90-95% | **95-97%** |
| **Cost per Course** | $0.30-0.42 | **$0.35-0.38** |
| **Parse Error Success** | - | **95-98%** (jsonrepair) |
| **Complex Error Success** | - | **95-99%** (multi-step) |
| **Implementation Effort** | - | **34 hours** (vs 72h Instructor) |
| **Code Reuse** | - | **90%** (LangChain + validators) |

---

## KEY FILES TO MODIFY

1. **json-repair.ts**: Replace FSM with jsonrepair library
2. **field-name-fix.ts**: NEW utility (camelCase ↔ snake_case)
3. **partial-regenerator.ts**: Add `regenerateWithCritique()` multi-step
4. **langchain-models.ts**: Add `generateWithSchema()` helper
5. **analysis-validators.ts**: NO changes (keep existing)
6. **langchain-observability.ts**: Add repair strategy metrics

---

## MIGRATION NOTES FOR STAGE 4 → STAGE 5

**When applying this to Stage 5 Generation**:

1. **Reuse jsonrepair Integration**:
   - Same `json-repair.ts` utility
   - Same repair cascade logic
   - Same monitoring metrics

2. **Reuse Multi-Step Pipeline**:
   - Apply `regenerateWithCritique()` pattern
   - Trigger conditions: `errorCount >3`, quality failures
   - Use for: metadata generation, section generation

3. **Reuse Instructor Pattern**:
   - `generateWithSchema()` for simple calls
   - Keep LangGraph for orchestration (5-phase workflow from RT-002)

4. **Adapt Token Budgets**:
   - Stage 4: No strict budget (analysis)
   - Stage 5: RT-003 constants (120K total, 90K input max)
   - Add budget checks before repair attempts

5. **Adapt Quality Gates**:
   - Stage 4: Semantic similarity (contextual_language, synthesis)
   - Stage 5: RT-004 thresholds (0.75 similarity, 0.85 metadata quality)

---

## REFERENCES

- **RT-005 Research**: `docs/research/008-generation/JSON Repair and Regeneration Strategies for LLM.md`
- **RT-005 Decision**: `specs/008-generation-generation-json/research-decisions/rt-005-json-repair-regeneration.md`
- **Current Stage 4 Implementation**: `packages/course-gen-platform/src/orchestrator/services/analysis/`
- **ADR-001**: `docs/ADR-001-LLM-ORCHESTRATION-FRAMEWORK.md` (LangChain rationale)
- **Validation Best Practices**: `docs/generation/LLM-VALIDATION-BEST-PRACTICES.md`

---

**Status**: APPROVED - Ready for Stage 4 enhancement + Stage 5 application
**Next**: Execute Week 1 (T015-UPGRADE, T016-FIELD-NAME, T015-MONITORING)
