# Research Summary: Stage 4-6 Course Generation Pipeline

**Date**: 2025-11-22
**Status**: ✅ Complete (consolidated from prior research)

**Source Documents**:
- `docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md` (v2.2.0)
- Worktree version (v2.1.0) — LLM Parameters detail
- `docs/research/010-stage6-generation-strategy/`
- `docs/MODEL-SELECTION-DECISIONS.md`

## Research Questions Resolved

All technical unknowns from the spec have been resolved through prior research. This document consolidates decisions.

---

## 1. Stage 6 Generation Architecture

**Question**: Which architecture pattern for parallel lesson content generation?

**Decision**: **Hybrid Map-Reduce-Refine via LangGraph**

**Rationale**:
- Skeleton-of-Thought rejected: 40% coherence degradation for educational content
- Single-pass insufficient: Limited recovery from failures, no parallelization
- Hybrid approach: Planner → Parallel Expanders → Assembler → Smoother

**Alternatives Considered**:
| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Single-Pass | Simple, fast | No parallelization, no recovery | ❌ Too risky |
| Skeleton-of-Thought | 2x speed | 40% coherence loss | ❌ Kills quality |
| Sequential Multi-Stage | Good quality | Slow (no parallelism) | ❌ Too slow |
| **Hybrid Map-Reduce** | Parallel + coherent | More complex | ✅ Best balance |

**Source**: `docs/research/010-stage6-generation-strategy/Optimal Strategy for Educational Lesson Content Generation Research Report.md`

---

## 2. Model Selection for Content Generation

**Question**: Which LLM models for each stage/phase?

**Decision**: Language-aware routing with model fallback

| Task | RU Primary | EN Primary | Fallback |
|------|------------|------------|----------|
| Metadata | Qwen3-235B | DeepSeek Terminus | Kimi K2 |
| Lessons | Qwen3-235B | DeepSeek Terminus | Kimi K2 |
| Stage 6 Content | Qwen3-235B | DeepSeek Terminus | Kimi K2 |
| Analysis | OSS 20B/120B | OSS 20B/120B | — |
| Large Context | Grok 4 Fast | Grok 4 Fast | Gemini Flash |

**Rationale**:
- Qwen3-235B: Best RU quality (9.2/10), 100% reliability, $0.11/$0.60
- DeepSeek Terminus: Best EN quality (9.0/10), 100% reliability
- Kimi K2: Premium fallback for failures (9.5/10 RU, 9.2/10 EN)
- Use **regular** variants (NOT thinking) — 17-35x faster, same quality

**Source**: `docs/MODEL-SELECTION-DECISIONS.md`

---

## 3. LangGraph vs LangChain Architecture

**Question**: How to implement LangGraph state machine for Stage 6?

**Decision**: LangGraph StateGraph with typed state

**Implementation Pattern**:
```typescript
import { StateGraph, Annotation } from "@langchain/langgraph";

// Define typed state
const LessonState = Annotation.Root({
  lessonSpec: Annotation<LessonSpecificationV2>(),
  outline: Annotation<LessonOutline | null>(),
  expandedSections: Annotation<string[]>({ reducer: (a, b) => [...a, ...b] }),
  assembledContent: Annotation<string | null>(),
  finalContent: Annotation<LessonContent | null>(),
  ragChunks: Annotation<RAGChunk[]>(),
  errors: Annotation<string[]>({ reducer: (a, b) => [...a, ...b] }),
});

// Build graph
const graph = new StateGraph(LessonState)
  .addNode("planner", plannerNode)
  .addNode("expander", expanderNode)
  .addNode("assembler", assemblerNode)
  .addNode("smoother", smootherNode)
  .addEdge("__start__", "planner")
  .addConditionalEdges("planner", shouldExpand)
  .addEdge("expander", "assembler")
  .addEdge("assembler", "smoother")
  .addEdge("smoother", "__end__");
```

