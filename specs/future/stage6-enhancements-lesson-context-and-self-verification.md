# Future Enhancement: Stage 6 Lesson Context & Self-Verification

**Created**: 2024-12-24
**Status**: Planned
**Priority**: Medium
**Complexity**: High

## Overview

Two related enhancements to improve lesson quality in Stage 6 generation pipeline:

1. **Inter-Lesson Context**: Add connections between lessons (previous/next)
2. **Self-Verification Phase**: Pre-judge hallucination detection

---

## Enhancement 1: Inter-Lesson Context

### Problem Statement

Currently, each lesson is generated in isolation. The LLM has no knowledge of:
- What the student learned in previous lessons
- Which concepts have already been explained
- What topics will be covered next
- How this lesson fits into the course narrative

This leads to:
- Redundant explanations of concepts already covered
- Missing "bridge" content connecting lessons
- No forward references ("in the next lesson, we'll...")
- No backward references ("as we learned in...")
- Inconsistent terminology progression

### Proposed Solution

Add `lesson_context` field to `LessonSpecificationV2`:

```typescript
lesson_context: z.object({
  // Previous lesson info
  previous_lesson: z.object({
    lesson_id: z.string(),           // "1.2"
    title: z.string(),               // "Introduction to Hooks"
    key_concepts: z.array(z.string()), // ["useState", "useEffect"]
    summary: z.string().max(500),    // Brief summary for context
  }).nullable(),

  // Next lesson preview
  next_lesson: z.object({
    lesson_id: z.string(),
    title: z.string(),
    preview: z.string().max(300),    // Teaser for next lesson
  }).nullable(),

  // Cumulative course knowledge
  concepts_already_covered: z.array(z.string()), // All concepts from lessons 1.1 to current-1
  terms_already_defined: z.array(z.string()),    // Terms that don't need re-explanation
})
```

### Implementation Options

#### Option A: Generate Context Post-Lesson (Recommended)

After each lesson is generated, extract:
1. Key concepts covered
2. New terms introduced
3. Summary for next lesson's context

**Pros**:
- Context is accurate to actual generated content
- Same model that wrote lesson extracts context
- Can be done as part of Smoother or new "Contextualizer" node

