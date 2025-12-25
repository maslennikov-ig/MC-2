# DeepThink Analysis: Stage 6 Architecture Simplification

## Context

We have an over-engineered lesson content generation pipeline (Stage 6) that was designed based on an artificial "< 2 minutes per lesson" latency constraint. This constraint was set in a research prompt but doesn't reflect our actual architecture:

- We use **BullMQ with 30 parallel workers** to generate lessons
- Wall-clock time for 20 lessons is ~2 minutes regardless of per-lesson latency
- The complex pipeline (Planner → Expander → Assembler → Smoother) causes **content truncation bugs**

### Current Pipeline Problems

1. **Smoother node** rewrites entire content with 8K token limit, causing:
   - Loss of 2 out of 6 sections
   - Content truncated mid-sentence ("Какую...")
   - 36K chars input → 22K chars output

2. **6+ LLM calls per lesson** vs 1 needed

3. **Double work**: Expander generates, Smoother rewrites

### Proposed Simplification

Replace complex pipeline with single-pass generation:

```
Current:  LessonSpec → Planner → Expander → Assembler → Smoother → Judge
Proposed: LessonSpec → Generator → SelfReviewer → Judge
```

---

## Questions to Analyze

### 1. Single-Pass Viability

**Question**: Is single-pass generation viable for 5000-word Russian educational lessons with modern LLMs (128K+ context)?

Consider:
- Qwen3-235B, DeepSeek V3, Gemini 2.5 Flash capabilities
- Russian text tokenization (1.3-1.5x more tokens than English)
- 5000 words ≈ 7500-8500 tokens for Russian
- Input context: LessonSpec (~2K) + RAG chunks (~5K) + system prompt (~1K) = ~8K input
- Total context: ~16K tokens (well within 128K limit)

**Expected output**: Analysis of whether single-pass is viable, with evidence from model capabilities.

---

### 2. Optimal Token Limits for Russian

**Question**: What's the optimal `max_tokens` setting for Russian educational content generation?

Consider:
- Target: 3000-5000 words per lesson
- Russian tokenization overhead (Cyrillic vs Latin)
- Need buffer for formatting (markdown headers, lists, code blocks)
- Current broken setting: 8000 tokens (too low)
- Database config: 16384 tokens (ignored by code)

**Expected output**: Recommended max_tokens value with reasoning.

---

### 3. Which Nodes to Keep

**Question**: From the current pipeline, which nodes provide value and should be retained?

Current nodes:
| Node | Purpose | Keep? |
|------|---------|-------|
| Planner | Creates outline from LessonSpec | ? |
| Expander | Parallel section generation | ? |
| Assembler | Merges sections | ? |
| Smoother | Rewrites for transitions | ? |
| SelfReviewer | Heuristic checks (truncation, language) | ? |
| Judge | LLM quality evaluation (CLEV voting) | ? |

Consider:
- LessonSpec already contains section structure, key_points, objectives
- Planner may be redundant
- Smoother is the source of truncation bugs
- SelfReviewer catches issues but doesn't fix them
- Judge provides quality gate

**Expected output**: Table with recommendations for each node.

---

### 4. Edge Case Handling

**Question**: How should we handle rare edge cases of very long lessons (> 8 sections, > 25K estimated tokens)?

Options:
A. Always use single-pass (trust model context window)
B. Chunked generation without Smoother (split at section boundaries)
C. Reduce lesson scope in Stage 5 (prevent long lessons)
D. Other approach

Consider:
- How rare are these cases? (estimate %)
- Cost of complexity vs benefit
- Risk of quality degradation

**Expected output**: Recommended approach with trade-off analysis.

---

### 5. Transition Quality Without Smoother

**Question**: Current Smoother's stated purpose is to add transitions between sections. If we remove it, how do we ensure good transitions?

Options:
A. Include transition instructions in Generator prompt
B. Add "previous section summary" to each section's context
C. Post-generation transition injection (rule-based)
D. Accept that single-pass LLM naturally creates transitions

Consider:
- Modern LLMs (128K context) see full lesson while generating
- They naturally create coherent narratives
- Smoother was needed for parallel generation (sections didn't see each other)
- Single-pass doesn't have this problem

**Expected output**: Analysis of whether transitions are a real concern with single-pass.

---

### 6. Rollback Strategy

**Question**: If single-pass generation shows quality regression, what's the rollback plan?

Consider:
- A/B testing approach
- Quality metrics to monitor
- How to detect regression quickly
- Fallback to old pipeline if needed

**Expected output**: Rollback strategy with specific metrics and thresholds.

---

## Supporting Data

### Current Token Usage (from logs)

Lesson 2.2 generation:
- Total tokens used: 54,976
- Duration: 268 seconds
- Final word count: 3,059 words
- Sections generated: 6 by Expander, 4 by Smoother output

### Model Capabilities

| Model | Context | Output Limit | Speed |
|-------|---------|--------------|-------|
| Qwen3-235B | 128K | 32K | ~50 TPS |
| DeepSeek V3 | 128K | 32K | ~60 TPS |
| Gemini 2.5 Flash | 1M | 64K | ~100 TPS |
| Xiaomi MiMo-v2-Flash | 128K | 16K | ~80 TPS |

### Research Findings (from our docs)

1. "Single-pass generation, while coherent, is mathematically incapable of meeting the <2-minute latency constraint" - but this constraint is artificial for batch processing

2. "Skeleton-of-Thought approaches suffer from context fragmentation, leading to disjointed narratives" - this is why Smoother was added, but it causes truncation

3. "For your MVP, use single-pass generation with strong RAG integration" - one research recommended this

---

## Expected Deliverable

Provide a structured analysis with:

1. **Recommendation**: Single-pass vs keep complexity
2. **Confidence level**: High/Medium/Low with reasoning
3. **Implementation notes**: Specific guidance for implementation
4. **Risk assessment**: What could go wrong and how to mitigate
5. **Metrics to track**: How to measure success post-implementation
