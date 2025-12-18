# Research Prompt: Optimal Stage 6 Lesson Content Generation Strategy

**Date**: 2025-11-22
**Status**: ✅ COMPLETED
**Priority**: HIGH (blocks Stage 6 implementation)
**Type**: DeepResearch

**Results**:
- [Optimal Strategy Report](Optimal%20Strategy%20for%20Educational%20Lesson%20Content%20Generation%20Research%20Report.md)
- [LLM Content Generation Strategy](LLM%20Content%20Generation%20Strategy%20Research.md)

**Decision**: Hybrid Map-Reduce-Refine через LangGraph (production-grade)

---

## Research Question

What is the optimal strategy for generating educational lesson content (3-5K words per lesson) in a production B2B course generation pipeline, considering:
1. Single-pass generation vs Skeleton-of-Thought (parallel section expansion)
2. LangChain's latest capabilities for orchestrating multi-step generation
3. Quality, cost, and latency trade-offs

---

## Context

### System Overview

We are building Stage 6 of a course generation pipeline that:
- Receives detailed lesson specifications from Stage 5 (including intro_blueprint, sections with RAG queries, exercises)
- Generates complete lesson content (3-5K words) with RAG grounding
- Runs 10-30 lessons in parallel via BullMQ workers
- Uses OpenRouter for model access (DeepSeek Terminus, Qwen3 235B, Kimi K2)

### Current Architecture Document Proposals

**Option A: Single-Pass Generation**
- One LLM call per lesson
- Input: Full lesson specification + RAG context
- Output: Complete lesson (intro, sections, examples, exercises)
- Simpler implementation

**Option B: Skeleton-of-Thought (Two-Stage)**
- Stage 5 generates outline/skeleton (section titles + key points)
- Stage 6 expands each section in parallel
- Then assembles and adds transitions
- Potentially faster (parallel section generation)
- More complex orchestration

### Technology Stack

- **Framework**: LangChain (latest version as of 2025-11)
- **Models**: Via OpenRouter
  - Primary RU: `qwen/qwen3-235b-a22b-2507`
  - Primary EN: `deepseek/deepseek-v3.1-terminus`
  - Fallback: `moonshotai/kimi-k2-0905`
- **Queue**: BullMQ for parallel lesson generation
- **Vector DB**: Qdrant for RAG retrieval

---

## Research Questions

### Primary Questions

1. **Skeleton-of-Thought Effectiveness for Educational Content**
   - Does Skeleton-of-Thought improve quality for 3-5K word educational content?
   - What is the quality difference vs single-pass generation?
   - Are there specific content types (technical vs conceptual) where one approach excels?

2. **LangChain Capabilities for Multi-Step Generation**
   - What LangChain features (LCEL, chains, agents) are best suited for:
     - Single-pass generation with RAG
     - Skeleton-of-Thought with parallel expansion
   - Are there built-in patterns for "outline → expand" workflows?
   - How does LangChain handle intermediate state between generation steps?

3. **Production Performance Characteristics**
   - Latency comparison: single-pass vs skeleton-of-thought
   - Token consumption: is skeleton-of-thought actually 1.12x or higher?
   - Error recovery: which approach is more resilient to partial failures?

4. **Quality Considerations**
   - Does parallel section generation cause "context forgetting" (end contradicts beginning)?
   - How effective are "smoothing passes" for adding transitions?
   - What is the impact on citation consistency when sections are generated separately?

### Secondary Questions

5. **Optimal Model Selection for Stage 6**
   - Which models perform best for long-form educational content (not just structured JSON)?
   - Should we use different models for different content archetypes (code_tutorial vs concept_explainer)?
   - Is there a quality/cost optimal model specifically for 3-5K word generation?

6. **LangChain-Specific Implementation Patterns**
   - Best practices for RAG integration in long-form generation
   - Streaming support for progress tracking
   - Error handling and retry patterns in LCEL chains

---

## Constraints

1. **Must use OpenRouter** - all models accessed via OpenRouter API
2. **Must integrate with existing architecture** - BullMQ workers, Qdrant RAG, Supabase storage
3. **Target latency** - <2 minutes average per lesson
4. **Target cost** - $0.20-$0.50 per course total (all stages)
5. **Language support** - RU and EN content generation
6. **Output format** - Markdown for prose, JSON for metadata

---

## Expected Deliverables

1. **Recommendation**: Single-pass vs Skeleton-of-Thought for MVP
2. **LangChain implementation pattern** with code examples
3. **Model selection recommendation** for Stage 6 specifically
4. **Performance estimates** (latency, tokens, cost)
5. **Quality trade-off analysis**
6. **Migration path** if starting with simple approach and upgrading later

---

## Sources to Prioritize

- LangChain documentation (latest 2025 version)
- Academic papers on Skeleton-of-Thought prompting
- Production case studies of long-form content generation
- OpenRouter model benchmarks for long-form generation
- Educational content generation best practices

---

## Output Format

Please provide:
1. Executive summary with clear recommendation
2. Detailed analysis for each research question
3. LangChain code examples (TypeScript)
4. Comparison table (quality, cost, latency, complexity)
5. Implementation roadmap

---

**Research initiated by**: Spec clarification workflow
**Blocking**: Stage 6 implementation design
