# Task A31: Regeneration Pattern Unification Investigation

**Date Created**: 2025-11-10
**Priority**: HIGH (architectural consistency)
**Status**: INVESTIGATION REQUIRED
**Effort**: 4-6 hours (investigation + implementation)

---

## Executive Summary

During Phase 2 completion (A26-A30), we discovered that **Analyze** and **Generation** use **different regeneration patterns**:

- **Analyze**: Has 5-layer progressive repair with **critique → revise pattern** (`revision-chain.ts`)
- **Generation**: Has 2-layer repair with **simple quality-based retry** (no critique)

**Goal**: Conduct detailed investigation to unify regeneration patterns across both stages.

---

## Context

### What We Know So Far

**Analyze (Stage 4)** implements 5-layer progressive repair strategy:
1. **Layer 0**: Direct `JSON.parse()`
2. **Layer 1**: `json-repair.ts` - jsonrepair library + 6 custom FSM strategies
3. **Layer 2**: `revision-chain.ts` - **LLM critique → revise pattern** ✅
4. **Layer 3**: `partial-regenerator.ts` - field-level regeneration (Zod-based)
5. **Layer 4**: Full retry with model escalation (20B → 120B)

**Generation (Stage 5)** implements simpler strategy:
1. **Layer 1**: `json-repair.ts` - jsonrepair library + 4 custom strategies
2. **Layer 2**: Quality-based retry loop (maxRetries = 2, no critique)

### Key Question

**Which pattern is better?**
- Analyze's critique → revise (shows LLM its errors)
- Generation's simple retry (repeats same prompt)

### Specification Context

**A31 from ANALYZE-ENHANCEMENT-UNIFIED.md Part 2.3**:
```typescript
export async function regenerateWithCritique(
  phase: string,
  previousOutput: string,
  errors: ValidationError[]
): Promise<string> {
  // Step 1: Critique (identify root cause)
  const critique = await llm.invoke(`
    Analyze why this output failed validation:
    Output: ${previousOutput}
    Errors: ${JSON.stringify(errors)}
    Identify root cause and suggest fix strategy.
  `);

  // Step 2: Revise (regenerate with critique context)
  const revised = await llm.invoke(`
    Previous output had issues: ${critique}
    Regenerate ${phase} output addressing these issues.
  `);

  return revised;
}
```

**Trigger**: `errorCount >3` OR `semanticValidationFailed >=2`

---

## Investigation Scope

### Phase 1: Deep Code Analysis (2-3 hours)

#### Analyze Stage Patterns

**Files to investigate**:
1. `packages/course-gen-platform/src/orchestrator/services/analysis/revision-chain.ts`
   - How does critique → revise work?
   - What errors does it handle?
   - Success rate in practice?
   - Token cost per revision?

2. `packages/course-gen-platform/src/orchestrator/services/analysis/partial-regenerator.ts`
   - What's the difference vs revision-chain?
   - When is it triggered?
   - Field-level vs full regeneration?

3. Usage in phases:
   - `phase-1-classifier.ts` - uses what?
   - `phase-2-scope.ts` - uses what?
   - `phase-3-expert.ts` - uses what?
   - `phase-4-synthesis.ts` - uses what?
   - `phase-6-rag-planning.ts` - uses what?

**Key questions**:
- Does `revision-chain.ts` actually implement critique → revise from A31 spec?
- Or is it just "show LLM its error" pattern?
- How often is it triggered?
- What's the success rate?

#### Generation Stage Patterns

**Files to investigate**:
1. `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`
   - Retry logic: lines 174-240
   - Quality validation: `validateMetadataQuality()`
   - Why no critique pattern?

2. `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
   - Does it have retry logic?
   - JSON repair strategy?
   - Quality validation?

**Key questions**:
- Why was simple retry chosen for Generation?
- Is there a performance/cost reason?
- Would critique → revise help?

#### JSON Repair Comparison

**Files to compare**:
1. Analyze: `packages/course-gen-platform/src/orchestrator/services/analysis/json-repair.ts`
2. Generation: `packages/course-gen-platform/src/services/stage5/json-repair.ts`

**Compare**:
- Number of repair strategies
- Success rates
- Token costs
- Integration patterns

### Phase 2: Pattern Analysis (1-2 hours)

#### Create Comparison Matrix

| Aspect | Analyze | Generation | Winner? |
|--------|---------|------------|---------|
| **Repair strategies** | jsonrepair + 6 FSM | jsonrepair + 4 | ? |
| **Critique → Revise** | revision-chain.ts | None | ? |
| **Field-level regen** | partial-regenerator.ts | None | ? |
| **Model escalation** | 20B → 120B | qwen3-max fixed | ? |
| **Retry logic** | Complex (5 layers) | Simple (2 layers) | ? |
| **Token cost** | ? | ? | ? |
| **Success rate** | ? | ? | ? |
| **Code complexity** | HIGH (5 files) | LOW (2 files) | ? |

#### Identify Best Practices

**Questions to answer**:
1. Which pattern has better success rate?
2. Which pattern has lower token cost?
3. Which pattern is more maintainable?
4. Should we unify or keep separate?

### Phase 3: Implementation Plan (1 hour)

Based on Phase 1-2 findings, create one of:

**Option A: Unify on Analyze Pattern** (if Analyze is better)
- Move `revision-chain.ts` to shared package
- Integrate into Generation
- Update `metadata-generator.ts` to use critique → revise
- Add field-level regeneration to Generation

**Option B: Unify on Generation Pattern** (if Generation is better)
- Simplify Analyze to match Generation
- Remove redundant layers
- Keep only jsonrepair + simple retry

**Option C: Keep Separate** (if both have merits)
- Document why patterns differ
- Explain trade-offs
- Update specs to reflect decisions

---

## Investigation Deliverables

### Document to Create

**File**: `specs/008-generation-generation-json/dependencies/analyze-enhancement/A31-REGENERATION-PATTERNS-ANALYSIS.md`

**Structure**:
```markdown
# Regeneration Patterns Analysis: Analyze vs Generation