**Cons**:
- Requires sequential lesson generation (can't parallelize)
- Adds latency per lesson

```
Lesson N Generated → Extract Context → Store → Use in Lesson N+1
```

#### Option B: Pre-Generate Context from Specifications

Use Stage 5 lesson specifications to pre-compute:
1. What each lesson will cover (from learning objectives)
2. Dependencies between lessons

**Pros**:
- Can parallelize lesson generation
- Faster overall

**Cons**:
- Context is based on spec, not actual content
- May be less accurate

#### Option C: Hybrid Approach

1. Pre-generate basic context from specs (Option B)
2. After all lessons generated, do a "coherence pass" to add inter-lesson references

### Affected Components

| Component | Changes Needed |
|-----------|----------------|
| `LessonSpecificationV2` | Add `lesson_context` field |
| Stage 5 Generator | Generate context for each lesson |
| Stage 6 Planner | Use context in intro planning |
| Stage 6 Assembler | Add previous/next references |
| `stage6_planner` prompt | Add `<lesson_context>` section |
| `stage6_assembler` prompt | Add instructions for bridges |

### Prompt Additions (Draft)

For `stage6_planner`:

```xml
<lesson_context>
  {{#previousLesson}}
  <previous_lesson>
    <title>{{previousLesson.title}}</title>
    <summary>{{previousLesson.summary}}</summary>
    <key_concepts>{{previousLesson.key_concepts}}</key_concepts>
  </previous_lesson>
  {{/previousLesson}}

  {{#nextLesson}}
  <next_lesson>
    <title>{{nextLesson.title}}</title>
    <preview>{{nextLesson.preview}}</preview>
  </next_lesson>
  {{/nextLesson}}

  <concepts_covered_in_course>
    {{conceptsAlreadyCovered}}
  </concepts_covered_in_course>
</lesson_context>

<!-- Add to task section -->
IMPORTANT:
- In Introduction, reference what was learned in the previous lesson
- Do NOT re-explain concepts from: {{termsAlreadyDefined}}
- In Conclusion, preview what's coming in the next lesson
```

---

## Enhancement 2: Self-Verification Phase

### Problem Statement

Currently, content goes through this flow:

```
Planner → Expander → Assembler → Smoother → Judge (CLEV voting)
```

The Judge phase catches issues but:
- Uses separate LLM calls (expensive)
- Happens after full content is generated
- May require multiple refinement iterations

### Proposed Solution

Add a **Self-Verification** step where the generating model checks its own output before the Judge phase.

```
Planner → Expander → Assembler → Smoother → SELF-VERIFY → Judge
                                               ↓
                                     (Quick self-check)
```

### Self-Verification Checks

1. **Factual Accuracy**
   - Are statistics/numbers verifiable?
   - Are claims supported by RAG context?
   - Are there any invented facts?

2. **Terminology Consistency**
   - Same terms used throughout?
   - No conflicting definitions?

3. **Logical Coherence**
   - Do examples match explanations?
   - Is the flow logical?

4. **Hallucination Detection**
   - Flag any content not grounded in:
     - RAG context
     - Common knowledge
     - Lesson specification

### Implementation Options

#### Option A: Same-Model Self-Check

After Smoother, add prompt:

```
Review the content you just generated. Identify:
1. Any facts or statistics that may be incorrect
2. Any claims not supported by the provided context
3. Any logical inconsistencies

For each issue found, provide:
- Location in content
- Nature of concern
- Confidence level (low/medium/high)
```

**Pros**:
- Fast (single model call)
- Model has context from generation

**Cons**:
- Model may have blind spots to own errors

#### Option B: Different-Temperature Self-Check

Use same model but with lower temperature (0.1) to review:

```
As a fact-checker, review this educational content...
```

**Pros**:
- More critical perspective
- Still efficient

**Cons**:
- May not catch all issues

#### Option C: Cross-Reference with RAG

For each factual claim in the content:
1. Extract claim
2. Search RAG for supporting evidence
3. Flag unsupported claims

**Pros**:
- Grounded verification
- High accuracy

**Cons**:
- More complex
- Additional RAG calls

### Proposed New Node: Verifier

Add after Smoother, before Judge:

```typescript
// nodes/verifier.ts
export async function verifierNode(state: LessonGraphStateType): Promise<LessonGraphStateUpdate> {
  const { smoothedContent, ragChunks, lessonSpec } = state;

  // 1. Extract factual claims from content
  const claims = await extractClaims(smoothedContent);

  // 2. Verify each claim against RAG
  const verificationResults = await verifyClaims(claims, ragChunks);

  // 3. Flag unverified claims
  const flags = verificationResults.filter(r => !r.verified);

  // 4. If critical flags, trigger self-correction
  if (flags.some(f => f.severity === 'critical')) {
    return {
      needsSelfCorrection: true,
      verificationFlags: flags,
      currentNode: 'self-corrector',
    };
  }

  return {
    verificationFlags: flags,
    currentNode: 'judge',
  };
}
```

### Integration with Existing Judge

The self-verification results can be passed to Judge:

```typescript
// In judge prompt
<self_verification_results>
  <flags_count>{{flagsCount}}</flags_count>
  <flags>
    {{#verificationFlags}}
    <flag severity="{{severity}}">
      <claim>{{claim}}</claim>
      <concern>{{concern}}</concern>
    </flag>
    {{/verificationFlags}}
  </flags>
</self_verification_results>
```

Judge can then:
- Focus on flagged areas
- Skip re-checking verified content
- Faster evaluation

---

## Implementation Roadmap

### Phase 1: Research (1-2 days)

1. [ ] Analyze current lesson outputs for context gaps
2. [ ] Measure hallucination rate in current generation
3. [ ] Benchmark Judge effectiveness

### Phase 2: Inter-Lesson Context (3-5 days)

1. [ ] Extend `LessonSpecificationV2` schema
2. [ ] Create context extraction logic (post-lesson)
3. [ ] Update Stage 5 to generate context
4. [ ] Modify Stage 6 prompts
5. [ ] Test with sample course

### Phase 3: Self-Verification (3-5 days)

1. [ ] Implement claim extraction
2. [ ] Implement RAG-based verification
3. [ ] Create Verifier node
4. [ ] Integrate with Judge pipeline
5. [ ] Measure improvement

### Phase 4: Integration & Testing (2-3 days)

1. [ ] End-to-end testing
2. [ ] Performance benchmarking
3. [ ] Cost analysis
4. [ ] Documentation

---

## Success Metrics

### Inter-Lesson Context

- [ ] 100% of lessons reference previous lesson (where applicable)
- [ ] 100% of lessons preview next lesson (where applicable)
- [ ] No redundant concept re-explanations
- [ ] Consistent terminology across course

### Self-Verification

- [ ] 50%+ reduction in Judge iterations
- [ ] 80%+ of hallucinations caught before Judge
- [ ] <10% increase in generation time
- [ ] <15% increase in token cost

---

## Dependencies

- Stage 5 must generate lesson order information
- RAG context must be available for verification
- LangGraph state must support new fields

## Related Files

- `packages/shared-types/src/lesson-specification-v2.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/`
- `packages/course-gen-platform/src/shared/prompts/prompt-registry.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/`

## Notes

- Consider token budget impact for additional context
- May need to adjust RAG chunk allocation
- Self-verification could be optional (configurable)
