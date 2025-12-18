# Stage 3: Create Summary - Pre-Planning Analysis

**Document Type:** Research & Analysis
**Status:** Pre-Planning
**Date:** 2025-10-27
**Purpose:** Analyze current n8n implementation and define research questions before specification

---

## 📊 Current Implementation Analysis (n8n MVP)

### Workflow Overview

**File:** `workflows n8n/CAI CourseGen - Create Summary (14).json`

**Architecture:** Map-Reduce with recursive compression

**Flow:**
1. **Calculate Strategy** → Determine approach based on token count
2. **Chunk Summarization** → Process chunks via LangChain
3. **Combine & Compress** → Merge summaries recursively (up to 5 iterations)
4. **Save to Database** → Store in file_catalog

### Key Components

#### 1. Strategy Selection
```
< 3K tokens     → Save as full_text (no summarization)
< 115K tokens   → Direct summarization (single call)
> 115K tokens   → Hierarchical chunks with 5% overlap
```

#### 2. LLM Integration
- **Framework:** LangChain (n8n node)
- **Model:** `openai/gpt-oss-20b` (20B parameters)
- **Temperature:** 0.3
- **Provider:** OpenRouter

#### 3. Adaptive Compression
```typescript
Iteration 1: DETAILED    (5,000-10,000 words)
Iteration 2: BALANCED    (3,000-6,000 words)
Iteration 3+: AGGRESSIVE (1,500-3,000 words)
```

**Stop conditions:**
- Tokens < 200K
- OR iterations >= 5

#### 4. Token Calculation
- Language-specific ratios (18 languages supported)
- Russian: 1.6 chars/token (Cyrillic uses more tokens)
- English: 4.0 chars/token
- Default: 2.5 chars/token

#### 5. Storage
```sql
UPDATE file_catalog SET
  processed_content = summary,
  processing_method = 'summary' | 'full_text',
  original_content_length = char_count
```

---

## ❌ Identified Problems & Limitations

### 1. LLM Framework - LangChain in n8n

**Current:**
```javascript
"type": "@n8n/n8n-nodes-langchain.code"
```

**Problems:**
- ❌ Very limited functionality (n8n wrapper)
- ❌ No access to advanced LangChain features
- ❌ Difficult to debug and test
- ❌ Vendor lock-in (tied to n8n)
- ❌ No TypeScript types
- ❌ Cannot use latest LangChain updates

**Impact:** HIGH - Blocks modernization and optimization

---

### 2. Model Selection - Outdated (2024)

**Current:**
```javascript
"model": "openai/gpt-oss-20b"  // 20B parameter model from 2024
```

**Problems:**
- ❌ Model may be outdated (need 2025 models)
- ❌ No comparison with modern alternatives
- ❌ 20B parameters may not be optimal for summarization
- ❌ Missing features:
  - No prompt caching (Claude 3.5)
  - No structured outputs (GPT-4)
  - No extended context (Gemini 2M tokens)

**Missing Evaluation:**
- Claude 3.5 Sonnet (200K context, prompt caching)
- GPT-4 Turbo / GPT-4o (structured outputs)
- Gemini 1.5 Pro (2M context window)
- Llama 3.3 70B (open source alternative)

**Impact:** HIGH - Cost and quality optimization blocked

---

### 3. Summarization Strategy - Fixed Thresholds

**Current:**
```javascript
if (iteration === 1) {
  targetWords = '5,000-10,000 words'; // DETAILED
} else if (iteration === 2) {
  targetWords = '3,000-6,000 words'; // BALANCED
} else {
  targetWords = '1,500-3,000 words'; // AGGRESSIVE
}
```

**Problems:**
- ❌ Fixed thresholds (not adaptive to content type)
- ❌ No quality assessment
- ❌ Up to 5 iterations may be excessive
- ❌ No early stopping based on quality metrics
- ❌ Hard-coded word counts don't consider semantic completeness

**Missing:**
- Dynamic compression based on content analysis
- Quality metrics (ROUGE, BERTScore, coherence)
- Adaptive iteration strategy

**Impact:** MEDIUM - Quality and cost optimization opportunity

---

### 4. Storage Schema - Limited

**Current:**
```sql
UPDATE file_catalog SET
  processed_content = summary  -- Just text, no metadata
```

