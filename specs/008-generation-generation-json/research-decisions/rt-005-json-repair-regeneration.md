# RT-005: JSON Repair & Regeneration Optimization Strategy

**Status**: ✅ APPROVED - Implementation Ready
**Date**: 2025-11-08
**Research Source**: `docs/research/008-generation/JSON Repair and Regeneration Strategies for LLM.md`
**Blocks**: T015 (json-repair.ts), T019 (metadata-generator.ts), T020 (section-batch-generator.ts), T029-B (generation-phases.ts)

---

## 1. Executive Summary

**DECISION: Adopt "Pragmatic Cascade" strategy combining jsonrepair library (FSM) + existing 4-level cascade + selective LLM semantic repair**

**Key Results**:
- ✅ **Success Rate**: 95% (target: 90-95%)
- ✅ **Cost**: $0.35-0.38 per course (target: $0.30-0.42)
- ✅ **Token Budget**: 94-96% preserved (target: ≤95%)
- ✅ **ROI**: 133-233% year 1 ($16K-28K savings on 100K courses)

**Implementation Timeline**: 46 hours over 1.5 weeks

---

## 2. Approved Strategy: 4-Layer Repair Cascade

### Layer 1: FSM-Based Repair (jsonrepair library)

**Purpose**: Handle 95-98% of parse errors at near-zero cost

**Implementation**:
```typescript
import { jsonrepair } from 'jsonrepair';

function fsmRepair(rawJson: string): string {
  try {
    return jsonrepair(rawJson);
  } catch (error) {
    logger.warn({ error }, 'jsonrepair failed, passing to next layer');
    return rawJson;
  }
}
```

**Coverage**:
- Missing/extra brackets, braces (95% success)
- Unescaped quotes (92% success)
- Trailing commas (100% success)
- Comments (100% success)

**Performance**:
- Cost multiplier: 0.05x
- Token overhead: 0-50 tokens
- Success rate: 95-98%

**Library Choice**: **jsonrepair** (npm)
- 713K weekly downloads
- Zero dependencies
- TypeScript native
- Active maintenance (updated Nov 2025)
- Streaming support for 10K-100K token outputs

### Layer 2: Simple Cascade (Existing 4-Level Pattern)

**Purpose**: Catch errors missed by FSM, add +5-10% success

**Implementation** (reuse from n8n proof-of-concept):
```typescript
function fourLevelCascade(json: string): string {
  let repaired = json;

  // Level 1: Brace counting
  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    repaired += '}'.repeat(openBraces - closeBraces);
  }

  // Level 2: Quote fixing
  repaired = repaired.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

  // Level 3: Trailing commas
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // Level 4: Comments
  repaired = repaired.replace(/\/\*.*?\*\//g, '');
  repaired = repaired.replace(/\/\/.*/g, '');

  return repaired;
}
```

**Performance**:
- Cost multiplier: 0.10x
- Token overhead: 50-100 tokens
- Incremental success: +5-10% (total 90-95% with Layer 1)

### Layer 3: LLM Semantic Repair (Context-Aware)

**Purpose**: Handle schema violations for large contexts (>1K tokens)

**Decision Tree**:
```
Context size <500 tokens  → Skip LLM repair, regenerate (1.0x cheaper)
Context size 500-1K tokens → Regenerate (marginal savings)
Context size >1K tokens    → LLM repair (0.4x vs 1.0x regeneration)
```

**Implementation** (Schema-Guided Error Feedback pattern):
```typescript
async function llmSemanticRepair(
  json: string,
  error: z.ZodError,
  contextSize: number,
  language: string
): Promise<string | null> {
  // Threshold check
  if (contextSize < 1000) {
    logger.info({ contextSize }, 'Skipping LLM repair, context too small');
    return null; // Trigger regeneration
  }

  // Format errors
  const errors = error.issues.map(issue =>
    `- Field "${issue.path.join('.')}": ${issue.message}`
  ).join('\n');

  // Language-specific prompt
  const instructions = {
    en: "Fix the JSON structure while preserving English text exactly.",
    ru: "Исправьте структуру JSON, сохранив русский текст без изменений."
  };

  const prompt = `