**Rationale**:
- TypeScript-first with proper state typing
- Built-in retry and fallback support
- State persistence for debugging
- Parallel node execution via `fan_out`

**Source**: `docs/research/010-stage6-generation-strategy/LLM Content Generation Strategy Research.md`

---

## 4. RAG Context Management

**Question**: How long to store RAG context cache?

**Decision**: Store until course generation completes, then delete. Persist query parameters long-term.

**Rationale**:
- Retry consistency: Same context for retries
- Storage efficiency: Delete after success
- Reproducibility: Query params allow regeneration

**Implementation**:
```typescript
interface RAGContextCache {
  context_id: string;
  course_id: string;
  lesson_id: string;
  chunks: RAGChunk[];
  query_params: RAGQueryParams; // Persisted long-term
  created_at: Date;
  expires_at: Date; // course_completed_at + 1 hour
}
```

---

## 5. Dynamic Temperature by Content Archetype

**Question**: How to set LLM parameters per content type?

**Decision**: Single temperature per lesson based on dominant archetype

| Archetype | Temperature | Top-p | Rationale |
|-----------|-------------|-------|-----------|
| code_tutorial | 0.2-0.3 | 0.7 | Syntax precision |
| concept_explainer | 0.6-0.7 | 0.9 | Educational clarity |
| case_study | 0.5-0.6 | 0.9 | Narrative coherence |
| legal_warning | 0.0-0.1 | 0.7 | Zero error tolerance |

**Rejected Alternative**: Per-section dynamic temperature — 5-7x cost increase, zero production adoption

**Source**: `docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md` (LLM Parameters section)

---

## 6. Document Prioritization Integration

**Question**: Where does Document Prioritization fit in pipeline?

**Decision**: Integrated into Stage 2 + Stage 3 (not separate stage)

**Flow**:
1. **Stage 2 (Processing)**: LLM Classification → HIGH/LOW priority
2. **Stage 3 (Summarization)**: Budget Allocation → adaptive summarization
3. **Vectorization**: ALL from originals (not summaries)

**Rationale**:
- No new stage needed — enhances existing stages
- Classification naturally fits document processing
- Budget allocation naturally fits summarization

---

## 7. BullMQ Worker Configuration

**Question**: How many concurrent workers for Stage 6?

**Decision**: 30 concurrent workers (configurable)

**Rationale**:
- 10-30 lessons per course typical
- ~55s per lesson average
- Total course: ~3-5 minutes with full parallelization
- Memory: ~500MB per worker (acceptable)

**Configuration**:
```typescript
const worker = new Worker('stage6-lesson-content', processor, {
  connection: redis,
  concurrency: 30,
  limiter: {
    max: 30,
    duration: 1000 // Rate limit if needed
  }
});
```

---

## 8. V2 LessonSpecification Schema

**Question**: What fields change from V1 to V2?

**Decision**: See `docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md` (Schema section)

**Key Changes**:
| V1 Field | V2 Field | Rationale |
|----------|----------|-----------|
| `hook: string` | `hook_strategy` + `hook_topic` | Avoid over-specification |
| `word_count: number` | `depth: "summary" \| "detailed"` | Avoid padding |
| `rag_query: string` | `rag_context_id: string` | Pre-retrieved context |
| `grading_rubric: string` | `rubric_criteria: object[]` | Structured rubric |
| — | `content_archetype` | Dynamic temperature routing |

**No V1 Compatibility**: New product, no legacy courses

---

---

## 9. LLM Parameters Optimization (Multi-Stage)

**Question**: What temperature and parameters for each stage/phase?

**Decision**: Task-specific parameter tuning (temperature, top-p, frequency_penalty)

### Stage-Specific Parameters

**Stage 2-3 (Document Classification)**:
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Temperature | 0.0-0.1 | Binary decision requires determinism |
| Top-p | 0.7-0.8 | Truncate unreliable tail |
| Max Tokens | 10-20 | Minimal output |