**Problems:**
- ❌ No dedicated `summaries` table
- ❌ No versioning (cannot track changes)
- ❌ No quality metrics stored
- ❌ No model/strategy metadata
- ❌ No token counts (input/output)
- ❌ No cost tracking
- ❌ Not integrated with RAG (vectors not updated)

**Missing Schema:**
```sql
CREATE TABLE summaries (
  id UUID PRIMARY KEY,
  file_id UUID REFERENCES file_catalog,
  version INT,
  strategy TEXT,           -- 'direct', 'map-reduce', 'hierarchical'
  model TEXT,              -- 'claude-3-5-sonnet', 'gpt-4-turbo'
  input_tokens INT,
  output_tokens INT,
  cost_usd DECIMAL(10,6),
  summary_text TEXT,
  quality_metrics JSONB,   -- ROUGE, BERTScore, etc.
  created_at TIMESTAMPTZ
);
```

**Impact:** MEDIUM - Limits analytics and optimization

---

### 5. Caching - Absent

**Current:** No caching mechanism

**Problems:**
- ❌ Re-summarizes identical documents
- ❌ No deduplication (unlike vectorization in Stage 2)
- ❌ Wasted API calls and costs
- ❌ No prompt caching (Claude feature unused)

**Missing:**
- Content hash (SHA-256) for deduplication
- Prompt caching for repeated system prompts
- Summary result caching

**Potential Savings:** 50-90% cost reduction with caching

**Impact:** HIGH - Cost optimization critical

---

### 6. Quality Assessment - None

**Current:** No quality metrics

**Problems:**
- ❌ No validation of summary quality
- ❌ No metrics: coherence, relevance, consistency
- ❌ No feedback loop for improvement
- ❌ Cannot compare strategies/models
- ❌ No A/B testing framework

**Missing Metrics:**
- ROUGE-L (n-gram overlap)
- BERTScore (semantic similarity)
- Coherence score
- Compression ratio
- Information retention rate

**Impact:** MEDIUM - Cannot measure/improve quality

---

### 7. Chunking Strategy - Simple Overlap

**Current:**
```javascript
const OVERLAP_PERCENT = 0.05; // Fixed 5% overlap
```

**Problems:**
- ❌ Fixed 5% overlap (not adaptive)
- ❌ Does not consider semantic boundaries
- ❌ May split important contexts
- ❌ No use of existing hierarchical chunking (Stage 0)

**Opportunity:**
- Reuse hierarchical chunking from Stage 0 (proven in Stage 2)
- Jina-v3 embeddings for semantic boundaries
- Adaptive overlap based on content type

**Impact:** LOW - Minor quality improvement

---

## 🔬 Research Questions (MANDATORY Before Specification)

### Research Area 1: LLM Framework Selection ⚠️ **CRITICAL**

**Question:** What is the optimal framework for LLM integration in production TypeScript codebase in 2025?

**Candidates:**

| Framework | Pros | Cons | Complexity |
|-----------|------|------|------------|
| **LangChain.js** | Mature ecosystem, Map-Reduce built-in, many components | Heavy overhead, complexity, slower updates | HIGH |
| **LangGraph** | Modern (state graphs), flexible workflows, good for complex flows | Newer, fewer examples, learning curve | MEDIUM |
| **Vercel AI SDK** | Simple, TypeScript-first, streaming, React integration | Fewer summarization features, less mature for complex workflows | LOW |
| **Direct APIs** (Anthropic SDK, OpenAI SDK) | Full control, minimal overhead, latest features (prompt caching) | More code for Map-Reduce, DIY orchestration | MEDIUM |
| **LlamaIndex.js** | Specialized for RAG & document processing | Less community experience, smaller ecosystem | MEDIUM |

**Evaluation Criteria:**
1. **Performance** - Latency, throughput, memory usage
2. **Developer Experience** - TypeScript support, debugging, testing
3. **Production Readiness** - Stability, error handling, monitoring
4. **Cost Optimization** - Prompt caching, batching, streaming
5. **Maintenance** - Community support, update frequency

**Deliverable:** Benchmark report comparing frameworks on real documents

---

### Research Area 2: LLM Model Selection ⚠️ **CRITICAL**

**Question:** Which LLM provides best quality-to-cost ratio for document summarization in 2025?

**Candidates:**

