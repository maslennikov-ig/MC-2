# Stage 3 Architecture Decision: Document Summarization

**Status**: PENDING RESEARCH
**Created**: 2025-10-28
**Decision Required By**: Before P1 implementation begins

## Executive Summary

This document will contain the research-validated architecture decision for Stage 3 document summarization. Team must benchmark 3-5 approaches on 50-100 documents and select optimal AI framework, summarization strategy, and model based on quality, cost, and maintainability criteria.

**Decision Criteria** (in priority order):
1. **Quality**: Semantic similarity >0.75 (validated against human eval on 10-15 docs)
2. **Cost**: Per-document API cost projections for all tiers (TRIAL → PREMIUM)
3. **Maintainability**: Framework complexity, learning curve, documentation quality
4. **Performance**: Latency for small (<5 pages) and large (200+ pages) documents
5. **Multilingual Support**: Russian + English quality parity

---

## Research Questions to Answer

### 1. AI Framework Selection

**Options to Benchmark**:
1. **LangChain.js** - Mature ecosystem, many integrations
2. **LangGraph** - Newer, agent-focused, better for complex workflows
3. **Direct OpenRouter API** - Lightweight, full control (like Stage 2 Jina-v3)
4. **Vercel AI SDK** - Modern, streaming-first, TypeScript-native

**Evaluation Criteria**:
- **Developer Experience**: TypeScript support, documentation, example quality
- **Maintenance Overhead**: Dependency count, update frequency, breaking changes
- **Streaming Support**: Does framework support streaming responses? (Future: P3 priority)
- **Cost Efficiency**: Any framework overhead (extra API calls, token waste)?
- **Integration**: How easy to integrate with existing BullMQ/tRPC architecture?

**Benchmark Approach**:
- Implement basic summarization (5-page document) with each framework
- Measure: Time to implement, lines of code, complexity, API call overhead
- Test: Error handling, retry logic, timeout handling

**Deliverable**: Framework comparison table with recommendation

---

### 2. Summarization Strategy Selection

**Options to Benchmark**:
1. **Stuffing** - Single prompt with full document (simple, fast, context-limited)
2. **Map-Reduce** - Parallel chunk summaries → combine (MVP approach, may lose coherence)
3. **Refine** - Iterative refinement with context (coherent, slower, sequential)
4. **Map-Rerank** - Rank chunk relevance before summarizing (quality, complexity)
5. **Hierarchical with semantic clustering** - Group related chunks before summarizing

**Evaluation Criteria**:
- **Quality**: Semantic similarity score (>0.75 threshold)
- **Human Eval**: Coherence, completeness, accuracy on 10-15 sample documents
- **Cost**: Total tokens (input + output) per document
- **Latency**: End-to-end processing time (small vs large documents)
- **Robustness**: How well does strategy handle edge cases (tables, code, mixed language)?

**Benchmark Approach**:
- Select 50-100 document sample (25% Russian, 75% English, varied sizes)
- Implement 3-5 strategies (prioritize: Stuffing, Map-Reduce, Refine)
- Measure semantic similarity for all, human eval for top 2
- Calculate cost/latency statistics (mean, p50, p95, p99)

**Deliverable**: Strategy comparison table with quality/cost/latency trade-offs

---

### 3. Model Selection

**Options to Benchmark**:
1. **openai/gpt-oss-20b** (Llama 3.3 70B via OpenRouter) - MVP baseline
2. **GPT-4 Turbo** - Highest quality, expensive
3. **Claude 3.5 Sonnet** - Balanced quality/cost
4. **Gemini 1.5 Pro** - Large context window (1M tokens)
5. **Mixtral 8x22B** - Open-source, cost-effective

**Evaluation Criteria**:
- **Quality**: Semantic similarity >0.75 + human eval correlation
- **Cost**: OpenRouter pricing per 1M tokens (input + output)
- **Context Window**: Maximum document size supported
- **Multilingual**: Russian + English quality parity
- **Reliability**: API uptime, rate limits, error rates

**Benchmark Approach**:
- Test top 3 models on same 50-100 document sample
- Calculate semantic similarity scores (distribution analysis)
- Human eval on 10-15 docs (Russian + English mix)
- Compute correlation: semantic similarity vs human ratings
- Cost projection: $X per 1000 documents for each tier

**Deliverable**: Model comparison table with quality/cost projections

---

### 4. Token Threshold Values

**Thresholds to Validate**:
- **No-summary threshold**: MVP = 3K tokens (skip summarization, use full text)
- **Chunk size**: MVP = 115K tokens per chunk (if using chunking strategy)
- **Final output size**: MVP = 200K tokens (for Stage 4 Course Structure Analyze)

