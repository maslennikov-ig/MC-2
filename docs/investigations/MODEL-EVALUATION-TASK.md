# Model Evaluation Task: Qwen 3 Max Alternatives

**Date**: 2025-11-13
**Status**: Ready for execution
**Objective**: Identify cost-effective alternatives to Qwen 3 Max for Stage 5 generation phases

---

## Executive Summary

Test 10 alternative LLM models against current Qwen 3 Max baseline to find cheaper options that maintain quality. Current cost: **$0.63 per course** (with retries up to $0.76). Target: reduce by 30-50% while maintaining >0.75 quality score.

**Cost-Optimized Plan**: 2 test cases per scenario (EN + RU), 1 lesson per test (vs full section), **NO RAG** (testing pure generation quality). **Total: 40 API calls, estimated cost $4-7** (vs original 100 calls, $15-25).

---

## Models to Test

| Model ID | Context | Cost (per 1M tokens) | Special Features |
|----------|---------|---------------------|------------------|
| `qwen/qwen3-max` | 256K | $1.20 / $6.00 | **BASELINE** (current) |
| `nousresearch/hermes-3-llama-3.1-405b` | 128K | $0.50 / $0.50 | **OSS 120B** (current tier 1) |
| `moonshotai/kimi-k2-0905` | 200K | ? | Moonshot AI flagship |
| `deepseek/deepseek-v3.2-exp` | 128K | ? | DeepSeek experimental |
| `deepseek/deepseek-chat-v3.1` | 128K | $0.27 / $1.10 | DeepSeek production |
| `qwen/qwen3-235b-a22b-thinking-2507` | 128K | ? | Qwen reasoning model |
| `z-ai/glm-4.6` | 128K | ? | Z-AI GLM flagship |
| `moonshotai/kimi-k2-thinking` | 200K | ? | Moonshot reasoning |
| `x-ai/grok-4-fast` | 128K | ? | xAI Grok optimized |
| `qwen/qwen3-32b` | 128K | $0.35 / $1.40 | Qwen compact |

---

## Test Scenarios

### Scenario 1: Metadata Generation (Phase 1)

**Task**: Generate course-level metadata from analysis result

**Input** (NO RAG, minimal context):
- `analysis_result`: Course topic + complexity + recommended structure (~2K tokens)
- `frontend_parameters`: User preferences (course_title override, difficulty)

**Output**: JSON with:
```typescript
{
  course_title: string,           // 5-60 chars
  description: string,            // 100-500 chars
  learning_outcomes: string[],    // 3-8 items
  prerequisites: string[],        // 0-5 items
  difficulty_level: enum,         // beginner | intermediate | advanced
  estimated_duration: string      // "4 weeks" | "20 hours"
}
```

**Test Cases** (2 total, minimal cost):
1. **English, Beginner**: "Introduction to Python Programming" (simple topic, ~2K input, ~500 output tokens)
2. **Russian, Intermediate**: "Машинное обучение для начинающих" (ML topic, ~2K input, ~500 output tokens)

**Prompt Template**: Use `metadata-generator.ts` prompt (lines 140-180)

---

### Scenario 2: Section Generation (Phase 2, Tier 2)

**Task**: Generate 1 lesson with exercises (cost-optimized: 1 lesson instead of full section)

**Input** (NO RAG, minimal context):
- `analysis_result`: Topic + section outline from analysis (~2K tokens)
- `metadata`: Course metadata from Phase 1 (~500 tokens)
- `section_index`: 0 (first section)

**Output**: JSON with (1 lesson only):
```typescript
{
  lesson_number: number,
  lesson_title: string,
  content_blocks: [
    { type: 'text', content: string },      // Main explanation (~800-1200 tokens)
    { type: 'example', content: string }    // Code/practical example (~200-400 tokens)
  ],
  exercises: [                              // 1-2 exercises (cost-optimized)
    {
      type: 'multiple_choice' | 'coding' | 'short_answer',
      question: string,
      options?: string[],
      correct_answer: string | number,
      explanation: string
    }
  ]
}
```

**Test Cases** (2 total, minimal cost):
1. **English, Programming**: "Variables and Data Types in Python" (code-heavy, ~2.5K input, ~1500 output tokens)
2. **Russian, Theory**: "Основы нейронных сетей" (conceptual ML, ~2.5K input, ~1200 output tokens)

