# Research Prompt: LLM Orchestration Framework Selection for Stage 4

**Generated**: 2025-11-01
**Status**: 🔬 RESEARCH REQUIRED
**Research Type**: Deep Research (comparative analysis)
**Time Budget**: 2-4 hours
**Deadline**: Before starting T015 (Phase services implementation)

---

## Context

**Project**: MegaCampus2 - Course Generation Platform (Stage 4: Multi-Phase Analysis)

**Current Decision** (from research.md, line 56):
- ❌ Framework-based orchestration (LangChain, LlamaIndex) rejected
- ✅ Direct OpenAI SDK chosen
- **Rationale**: "Stage 3 proved Direct OpenAI SDK simpler and faster"

**Problem**: Stage 4 has MORE COMPLEX requirements than Stage 3:
- 5 sequential phases with dependencies
- Per-phase model selection (20B for simple, 120B for expert)
- Quality validation after each phase
- Cost tracking per phase
- Progress updates (6 checkpoints, 0-100%)
- Error handling with retry/escalation logic
- Adaptive model selection (document count-based)

**Question**: Should we reconsider frameworks for Stage 4's complexity?

---

## Research Questions

### **PRIMARY QUESTION**:
**"What is the optimal approach for implementing Stage 4's multi-phase multi-model LLM orchestration?"**

---

## Technical Requirements (Stage 4 Specific)

### **Architecture**:
```
Phase 0 (Pre-Flight) → Phase 1 (Classification, 20B) → Phase 2 (Scope, 20B) →
Phase 3 (Expert, 120B ALWAYS) → Phase 4 (Synthesis, Adaptive 20B/120B) →
Phase 5 (Assembly, No LLM)
```

### **Key Features Needed**:

#### 1. **Multi-Model Orchestration**:
- OpenRouter API integration (NOT native OpenAI)
- Model routing: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `google/gemini-2.5-flash` (emergency)
- Per-phase model configuration (from database: `llm_model_config` table)
- 3-tier fallback: course override → global default → hardcoded

#### 2. **Quality Validation**:
- Semantic similarity check (Jina-v3 embeddings, 0.75 threshold)
- Retry with escalation if quality fails (20B → 120B → Gemini 2.5 Flash)
- Zod schema validation for all outputs

#### 3. **Cost Tracking**:
- Per-phase token counting (input + output)
- Cost calculation by model ID (different pricing per model)
- Aggregate cost per course + per organization

#### 4. **Progress Tracking**:
- 6 progress updates: 0% → 10% → 25% → 45% → 75% → 90% → 100%
- Russian language progress messages
- Real-time updates to Supabase (`courses.generation_progress`)

#### 5. **Error Handling**:
- Barrier enforcement (Stage 3 must be 100% complete)
- Minimum 10 lessons validation (Phase 2 hard failure)
- Retry logic with exponential backoff
- Context overflow detection (switch to emergency model)

#### 6. **Performance**:
- Total execution time: 30s - 10min
- NO streaming (batch responses preferred for reliability)
- Parallel execution NOT needed (phases are sequential)

#### 7. **Maintainability**:
- Must integrate with existing Stage 3 infrastructure (llm-client.ts, quality-validator.ts, cost-calculator.ts)
- TypeScript + Zod schemas required
- Supabase Auth integration
- BullMQ job processing

---

## Frameworks to Research

**Please evaluate EACH framework on the criteria below**:

### Core Frameworks

1. **LangChain** (LangChain Core + LangGraph for orchestration)
   - Version: Latest stable (v0.3+)
   - Focus: Multi-agent orchestration, model routing, retry logic
   - Official docs: https://js.langchain.com/docs/