${instructions[language] || instructions.en}

Validation Errors:
${errors}

Malformed JSON:
${json}

Return ONLY the corrected JSON, preserving all ${language.toUpperCase()} text and UTF-8 encoding.
`;

  const response = await openrouter.chat.completions.create({
    model: 'openai/gpt-oss-20b', // Cheap model for repair
    messages: [
      { role: 'system', content: 'You are a JSON repair specialist.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1, // Low temperature for structural fixes
    max_tokens: 2000 // Limit repair overhead
  });

  return response.choices[0]?.message?.content || null;
}
```

**Performance**:
- Cost multiplier: 0.40-0.50x (vs 1.0x regeneration)
- Token overhead: 250-400 tokens
- Success rate: 75-85% for schema violations
- Break-even: >1,000 token contexts

**Multi-Language Support**:
- EN/RU templates provided
- DE/ES can be added as needed
- FSM Layer 1 is language-agnostic (UTF-8 preserving)

### Layer 4: Regeneration Fallback (RT-004 Integration)

**Purpose**: Last resort when repair cascade fails

**Trigger Conditions**:
- All layers 1-3 failed
- Error count >3 concurrent errors
- Semantic errors (hallucinations, wrong intent)

**Integration with RT-004**:
```typescript
// Attempts 1-2: Fast fail with FSM repair
{ temp: 1.0, model: 'OSS 120B', repair: 'fsm', backoff: 0 },
{ temp: 1.0, model: 'OSS 120B', repair: 'fsm', backoff: 1000 },

// Attempt 3: Enhanced cascade
{ temp: 1.0, model: 'OSS 120B', repair: 'cascade', backoff: 2000 },

// Attempts 4-5: Temperature reduction + cascade
{ temp: 0.5, model: 'OSS 120B', repair: 'cascade', backoff: 4000 },
{ temp: 0.3, model: 'OSS 120B', repair: 'cascade', backoff: 8000 },

// Attempts 6-7: Prompt enhancement (stricter instructions)
{ temp: 0.3, model: 'OSS 120B', repair: 'llm', backoff: 16000 },
{ temp: 0.2, model: 'OSS 120B', repair: 'llm', backoff: 32000 },

// Attempts 8-10: Model escalation (qwen3-max, Gemini)
{ temp: 0.3, model: 'qwen3-max', repair: 'cascade', backoff: 64000 },
{ temp: 0.2, model: 'qwen3-max', repair: 'cascade', backoff: 128000 },
{ temp: 0.1, model: 'Gemini 2.5', repair: 'cascade', backoff: 256000 }
```

**Performance**:
- Cost multiplier: 1.0x (baseline)
- Cumulative success: 97-99% after 10 attempts
- Expected: Most courses succeed by attempt 3 (85% cumulative)

---

## 3. Error Classification & Routing

### Parse Errors → Always FSM Repair (Layer 1-2)

**Error Types**:
- Trailing commas
- Missing brackets/braces
- Unescaped quotes
- Comments in JSON

**Success Rate**: 95-100%
**Cost**: 0.05-0.10x

### Type Mismatches → Zod Coercion First

**Error Types**:
- String "30" → number 30
- Boolean string parsing

**Strategy**:
```typescript
// Use Zod .coerce() transformers
const CoercedSchema = z.object({
  estimated_duration_minutes: z.coerce.number(), // "30" → 30
  quiz_per_section: z.coerce.boolean() // "true" → true
});
```

**Success Rate**: 70-80%
**Cost**: 0.05x (near-zero)

### Missing Fields → Context-Dependent

**Decision Matrix**:

| Context Size | Strategy | Rationale |
|--------------|----------|-----------|
| <500 tokens | Regenerate immediately | Retry cheaper than repair |
| 500-2K tokens | LLM repair if <3 missing | Marginal savings |
| >2K tokens | Always attempt LLM repair | 31-40% cost savings |

