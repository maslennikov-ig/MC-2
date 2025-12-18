# Deep Research Prompt: LLM Judge for Educational Content Quality Validation

**Status**: Pending Research
**Created**: 2025-11-22
**Related Spec**: `specs/010-stages-456-pipeline/`

---

## Research Context

We are developing a production-grade online course generation system using LLMs. The architecture includes:

- **Stage 5 (Generation)**: Creates LessonSpecification V2 (lesson structure, learning objectives, hook_strategy, depth, content_archetype)
- **Stage 6 (Lesson Content)**: Generates complete lesson text via Hybrid Map-Reduce-Refine pipeline (Planner → Expanders → Assembler → Smoother)

Current specification requires LLM Judge with 3x voting (temperature 0.0) for Stage 5 with a quality threshold of 0.75. LLM Judge is NOT specified for Stage 6.

**Budget per course**: $0.20-$0.50 (all stages combined)
**Lessons per course**: 10-30
**Generation models**: Qwen3-235B (RU), DeepSeek Terminus (EN), Kimi K2 (fallback)

---

## Research Questions

### Block 1: Necessity of LLM Judge for Stage 6

1. Is LLM Judge needed for validating generated lesson content (Stage 6), or is validation of specifications only (Stage 5) sufficient?
2. Which educational content quality metrics can be automatically evaluated via LLM?
3. Are there studies on LLM-as-a-Judge effectiveness for educational content vs. human evaluation? What is the correlation?

### Block 2: Evaluation Architecture

4. Which model is better suited for the Judge role — the same model that generates content, or a fundamentally different one? Is there a "self-evaluation bias" problem?
5. Optimal number of votes: Is 3x voting sufficient? Or does educational content require more/fewer?
6. Vote aggregation strategy: majority vote, arithmetic mean, minimum, or weighted voting?
7. Temperature 0.0 — is it optimal for Judge, or is slight variability (0.1-0.2) better?

### Block 3: Rubric and Evaluation Criteria

8. What criteria should be included in the educational lesson evaluation rubric?
   - Pedagogical structure (intro → body → summary)
   - Alignment with learning objectives
   - Factual accuracy (grounding in RAG context)
   - Readability and clarity
   - Engagement (hook, examples, analogies)
   - Topic coverage completeness
9. How to weight the criteria? Equal weights or priorities?
10. Judge output format: numerical score (0.0-1.0), categorical (excellent/good/fair/poor), or multi-dimensional rubric?

### Block 4: Context for Judge

11. What context should be passed to Judge for lesson evaluation?
    - Generated content only?
    - + LessonSpecification (expectations)?
    - + RAG context (sources)?
    - + Course learning objectives?
12. Does Judge need RAG access for factual grounding verification? Or is this too expensive/complex?
13. How can Judge verify factual accuracy without RAG access?

### Block 5: Correction Strategy (Critical)

14. For low scores (< 0.75) — which strategy is optimal?
    - **Full regeneration** — expensive, loses successful parts
    - **Targeted fixes** — Judge specifies concrete problems and fix prompt
    - **Iterative refinement** — multiple improvement passes
15. For targeted fixes — how to formulate "fix prompts"? Examples from research?
16. How many correction iterations are acceptable before fallback to manual review?
17. How to maintain lesson coherence during targeted fixes (preserve transitions)?

### Block 6: Economics and Performance

18. LLM Judge cost per lesson with 3x voting — what percentage of course budget does this consume?
19. When to run Judge — after each lesson (streaming feedback) or in batches (context efficiency)?
20. Can a cheaper model be used for Judge (e.g., GPT-4o-mini, Claude Haiku)?
21. Are there techniques for reducing Judge cost without quality loss (prompt caching, few-shot calibration)?

### Block 7: Alternatives to LLM Judge

22. What non-LLM metrics can be used for pre-filtering before expensive LLM Judge?
    - Content length vs. expected
    - Readability scores (Flesch-Kincaid)
    - Keyword coverage
    - Structure validation (headers, sections)
23. Hybrid approach: cheap heuristics + LLM Judge only for borderline cases?

---

## Expected Research Output

1. **Recommendation**: Use/don't use LLM Judge for Stage 6 (with justification)
2. **Judge Architecture** (if recommended): model, voting, aggregation, temperature
3. **Evaluation Rubric**: criteria, weights, output format
4. **Context Strategy**: what to pass to Judge
5. **Correction Strategy**: targeted fix vs. regeneration, fix-prompt format
6. **Cost-Benefit Analysis**: Judge cost vs. quality value
7. **Fallback Plan**: what to do when corrections fail

---

## Additional Research Sources

- LLM-as-a-Judge research (G-Eval, JudgeLM, PandaLM, MT-Bench)
- Educational assessment frameworks (Bloom's Taxonomy alignment)
- LLM self-refinement research (Constitutional AI, RLHF, Self-Refine)
- Cost optimization techniques for multi-call LLM pipelines
- Educational content quality metrics (QM Rubric, OSCQR)

---

## Post-Research Actions

After receiving research results:
1. Update `spec.md` with LLM Judge requirements for Stage 6 (if recommended)
2. Add detailed Judge architecture to `plan.md`
3. Create specific tasks in `tasks.md` for Judge implementation
4. Document decision in ADR format

---

*This prompt is designed for Deep Research tools (Perplexity Pro, ChatGPT Deep Research, Claude with web search, etc.)*