2. **LangSmith** (LangChain's observability layer)
   - Purpose: Tracing, cost tracking, quality monitoring
   - Question: Does it add value over custom Supabase tracking?
   - Official docs: https://docs.smith.langchain.com/

3. **LlamaIndex**
   - Version: Latest stable (TypeScript SDK)
   - Focus: Data ingestion, multi-step reasoning
   - Official docs: https://ts.llamaindex.ai/

4. **Semantic Kernel** (Microsoft)
   - Version: Latest TypeScript SDK
   - Focus: Orchestration, planning, chaining
   - Official docs: https://learn.microsoft.com/en-us/semantic-kernel/

5. **Haystack** (deepset)
   - Version: 2.x
   - Focus: Pipeline orchestration
   - Official docs: https://docs.haystack.deepset.ai/

6. **Autogen** (Microsoft)
   - Focus: Multi-agent conversation patterns
   - Official docs: https://microsoft.github.io/autogen/

7. **Vercel AI SDK**
   - Focus: Streaming, UI integration, TypeScript-first
   - Official docs: https://sdk.vercel.ai/docs

8. **Direct OpenAI SDK** (Current approach)
   - Custom orchestration logic
   - Manual model routing, retry, cost tracking
   - Official docs: https://platform.openai.com/docs/api-reference

9. **Other frameworks** (if you find better options)
   - Please add any relevant frameworks discovered during research

---

## Evaluation Criteria

For EACH framework, research and score (1-10):

### **1. Model Routing & Selection** (Weight: 20%)
- ✅ Supports OpenRouter API (NOT just native OpenAI)?
- ✅ Allows per-phase model configuration (from DB)?
- ✅ Supports 3-tier fallback logic (override → global → hardcoded)?
- ✅ Can switch models mid-workflow (escalation on quality failure)?
- ✅ Handles multiple model providers (OpenAI, Google, Meta)?

**Scoring Guide**:
- 10/10: Full support for all requirements out-of-box
- 7-9/10: Supports most, minor customization needed
- 4-6/10: Partial support, significant custom code required
- 1-3/10: Limited support, framework fights against requirements
- 0/10: Incompatible (show-stopper)

### **2. Quality Validation & Retry** (Weight: 20%)
- ✅ Built-in quality checks (semantic similarity, schema validation)?
- ✅ Retry with escalation (cheap model fails → expensive model retries)?
- ✅ Integrates with custom validators (Jina-v3 embeddings)?
- ✅ Handles context overflow gracefully (emergency model switch)?

**Scoring Guide**:
- 10/10: Built-in quality gates + custom validator hooks
- 7-9/10: Retry logic exists, can add custom validators
- 4-6/10: Manual retry implementation needed
- 1-3/10: No retry support, must build from scratch
- 0/10: Incompatible

### **3. Cost Tracking & Observability** (Weight: 15%)
- ✅ Per-phase token counting?
- ✅ Cost calculation per model (custom pricing)?
- ✅ Integrates with external tracking (Supabase)?
- ✅ Aggregate costs by organization/course?

**Scoring Guide**:
- 10/10: Built-in cost tracking + custom export hooks
- 7-9/10: Token counting provided, can calculate costs
- 4-6/10: Basic token counts, manual cost calculation
- 1-3/10: No cost tracking, must implement manually
- 0/10: Incompatible

### **4. Orchestration Complexity** (Weight: 15%)
- ✅ Sequential phase execution with dependencies?
- ✅ Conditional logic (Phase 2 minimum lessons → fail if <10)?
- ✅ Barrier enforcement (Stage 3 complete → allow Stage 4)?
- ✅ Adaptive logic (document count → model selection)?

**Scoring Guide**:
- 10/10: DAG-based orchestration with conditionals
- 7-9/10: Sequential chains with branching
- 4-6/10: Simple chains, manual conditional logic
- 1-3/10: Linear only, no conditional support
- 0/10: Incompatible

### **5. TypeScript & Integration** (Weight: 10%)
- ✅ Native TypeScript support (not Python-only)?
- ✅ Type-safe (Zod schema integration)?
- ✅ Works with Supabase Auth?
- ✅ BullMQ compatible (async job processing)?

**Scoring Guide**:
- 10/10: TypeScript-first, Zod integration, BullMQ compatible
- 7-9/10: TypeScript SDK, integrates with most tools
- 4-6/10: TypeScript available but limited
- 1-3/10: JavaScript only, manual typing
- 0/10: Python-only (show-stopper)

### **6. Performance** (Weight: 10%)
- ✅ 30s-10min execution window achievable?
- ✅ NO unnecessary overhead (framework bloat)?
- ✅ Supports batch (non-streaming) responses?
- ✅ Can update progress to external DB (Supabase)?

**Scoring Guide**:
- 10/10: Minimal overhead, batch support, external DB hooks
- 7-9/10: Low overhead, batch available
- 4-6/10: Moderate overhead, batch possible
- 1-3/10: High overhead, streaming-only
- 0/10: Incompatible

### **7. Maintainability & Learning Curve** (Weight: 5%)
- ✅ Simple to understand (vs custom code)?
- ✅ Active community & documentation?
- ✅ Stable API (no breaking changes every month)?
- ✅ Can reuse existing Stage 3 services (llm-client, quality-validator)?

**Scoring Guide**:
- 10/10: Intuitive, great docs, stable, reuses existing code
- 7-9/10: Good docs, mostly stable, some reuse
- 4-6/10: Moderate learning curve, frequent updates
- 1-3/10: Complex, poor docs, breaking changes
- 0/10: Incompatible

### **8. Edge Cases** (Weight: 5%)
- ✅ Handles Russian language outputs (enforce English prompts)?
- ✅ Minimum lesson constraint (hard failure)?
- ✅ Research flag detection (conservative LLM-based)?
- ✅ Emergency model escalation (Gemini 2.5 Flash)?

**Scoring Guide**:
- 10/10: All edge cases handled gracefully
- 7-9/10: Most edge cases supported
- 4-6/10: Some edge cases need workarounds
- 1-3/10: Edge cases difficult to implement
- 0/10: Incompatible

---

## Comparison Matrix Template

Please fill this table with scores (0-10) for each criterion:

| Criteria | Weight | LangChain | LangSmith | LlamaIndex | Semantic Kernel | Haystack | Autogen | Vercel AI | Direct SDK | Other |
|----------|--------|-----------|-----------|------------|-----------------|----------|---------|-----------|------------|-------|
| **Model Routing** | 20% | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 |
| **Quality & Retry** | 20% | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 |
| **Cost Tracking** | 15% | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 |
| **Orchestration** | 15% | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 |
| **TypeScript** | 10% | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 |
| **Performance** | 10% | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 |
| **Maintainability** | 5% | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 |
| **Edge Cases** | 5% | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 | ?/10 |
| **WEIGHTED TOTAL** | 100% | ?/100 | ?/100 | ?/100 | ?/100 | ?/100 | ?/100 | ?/100 | ?/100 | ?/100 |

**Calculation Example**:
```
LangChain Score = (Model Routing × 0.20) + (Quality × 0.20) + (Cost × 0.15) +
                  (Orchestration × 0.15) + (TypeScript × 0.10) + (Performance × 0.10) +
                  (Maintainability × 0.05) + (Edge Cases × 0.05)
```

**Winner**: [Framework Name] with score [X]/100

---

## Decision Factors

### **Show-stoppers** (any framework with these fails automatically):
- ❌ Doesn't support OpenRouter API (only native OpenAI)
- ❌ Python-only (no TypeScript SDK)
- ❌ Requires streaming (we need batch)
- ❌ Can't integrate with Supabase (locked to vendor DB)

### **Nice-to-haves** (bonus points):
- ✅ Built-in cost tracking (saves custom code)
- ✅ Built-in quality validation (semantic similarity)
- ✅ Active development (updated in last 3 months)
- ✅ Used by production apps (not just research projects)
- ✅ Supports OpenRouter out-of-box
- ✅ Has TypeScript examples (not just Python)

---

## Additional Research Questions

**Besides framework selection, also research**:

### 1. **Token Estimation**:
- Best practices for estimating tokens BEFORE API call (Stage 3 has 115K chunks)?
- Libraries: `tiktoken`, `gpt-tokenizer`, custom character-to-token ratio?
- Which method has best accuracy for OpenRouter models?

### 2. **Progress Tracking Patterns**:
- Best way to update progress during LLM calls (webhooks, polling, server-sent events)?
- Should we use LangSmith's tracing or custom Supabase updates?
- Industry standard for long-running LLM jobs (30s-10min)?

### 3. **Cost Optimization**:
- Prompt caching strategies (OpenRouter supports caching)?
- Batch processing patterns (multiple courses in one job)?
- Token reduction techniques without quality loss?

### 4. **Error Handling**:
- Industry best practices for LLM retry logic?
- Exponential backoff vs fixed delay?
- Circuit breaker patterns for LLM APIs?
- How to detect context overflow BEFORE API call fails?

### 5. **Quality Validation Alternatives**:
- Besides semantic similarity (Jina-v3), what else exists?
- Frameworks with built-in quality gates?
- LLM-as-a-judge patterns (use one model to validate another)?

### 6. **OpenRouter-Specific**:
- Are there OpenRouter-native SDKs better than generic OpenAI SDK?
- OpenRouter pricing API integration (dynamic cost calculation)?
- OpenRouter error codes and rate limits (different from OpenAI)?

---

## Expected Output

Please provide:

### 1. **Comparison Matrix** (filled table above)
- All scores (0-10) with justification
- Weighted totals calculated
- Winner identified

### 2. **Top 3 Recommendations** (ranked with pros/cons)

**Format**:
```markdown
### 🥇 WINNER: [Framework Name] (Score: X/100)

**Pros**:
- [Advantage 1]
- [Advantage 2]
- [Advantage 3]

**Cons**:
- [Limitation 1]
- [Limitation 2]

**Best For**: Stage 4's multi-phase orchestration because [reason]

---

### 🥈 RUNNER-UP: [Framework Name] (Score: X/100)

**Pros**:
- [Advantage 1]
- [Advantage 2]

**Cons**:
- [Limitation 1]
- [Limitation 2]

**When to Consider**: If [specific condition]

---

### 🥉 THIRD PLACE: [Framework Name] (Score: X/100)

**Pros**:
- [Advantage 1]

**Cons**:
- [Limitation 1]
- [Limitation 2]

**When to Consider**: If [specific condition]
```

### 3. **Winner Justification** (why this framework for Stage 4?)
- Detailed explanation (300-500 words)
- Comparison to Direct SDK approach (current)
- Address specific Stage 4 requirements (5 phases, model routing, quality validation)

### 4. **Migration Effort** (if switching from Direct SDK):

**Format**:
```markdown
### Migration Analysis

**If Winner = Direct SDK**:
- No migration needed
- Continue with current approach
- Estimated effort: 0 hours

**If Winner = [Framework]**:
- **Estimated Hours**: [X-Y hours]
- **Risk Level**: Low / Medium / High
- **Risks**:
  - [Risk 1]
  - [Risk 2]
- **Mitigation**:
  - [Strategy 1]
  - [Strategy 2]
- **Can we use framework ONLY for Stage 4?**: Yes/No (explain)
- **Hybrid Approach Possible?**: Yes/No (explain)
  - Keep Stage 3 Direct SDK, use framework for Stage 4+
```

### 5. **Code Examples** (winner framework):

#### Example 1: Phase 1 Classifier Implementation (20 lines)
```typescript
// Show how Phase 1 (Classification, 20B model) would be implemented
// Include: model routing, prompt, Zod validation
```

#### Example 2: Model Routing Logic (10 lines)
```typescript
// Show how per-phase model selection works
// Include: DB lookup, 3-tier fallback
```

#### Example 3: Quality Validation + Retry (15 lines)
```typescript
// Show how quality validation with retry/escalation works
// Include: semantic similarity check, 20B → 120B escalation
```

### 6. **Answers to Additional Questions**

For each question (1-6 above), provide:
- **Best Practice**: Industry standard approach
- **Recommended Tool/Library**: Specific npm package or pattern
- **Code Snippet** (5-10 lines): If applicable
- **Integration with Winner Framework**: How it fits together

---

## Research Methodology

**Suggested approach**:

1. **Documentation Review** (1 hour):
   - Read official docs for each framework
   - Check TypeScript SDK availability
   - Look for OpenRouter integration examples

2. **GitHub Analysis** (30 min):
   - Check GitHub stars, issues, last commit date
   - Look for production use cases
   - Review TypeScript examples

3. **Code Examples** (1 hour):
   - Find real-world projects using each framework
   - Look for multi-step orchestration examples
   - Check OpenRouter integration patterns

4. **Scoring & Comparison** (30 min):
   - Fill comparison matrix
   - Calculate weighted scores
   - Identify winner

5. **Deep Dive on Winner** (1 hour):
   - Write code examples
   - Estimate migration effort
   - Answer additional questions

**Total**: 2-4 hours

---

## Deliverable Format

Please provide results in a markdown file (`research-results-llm-frameworks.md`) with:

```markdown
# Research Results: LLM Orchestration Framework Selection

**Date**: YYYY-MM-DD
**Researcher**: [Your Name]
**Time Spent**: [X hours]

## Executive Summary
[2-3 paragraphs: Winner, key findings, recommendation]

## Comparison Matrix
[Filled table with scores]

## Top 3 Recommendations
[Detailed pros/cons for top 3]

## Winner Justification
[300-500 words]

## Migration Effort
[Analysis if switching from Direct SDK]

## Code Examples
[3 code snippets showing winner in action]

## Additional Research Findings
[Answers to 6 additional questions]

## References
[List of sources consulted]
```

---

## Success Criteria

Research is complete when:
- ✅ All 8+ frameworks scored on 8 criteria
- ✅ Comparison matrix filled with justified scores
- ✅ Winner identified with clear reasoning
- ✅ Migration effort estimated (if needed)
- ✅ Code examples provided (3 snippets)
- ✅ Additional questions answered (6 questions)
- ✅ Deliverable file created (`research-results-llm-frameworks.md`)

---

## Next Steps After Research

1. Review research results with team
2. Make final decision (framework vs Direct SDK)
3. Update `research.md` with decision and rationale
4. If changing approach:
   - Update `plan.md` (orchestration strategy)
   - Update `tasks.md` (T015-T019 implementation approach)
   - Update `quickstart.md` (code examples)
5. Proceed with Phase 1 implementation

---

**Research Status**: 🔬 AWAITING RESULTS
**Next Action**: Conduct deep research and provide findings