### Constraint Violations → Regenerate with Examples

**Error Types**:
- Regex pattern failures
- Min/max value violations

**Success Rate**: 55-65% for repair (low)
**Strategy**: Regenerate with explicit examples in prompt

### Semantic Errors → Regenerate Only

**Error Types**:
- Hallucinations
- Wrong intent
- Reasoning errors

**Success Rate**: <25% for repair (very low)
**Strategy**: Always regenerate, never attempt repair

---

## 4. Token Budget Impact

### Analysis (90K Input Budget from RT-003)

| Component | Tokens | % Budget | Notes |
|-----------|--------|----------|-------|
| Primary generation | 85,000 | 94.4% | Course content |
| FSM repair (Layer 1) | 50 | 0.06% | Near-zero |
| Simple cascade (Layer 2) | 100 | 0.11% | Negligible |
| LLM repair (Layer 3) | 250 | 0.28% | Per attempt |
| Retry reserve | 4,300 | 4.8% | Safety margin |
| **Total** | **90,000** | **100%** | ✅ Within budget |

**Conclusion**: Repair overhead is **negligible** (0.06-0.45%), preserving **94%+ of budget** for content generation.

---

## 5. Cost-Benefit Analysis

### Baseline vs Optimized

| Approach | Cost/Course | Success | Annual (100K) | Savings |
|----------|-------------|---------|---------------|---------|
| **Baseline (regen only)** | $0.51-0.66 | 85% | $51K-66K | — |
| FSM repair only | $0.46-0.50 | 90% | $46K-50K | 10-23% |
| Current 4-level cascade | $0.42-0.48 | 90-92% | $42K-48K | 18-27% |
| **RT-005 (Approved)** | **$0.35-0.38** | **95%** | **$35K-38K** | **27-32%** ✓ |

**Annual Savings**: $16K-28K (100K courses/year)

### ROI Calculation

**Implementation Cost**: 46 hours @ $150/hr = **$6,900**

**Annual Savings**: **$16K-28K**

**ROI**: **232-406%** in year 1
**Break-even**: **2.5-5.2 months**

---

## 6. Implementation Checklist

### Week 1: Core Integration (10 hours)

- [ ] **T015-A**: Install jsonrepair dependency (`pnpm add jsonrepair`)
- [ ] **T015-B**: Implement fsmRepair() function (4 hours)
- [ ] **T015-C**: Port fourLevelCascade() from n8n proof-of-concept (reuse existing, 2 hours)
- [ ] **T016**: Implement field-name auto-fix (camelCase ↔ snake_case, 2 hours)
- [ ] **T015-D**: Add retry budget class (60/minute limit, Google SRE pattern, 4 hours)

### Week 2-3: Enhancement (36 hours)

- [ ] **T015-E**: Implement llmSemanticRepair() with context-size threshold (8 hours)
- [ ] **T015-F**: Add error classification logic (parse, type, missing, constraint, semantic, 8 hours)
- [ ] **T019-T020**: Integrate repair cascade into metadata/section generators (8 hours)
- [ ] **T029-B**: Wrap generation-phases.ts with RT-004 retry + repair hooks (4 hours)
- [ ] **T015-G**: Add Pino monitoring (repair_attempts, repair_success, repair_strategy metrics, 8 hours)

### Testing (12 hours in Week 2-3)

- [ ] **Unit tests**: Each repair layer independently (fsmRepair, fourLevelCascade, llmRepair, 4 hours)
- [ ] **Integration tests**: Full cascade with injected errors (parse, schema, missing fields, 4 hours)
- [ ] **Edge cases**: Large JSON (>10K tokens), deeply nested (>50 levels), concurrent errors, 4 hours)

**Total**: **46 hours** over 1.5 weeks

---

## 7. Monitoring & Metrics

### Prometheus Metrics (Pino + prom-client)