| Model | Context Window | Key Features | Cost (per 1M tokens) |
|-------|----------------|--------------|---------------------|
| **Claude 3.5 Sonnet** | 200K | Prompt caching (90% savings), excellent summarization | Input: $3, Output: $15 (cached: $0.30/$0.60) |
| **GPT-4 Turbo** | 128K | Structured outputs, reliable quality | Input: $10, Output: $30 |
| **GPT-4o** | 128K | Faster, cheaper than GPT-4 | Input: $2.50, Output: $10 |
| **Gemini 1.5 Pro** | 2M (!) | Massive context, good quality | Input: $1.25, Output: $5 |
| **Llama 3.3 70B** | 128K | Open source, cheap via OpenRouter | Input: $0.40, Output: $1.20 |
| **Qwen 2.5 72B** | 128K | Strong multilingual, cheap | Input: $0.35, Output: $1.20 |

**Evaluation Tests:**

1. **Quality Metrics:**
   - ROUGE-L score (n-gram overlap with reference)
   - BERTScore (semantic similarity)
   - Human evaluation (5 experts, 1-10 scale)

2. **Use Cases:**
   - Short docs (< 10K tokens) - single call
   - Medium docs (10-50K tokens) - Map-Reduce
   - Long docs (50-200K tokens) - hierarchical
   - Multi-language docs (Russian, English, etc.)

3. **Cost Analysis:**
   - Cost per document (with/without prompt caching)
   - Latency (time to first token, total time)
   - Token efficiency (compression ratio)

**Deliverable:** Model comparison report with recommendations by use case

---

### Research Area 3: Summarization Strategy ⚠️ **HIGH PRIORITY**

**Question:** What is the optimal summarization strategy for different document sizes?

**Current n8n Strategy:**
- Map-Reduce with recursive compression (up to 5 iterations)

**Alternative Strategies:**

| Strategy | Best For | Pros | Cons |
|----------|----------|------|------|
| **Stuff** | < 50K tokens | Single call, fastest, cheapest | Limited by context window |
| **Map-Reduce** | 50-200K tokens | Parallelizable, scales well | Two-phase cost, may lose context |
| **Refine** | Any size | Sequential improvement, better quality | Slow (sequential), expensive |
| **Map-Rerank** | Quality-critical | Generate multiple summaries, pick best | 2-3x cost |
| **Hierarchical** | > 200K tokens | Tree structure, preserves organization | Complex implementation |

**Evaluation Criteria:**
1. **Information Retention** - ROUGE scores vs reference
2. **Processing Time** - Latency for different document sizes
3. **Cost** - API costs per document
4. **Quality** - Coherence, relevance, completeness

**Test Documents:**
- 10K tokens: Single article
- 50K tokens: Research paper
- 100K tokens: Technical manual
- 200K tokens: Book chapter

**Deliverable:** Strategy selection matrix with decision tree

---

### Research Area 4: Optimization Techniques

**Question:** What optimizations provide best ROI?

**Techniques to Evaluate:**

#### 4.1 Prompt Caching (Claude 3.5)
- Cache system prompt (instructions, format)
- Save up to 90% on repeated prompts
- Test: 1,000 documents with identical instructions

#### 4.2 Semantic Chunking
- Use Jina-v3 embeddings (from Stage 0)
- Split at semantic boundaries (not fixed tokens)
- Compare with fixed-size chunks

#### 4.3 Content Deduplication
- SHA-256 hash of documents
- Skip summarization if cached
- Test: 1,000 docs with 30% duplicates

#### 4.4 Quality Gates
- ROUGE threshold (min quality before accepting)
- Automatic retry with different strategy if below threshold
- Test: Documents with varying complexity

**Deliverable:** Cost-benefit analysis for each optimization

---

### Research Area 5: Integration with Existing Infrastructure

**Question:** How to leverage Stage 0-2 infrastructure?

**Available Infrastructure:**

1. **Hierarchical Chunking** (Stage 0)
   - Parent chunks: 1500 tokens
   - Child chunks: 400 tokens
   - Semantic boundaries
   - **Reuse for summarization?**

2. **Jina-v3 Embeddings** (Stage 0)
   - 768-dimensional vectors
   - Late chunking support
   - **Use for semantic chunking?**

3. **Qdrant Vector Storage** (Stage 0)
   - Already stores document chunks
   - **Store summary embeddings for RAG?**

4. **BullMQ Orchestration** (Stage 1)
   - Job types defined: SUMMARY_GENERATION
   - Retry logic, progress tracking
   - **Ready to use**

5. **Database Schema** (Stage 0)
   - file_catalog table exists
   - **Need summaries table?**