**Prompt Template**: Use `section-batch-generator.ts` prompt (lines 450-550)

---

## Execution Plan

### Phase 1: Setup (5 min)
1. Read current prompts from `metadata-generator.ts` and `section-batch-generator.ts`
2. Fetch OpenRouter pricing for all 10 models
3. Create test data generator for 2 test cases per scenario (EN + RU)
4. Set up results collection structure

### Phase 2: Parallel Execution (10-15 min)
- Launch **10 parallel agents** (one per model)
- Each agent runs **4 tests** (2 metadata + 2 lesson generation, NO RAG)
- Total: **40 API calls** across all models (60% reduction vs original 100)
- Estimated cost: **$4-7** (70-75% cost reduction vs $15-25)

### Phase 3: Results Collection (auto)
- Save all outputs to `docs/investigations/model-evaluation-results.md`
- Structure: Model → Test Case → Output JSON + Metadata (tokens, cost, duration)

### Phase 4: Evaluation (10 min)
- Manual review of quality (schema compliance, content depth, creativity)
- Automated scoring: JSON validity, field completeness, length constraints
- Cost-benefit analysis: quality score / cost_per_generation

---

## Evaluation Criteria

### Automated Metrics (60% weight)

1. **Schema Compliance** (20%)
   - JSON validity (parse without errors)
   - All required fields present
   - Field types match TypeScript interface
   - Array lengths within constraints (e.g., 3-8 learning outcomes)

2. **Content Quality** (20%)
   - Text length constraints met (description 100-500 chars)
   - No placeholder text ("Lorem ipsum", "TODO", "[INSERT]")
   - No broken markdown or code blocks
   - Proper language (EN test → EN output, RU test → RU output)

3. **Instruction Following** (20%)
   - Difficulty level matches input
   - Topic relevance (course title reflects analysis_result)
   - RAG context integration (mentions specific documents when provided)

### Manual Metrics (40% weight)

4. **Content Depth** (15%)
   - Learning outcomes are specific and measurable
   - Lesson content provides clear explanations
   - Examples are relevant and well-structured

5. **Creativity & Coherence** (15%)
   - Course title is engaging (not generic "Introduction to X")
   - Exercises vary in type and difficulty
   - Section flow is logical

6. **Multilingual Quality** (10%)
   - Russian output is grammatically correct
   - Cultural appropriateness (Russian examples use Cyrillic, local references)

### Cost Efficiency Metric

**Final Score** = (Automated Score × 0.6 + Manual Score × 0.4) / (Cost per Generation / $0.10)

Example:
- Model A: Quality 0.85, Cost $0.08 → Score = 0.85 / 0.8 = **1.06**
- Model B: Quality 0.90, Cost $0.15 → Score = 0.90 / 1.5 = **0.60**
→ Model A wins (better cost-efficiency)

---

## Success Criteria

### Minimum Viable Alternative
- Quality score ≥ 0.75 (vs Qwen 3 Max baseline ≥ 0.80)
- Cost reduction ≥ 30% ($0.63 → $0.44 per course)
- Schema compliance rate ≥ 95%
- No critical failures (empty outputs, crashes)

### Ideal Alternative
- Quality score ≥ 0.80 (matches Qwen 3 Max)
- Cost reduction ≥ 50% ($0.63 → $0.31 per course)
- Schema compliance rate = 100%
- Faster generation (<30s per call vs 40-60s)

---

## Output Format

### Results File: `model-evaluation-results.md`

```markdown
# Model Evaluation Results
Date: 2025-11-13

## Executive Summary
- Models tested: 10
- Test cases: 10 per model (100 total)
- Total cost: $XX.XX
- Winner: [model-id] (quality X.XX, cost $X.XX/gen, efficiency X.XX)

## Ranking
1. [model-id] - Quality X.XX | Cost $X.XX | Efficiency X.XX
2. ...

## Detailed Results

### Model: qwen/qwen3-max (BASELINE)
- **Pricing**: $1.20 input / $6.00 output per 1M tokens
- **Total cost**: $X.XX
- **Avg quality**: 0.XX
- **Schema compliance**: XX%

#### Test 1: Metadata - English Beginner No RAG
**Input**: "Introduction to Python Programming"
**Output**:
\`\`\`json
{
  "course_title": "Python Programming: From Zero to Hero",
  "description": "Learn Python fundamentals...",
  ...
}
\`\`\`
**Metrics**: tokens=XXXX, cost=$X.XX, duration=XXs, quality=0.XX

...

### Model: deepseek/deepseek-chat-v3.1
...
```