**Evaluation Criteria**:
- **Quality**: Does small-doc bypass preserve 100% fidelity?
- **Cost**: What % of documents fall below threshold? (Cost savings estimation)
- **Stage 4 compatibility**: Will 200K token summaries fit Stage 4 context window?
- **Optimal chunk size**: For chunking strategies (Map-Reduce), what chunk size maximizes coherence?

**Benchmark Approach**:
- Analyze document size distribution in sample (histogram)
- Test different thresholds (1K, 3K, 5K, 10K) on small-doc bypass
- Validate Stage 4 context window needs (review Stage 4 spec)
- If using chunking: Test chunk sizes (50K, 100K, 115K, 150K)

**Deliverable**: Threshold recommendations with rationale

---

## Research Execution Plan

### Phase 1: Setup & Data Preparation (1 day)

**Tasks**:
1. Collect 50-100 document sample
   - Source: Real uploaded documents or synthetic dataset
   - Distribution: 25% Russian, 75% English
   - Size range: 1 page → 200+ pages
   - Content types: Technical manuals, educational materials, mixed media

2. Prepare human eval protocol
   - Select 10-15 documents (5 Russian, 10 English)
   - Define evaluation rubric (coherence, completeness, accuracy)
   - Recruit 2-3 evaluators (Russian + English speakers)

3. Setup benchmark infrastructure
   - OpenRouter API key configuration
   - Logging framework for metrics collection
   - Vector generation for semantic similarity (Jina-v3)

### Phase 2: Framework Comparison (1 day)

**Tasks**:
1. Implement basic summarization with each framework
   - LangChain.js (Document + Map-Reduce chain)
   - LangGraph (Simple summarization agent)
   - Direct OpenRouter API (fetch + prompt engineering)
   - Vercel AI SDK (streaming client)

2. Measure developer experience
   - Time to implement (track hours)
   - Lines of code (measure complexity)
   - Documentation quality (subjective rating 1-10)

3. Test error handling
   - API timeout scenarios
   - Rate limit handling
   - Network failures

**Deliverable**: Framework comparison table → recommend top 1-2 for strategy testing

### Phase 3: Strategy + Model Benchmarking (2-3 days)

**Tasks**:
1. Implement 3-5 strategies with selected framework(s)
   - Stuffing (baseline)
   - Map-Reduce (MVP approach)
   - Refine (quality alternative)
   - [Optional] Map-Rerank, Hierarchical

2. Benchmark each strategy × top 3 models on 50-100 docs
   - Measure: Semantic similarity, latency, cost
   - Log: Input/output tokens, API calls, errors

3. Human evaluation on top 2 strategies (10-15 docs)
   - Coherence (1-5 scale)
   - Completeness (1-5 scale)
   - Accuracy (1-5 scale)

4. Correlation analysis
   - Compute Pearson correlation: semantic similarity vs human ratings
   - Validate semantic similarity as quality proxy (r > 0.8 acceptable)

**Deliverable**: Strategy + model comparison tables with recommendation

### Phase 4: Threshold Optimization (0.5 day)

**Tasks**:
1. Analyze document size distribution
   - Histogram of token counts
   - Percentiles (p10, p25, p50, p75, p90, p95, p99)

2. Test no-summary threshold values
   - 1K, 3K, 5K, 10K token thresholds
   - Calculate % documents bypassed (cost savings)

3. Validate Stage 4 context window needs
   - Review Stage 4 spec requirements
   - Test: Does 200K token summary fit?

4. [If chunking] Optimize chunk size
   - Test 50K, 100K, 115K, 150K chunks
   - Measure coherence impact (semantic similarity)

**Deliverable**: Threshold recommendations table

### Phase 5: Cost Projections & Documentation (0.5 day)

**Tasks**:
1. Calculate per-document cost for each model
   - Formula: (input_tokens × $X/1M) + (output_tokens × $Y/1M)
   - Average across 50-100 doc sample

2. Project costs for all tiers
   - TRIAL: 10 docs/month × $X = $Y/month
   - STANDARD: 100 docs/month × $X = $Y/month
   - BASIC: 500 docs/month × $X = $Y/month
   - PREMIUM: 5000 docs/month × $X = $Y/month

3. Document architecture decision
   - Fill all sections below
   - Include benchmark data (tables, charts)
   - Justify recommendations with data

**Deliverable**: This document (architecture-decision.md) - COMPLETE status

---

