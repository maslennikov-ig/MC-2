# RT-001: Multi-Model Orchestration Strategy - FINAL DECISION

**Research Task**: RT-001 qwen3-max Invocation Strategy
**Decision Date**: 2025-11-07
**Status**: ✅ APPROVED - Ready for Implementation
**Strategy**: **Balanced Production** (Комбинация #1)

---

## Executive Summary

**ФИНАЛЬНОЕ РЕШЕНИЕ**: Hybrid metadata generation (critical fields → qwen3-max, non-critical → OSS 120B) + OSS 120B primary для sections + Standard thresholds (0.75)

**Target Cost**: $0.33-0.39 per course ✅ **WITHIN TARGET RANGE ($0.20-0.40)**
**Target Quality**: 85-90% semantic similarity ✅ **EXCEEDS MINIMUM (0.75)**
**Escalation Rate**: 20-25% (sustainable, production-proven)

**Consensus**: All 3 research reports (90KB total) converge on this strategy as optimal cost-quality balance for production deployment.

---

## Research Context

**Sources Analyzed**:
1. Report 1: "Multi-Model Orchestration Strategy for CourseAI Stage 5 Generation" (~28KB) - Deep dive into phase-level routing
2. Report 2: "Multi-Model Orchestration Strategy for Stage 5 Gen" (~19KB) - Industry case studies (Jasper AI, Notion AI, Copy.ai)
3. Report 3: "Multi-Model Orchestration Strategy for Educational Course Generation Decision Framework 2" (~43KB) - Cost-benefit analysis, thresholds, production roadmap

**Key Finding** (Research Consensus):
> "60-70% of final content quality is determined by metadata quality" (Phase 2)

**Implication**: Investment in Phase 2 metadata (qwen3-max for critical fields) enables cheaper models (OSS 120B) to succeed in Phase 3 (section generation).

---

## Model Routing Strategy: Phase-by-Phase

### Phase 1: Input Validation

**Model**: OSS 20B (always)
**Cost**: $0.001-0.002 per course
**Rationale**: Schema validation = deterministic task, no reasoning needed

**Implementation**:
```typescript
function validateInput(input: GenerationJobInput) {
  // Use cheapest model for schema validation
  const model = "oss_20b";
  const isValid = GenerationJobInputSchema.safeParse(input);

  if (!isValid.success) {
    throw new ValidationError("Invalid input schema");
    // NO ESCALATION - reject malformed inputs immediately
  }

  return isValid.data;
}
```

**Escalation**: NEVER (reject input if validation fails)

---

### Phase 2: Metadata Generation (HYBRID APPROACH)

**Strategy**: Critical fields → qwen3-max ALWAYS, Non-critical fields → OSS 120B with conditional escalation

**Cost**: $0.126-0.144 per course (saves 25-40% vs always qwen3-max)
**Quality Target**: ≥0.85 completeness, ≥0.90 coherence, ≥0.85 alignment

#### Critical Fields (ALWAYS qwen3-max) 💎

**Fields**:
- `learning_outcomes` (impact: 90-100% on quality)
- `learning_objectives` (impact: 90-100%)
- `pedagogical_strategy` (impact: 70-90%)
- `course_structure` (impact: 60-80%)
- `domain_taxonomy` (impact: 50-70%)

**Token Allocation**: 40% of metadata tokens
**Cost**: $0.072 per course

**Rationale**: These fields determine 60-70% of downstream quality. Errors here propagate with 15-100x cost. Research consensus: NEVER compromise on critical metadata.

**Implementation**:
```typescript
const CRITICAL_METADATA_FIELDS = [
  "learning_outcomes",
  "learning_objectives",
  "pedagogical_strategy",
  "course_structure",
  "domain_taxonomy"
];

async function generateCriticalMetadata(input: GenerationJobInput) {
  const model = "qwen3-max"; // ALWAYS, no conditions
  const maxRetries = 2;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const metadata = await llm.generate(model, buildCriticalMetadataPrompt(input));
    const quality = validateMetadataQuality(metadata);

    // Quality gates
    if (quality.completeness >= 0.85 &&
        quality.coherence >= 0.90 &&
        quality.alignment >= 0.85) {
      return metadata;
    }

    if (attempt === maxRetries) {
      // After 2 attempts, flag for human review
      logger.warn("Critical metadata quality below threshold after 2 attempts", { quality });
      flagForHumanReview(metadata, "critical_metadata_quality_low");
      return metadata; // Proceed with flag
    }
  }
}
```

#### Non-Critical Fields (OSS 120B → escalate if needed) 📋

**Fields**:
- `target_audience_details` (impact: 20-30%)
- `time_estimates` (impact: 10-20%)
- `prerequisite_descriptions` (impact: 20-30%)
- `style_guidelines` (impact: 10-15%)
- `resource_references` (impact: 5-10%)

**Token Allocation**: 60% of metadata tokens
**Cost**: $0.036 (baseline) + $0.018 (30% escalation rate) = $0.054 per course

**Implementation**:
```typescript
const NON_CRITICAL_METADATA_FIELDS = [
  "target_audience_details",
  "time_estimates",
  "prerequisite_descriptions",
  "style_guidelines",
  "resource_references"
];

async function generateNonCriticalMetadata(input: GenerationJobInput) {
  const model = "oss_120b"; // Try cheaper model first
  const metadata = await llm.generate(model, buildNonCriticalMetadataPrompt(input));
  const quality = validateMetadataQuality(metadata);

  // Escalation trigger: quality < 0.85
  if (quality.completeness < 0.85 || quality.coherence < 0.80) {
    logger.info("Non-critical metadata quality low, escalating to qwen3-max", { quality });
    return await llm.generate("qwen3-max", buildNonCriticalMetadataPrompt(input));
  }

  return metadata;
}
```

**Escalation Rate**: 30% (expected, based on research)

---

### Phase 3: Section Generation (TIERED ROUTING)

**Strategy**: 3-tier routing with OSS 120B as primary (70-75%), qwen3-max for complex/escalated (20-25%), Gemini for overflow (5%)

**Cost**: $0.206-0.244 per course (70-80% of total generation cost)
**Quality Target**: ≥0.75 semantic similarity (per section)

#### Tier 1: OSS 120B Primary (70-75% of sections) 🥇

**Use Cases**:
- Standard sections with Analyze scaffolding
- Structured content (lessons, exercises)
- Sections with clear templates from analysis_result
- Medium complexity (complexity score < 0.75)

**Implementation**:
```typescript
async function generateSection(
  sectionSpec: SectionSpec,
  learningOutcomes: string[],
  metadata: CourseMetadata
) {
  // Pre-routing: check complexity
  const complexity = calculateComplexityScore(sectionSpec);
  const criticality = assessCriticality(sectionSpec, learningOutcomes);

  // Default to OSS 120B (70-75% of sections)
  let model: ModelName = "oss_120b";

  // Pre-identified complex sections → qwen3-max
  if (complexity >= 0.75 || criticality >= 0.80) {
    model = "qwen3-max";
    logger.info("Pre-routing to qwen3-max", { complexity, criticality });
  }

  // Context overflow → Gemini
  if (estimateContextLength(sectionSpec) > 120000) {
    model = "gemini_2_5_flash";
    logger.info("Pre-routing to Gemini for overflow", { contextLength });
  }

  // Generate
  const section = await llm.generate(model, buildSectionPrompt(sectionSpec, metadata));

  // Quality validation
  const similarity = await computeSemanticSimilarity(
    section.content,
    learningOutcomes,
    embeddingModel: "sentence-transformers/all-mpnet-base-v2"
  );

  // Reactive escalation (if OSS 120B fails)
  if (similarity < 0.75 && model === "oss_120b") {
    logger.info("Section quality low, escalating to qwen3-max", {
      similarity,
      threshold: 0.75
    });

    const retriedSection = await llm.generate("qwen3-max", buildSectionPrompt(sectionSpec, metadata));
    const retriedSimilarity = await computeSemanticSimilarity(
      retriedSection.content,
      learningOutcomes
    );

    if (retriedSimilarity >= 0.75) {
      return retriedSection;
    } else {
      // Even qwen3-max failed
      logger.warn("Section quality low even after qwen3-max escalation", { retriedSimilarity });
      flagForHumanReview(retriedSection, "section_quality_low_after_escalation");
      return retriedSection;
    }
  }

  return section;
}
```

**Quality Gates**:
- Semantic similarity ≥ 0.75 (validated threshold from research)
- Composite quality score ≥ 3.5/5.0
- Schema validation passes

**Escalation Trigger**: Similarity < 0.75 after generation

#### Tier 2: qwen3-max (20-25% of sections) 💎

**Use Cases**:
- Pre-identified complex sections (complexity ≥ 0.75)
- High criticality sections (foundational concepts)
- Escalation from Tier 1 (quality < 0.75)
- Abstract reasoning required
- Domain-specific technical content

**Quality Target**: ≥0.80 semantic similarity (higher bar for expensive model)

**Cost**: $0.120-0.150 per course (20-25% of sections)

#### Tier 3: Gemini 2.5 Flash (5% overflow cases) 🌐

**Use Cases**:
- Context length > 120K tokens (per-batch limit)
- Cross-section synthesis requiring broad context
- Token overflow edge cases

**Cost**: $0.002-0.004 per course (rare, 5% of sections)

**Rationale**: Gemini's 1M context window handles overflow at competitive pricing ($0.15/1M tokens)

---

### Phase 4: Quality Validation

**Model**: OSS 20B (95% of validation), OSS 120B (5% sample for calibration)
**Cost**: $0.001-0.002 per course
**Validation Type**: Semantic similarity + LLM-as-judge

**Implementation**:
```typescript
async function validateQuality(
  sections: Section[],
  learningOutcomes: string[]
): Promise<QualityValidationResult> {
  const results: ValidationResult[] = [];

  for (const section of sections) {
    // Tier 1: Fast embedding-based check (95% of sections)
    const similarity = await computeSemanticSimilarity(
      section.content,
      learningOutcomes,
      embeddingModel: "sentence-transformers/all-mpnet-base-v2"
    );

    if (similarity >= 0.80) {
      // High confidence pass
      results.push({
        sectionId: section.id,
        status: "PASS",
        similarity,
        method: "embedding"
      });
      continue;
    }

    if (similarity >= 0.70 && similarity < 0.80) {
      // Borderline: use LLM-as-judge (OSS 20B)
      const judgeResult = await llmAsJudge({
        model: "oss_20b",
        sectionContent: section.content,
        learningObjectives: learningOutcomes,
        criteria: ["pedagogical_alignment", "factual_accuracy", "concept_clarity"]
      });

      results.push({
        sectionId: section.id,
        status: judgeResult.score >= 0.75 ? "PASS_WITH_FLAG" : "REVIEW_REQUIRED",
        similarity,
        judgeScore: judgeResult.score,
        method: "llm_judge_oss20b"
      });
      continue;
    }

    // similarity < 0.70: Automatic fail
    results.push({
      sectionId: section.id,
      status: "FAIL",
      similarity,
      method: "embedding",
      reason: "Low semantic similarity to learning outcomes"
    });
  }

  // Calculate overall quality score
  const passRate = results.filter(r =>
    r.status === "PASS" || r.status === "PASS_WITH_FLAG"
  ).length / results.length;

  return {
    overallQualityScore: passRate,
    sectionResults: results,
    requiresRevision: passRate < 0.85,
    flaggedSections: results.filter(r =>
      r.status.includes("FLAG") || r.status === "FAIL"
    )
  };
}
```

**Validation Criteria**:
- Semantic similarity (embedding-based, fast)
- Pedagogical alignment (LLM-as-judge for borderline cases)
- Factual accuracy (spot checks)
- Schema compliance

**Escalation**: OSS 120B for 5% sample (quality control calibration)

---

### Phase 5: Minimum Lessons Validation

**Model**: OSS 20B (always)
**Cost**: $0.001 per course
**Check**: ≥10 lessons total (FR-015)

**Implementation**:
```typescript
function validateMinimumLessons(course: CourseStructure): ValidationResult {
  const model = "oss_20b"; // Simple counting, cheapest model
  const lessonCount = countLessons(course);

  if (lessonCount < 10) {
    throw new ValidationError(`Insufficient lessons: ${lessonCount}/10 required`);
  }

  return { status: "PASS", lessonCount };
}
```

**Escalation**: NEVER (simple count validation)

---

## Escalation Decision Tree

```
┌─────────────────────────────────────────────────────────┐
│          COURSE GENERATION MODEL ROUTING                │
│              (RT-001 Final Strategy)                    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  Phase 1: Validation    │
              │  Model: OSS 20B         │
              │  Cost: $0.001-0.002     │
              │  Gate: Schema valid?    │
              └───────────┬─────────────┘
                          │ ✓ Valid
                          ▼
              ┌─────────────────────────────┐
              │  Phase 2: Metadata          │
              │  Critical Fields?           │
              └──────┬──────────────┬───────┘
                 YES │              │ NO
                     ▼              ▼
         ┌──────────────────┐  ┌──────────────────┐
         │ qwen3-max        │  │ OSS 120B         │
         │ (ALWAYS)         │  │ (try first)      │
         │ Cost: $0.072     │  │ Cost: $0.036     │
         │ Quality ≥0.85?   │  │ Quality ≥0.85?   │
         └──────┬───────────┘  └────────┬─────────┘
                │ ✓ YES              │ ✓ YES │ ✗ NO
                │                    │       ↓
                │                    │   ┌────────────┐
                │                    │   │ qwen3-max  │
                │                    │   │ escalation │
                │                    │   └─────┬──────┘
                │                    │         │ +$0.018
                └──────────┬─────────┴─────────┘
                           │ Metadata Complete
                           ▼
              ┌─────────────────────────────┐
              │  Phase 3: Section Generation│
              │  Complexity Check           │
              └─────┬──────────────┬────────┘
                    │              │
          ┌─────────┴──────┐      └────────────┐
          ▼                ▼                    ▼
    ┌──────────┐    ┌──────────────┐    ┌─────────────┐
    │ Tier 1   │    │ Tier 2       │    │ Tier 3      │
    │ OSS 120B │    │ qwen3-max    │    │ Gemini 2.5F │
    │ 70-75%   │    │ 20-25%       │    │ 5%          │
    │ $0.090   │    │ $0.150       │    │ $0.004      │
    └─────┬────┘    └──────┬───────┘    └──────┬──────┘
          │                │                    │
          │ Similarity     │                    │
          │ < 0.75         │                    │
          ├────────────────►                    │
          │                │                    │
          └────────────────┴────────────────────┘
                           │
                           ▼
              ┌─────────────────────────────┐
              │  Phase 4: Quality Validation│
              │  Model: OSS 20B (95%)       │
              │  Cost: $0.001               │
              │  Gate: Similarity ≥0.75?    │
              └──────────┬──────────────────┘
                         │ ✓ Pass
                         ▼
              ┌─────────────────────────────┐
              │  Phase 5: Final Check       │
              │  Model: OSS 20B             │
              │  Cost: $0.001               │
              │  Gate: ≥10 lessons?         │
              └──────────┬──────────────────┘
                         │ ✓ Pass
                         ▼
                    ┌─────────┐
                    │ APPROVE │
                    │ Course  │
                    └─────────┘

TOTAL COST: $0.335-0.394 per course ✅
TOTAL QUALITY: 85-90% similarity ✅
```

---

## Quality Thresholds (Standard - Validated)

**Semantic Similarity Thresholds**:
- **≥0.80**: PASS (high confidence, accept immediately)
- **0.75-0.79**: PASS_WITH_FLAG (acceptable, log for review)
- **0.70-0.74**: RETRY (marginal, retry once with enhanced prompt)
- **0.65-0.69**: ESCALATE (weak, escalate to next tier model)
- **<0.65**: FAIL (reject, flag for human review)

**Rationale**: All 3 research reports converge on 0.75 as validated threshold. Industry standard across production systems (Jasper AI, Notion AI, Copy.ai).

**Composite Quality Score** (5-point scale):
- **≥4.0**: Excellent (target for Tier 2/qwen3-max)
- **3.5-3.9**: Good (acceptable for Tier 1/OSS 120B)
- **3.0-3.4**: Marginal (retry once with enhanced prompt)
- **<3.0**: Poor (immediate escalation to next tier)

**Metadata Quality Gates** (Phase 2):
- Completeness: ≥0.85 (critical fields), ≥0.75 (non-critical)
- Coherence: ≥0.90 (critical fields), ≥0.80 (non-critical)
- Alignment: ≥0.85 (critical fields), ≥0.75 (non-critical)

---

## Cost Breakdown & ROI Analysis

### Per-Course Cost Breakdown

| Phase | Model(s) | Token % | Cost per Course | % of Total |
|-------|----------|---------|-----------------|------------|
| **Phase 1: Validation** | OSS 20B | 5% (750 tokens) | $0.001 | 0.3% |
| **Phase 2: Metadata (Critical)** | qwen3-max | 4% (600 tokens) | $0.072 | 19.5% |
| **Phase 2: Metadata (Non-Critical)** | OSS 120B → qwen3-max | 6% (900 tokens) | $0.054 | 14.6% |
| **Phase 3: Sections (Tier 1)** | OSS 120B | 60% (9,000 tokens) | $0.090 | 24.4% |
| **Phase 3: Sections (Tier 2)** | qwen3-max | 20% (3,000 tokens) | $0.150 | 40.7% |
| **Phase 3: Overflow** | Gemini 2.5 Flash | 5% (750 tokens) | $0.004 | 1.1% |
| **Phase 4: Validation** | OSS 20B | 2% (300 tokens) | $0.001 | 0.3% |
| **Phase 5: Final Check** | OSS 20B | 1% (150 tokens) | $0.001 | 0.3% |
| **TOTAL** | Mixed | **~15,000 tokens** | **$0.373** | **100%** |

**Cost Range**: $0.335-0.394 per course (depending on escalation rate)

**Budget Compliance**: ✅ WITHIN TARGET ($0.20-0.40)

---

### ROI Justification: Why This Strategy?

#### Investment #1: Phase 2 Critical Fields (qwen3-max) = $0.072

**Return**:
- Critical fields determine 60-70% of final quality (research consensus)
- Errors in learning_outcomes/pedagogical_strategy propagate with **15-100x cost** downstream
- qwen3-max accuracy: 95% vs OSS 20B: 75% (20% improvement)
- Value: (0.95 - 0.75) × $100 (course value) × 0.50 (error impact) = **$10.00**
- ROI: $10.00 / $0.072 = **139:1**

**Verdict**: ✅ STRONGLY JUSTIFIED

#### Investment #2: Phase 3 OSS 120B Primary (vs OSS 20B) = +$0.090

**Return**:
- Reduces escalation rate from 30-35% to 20-25% (saves retry costs)
- OSS 120B with quality metadata achieves 80-85% similarity (vs 70-75% with OSS 20B)
- Latency improvement: 1 retry vs 2-3 retries (faster time-to-completion)
- Value: Improved quality + reduced retries + faster generation
- ROI: **Positive** (proven by Report 2-3 production systems)

**Verdict**: ✅ JUSTIFIED

#### Comparison vs Alternatives:

| Strategy | Cost | Quality | ROI | Production-Ready? |
|----------|------|---------|-----|-------------------|
| **This Strategy (Balanced)** | $0.37 | 85-90% | **Optimal** | ✅ YES |
| Always qwen3-max (Quality-First) | $0.45 | 92-95% | Good (overkill) | ✅ YES (expensive) |
| OSS 20B Primary (Cost-Aggressive) | $0.25 | 75-80% | Poor (high retry cost) | ⚠️ Risky |
| OSS 120B First (MVP) | $0.28 | 80-85% | Medium (high escalation) | ⚠️ MVP only |

---

## Implementation Checklist

### 1. Phase 2 Metadata Generation (T019)

**File**: `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`

**Tasks**:
- [ ] Define `CRITICAL_METADATA_FIELDS` constant (5 fields)
- [ ] Define `NON_CRITICAL_METADATA_FIELDS` constant (5 fields)
- [ ] Implement `generateCriticalMetadata()`: always qwen3-max, max 2 retries
- [ ] Implement `generateNonCriticalMetadata()`: OSS 120B first, escalate if quality < 0.85
- [ ] Implement quality validation: completeness, coherence, alignment checks
- [ ] Add logging: model selection rationale, quality scores, escalation triggers
- [ ] Add cost tracking: token usage per field, model used per field

**Quality Gates**:
- Critical fields: completeness ≥0.85, coherence ≥0.90, alignment ≥0.85
- Non-critical fields: completeness ≥0.75, coherence ≥0.80

**Reference**: RT-001 Phase 2 section above

---

### 2. Phase 3 Section Generation (T020)

**File**: `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`

**Tasks**:
- [ ] Implement `calculateComplexityScore()`: assess section complexity (0-1 scale)
- [ ] Implement `assessCriticality()`: assess section importance to learning outcomes
- [ ] Implement pre-routing logic:
  - Default: OSS 120B (70-75% of sections)
  - Complexity ≥0.75 OR criticality ≥0.80 → qwen3-max
  - Context length >120K → Gemini 2.5 Flash
- [ ] Implement reactive escalation:
  - If similarity <0.75 after OSS 120B → retry with qwen3-max
- [ ] Add semantic similarity computation (sentence-transformers/all-mpnet-base-v2)
- [ ] Add quality gate validation: similarity ≥0.75 threshold
- [ ] Add logging: complexity scores, model routing decisions, escalation triggers
- [ ] Add cost tracking: token usage per section, model used per section

**Escalation Logic**:
```typescript
if (similarity < 0.75 && currentModel === "oss_120b") {
  escalate to "qwen3-max"
}
```

**Reference**: RT-001 Phase 3 section above

---

### 3. Phase 4 Quality Validation (T021)

**File**: `packages/course-gen-platform/src/services/stage5/quality-validator.ts`

**Tasks**:
- [ ] Implement embedding-based validation (sentence-transformers, 95% of checks)
- [ ] Implement LLM-as-judge (OSS 20B) for borderline cases (similarity 0.70-0.79)
- [ ] Add threshold checks: ≥0.80 pass, 0.70-0.79 borderline, <0.70 fail
- [ ] Add overall quality score calculation (pass rate)
- [ ] Add flagged sections collection (fail + pass_with_flag)
- [ ] Add logging: validation method, similarity scores, judge scores

**Reference**: RT-001 Phase 4 section above

---

### 4. Update Generation Orchestrator (T029-B)

**File**: `packages/course-gen-platform/src/services/stage5/generation-phases.ts`

**Tasks**:
- [ ] Update `generateMetadata()` phase: call metadata-generator with hybrid logic
- [ ] Update `generateSections()` phase: call section-batch-generator with tiered routing
- [ ] Update `validateQuality()` phase: call quality-validator with threshold checks
- [ ] Add state tracking: modelUsed per phase, escalation counts, quality scores
- [ ] Add cost accumulation: track cost per phase, total cost per course
- [ ] Add comprehensive logging: model routing decisions, quality gates, escalations

**Reference**: RT-001 all phases + Decision Tree

---

### 5. Implementation Task (T001-R-IMPL)

**Prerequisites**: T019, T020, T021, T029-B complete

**Tasks**:
- [ ] Integration testing: run 10 test courses through pipeline
- [ ] Validate cost: measure actual cost per course, compare to target ($0.33-0.39)
- [ ] Validate quality: measure semantic similarity, compare to target (≥0.75)
- [ ] Measure escalation rate: should be 20-25%
- [ ] Performance testing: measure latency per phase
- [ ] Edge case testing: minimal Analyze output (from title-only user input), overflow (>120K), validation failures
- [ ] Documentation: update API docs with model routing strategy
- [ ] Monitoring setup: cost tracking, quality metrics, escalation rate dashboard

**Success Criteria**:
- ✅ Cost per course: $0.30-0.40
- ✅ Quality: ≥0.75 semantic similarity (avg ≥0.85)
- ✅ Escalation rate: 20-30%
- ✅ Latency: <120s per course

---

## Monitoring & Alerts

### Key Metrics to Track

**Cost Metrics**:
- Total cost per course (target: $0.33-0.39, alert if >$0.45)
- Cost by phase breakdown (Phase 2: ~34%, Phase 3: ~65%)
- Cost by model (qwen3-max: ~60%, OSS 120B: ~35%, OSS 20B: ~1%)
- Escalation rate (target: 20-25%, alert if >35%)

**Quality Metrics**:
- Semantic similarity per section (target: ≥0.75, avg: 0.85-0.90)
- Overall quality score (target: ≥0.85 pass rate)
- Metadata quality (critical fields: ≥0.85, non-critical: ≥0.75)
- Validation pass rate (target: ≥95%)

**Operational Metrics**:
- Escalation rate by phase (Phase 2: ~30%, Phase 3: ~20-25%)
- Retry rate (target: <20%)
- Human review rate (target: <3%)
- Latency per phase (Phase 2: <10s, Phase 3: <120s)

### Alert Thresholds

**CRITICAL Alerts** (immediate action):
- Cost per course >$0.50 (exceeds target by 25%)
- Overall quality score <0.70 (below minimum)
- Escalation rate >50% (system degradation)

**WARNING Alerts** (investigate):
- Cost per course >$0.45 (approaching limit)
- Quality score 0.70-0.75 (borderline)
- Escalation rate 35-50% (higher than expected)
- Human review rate >5%

---

## Future Optimization Paths

### Short-Term (Month 2-3)

1. **Prompt Caching**: Cache pedagogical frameworks, course structure templates
   - Expected savings: 20-30% on input tokens
   - Implementation: OpenRouter native caching

2. **Complexity Scoring Refinement**: Train classifier on production data
   - Improve pre-routing accuracy (reduce unnecessary escalations)
   - Target: 5-10% escalation rate reduction

3. **Batch Processing**: Generate multiple sections in parallel
   - Optimize throughput (maintain quality)
   - Reduce per-course latency by 20-30%

### Medium-Term (Month 4-6)

1. **Fine-Tuning OSS 120B**: Collect 1,000+ high-quality courses
   - Fine-tune on institutional patterns
   - Expected: 50-70% cost reduction for Phase 3
   - Payback period: 2-3 months at scale

2. **Threshold Optimization**: A/B test different thresholds
   - Optimize escalation rate (minimize retries)
   - Target: $0.28-0.35 per course

3. **Semantic Caching**: Cache similar course patterns
   - Expected: 35% cost reduction on cache hits
   - Implementation: Vector similarity search for prompts

### Long-Term (Month 6+)

1. **Domain-Specific Models**: Explore education-focused models
   - Potentially better performance at lower cost
   - Evaluate new model releases (Mistral education variants)

2. **Mixture of Experts (MoE)**: Different models for different content types
   - Code examples: Code-focused model
   - Math content: Math-specialized model
   - General content: Balanced general model

---

## Research References

**Full Research Reports** (moved to `research-decisions/` for future reference):
1. `rt-001-research-report-1-courseai.md` (28KB) - Phase-level routing deep dive
2. `rt-001-research-report-2-stage5gen.md` (19KB) - Industry case studies
3. `rt-001-research-report-3-decision-framework.md` (43KB) - Cost-benefit analysis

**Cross-Validation Analysis**:
- **Strong Consensus** (all 3 reports agree):
  - Phase 2 = critical investment point (qwen3-max for metadata)
  - Phase 3 = OSS 120B primary with tiered routing
  - Phase 4 = OSS 20B + embeddings for validation
  - Threshold = 0.75 semantic similarity (validated)

- **Divergent Findings** (resolved):
  - Primary model for Phase 3: Report 1 favored OSS 20B, Reports 2-3 favored OSS 120B
  - **Resolution**: OSS 120B chosen (aligns with RT-002 strong Analyze scaffolding)
  - Metadata strategy: Report 1-2 favored always qwen3-max, Report 3 favored hybrid
  - **Resolution**: Hybrid chosen (25-40% cost savings, protects critical fields)

**Production Validation**:
- Jasper AI: Multi-model routing with task-category specialization
- Notion AI: Fine-tuned models for high-volume tasks (50% latency reduction)
- Copy.ai: Three-tier routing (GPT-4o strategic, GPT-3.5 volume, Claude Opus quality)
- RouteLLM (Berkeley/Anyscale): 85% cost reduction, 95% GPT-4 quality maintained

---

## Conclusion

**APPROVED STRATEGY**: Balanced Production (Комбинация #1)

**Key Success Factors**:
1. ✅ Phase 2 hybrid approach protects critical metadata (60-70% quality impact)
2. ✅ OSS 120B primary for Phase 3 leverages strong Analyze scaffolding (RT-002)
3. ✅ 0.75 threshold validated across all research reports
4. ✅ Cost $0.33-0.39 WITHIN target range ($0.20-0.40)
5. ✅ Quality 85-90% EXCEEDS minimum (0.75)
6. ✅ Production-proven patterns from industry leaders

**Next Steps**:
1. Implement Phase 2 metadata generation (T019) with hybrid routing
2. Implement Phase 3 section generation (T020) with tiered routing
3. Implement Phase 4 quality validation (T021) with threshold checks
4. Update generation orchestrator (T029-B) with state tracking
5. Execute RT-001 implementation task (T001-R-IMPL) with integration testing

**Status**: ✅ READY FOR IMPLEMENTATION

---

**Document Version**: 1.0
**Last Updated**: 2025-11-07
**Owner**: CourseAI Generation Team
**Related**: RT-002 (Architecture), RT-003 (Token Budget), RT-004 (Quality Gates)