---

## Implementation Notes

### Agent Architecture
- **Orchestrator**: Main agent that launches 10 parallel workers
- **Worker agents**: Each tests 1 model × 10 test cases
- **Shared context**: Test prompts, evaluation criteria, result template

### Error Handling
- Retry logic: 3 attempts per API call (exponential backoff)
- Timeout: 120s per generation
- Invalid JSON: log raw output, mark as schema compliance failure
- API errors: log error, skip model (don't block others)

### Cost Protection
- Hard limit: **$10 total spend** (reduced from $30)
- Per-model limit: **$1.50** (reduced from $5)
- If limit hit: stop that model, continue others
- Auto-stop after 40 API calls completed

---

## Next Steps After Evaluation

1. **Update RT-001** with new model routing strategy
2. **Update cost-calculator.ts** with winner model pricing
3. **Update metadata-generator.ts** and section-batch-generator.ts to use new model
4. **Add feature flag** for gradual rollout (10% → 50% → 100%)
5. **Monitor production** for quality degradation (Jina-v3 similarity scores)
6. **Calculate ROI**: (old_cost - new_cost) × courses_per_month

---

## Appendix A: Model Selection Rationale

### Why These 10 Models?

1. **Qwen family** (qwen3-max, qwen3-32b, qwen3-235b-thinking): Current vendor, multiple tiers
2. **DeepSeek** (v3.2-exp, chat-v3.1): Strong JSON adherence, low cost
3. **Moonshot Kimi** (k2-0905, k2-thinking): Large context, reasoning focus
4. **Z-AI GLM-4.6**: Emerging competitor, claimed quality
5. **xAI Grok-4-fast**: Speed optimization for latency reduction
6. **OSS 120B**: Current tier 1 model, validation baseline

### Models NOT Tested (why)
- **GPT-4**: Too expensive ($10+ input, $30+ output)
- **Claude 3.5 Sonnet**: No JSON mode, high cost
- **Gemini 2.5 Flash**: Already tier 3 fallback, tested separately
- **Llama 3.1 70B**: Too small for complex metadata generation

---

## Appendix B: Risk Analysis

### Risks
1. **Quality degradation**: New model generates low-quality courses → mitigate with A/B testing
2. **Schema drift**: Model ignores JSON schema → add stricter validation + retry logic
3. **Cost overrun during testing**: 10 models × 10 tests = 100 API calls → set hard limits ($30)
4. **Latency increase**: Slower model impacts UX → measure P50/P95 latency in results
5. **Vendor lock-in**: Switching to proprietary model (Kimi, GLM) → prefer open alternatives

### Mitigation
- Run evaluation on **test environment** first
- Use **feature flags** for gradual production rollout
- Monitor **quality scores** (Jina-v3 similarity) in real-time
- Keep **Qwen 3 Max as fallback** for 6 months post-switch

---

## Cost Optimization Summary

| Optimization | Original Plan | Optimized Plan | Savings |
|--------------|---------------|----------------|---------|
| Test cases per scenario | 5 | 2 (EN + RU) | -60% |
| Section output | Full section (2-3 lessons) | 1 lesson only | -66% |
| RAG context | 15-40K tokens | 0 tokens (removed) | -100% |
| **Total API calls** | **100** | **40** | **-60%** |
| **Estimated cost** | **$15-25** | **$4-7** | **-70%** |
| **Duration** | **40 min** | **20 min** | **-50%** |

**Key Changes**:
1. ✅ Removed RAG testing (no test data available)
2. ✅ Reduced test cases from 5 to 2 per scenario (EN + RU coverage)
3. ✅ Generate 1 lesson instead of full section (sufficient for quality assessment)
4. ✅ Reduced input context from 15-40K to ~2-2.5K tokens

**Retained Quality**:
- Still testing 10 models (full coverage)
- Both languages tested (English + Russian)
- Both scenarios tested (metadata + lesson generation)
- Sufficient output volume for quality comparison (~500-1500 tokens per test)

---

**Status**: ✅ Ready for execution (cost-optimized)
**Assigned to**: Orchestrator agent (parallel execution)
**Estimated duration**: 20 minutes
**Estimated cost**: $4-7