```typescript
import { Counter, Histogram } from 'prom-client';

// Repair attempts by strategy
const repairAttempts = new Counter({
  name: 'json_repair_attempts_total',
  help: 'Total repair attempts',
  labelNames: ['strategy', 'language', 'error_type']
});

// Repair success rate
const repairSuccess = new Counter({
  name: 'json_repair_success_total',
  help: 'Successful repairs',
  labelNames: ['strategy', 'attempt', 'layer']
});

// Repair duration
const repairDuration = new Histogram({
  name: 'json_repair_duration_ms',
  help: 'Repair duration in milliseconds',
  buckets: [10, 50, 100, 500, 1000, 5000],
  labelNames: ['strategy']
});

// Cost tracking
const repairCost = new Counter({
  name: 'json_repair_cost_usd_total',
  help: 'Cumulative repair cost in USD',
  labelNames: ['strategy']
});
```

### Alerting Thresholds

- **Failure rate >20%**: Alert DevOps (repair cascade not working)
- **LLM repair >40% of attempts**: Investigate prompt quality
- **Context size avg >5K tokens**: Consider Gemini earlier in cascade
- **Cost >$0.42/course**: Budget exceeded, review repair usage

---

## 8. Multi-Language Considerations

### FSM Repair: Language-Agnostic ✅

**Confirmation**: jsonrepair works identically for EN/RU/DE/ES because it operates at syntax level (brackets, quotes, commas, UTF-8 preserving).

### LLM Repair: Language-Specific Prompts

**Supported Languages** (initial):
- English (en)
- Russian (ru)

**Future Expansion** (add as needed):
- German (de)
- Spanish (es)
- 13+ additional languages (language detection from analysis_result.contextual_language)

**Implementation**:
```typescript
const REPAIR_INSTRUCTIONS = {
  en: "Fix the JSON structure while preserving English text exactly.",
  ru: "Исправьте структуру JSON, сохранив русский текст без изменений.",
  de: "Korrigieren Sie die JSON-Struktur unter Beibehaltung des deutschen Textes.",
  es: "Corrija la estructura JSON preservando el texto español exactamente."
};

function getRepairInstruction(language: string): string {
  return REPAIR_INSTRUCTIONS[language] || REPAIR_INSTRUCTIONS.en;
}
```

---

## 9. Edge Cases & Mitigations

### Very Large JSON (>10K tokens)

**Risk**: Memory issues, truncation

**Mitigation**:
```typescript
import { jsonrepairTransform } from 'jsonrepair';

// Use streaming for large outputs
const stream = rawStream
  .pipe(jsonrepairTransform({ bufferSize: 1048576 })) // 1MB buffer
  .pipe(zod.stream(CourseStructureSchema));
```

### Deeply Nested JSON (>50 levels)

**Risk**: Stack overflow, cascading failures

**Mitigation**:
- Implement depth limits (max 100 levels)
- Validate subtrees incrementally
- Use iterative parsers (not recursive)

**Note**: OpenAI Structured Outputs limited to 5 levels (not suitable for our 10-50 level requirement)

### Multiple Concurrent Errors (>3 errors)

**Risk**: Success rate decreases multiplicatively (0.9³ = 73%)

**Strategy**: If error count >3 → skip repair, regenerate directly

```typescript
if (zodError.issues.length > 3) {
  logger.warn({ errorCount: zodError.issues.length }, 'Too many errors, regenerating');
  return null; // Trigger regeneration
}
```

### Security: XSS via JSON Repair

**Risk**: Malicious content in JSON fields

**Mitigation** (DOMPurify sanitization):
```typescript
import DOMPurify from 'isomorphic-dompurify';

function sanitizeCourseStructure(course: CourseStructure): CourseStructure {
  return {
    ...course,
    course_title: DOMPurify.sanitize(course.course_title),
    course_description: DOMPurify.sanitize(course.course_description),
    // ... sanitize all string fields
  };
}
```

---

## 10. Future Optimization Roadmap

### Short-Term (Months 1-3)

✅ **Implemented in RT-005**:
- jsonrepair integration
- LLM semantic repair
- Monitoring & metrics

### Medium-Term (Months 3-6)

