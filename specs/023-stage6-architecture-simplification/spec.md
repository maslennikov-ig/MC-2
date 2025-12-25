# Stage 6 Architecture Simplification

## Problem Statement

Current Stage 6 lesson content generation pipeline is over-engineered based on an artificial 2-minute latency constraint that doesn't apply to our batch processing architecture.

### Current Architecture (Over-Complex)

```
LessonSpec → Planner → Expander → Assembler → Smoother → SelfReviewer → Judge
                           ↓           ↓           ↓
                     5-8 parallel   merge      REWRITE ALL
                     LLM calls      sections   (loses content!)
```

**6+ LLM calls per lesson**, with Smoother causing content truncation.

### Evidence of Over-Engineering

1. **Artificial Constraint**: The "< 2 min per lesson" requirement was set in research prompt, not derived from real user needs
2. **Batch Processing Reality**: With 30 BullMQ workers generating lessons in parallel, wall-clock time for 20 lessons is ~2 minutes regardless of per-lesson latency
3. **Smoother Bug**: Rewrites 36K chars with 8K token limit → loses 2 sections and truncates content mid-sentence
4. **Double Work**: Expander generates content, Smoother rewrites it (2x token cost)
5. **Research Contradiction**: One research document recommended "single-pass for MVP" but we implemented the complex Hybrid anyway

### Observed Bugs

From production logs (lesson 2.2):
- Expander created 6 sections (~4919 words)
- Assembler merged: 36869 chars
- Smoother output: 22586 chars, **4 sections** (lost 2 sections!)
- Content ends mid-sentence: "Какую" (truncated)
- SelfReviewer detected: `truncationCheckPassed: false` but didn't fix it

---

## Proposed Architecture

### Option A: Single-Pass Generator (Recommended)

```
LessonSpec + RAG → Generator → SelfReviewer → Judge
                       ↓
                 full lesson
                 (one LLM call)
```

**Benefits**:
- 1 LLM call for content (vs 6-8 currently)
- No content loss from rewriting
- Model sees full context → natural transitions
- Simpler debugging
- Lower token cost

**When to use**: Lessons < 30K tokens (99% of cases)

### Option B: Chunked Generator (Fallback for huge lessons)

```
LessonSpec → ChunkPlanner → [Chunk1, Chunk2, ...] → Assembler → Judge
                                  ↓
                            parallel generation
                            (no Smoother!)
```

**When to use**: Lessons > 30K tokens (rare edge case)

**Key difference from current**: NO Smoother. Each chunk ends at natural boundaries, Assembler just concatenates.

---

## Implementation Plan

### Phase 1: Fix Immediate Bug (Quick Win)

1. Increase `DEFAULT_MAX_TOKENS` in `smoother.ts` from 8000 to 24000
2. Add validation: if output < 80% of input length, reject and retry
3. This unblocks production while we refactor

### Phase 2: Create Single-Pass Generator

1. New node: `generator.ts` - single LLM call for full lesson
2. Input: LessonSpec + RAG chunks (formatted as XML)
3. Output: Full markdown lesson
4. Max tokens: 24000 (configurable from DB)
5. Model: Use `stage_6_standard_ru/en` config

### Phase 3: Simplify Pipeline

1. Remove: `planner.ts`, `expander.ts`, `assembler.ts`, `smoother.ts`
2. Keep: `self-reviewer.ts` (heuristic checks), `judge/` (quality validation)
3. New flow: `generator → selfReviewer → judge`

### Phase 4: Add Fallback for Edge Cases

1. If lesson spec indicates > 8 sections OR > 25K estimated tokens:
   - Use chunked generation (2-3 chunks max)
   - No Smoother - chunks end at section boundaries
   - Simple concatenation

---

## Token Budget Analysis

### Current (Broken)

| Node | Tokens | Notes |
|------|--------|-------|
| Planner | ~2K | Creates outline (redundant - already in LessonSpec) |
| Expander (x6) | ~18K | 6 sections × 3K each |
| Smoother | ~8K | Rewrites all, truncates content |
| Judge (x2) | ~8K | 2 judges |
| **Total** | **~36K** | Plus refinement loops |

### Proposed (Single-Pass)

| Node | Tokens | Notes |
|------|--------|-------|
| Generator | ~20K | One call, full lesson |
| Judge (x2) | ~8K | Same as before |
| **Total** | **~28K** | 22% reduction, no truncation |

---

## Files to Modify

### Remove (Phase 3)
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/planner.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/expander.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/assembler.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/smoother.ts`

### Create
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator.ts`

### Modify
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/index.ts` - export new generator
- `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts` - new graph topology
- `packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts` - simplify state

---

## Success Criteria

1. **No truncation**: Lessons generate complete content (ends with proper punctuation)
2. **All sections preserved**: If LessonSpec has 6 sections, output has 6 sections
3. **Lower cost**: < 30K tokens per lesson (vs ~36K+ currently)
4. **Simpler debugging**: One LLM call to inspect vs 6+
5. **Tests pass**: Existing quality thresholds maintained

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Single call timeout | Use streaming, 5-minute timeout, retry with smaller model |
| Context too large | Fallback to chunked generation for lessons > 8 sections |
| Quality regression | A/B test: generate same lesson with old/new pipeline, compare Judge scores |
| Lost parallelism benefit | Not a real loss - BullMQ already parallelizes across lessons |

---

## Questions for DeepThink Analysis

See `deepthink-prompt.md` for detailed analysis prompt covering:

1. Is single-pass generation viable for 5000-word Russian lessons?
2. What's the optimal max_tokens for Russian educational content?
3. Should we keep any nodes from current pipeline?
4. How to handle the rare edge case of very long lessons?