**Integration Tasks:**
- Map existing infrastructure to summarization needs
- Identify gaps (new tables, RPCs, types)
- Plan data flow: file_catalog → summarization → vectors

---

## 💡 Preliminary Recommendations (Subject to Research)

### Framework (80% confidence)
**Recommendation:** Direct APIs (Anthropic SDK) + custom orchestration

**Rationale:**
- Full control over prompt caching (Claude 3.5)
- Minimal overhead (no framework abstraction)
- Latest features immediately available
- Easier to test and debug
- Can add LangChain later if needed

### Model (70% confidence)
**Recommendation:** Claude 3.5 Sonnet with prompt caching

**Rationale:**
- Prompt caching: 90% cost savings on repeated prompts
- Excellent summarization quality
- 200K context window (enough for most docs)
- Strong multilingual support (including Russian)

**Fallback:** Llama 3.3 70B (via OpenRouter) for cost-sensitive cases

### Strategy (60% confidence)
**Recommendation:** Adaptive based on size

```typescript
if (tokens < 50K) {
  strategy = 'stuff';  // Single call
} else if (tokens < 150K) {
  strategy = 'map-reduce';  // With prompt caching
} else {
  strategy = 'hierarchical';  // Tree structure
}
```

### Storage (90% confidence)
**Recommendation:** Dedicated summaries table

```sql
CREATE TABLE summaries (
  id UUID PRIMARY KEY,
  file_id UUID REFERENCES file_catalog,
  version INT DEFAULT 1,
  content_hash TEXT,        -- SHA-256 for deduplication
  strategy TEXT,
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cost_usd DECIMAL(10,6),
  summary_text TEXT,
  quality_metrics JSONB,    -- ROUGE, BERTScore
  cache_hit BOOLEAN,
  processing_time_ms INT,
  created_at TIMESTAMPTZ
);

-- Index for deduplication
CREATE INDEX idx_summaries_content_hash ON summaries(content_hash);
```

---

## 📋 Research Plan Outline

### Phase 0: Research & Benchmarking (3-4 days)

**Day 1: Framework Evaluation**
- Task R1.1: Setup test harness (3 document sizes)
- Task R1.2: Benchmark LangChain Map-Reduce
- Task R1.3: Benchmark Direct API (Anthropic SDK)
- Task R1.4: Benchmark Vercel AI SDK
- Task R1.5: Compare latency, memory, DX

**Day 2: Model Evaluation**
- Task R2.1: Test Claude 3.5 Sonnet (with/without caching)
- Task R2.2: Test GPT-4o
- Task R2.3: Test Gemini 1.5 Pro
- Task R2.4: Test Llama 3.3 70B
- Task R2.5: Calculate ROUGE, BERTScore, cost

**Day 3: Strategy Testing**
- Task R3.1: Test Stuff (< 50K tokens)
- Task R3.2: Test Map-Reduce (50-150K tokens)
- Task R3.3: Test Hierarchical (> 150K tokens)
- Task R3.4: Compare quality and cost

**Day 4: Optimization Testing**
- Task R4.1: Measure prompt caching savings
- Task R4.2: Test semantic chunking
- Task R4.3: Test content deduplication
- Task R4.4: Calculate ROI

**Deliverables:**
1. Framework comparison report (markdown + data)
2. Model evaluation matrix (quality, cost, latency)
3. Strategy decision tree
4. Optimization cost-benefit analysis

---

## 🚀 Next Steps

1. **Read this document** when creating Stage 3 specification
2. **Include Research Phase** (Phase 0) in specification
3. **Make data-driven decisions** based on research results
4. **Document findings** in research.md
5. **Update recommendations** in specification

---

## 📚 References

**Existing Infrastructure:**
- Stage 0: Hierarchical chunking, Jina-v3, Qdrant
- Stage 1: BullMQ orchestration, JWT auth
- Stage 2: Integration tests, database verification

**Current Implementation:**
- `workflows n8n/CAI CourseGen - Create Summary (14).json`

**Documentation:**
- `docs/IMPLEMENTATION_ROADMAP_EN.md`
- `docs/TECHNICAL_SPECIFICATION_PRODUCTION_EN.md`
- `docs/RAG-CHUNKING-STRATEGY.md`

---

**Document Status:** READY FOR SPECIFICATION PLANNING
**Next Action:** Create Stage 3 specification with Research Phase
**Author:** Claude Code (Analysis)
**Date:** 2025-10-27