## Decisions (TO BE FILLED AFTER RESEARCH)

### Decision 1: AI Framework

**Selected Framework**: [TBD]

**Rationale**:
- [Quality metrics]
- [Cost analysis]
- [Maintainability factors]
- [Performance benchmarks]

**Alternatives Considered**:
1. [Framework A]: [Why rejected]
2. [Framework B]: [Why rejected]
3. [Framework C]: [Why rejected]

**Implementation Notes**:
- [Integration approach]
- [Error handling strategy]
- [Retry logic]

---

### Decision 2: Summarization Strategy

**Selected Strategy**: [TBD]

**Rationale**:
- **Quality**: Semantic similarity = [X.XX] (mean ± std), Human eval = [X.X/5.0]
- **Cost**: $[X.XX] per document (input + output tokens)
- **Latency**: [X] seconds (mean), [X] seconds (p95)
- **Multilingual**: Russian quality = [X%] of English quality

**Alternatives Considered**:
1. [Strategy A]: Quality [X.XX], Cost $[X.XX], Latency [X]s - [Why rejected]
2. [Strategy B]: Quality [X.XX], Cost $[X.XX], Latency [X]s - [Why rejected]

**Implementation Notes**:
- [Chunking approach if applicable]
- [Parallel processing strategy]
- [Quality validation checkpoints]

**Quality Validation**:
- Semantic similarity correlation to human eval: r = [X.XX] (target: r > 0.80)
- Threshold: >0.75 cosine similarity (validated on [N] documents)

---

### Decision 3: Model Selection

**Selected Model**: [TBD]

**Rationale**:
- **Quality**: Semantic similarity = [X.XX] (mean ± std)
- **Cost**: $[X.XX] per 1M input tokens, $[X.XX] per 1M output tokens
- **Context Window**: [X]K tokens (sufficient for [max_doc_size])
- **Multilingual**: Russian/English quality parity = [X%]
- **Reliability**: [X%] uptime, [X] requests/min rate limit

**Alternatives Considered**:
1. [Model A]: Quality [X.XX], Cost $[X.XX]/1M, Window [X]K - [Why rejected]
2. [Model B]: Quality [X.XX], Cost $[X.XX]/1M, Window [X]K - [Why rejected]

**Cost Projections** (per 1000 documents):
- TRIAL (10 docs/month): $[X.XX]/month
- STANDARD (100 docs/month): $[X.XX]/month
- BASIC (500 docs/month): $[X.XX]/month
- PREMIUM (5000 docs/month): $[X.XX]/month

**Implementation Notes**:
- OpenRouter model ID: `[provider/model-id]`
- Fallback model: `[provider/model-id]` (if primary fails)
- Temperature: [X.X] (creativity vs consistency trade-off)
- Max output tokens: [X] (based on 200K final size requirement)

---

### Decision 4: Token Thresholds

**No-Summary Threshold**: [TBD] tokens

**Rationale**:
- [X%] of documents fall below threshold (bypass summarization)
- Cost savings: $[X.XX]/month (estimated)
- Quality: 100% fidelity preserved (full text storage)

**Chunk Size** (if applicable): [TBD] tokens

**Rationale**:
- [Balance between context preservation and processing efficiency]
- [Coherence impact analysis]

**Final Output Size**: [TBD] tokens

**Rationale**:
- Stage 4 context window: [X]K tokens available
- Buffer: [X]K tokens for client input + system prompts
- Validation: [X]K tokens sufficient for comprehensive course analysis

**Document Size Distribution** (from sample):
- p10: [X] tokens
- p25: [X] tokens
- p50: [X] tokens (median)
- p75: [X] tokens
- p90: [X] tokens
- p95: [X] tokens
- p99: [X] tokens
- Max: [X] tokens

---

## Implementation Roadmap

### Immediate Next Steps (Post-Research)

1. **Update spec.md**: Replace all [NEEDS CLARIFICATION] markers with decisions
2. **Create plan.md Phase 1 tasks**: Based on selected framework/strategy/model
3. **Implement LLM client abstraction**: `llm-client.ts` with selected framework
4. **Create strategy implementation**: Map-Reduce/Refine/other in `strategies/` directory
5. **Setup token estimation**: `token-estimator.ts` with language-specific ratios (if validated)
6. **Implement quality validator**: `quality-validator.ts` with semantic similarity threshold

### Migration Path (If Framework Changes)

**Current MVP Assumption**: [Framework X] with [Strategy Y]

**If Research Recommends Different Approach**:
1. Document migration plan in this file
2. Update all affected modules (list below)
3. Re-run integration tests with new framework
4. Validate semantic similarity correlation still holds