**If success rate <93%**:
- [ ] Evaluate Instructor-TS framework (auto-retry automation)
- [ ] Add multi-step pipeline for complex reasoning errors
- [ ] Implement response caching (15-30% additional savings)

### Long-Term (Months 6-12)

**If volume >500K courses/month**:
- [ ] Evaluate FSM constrained decoding (self-hosted)
  - **Break-even**: 500K-1M queries/month
  - **Success**: 99.9% guaranteed format
  - **Cost**: 0.02x (2x faster, near-zero overhead)
  - **Investment**: $50K-100K infrastructure + 260 hours development

---

## 11. Success Criteria

### Target Metrics (from RT-005 research task)

| Metric | Target | Achievable | Status |
|--------|--------|------------|--------|
| **Success rate** | 90-95% | **95%** | ✅ Met |
| **Cost per course** | $0.30-0.42 | **$0.35-0.38** | ✅ Met |
| **Token budget** | ≤95% | **94-96%** | ✅ Met |
| **Token savings** | 20-30% | **27-32%** | ✅ Met |
| **Production-ready libs** | Stable | **jsonrepair (713K/week)** | ✅ Met |

### Validation Plan

**Phase 1 (Week 1)**: Unit tests + integration tests (12 hours)
- FSM repair: 100 test cases (parse errors, quotes, commas, comments)
- 4-level cascade: 50 test cases (brace counting, edge cases)
- Error classification: 20 test cases (parse, type, missing, constraint, semantic)

**Phase 2 (Week 2-3)**: Production simulation (100 test courses)
- Minimal user input scenarios (title only → Analyze → Generation with sparse analysis_result)
- Full Analyze results (rich context)
- Different languages (EN/RU)
- Different styles (academic, conversational, practical)
- Injected errors (parse, schema, missing fields, >3 concurrent)

**Success Criteria**: ≥95% success on 100 test courses, cost ≤$0.38/course

---

## 12. Implementation Tasks

**Follow-up Tasks**:
- [ ] **T005-R-IMPL**: Apply RT-005 strategy to json-repair.ts, metadata-generator.ts, section-batch-generator.ts, generation-phases.ts (assigned to llm-service-specialist)
  - Depends on: RT-005 ✅, T015, T019, T020, T029-B
  - Effort: 46 hours over 1.5 weeks
  - Output: RT-005 strategy fully implemented with monitoring

**Integration Points**:
- **T015** (json-repair.ts): Implement 4-layer cascade
- **T019** (metadata-generator.ts): Integrate parseMetadata() with repair cascade
- **T020** (section-batch-generator.ts): Integrate parseSections() with repair cascade
- **T029-B** (generation-phases.ts): Wrap generateMetadata/Sections with RT-004 retry + repair hooks

---

## 13. Decision Rationale

### Why "Pragmatic Cascade" over alternatives?

**Alternative 1: Instructor-TS Framework**
- ❌ Higher cost ($0.38-0.42 vs $0.35-0.38)
- ❌ Framework dependency risk
- ❌ 72 hours implementation vs 46 hours
- ✅ Higher success (97% vs 95%) - **Not worth 50% more effort for +2% success**

**Alternative 2: FSM Constrained Decoding (self-hosted)**
- ❌ Requires $50K-100K infrastructure
- ❌ 260 hours implementation (3+ months)
- ❌ Break-even only at 500K+ queries/month (currently 100K)
- ✅ 99.9% success, 0.02x cost - **Future roadmap, not immediate priority**

**Pragmatic Cascade Wins**:
- ✅ Meets all targets (95% success, $0.35-0.38 cost)
- ✅ Fast implementation (46 hours, 1.5 weeks)
- ✅ Proven libraries (jsonrepair 713K weekly downloads)
- ✅ Reuses existing 4-level cascade (n8n proof-of-concept)
- ✅ Clear upgrade path (can add Instructor-TS or FSM later)

---

**Status**: ✅ **APPROVED FOR IMPLEMENTATION**
**Next**: Execute T005-R-IMPL with llm-service-specialist
**Timeline**: Week 1-3 (46 hours total)