**Stage 4 (Analyze) - Phase-Specific**:
| Phase | Task | Temp | Top-p | Rationale |
|-------|------|------|-------|-----------|
| Phase 1 | Classification | 0.1-0.2 | 0.8 | Multi-label calibration |
| Phase 2 | Counting | 0.0-0.2 | 0.7 | Arithmetic accuracy |
| **Phase 3** | Strategic Reasoning | **0.4-0.5** | 0.9 | Evidence-based pedagogy (NOT 0.8!) |
| Phase 4 | Document Synthesis | 0.3-0.4 | 0.9 | Structural coherence |
| Phase 6 | RAG Planning | 0.4-0.5 | 0.9 | Query diversity + precision |

**Stage 5 (Generation)**:
| Phase | Task | Temp | Top-p | Rationale |
|-------|------|------|-------|-----------|
| Phase 2 | Metadata Gen | 0.6-0.7 | 0.9 | Professional engaging (NOT clickbait) |
| **Phase 3** | RAG Synthesis | **0.4-0.5** | 0.9 | Grounded pedagogical synthesis |
| Phase 4 | LLM Judge | **0.0** | 1.0 | Consistency via 3x voting |

**Stage 6 (Content) - By Archetype**:
| Archetype | Temp | Top-p | Freq Pen | Max Tokens |
|-----------|------|-------|----------|------------|
| code_tutorial | 0.2-0.3 | 0.6-0.7 | 0.0-0.1 | 2000-3000 |
| concept_explainer | 0.6-0.7 | 0.9-0.95 | 0.3 | 2500-3500 |
| case_study | 0.5-0.6 | 0.9 | 0.2 | 1800-2200 |
| legal_warning | 0.0-0.1 | 0.7-0.8 | 0.0 | 2000-3000 |

### Critical Changes from Initial Assumptions

1. **Phase 3 Expert Analysis**: 0.8 → **0.4-0.5** (pedagogical strategy = strategic reasoning, NOT creative)
2. **Phase 2 Metadata**: 0.8 → **0.6-0.7** (B2B professional ≠ consumer marketing)
3. **LLM Judge**: 0.2 → **0.0** (industry consensus: temp 0.0 + 3x voting)
4. **Educational Analogies**: 1.0 → **0.6-0.7** (accuracy > novelty)

### Per-Section Dynamic Temperature: NOT RECOMMENDED ❌

**Why Production Rejects**:
- Cost: 5-7x base (5 API calls per lesson)
- Latency: +10-20 seconds
- Zero production adoption
- Better alternative: **Model routing** (40-60% cost reduction)

**Recommendation**: Single temperature per lesson based on dominant archetype.

### OSS Model-Specific Guidance

**Llama 3.x** (via OpenRouter):
- Classification: temp 0.2, top-p 0.7, top-k 5-10
- Strategic: temp 0.5, top-p 0.95
- Creative: temp 0.7-0.8, top-p 0.95, top-k 40

**Qwen 2.5/3** (via OpenRouter):
- Reasoning (thinking mode): **temp 0.6**, top-p 0.95, **do_sample=True** (critical)
- Classification: temp 0.2-0.3
- Creative: temp 0.7-0.9

**Mistral 7B/8x7B**:
- **Maximum temp 0.7** (official limit)
- Classification: temp 0.0-0.2
- Strategic: temp 0.3-0.5

**Source**: `docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md` (v2.1.0 LLM Parameters section)

---

## 10. Production Cost-Quality Analysis

**Question**: What are realistic production costs?

**Decision**: Budget for 2-5x multiplier over base token costs

### Realistic Retry Rates

- Production systems: **15-30%** retry rates (NOT optimistic 1.18x)
- Cost multiplier from retries: **1.15-1.3x**

### Total Production Cost Multipliers

```
Direct API costs:           1.0x (baseline)
+ Retry overhead:           1.15-1.3x
+ Quality assurance:        1.1-1.2x
+ Infrastructure overhead:  1.3-1.4x
= TOTAL: 2-5x base token costs
```