**Affected Modules**:
- `llm-client.ts` - Framework abstraction layer
- `summarization-service.ts` - Business logic using framework
- `strategies/*.ts` - Strategy implementations
- Unit tests for service layer

---

## Appendix: Benchmark Data

### Framework Comparison Table

| Framework | Lines of Code | Time to Implement | Dependencies | DX Rating | Error Handling | Recommendation |
|-----------|--------------|-------------------|--------------|-----------|----------------|----------------|
| LangChain.js | [TBD] | [TBD] hours | [TBD] packages | [1-10] | [Good/Fair/Poor] | [Yes/No/Maybe] |
| LangGraph | [TBD] | [TBD] hours | [TBD] packages | [1-10] | [Good/Fair/Poor] | [Yes/No/Maybe] |
| Direct API | [TBD] | [TBD] hours | [TBD] packages | [1-10] | [Good/Fair/Poor] | [Yes/No/Maybe] |
| Vercel AI SDK | [TBD] | [TBD] hours | [TBD] packages | [1-10] | [Good/Fair/Poor] | [Yes/No/Maybe] |

### Strategy Comparison Table

| Strategy | Quality (Similarity) | Quality (Human) | Cost/Doc | Latency (Mean) | Latency (p95) | Recommendation |
|----------|---------------------|-----------------|----------|----------------|---------------|----------------|
| Stuffing | [X.XX ± X.XX] | [X.X/5.0] | $[X.XX] | [X]s | [X]s | [Yes/No/Maybe] |
| Map-Reduce | [X.XX ± X.XX] | [X.X/5.0] | $[X.XX] | [X]s | [X]s | [Yes/No/Maybe] |
| Refine | [X.XX ± X.XX] | [X.X/5.0] | $[X.XX] | [X]s | [X]s | [Yes/No/Maybe] |
| Map-Rerank | [X.XX ± X.XX] | [X.X/5.0] | $[X.XX] | [X]s | [X]s | [Yes/No/Maybe] |
| Hierarchical | [X.XX ± X.XX] | [X.X/5.0] | $[X.XX] | [X]s | [X]s | [Yes/No/Maybe] |

### Model Comparison Table

| Model | Quality (Similarity) | Quality (Multilingual) | Cost/1M Input | Cost/1M Output | Context Window | Recommendation |
|-------|---------------------|------------------------|---------------|----------------|----------------|----------------|
| Llama 3.3 70B | [X.XX ± X.XX] | [X%] parity | $[X.XX] | $[X.XX] | [X]K | [Yes/No/Maybe] |
| GPT-4 Turbo | [X.XX ± X.XX] | [X%] parity | $[X.XX] | $[X.XX] | [X]K | [Yes/No/Maybe] |
| Claude 3.5 Sonnet | [X.XX ± X.XX] | [X%] parity | $[X.XX] | $[X.XX] | [X]K | [Yes/No/Maybe] |
| Gemini 1.5 Pro | [X.XX ± X.XX] | [X%] parity | $[X.XX] | $[X.XX] | [X]K | [Yes/No/Maybe] |
| Mixtral 8x22B | [X.XX ± X.XX] | [X%] parity | $[X.XX] | $[X.XX] | [X]K | [Yes/No/Maybe] |

### Semantic Similarity Correlation Analysis

**Hypothesis**: Semantic similarity (cosine similarity between original text and summary Jina-v3 embeddings) correlates with human quality judgments.

**Human Eval Sample**: [N] documents (Russian + English)

**Correlation Coefficient**: r = [X.XX] (Pearson)

**Interpretation**:
- r > 0.80: Excellent - semantic similarity is valid quality proxy
- 0.60 < r < 0.80: Good - semantic similarity useful but supplement with human audit
- r < 0.60: Poor - semantic similarity not reliable, need alternative quality metric

**Validation Strategy** (if r > 0.80):
- P1: Post-hoc semantic similarity logging (warning only)
- P2: Pre-save quality gate with >0.75 threshold
- P3: Periodic human audit sampling (random production samples)

---

## Research Team Sign-Off

**Researcher(s)**: [Name(s)]
**Completion Date**: [YYYY-MM-DD]
**Review Status**: [ ] DRAFT | [ ] UNDER REVIEW | [ ] APPROVED

**Approval Required From**:
- [ ] Technical Lead
- [ ] Product Owner
- [ ] Cost/Budget Reviewer

**Next Action**: Update `/specs/005-stage-3-create/spec.md` with decisions → Begin P1 implementation