## Executive Summary
- Key findings
- Recommendation (Option A/B/C)
- Implementation plan

## Current State Analysis

### Analyze Stage (Stage 4)
- Pattern description
- Files involved
- Usage frequency
- Success rates (from A30 metrics if available)
- Token costs
- Pros/Cons

### Generation Stage (Stage 5)
- Pattern description
- Files involved
- Usage frequency
- Success rates
- Token costs
- Pros/Cons

## Comparison Matrix
[Detailed comparison table]

## Code Examples

### Analyze: revision-chain.ts Pattern
[Code snippets with explanation]

### Generation: Simple Retry Pattern
[Code snippets with explanation]

## Performance Analysis

### Token Costs
- Analyze: X tokens per repair attempt
- Generation: Y tokens per repair attempt

### Success Rates
- Analyze: XX% success after Layer 2
- Generation: YY% success after retry

### Code Complexity
- Analyze: 5 repair layers, 3 files, ~800 LOC
- Generation: 2 repair layers, 2 files, ~400 LOC

## Recommendation

### Option [A/B/C]: [Title]

**Rationale**:
1. [Reason 1]
2. [Reason 2]
3. [Reason 3]

**Implementation Plan**:
- [ ] Step 1: ...
- [ ] Step 2: ...
- [ ] Step 3: ...

**Estimated Effort**: X hours

**Files to Modify**:
1. [File 1]
2. [File 2]

**Tests to Add**:
1. [Test 1]
2. [Test 2]

## Migration Strategy

[If unification is recommended]

### Phase 1: Preparation
- Create shared utilities
- Write migration tests

### Phase 2: Implementation
- Update Analyze/Generation
- Validate with existing tests

### Phase 3: Validation
- Run A30 metrics comparison
- Measure token cost changes
- Measure success rate changes

## Appendix

### A31 Specification
[Full spec from ANALYZE-ENHANCEMENT-UNIFIED.md]

### revision-chain.ts Full Code
[Complete code with annotations]

### metadata-generator.ts Retry Logic
[Complete code with annotations]
```

---

## Investigation Instructions

### How to Run Investigation

**Step 1: Start new Claude Code session** (this one is running out of context)

**Step 2: Use this prompt**:
```
I need to investigate and compare regeneration patterns between Stage 4 Analyze and Stage 5 Generation.

Please read the investigation task document:
specs/008-generation-generation-json/dependencies/analyze-enhancement/TASK-A31-REGENERATION-UNIFICATION.md

Then conduct the investigation following the phases outlined in the document.

Create the deliverable: A31-REGENERATION-PATTERNS-ANALYSIS.md with your findings and recommendation.
```

**Step 3: Agent will**:
1. Read all specified files
2. Analyze patterns
3. Create comparison matrix
4. Make recommendation
5. Create implementation plan

**Step 4: Review and decide**:
- Read the analysis document
- Decide on Option A, B, or C
- Assign implementation to appropriate subagent

---

## Success Criteria

✅ Complete code analysis of both stages
✅ Comparison matrix with data (not assumptions)
✅ Clear recommendation with rationale
✅ Implementation plan with effort estimate
✅ Migration strategy (if unification recommended)

---

## Notes

- **A30 metrics** are now available - use them for success rate analysis
- **Don't assume** - verify by reading actual code
- **Consider token costs** - critique → revise adds LLM calls
- **Consider maintenance** - simpler might be better
- **Consider success rates** - complexity might be justified

---

## Related Files

**Analyze**:
- `src/orchestrator/services/analysis/revision-chain.ts`
- `src/orchestrator/services/analysis/partial-regenerator.ts`
- `src/orchestrator/services/analysis/json-repair.ts`
- `src/orchestrator/services/analysis/phase-*.ts` (all phases)

**Generation**:
- `src/services/stage5/json-repair.ts`
- `src/services/stage5/metadata-generator.ts`
- `src/services/stage5/section-batch-generator.ts`

**Specs**:
- `specs/ANALYZE-ENHANCEMENT-UNIFIED.md` (Part 2.3 - A31)
- `specs/008-generation-generation-json/research-decisions/rt-005-pragmatic-hybrid-implementation-prompt.md`

---

## Next Steps After Investigation

1. **If Option A (Unify on Analyze)**:
   - Create task for `utility-builder` or `llm-service-specialist`
   - Move `revision-chain.ts` to shared
   - Integrate into Generation

2. **If Option B (Unify on Generation)**:
   - Create task for `bug-fixer` or refactor specialist
   - Simplify Analyze
   - Remove redundant layers

3. **If Option C (Keep Separate)**:
   - Update documentation
   - Close A31 as "Not Applicable"
   - Move to next feature

---

**Created by**: Claude Code (Session ending due to context limit)
**For continuation**: Start new session, read this task document, conduct investigation