### Cost Targets by Scale

| Scale | Requests/month | Cost/month | Focus |
|-------|----------------|------------|-------|
| **MVP** | <100K | $500-2,000 | Prove value |
| **Growth** | 100K-1M | $2,000-10,000 | Efficiency |
| **Scale** | 1M+ | $10,000-50,000 | Sustainability |

### Single-Stage vs Two-Stage Economics

| Approach | Cost | Latency | Complexity |
|----------|------|---------|------------|
| Single-stage (MVP) | 1.0x | 2-4s | Low |
| Two-stage | **1.12x** (NOT 2.0x) | 4-8s | Moderate |

**Recommendation**: Start single-stage. Consider two-stage only if quality issues emerge.

---

## 11. Production Implementation Strategy (Phased)

**Question**: How to roll out optimizations?

**Decision**: 3-phase approach over 6-12 months

### Phase 1: MVP (Month 1-2)

**Focus**: Prove value with minimal complexity

- Stage 3: temp **0.0** (classification)
- Stage 4: temp **0.4** (strategic reasoning)
- Stage 5: temp **0.5** (lesson generation)
- LLM Judge: temp **0.0** + **3x voting**
- Single model per stage
- Basic retry logic (3 attempts)

**Success criteria**: Core functionality works, cost per course understood

### Phase 2: Optimization (Month 3-6)

**Focus**: 40-60% cost reduction

- Week 1-2: Prompt compression (20-40% token reduction)
- Week 3-4: Semantic caching (40-70% hit rate target)
- Week 5-8: **Archetype routing** (HIGHEST ROI)
  - 70% to Llama 3 8B-Instruct (cheaper)
  - Reserve Qwen 2.5 20B for complex
  - Reserve 120B for expert analysis only

**Success criteria**: 40-60% cost reduction, quality maintained

### Phase 3: Advanced (Month 6-12)

**Consider only if volume >1M tokens/day**:

- Fine-tuning smaller models ($10k-50k investment)
- Smart guardrails (<10% false positive rate)
- Dynamic context management (cap at 2,000 tokens)
- Batch processing (50%+ discounts)

---

## 12. Risk Mitigation & Diagnostics

**Question**: How to validate and monitor?

### Symptoms of Incorrect Temperature

**Too low** (<0.3 for strategic tasks):
- Repetitive outputs
- "Robotic" feel
- **Fix**: Increase to 0.4-0.6

**Too high** (>0.7 for factual content):
- Factual hallucinations
- Nonsensical analogies
- **Fix**: Decrease to 0.2-0.5

### Validation Process for OSS Models

1. Select 20 samples per stage (100 total)
2. Generate at 3 temps: [optimal-0.2, optimal, optimal+0.2]
3. Evaluate with LLM judge (temp 0.0, 3x voting)
4. Human review 20% of samples
5. Select optimal based on quality metrics
6. Document optimal temp per model+stage
7. Re-run quarterly or when changing models

### Diagnostic Checklist

**Before production**:
- [ ] Model costs at 10x current usage
- [ ] Include retry overhead (1.3x minimum)
- [ ] Budget for monitoring (30-40% overhead)
- [ ] Test failure modes
- [ ] Cost alerting (>2x baseline triggers review)
- [ ] Validate temperatures on n=20+ samples

**During scaling (first 2 months)**:
- [ ] Monitor prompt length growth
- [ ] Track cache hit rates (target 50%+)
- [ ] Retry limits (3 max)
- [ ] Weekly cost review
- [ ] Human review 5-10% outputs

**Optimization triggers**:
- Cost/lesson >$1: Implement caching
- Cost/lesson >$2: Add model routing
- Volume >1M tokens/day: Consider fine-tuning

---

## Research Gaps: None

All technical questions resolved. Ready for Phase 1 (Design).
