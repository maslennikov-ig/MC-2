# RT-004: Quality Validation & Retry Logic Strategy - FINAL DECISION

**Research Task**: RT-004 Quality Validation Best Practices & Retry Logic
**Decision Date**: 2025-11-07
**Status**: ✅ APPROVED - Ready for Implementation
**Strategy**: **10-Attempt Tiered Retry with Phase-Specific Thresholds**

---

## Executive Summary

**ФИНАЛЬНОЕ РЕШЕНИЕ**: 10-attempt retry strategy with exponential escalation + phase-specific thresholds (0.70-0.90) + intelligent failure handling

**Key Validation**: RT-001 threshold (0.75) ✅ **CONFIRMED** by industry research as standard for content generation

**Target Metrics**:
- Quality: 90-95% semantic similarity (avg 0.85)
- Success Rate: 90%+ after retries
- Retry Cost Overhead: ≤30% of baseline
- Manual Review Rate: 5-10%

**Research Source**: 40KB comprehensive report analyzing production systems (LangChain, OpenAI, Instructor, Guardrails AI, industry case studies)

---

## Quality Thresholds: Phase-Specific Strategy

### RT-001 Integration ✅

**RT-004 validates RT-001 decisions**:
- 0.75 semantic similarity = **industry standard** ✅
- Phase-specific thresholds = **production best practice** ✅
- Language adjustments = **validated by Jina-v3 MTEB scores** ✅

### Phase-Specific Thresholds (Final)

| Phase | Semantic Similarity | Rationale | RT-001 Alignment |
|-------|-------------------|-----------|------------------|
| **Phase 2: Metadata Generation** | 0.80-0.90 | Highest precision; errors propagate downstream | ✅ Matches RT-001 |
| **Phase 3: Section Generation** | 0.75-0.85 | Balanced quality for structural elements | ✅ Matches RT-001 |
| **Phase 3: Lesson Content** | 0.70-0.80 | Allow creative variation while maintaining alignment | ✅ Extension of RT-001 |
| **Phase 4: Quality Validation** | 0.75+ | Final gate, standard threshold | ✅ Matches RT-001 |

**Granular Thresholds** (within Phase 3):

| Content Type | Threshold | Justification |
|-------------|-----------|---------------|
| Critical metadata fields | 0.85-0.90 | learning_outcomes, pedagogical_strategy (RT-001) |
| Non-critical metadata | 0.75-0.80 | time_estimates, prerequisites (RT-001) |
| Section structure | 0.75-0.85 | Standard quality (RT-001 primary) |
| Lesson objectives | 0.75-0.80 | Pedagogical alignment required |
| Lesson content | 0.70-0.75 | Creative variation allowed |
| Exercise descriptions | 0.70-0.75 | Task clarity > strict alignment |

### Language-Specific Adjustments

**Jina-v3 MTEB Scores** (multilingual model, no switching required):
- English: 85.80% STS → Standard thresholds (0.75-0.85)
- German: 78.97% STS → Standard thresholds (0.75-0.85)
- Spanish: 80.09% STS → Standard thresholds (0.75-0.85)
- **Russian: 81.5% STS → -5% adjustment (0.70-0.80)**

**Implementation**:
```typescript
function getThresholdForLanguage(
  language: string,
  phase: "metadata" | "sections" | "content"
): number {
  const baseThresholds = {
    metadata: 0.85,
    sections: 0.75,
    content: 0.70
  };

  const languageAdjustment = {
    en: 0.00,
    de: 0.00,
    es: 0.00,
    ru: -0.05  // Medium-resource language
  };

  return baseThresholds[phase] + (languageAdjustment[language] || 0.00);
}
```

---

## Retry Strategy: 10-Attempt Tiered Escalation

### Research Insight

**Background batch processing enables aggressive retry strategies**:
- Real-time systems: 2-3 retries (latency critical)
- Batch systems: 5-10 retries (cost-optimized, 10-30 min acceptable wait)
- **Our context**: Background course generation → **10 retries optimal**

### Escalation Sequence

```
┌─────────────────────────────────────────────────────────┐
│          10-ATTEMPT RETRY STRATEGY                      │
│       (Optimized for Batch Processing)                  │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  Attempt 1-3            │
              │  NETWORK RETRY          │
              │  ─────────────          │
              │  Model: Same            │
              │  Temp: 1.0 (unchanged)  │
              │  Wait: 2^N + jitter     │
              │  Resolves: 70-80%       │
              │  Cost: 1.0x             │
              └───────────┬─────────────┘
                          │ Still failing?
                          ▼
              ┌─────────────────────────┐
              │  Attempt 4-5            │
              │  TEMPERATURE REDUCTION  │
              │  ──────────────────────│
              │  Model: Same            │
              │  Temp: 1.0→0.7→0.3      │
              │  Wait: 2^N + jitter     │
              │  Resolves: Format/quality│
              │  Cost: 1.0x             │
              └───────────┬─────────────┘
                          │ Still failing?
                          ▼
              ┌─────────────────────────┐
              │  Attempt 6-7            │
              │  PROMPT ENHANCEMENT     │
              │  ───────────────────    │
              │  Model: Same            │
              │  Temp: 0.3              │
              │  Prompt: +constraints   │
              │  Wait: 2^N + jitter     │
              │  Resolves: Instructions │
              │  Cost: 1.1x (more tokens)│
              └───────────┬─────────────┘
                          │ Still failing?
                          ▼
              ┌─────────────────────────┐
              │  Attempt 8-10           │
              │  MODEL ESCALATION       │
              │  ─────────────────      │
              │  Model: OSS 120B→qwen3  │
              │  Temp: 0.3              │
              │  Prompt: Enhanced       │
              │  Wait: 60s fixed        │
              │  Resolves: Capability   │
              │  Cost: 3-20x            │
              └───────────┬─────────────┘
                          │ Max retries?
                          ▼
              ┌─────────────────────────┐
              │  FAILURE HANDLING       │
              │  ─────────────────      │
              │  Similarity >0.60?      │
              │    → Manual review      │
              │  Partial success (8/10)?│
              │    → Accept + complete  │
              │  Complete failure?      │
              │    → Hard fail + alert  │
              └─────────────────────────┘
```

### Retry Implementation (TypeScript)

```typescript
interface RetryConfig {
  maxAttempts: number;
  networkRetries: number;
  temperatureSteps: number[];
  escalationModels: string[];
}

const RETRY_CONFIG: RetryConfig = {
  maxAttempts: 10,
  networkRetries: 3,
  temperatureSteps: [1.0, 0.7, 0.3],
  escalationModels: ["oss_120b", "qwen3-max"]
};

async function generateWithRetry<T>(
  generateFn: (config: GenerationConfig) => Promise<T>,
  validateFn: (output: T) => ValidationResult,
  context: GenerationContext,
  attempt: number = 1
): Promise<T> {
  // Circuit breaker check
  if (circuitBreaker.isOpen()) {
    await sleep(60_000); // 60s cooldown
    circuitBreaker.halfOpen();
  }

  // Determine retry strategy based on attempt
  const config = getRetryConfig(context, attempt);

  // Exponential backoff with jitter
  const waitTime = calculateBackoff(attempt, config.phase);
  await sleep(waitTime);

  try {
    // Generate
    const output = await generateFn(config);

    // Validate
    const validation = validateFn(output);

    if (validation.passed) {
      logger.info("Generation succeeded", { attempt, quality: validation.score });
      return output;
    }

    // Validation failed - check if retryable
    if (!validation.retryable || attempt >= RETRY_CONFIG.maxAttempts) {
      return handleFailure(output, validation, context, attempt);
    }

    // Try self-healing for schema violations
    if (validation.errorType === "SCHEMA_VIOLATION" && attempt < 3) {
      const repaired = await selfHealSchema(output, validation.error);
      const revalidation = validateFn(repaired);

      if (revalidation.passed) {
        logger.info("Self-healing repair succeeded", { attempt });
        return repaired;
      }
    }

    // Retry with incremented attempt
    logger.warn("Retrying generation", {
      attempt,
      nextAttempt: attempt + 1,
      errorType: validation.errorType,
      quality: validation.score
    });

    return generateWithRetry(generateFn, validateFn, context, attempt + 1);

  } catch (error) {
    // Classify error and handle
    const errorType = classifyError(error);

    if (errorType === "NON_RETRYABLE") {
      throw error;
    }

    if (errorType === "RATE_LIMIT") {
      const retryAfter = error.headers?.['Retry-After'] || 60;
      await sleep(retryAfter * 1000);
    }

    if (attempt >= RETRY_CONFIG.maxAttempts) {
      circuitBreaker.recordFailure();
      throw new MaxRetriesExceededError(error, attempt);
    }

    return generateWithRetry(generateFn, validateFn, context, attempt + 1);
  }
}

function getRetryConfig(
  context: GenerationContext,
  attempt: number
): GenerationConfig {
  // Attempts 1-3: Network retry (same params)
  if (attempt <= 3) {
    return {
      model: context.baseModel,
      temperature: 1.0,
      prompt: context.basePrompt,
      phase: "NETWORK_RETRY"
    };
  }

  // Attempts 4-5: Temperature reduction
  if (attempt <= 5) {
    const tempIndex = attempt - 4;
    return {
      model: context.baseModel,
      temperature: RETRY_CONFIG.temperatureSteps[tempIndex + 1], // 0.7 or 0.3
      prompt: context.basePrompt,
      phase: "TEMPERATURE_REDUCTION"
    };
  }

  // Attempts 6-7: Prompt enhancement
  if (attempt <= 7) {
    return {
      model: context.baseModel,
      temperature: 0.3,
      prompt: enhancePromptWithConstraints(context.basePrompt, attempt),
      phase: "PROMPT_ENHANCEMENT"
    };
  }

  // Attempts 8-10: Model escalation
  const escalationIndex = Math.min(attempt - 8, RETRY_CONFIG.escalationModels.length - 1);
  return {
    model: RETRY_CONFIG.escalationModels[escalationIndex],
    temperature: 0.3,
    prompt: enhancePromptWithConstraints(context.basePrompt, attempt),
    phase: "MODEL_ESCALATION"
  };
}

function calculateBackoff(attempt: number, phase: string): number {
  if (phase === "MODEL_ESCALATION") {
    return 60_000; // Fixed 60s wait after model escalation
  }

  // Exponential backoff with jitter: (2^attempt) * 1000 + random(100-300)
  const baseWait = Math.pow(2, attempt) * 1000;
  const jitter = Math.random() * 200 + 100;

  return Math.min(baseWait + jitter, 120_000); // Cap at 2 minutes
}
```

### Progressive Prompt Enhancement

**Attempt 1 (Standard)**:
```
Generate course sections based on the following analysis:
{analysis_result}

Required structure: {schema}

Style: {style_prompt}
```

**Attempt 6 (Enhanced - Explicit Constraints)**:
```
Generate EXACTLY {section_count} sections.
Each section MUST contain 3-5 lessons.
Each lesson MUST have:
- title (string, 10-100 chars)
- objectives (array of 3-5 strings, Bloom's taxonomy verbs)
- content (string, 500-3000 chars)
- assessment (array of 3-5 questions)

Output ONLY valid JSON conforming to this schema:
{schema}

NO explanations. NO markdown. ONLY JSON.

Analysis context:
{analysis_result}

Style guidelines:
{style_prompt}

Example valid section:
{example_json}
```

**Attempt 7 (Error-Specific)**:
```
Previous attempt failed with error:
"{validation_error}"

Specifically:
- Section 3 missing "objectives" array
- Lesson 5 "content" field too short (250 chars, minimum 500)

Regenerate ALL sections fixing these errors.
Maintain all other valid content from previous attempt.

Required structure: {schema}
```

---

## Failure Handling: Tiered Escalation

### Error Classification Tree

```typescript
enum ErrorType {
  NON_RETRYABLE = "NON_RETRYABLE",         // 400, 401, 403
  TRANSIENT = "TRANSIENT",                 // 5xx, timeouts, network
  RATE_LIMIT = "RATE_LIMIT",               // 429
  SCHEMA_VIOLATION = "SCHEMA_VIOLATION",   // JSON parse, missing fields
  QUALITY_LOW = "QUALITY_LOW",             // Semantic similarity < threshold
  MIN_REQUIREMENTS = "MIN_REQUIREMENTS",   // < 10 lessons
  CAPABILITY_LIMIT = "CAPABILITY_LIMIT"    // Model can't handle task
}

function classifyError(error: Error | ValidationError): ErrorType {
  if (error instanceof APIError) {
    if ([400, 401, 403].includes(error.statusCode)) {
      return ErrorType.NON_RETRYABLE;
    }
    if ([500, 502, 503, 504, 408].includes(error.statusCode)) {
      return ErrorType.TRANSIENT;
    }
    if (error.statusCode === 429) {
      return ErrorType.RATE_LIMIT;
    }
  }

  if (error instanceof ValidationError) {
    if (error.type === "SCHEMA_MISMATCH") {
      return ErrorType.SCHEMA_VIOLATION;
    }
    if (error.type === "QUALITY_BELOW_THRESHOLD") {
      return ErrorType.QUALITY_LOW;
    }
    if (error.type === "INSUFFICIENT_LESSONS") {
      return ErrorType.MIN_REQUIREMENTS;
    }
  }

  return ErrorType.CAPABILITY_LIMIT;
}
```

### Failure Handling Strategies

| Error Type | Strategy | Action | When to Use |
|-----------|----------|--------|-------------|
| **NON_RETRYABLE** | Hard Fail | Log + notify user + STOP | 400, 401, 403 errors |
| **TRANSIENT** | Exponential Backoff | Retry with 2^N delay | Network, 5xx errors |
| **RATE_LIMIT** | Respect Retry-After | Wait + retry | 429 with header |
| **SCHEMA_VIOLATION** | Self-Healing | 1-2 repair attempts | JSON errors, missing fields |
| **QUALITY_LOW** | Temperature + Escalation | Reduce temp → escalate model | Similarity < threshold |
| **MIN_REQUIREMENTS** | Partial Acceptance | Accept 8/10 lessons + manual | Close to goal |
| **CAPABILITY_LIMIT** | Model Escalation | Switch to stronger model | Model can't handle complexity |

### Failure Decision Tree

```typescript
async function handleFailure<T>(
  output: T,
  validation: ValidationResult,
  context: GenerationContext,
  attempt: number
): Promise<T> {
  const errorType = classifyError(validation.error);

  switch (errorType) {
    case ErrorType.NON_RETRYABLE:
      logger.error("Non-retryable error", {
        error: validation.error,
        context: context.topic,
        attempt
      });
      throw new GenerationError("Invalid request. Check inputs and try again.");

    case ErrorType.SCHEMA_VIOLATION:
      if (attempt < 3 && context.tokenCount > 1000) {
        // Cost-effective repair for large contexts
        return await selfHealSchema(output, validation.error);
      } else {
        // Regenerate with stricter prompt
        throw new RetryableError("Schema violation", { attempt, enhancePrompt: true });
      }

    case ErrorType.QUALITY_LOW:
      if (validation.score > 0.60 && validation.score < 0.75) {
        // Borderline quality - route to manual review
        logger.warn("Borderline quality, routing to manual review", {
          score: validation.score,
          threshold: 0.75,
          attempt
        });
        await queueForManualReview(output, validation, context);
        return output; // Return for review, don't block pipeline
      } else {
        // Too low - escalate or fail
        if (attempt < 10) {
          throw new RetryableError("Quality below threshold", {
            escalateModel: true
          });
        } else {
          throw new GenerationError("Quality unacceptable after max retries");
        }
      }

    case ErrorType.MIN_REQUIREMENTS:
      const lessonCount = (output as any).lessons?.length || 0;

      if (lessonCount >= 8 && lessonCount < 10) {
        // Partial acceptance - 80% complete
        logger.info("Partial acceptance: 8/10 lessons", {
          actual: lessonCount,
          required: 10
        });
        await queueForCompletion(output, { missing: 10 - lessonCount });
        return output; // Accept partial result
      } else if (attempt < 3) {
        // Retry with emphasis on lesson count
        throw new RetryableError("Insufficient lessons", {
          enhancePrompt: true,
          emphasize: "lesson_count"
        });
      } else {
        throw new GenerationError(`Insufficient lessons after ${attempt} attempts`);
      }

    case ErrorType.RATE_LIMIT:
      const retryAfter = validation.error.headers?.['Retry-After'] || 60;
      logger.warn("Rate limit hit, waiting", { retryAfter, attempt });
      await sleep(retryAfter * 1000);
      throw new RetryableError("Rate limit", { waitTime: retryAfter });

    default:
      // Max retries exhausted
      if (attempt >= 10) {
        logger.error("Max retries exhausted", {
          attempt,
          errorType,
          quality: validation.score
        });

        // Alert engineering team
        await alertTeam({
          severity: "HIGH",
          message: "Course generation failed after 10 attempts",
          context,
          validation
        });

        throw new GenerationError("Max retries exceeded");
      }

      throw new RetryableError("Unknown error", { attempt });
  }
}
```

---

## Self-Healing Techniques

### Cost-Effectiveness Analysis

**Break-even calculation**: Repair justified when `(success_rate > 50%) AND (token_savings > 30%)`

| Error Type | Repair Success Rate | Cost vs Regeneration | Strategy | When to Use |
|-----------|-------------------|---------------------|----------|-------------|
| JSON syntax | 95% | 0.1x (FSM-based) | Always repair | All cases |
| Schema violation | 80% | 0.5x (LLM repair) | Repair if context >1K tokens | Large contexts |
| Constraint error | 70% | 0.7x (1-2 repairs) | Repair if context >2K tokens | Large contexts |
| Logic error | 40% | 1.0x (regenerate) | Full regeneration | Small contexts |
| Reasoning error | 20% | 1.0x+ (regenerate + prompt fix) | Full regeneration | Fundamental issues |

### Self-Healing Implementation

```typescript
interface RepairResult<T> {
  output: T;
  costMultiplier: number;
  method: "fsm" | "llm_repair" | "regenerate";
  success: boolean;
}

async function selfHealSchema<T>(
  output: T,
  error: ValidationError
): Promise<T> {
  // Level 1: FSM-based JSON repair (near-zero cost)
  if (error.type === "JSON_PARSE_ERROR") {
    try {
      const repaired = fsmJsonRepair(JSON.stringify(output));
      const parsed = JSON.parse(repaired);

      logger.info("FSM repair succeeded", { method: "fsm", cost: "0.1x" });
      return parsed as T;
    } catch (fsmError) {
      // Fallback to LLM repair
      logger.warn("FSM repair failed, trying LLM repair", { fsmError });
    }
  }

  // Level 2: LLM-based semantic repair
  const repairPrompt = buildRepairPrompt(output, error);
  const repaired = await llm.generate({
    model: "gpt-5-mini", // Cheap model for repairs
    temperature: 0.3,
    prompt: repairPrompt
  });

  // Validate repaired output
  const validation = await validateOutput(repaired);

  if (validation.passed) {
    logger.info("LLM repair succeeded", { method: "llm_repair", cost: "0.5x" });
    return repaired;
  } else {
    // Repair failed - throw to trigger regeneration
    throw new RepairFailedError("Self-healing unsuccessful", {
      originalError: error,
      repairAttempts: 1
    });
  }
}

function buildRepairPrompt(output: any, error: ValidationError): string {
  return `
Your output failed validation with the following error:
${error.message}

Specific issues:
${error.details.map(d => `- ${d.field}: ${d.message}`).join('\n')}

Original output:
${JSON.stringify(output, null, 2)}

Required schema:
${JSON.stringify(error.schema, null, 2)}

Fix ONLY the validation errors while maintaining all other content.
Output valid JSON conforming to the schema.
  `.trim();
}
```

### Repair Strategies by Error Type

**JSON Syntax Errors** (95% success, 0.1x cost):
- Use FSM-based repair (json-repair library)
- Fixes: missing brackets, trailing commas, unescaped quotes
- Near-instant, deterministic

**Schema Violations** (80% success, 0.5x cost):
- LLM repair with validation error feedback
- Provide exact field names, types, constraints
- Works well when structure is mostly correct

**Constraint Violations** (70% success, 0.7x cost):
- Feed validation error back to LLM
- Example: "Field 'age' must be 0-120 (got 150)"
- 1-2 repair attempts max

**Logic/Reasoning Errors** (20-40% success, 1.0x+ cost):
- Full regeneration more cost-effective
- LLMs can't reliably self-correct without external feedback
- Only works with objective error signals (schema, tests)

---

## Integration with RT-001 Model Routing

### Phase 2: Metadata Generation

**Model**: Hybrid (RT-001) + Retry Logic (RT-004)

```typescript
async function generateMetadata(input: GenerationJobInput): Promise<CourseMetadata> {
  // Critical fields: qwen3-max ALWAYS (RT-001)
  const criticalMetadata = await generateWithRetry(
    (config) => llm.generate({
      model: "qwen3-max", // ALWAYS for critical fields
      temperature: config.temperature,
      prompt: buildCriticalMetadataPrompt(input)
    }),
    (output) => validateMetadataQuality(output, {
      completeness: 0.85,
      coherence: 0.90,
      alignment: 0.85
    }),
    { baseModel: "qwen3-max", phase: "metadata_critical" }
  );

  // Non-critical fields: OSS 120B first, escalate to qwen3-max if needed (RT-001)
  const nonCriticalMetadata = await generateWithRetry(
    (config) => llm.generate({
      model: config.model, // OSS 120B → qwen3-max escalation
      temperature: config.temperature,
      prompt: buildNonCriticalMetadataPrompt(input)
    }),
    (output) => validateMetadataQuality(output, {
      completeness: 0.75,
      coherence: 0.80
    }),
    {
      baseModel: "oss_120b",
      escalationModels: ["qwen3-max"],
      phase: "metadata_non_critical"
    }
  );

  return { ...criticalMetadata, ...nonCriticalMetadata };
}
```

**Quality Gates** (RT-004):
- Critical metadata: 0.85 completeness, 0.90 coherence, 0.85 alignment
- Non-critical metadata: 0.75 completeness, 0.80 coherence
- Max retries: 2 for critical (then human review), 3 for non-critical

**Escalation** (RT-004):
- Non-critical fields escalate to qwen3-max if quality <0.85 (30% expected)
- Critical fields retry 2x with qwen3-max, then flag for human review

---

### Phase 3: Section Generation

**Model**: OSS 120B primary → qwen3-max escalation (RT-001) + Retry Logic (RT-004)

```typescript
async function generateSection(
  sectionSpec: SectionSpec,
  learningOutcomes: string[],
  metadata: CourseMetadata
): Promise<Section> {
  // Calculate complexity for pre-routing (RT-001)
  const complexity = calculateComplexityScore(sectionSpec);
  const criticality = assessCriticality(sectionSpec, learningOutcomes);

  // Determine base model (RT-001 tiered routing)
  const baseModel = (complexity >= 0.75 || criticality >= 0.80)
    ? "qwen3-max"  // Pre-identified complex sections
    : "oss_120b";  // Standard sections (70-75%)

  const section = await generateWithRetry(
    (config) => llm.generate({
      model: config.model,
      temperature: config.temperature,
      prompt: buildSectionPrompt(sectionSpec, metadata, config.attempt)
    }),
    (output) => validateSectionQuality(output, {
      similarity: getThresholdForLanguage(metadata.language, "sections"), // 0.75 or 0.70 for RU
      lessonCount: { min: 3, max: 5 },
      objectiveCount: { min: 3, max: 5 }
    }),
    {
      baseModel,
      escalationModels: baseModel === "oss_120b"
        ? ["qwen3-max"]  // Escalate Tier 1 to Tier 2
        : [],           // Tier 2 doesn't escalate further
      phase: "section_generation",
      maxAttempts: 10
    }
  );

  return section;
}
```

**Quality Gates** (RT-004):
- Semantic similarity: ≥0.75 (EN/DE/ES) or ≥0.70 (RU)
- Lesson count: 3-5 lessons per section
- Objective count: 3-5 objectives per lesson

**Escalation** (RT-004 + RT-001):
- Tier 1 (OSS 120B): If similarity <0.75 after generation → retry with qwen3-max
- Tier 2 (qwen3-max): If similarity <0.80 after generation → 10 retries → manual review
- Tier 3 (Gemini): Context >120K tokens → no escalation (fallback only)

---

### Phase 4: Quality Validation

**Model**: OSS 20B (95%) + OSS 120B LLM-as-judge (5%) - RT-001

**Strategy** (RT-004): Fast embedding-based validation + LLM judge for borderline cases

```typescript
async function validateQuality(
  sections: Section[],
  learningOutcomes: string[],
  language: string
): Promise<QualityValidationResult> {
  const threshold = getThresholdForLanguage(language, "sections"); // 0.75 or 0.70
  const results: ValidationResult[] = [];

  for (const section of sections) {
    // Tier 1: Embedding-based validation (95% of sections, fast)
    const similarity = await computeSemanticSimilarity(
      section.content,
      learningOutcomes,
      { model: "jina-v3", language }
    );

    if (similarity >= threshold + 0.05) {
      // High confidence pass (≥0.80 for EN, ≥0.75 for RU)
      results.push({
        sectionId: section.id,
        status: "PASS",
        similarity,
        method: "embedding"
      });
      continue;
    }

    if (similarity >= threshold - 0.05 && similarity < threshold + 0.05) {
      // Borderline (0.70-0.79 for EN, 0.65-0.74 for RU) - use LLM-as-judge
      const judgeResult = await llmAsJudge({
        model: "oss_20b", // Cheap model for validation
        sectionContent: section.content,
        learningObjectives: learningOutcomes,
        criteria: ["pedagogical_alignment", "factual_accuracy", "concept_clarity"],
        temperature: 0.3
      });

      const finalScore = (similarity + judgeResult.score) / 2; // Average

      results.push({
        sectionId: section.id,
        status: finalScore >= threshold ? "PASS_WITH_FLAG" : "REVIEW_REQUIRED",
        similarity,
        judgeScore: judgeResult.score,
        finalScore,
        method: "llm_judge_oss20b"
      });
      continue;
    }

    // Below threshold - automatic fail
    results.push({
      sectionId: section.id,
      status: "FAIL",
      similarity,
      method: "embedding",
      reason: `Semantic similarity ${similarity.toFixed(2)} below threshold ${threshold}`
    });
  }

  const passRate = results.filter(r =>
    r.status === "PASS" || r.status === "PASS_WITH_FLAG"
  ).length / results.length;

  return {
    overallQualityScore: passRate,
    sectionResults: results,
    requiresRevision: passRate < 0.85, // 85% pass rate required
    flaggedSections: results.filter(r =>
      r.status.includes("FLAG") || r.status === "FAIL"
    )
  };
}
```

**No Retries** (RT-004): Phase 4 is validation ONLY, retries happen in Phase 3 generation

---

## Monitoring & Metrics

### Key Metrics (RT-004 Recommended)

```typescript
const MONITORING_CONFIG = {
  qualityMetrics: {
    semanticSimilarityByLanguage: {
      english: { mean: 0.82, p95: 0.75, alertThreshold: 0.70 },
      german: { mean: 0.81, p95: 0.74, alertThreshold: 0.69 },
      spanish: { mean: 0.81, p95: 0.74, alertThreshold: 0.69 },
      russian: { mean: 0.76, p95: 0.69, alertThreshold: 0.64 },
    },
    schemaValidationPassRate: { target: 0.90, alertThreshold: 0.85 },
    lessonCountCompliance: { target: 1.0, alertThreshold: 0.95 },
  },

  retryMetrics: {
    retryRateByErrorType: {
      transient: { current: 0.15, alertThreshold: 0.30 },
      schema: { current: 0.08, alertThreshold: 0.15 },
      semantic: { current: 0.12, alertThreshold: 0.20 },
    },
    retrySuccessRate: { target: 0.85, alertThreshold: 0.70 },
    avgAttemptsPerSuccess: { target: 2.5, alertThreshold: 5.0 },
    escalationRate: { target: 0.25, alertThreshold: 0.40 }, // RT-001 target: 20-25%
  },

  costMetrics: {
    costPerSuccessfulCourse: { budget: 0.39, alertThreshold: 0.50 }, // RT-001 target
    retryCostOverhead: { target: 0.15, alertThreshold: 0.30 },
    selfHealingSuccessRate: { target: 0.75, alertThreshold: 0.50 },
  },

  latencyMetrics: {
    p50GenerationTime: { target: 120, alertThreshold: 300 }, // seconds
    p95GenerationTime: { target: 480, alertThreshold: 600 },
    p99GenerationTime: { alertThreshold: 1200 },
  },

  failureMetrics: {
    hardFailureRate: { target: 0.01, alertThreshold: 0.05 },
    manualReviewRate: { target: 0.08, alertThreshold: 0.15 }, // RT-001: 5-10%
    partialAcceptanceRate: { target: 0.03, alertThreshold: 0.10 },
  }
};
```

### Continuous Optimization Loop (RT-004)

**Week 1-2**: Establish baseline metrics across all languages
**Week 3-4**: Identify error patterns and adjust retry parameters
**Month 2**: Optimize model routing based on cost/quality data
**Month 3**: Fine-tune language-specific thresholds based on actual performance
**Ongoing**: A/B test prompt variations, monitor drift, update escalation rules

---

## Cost-Benefit Analysis

### Retry Cost Overhead

**Expected Retry Distribution** (RT-004 research):
- 70-80% succeed on attempt 1 (no retry cost)
- 15-20% succeed on attempts 2-5 (network/temperature, 1.0x cost multiplier)
- 5-10% succeed on attempts 6-7 (prompt enhancement, 1.1x cost multiplier)
- 3-5% succeed on attempts 8-10 (model escalation, 3-20x cost multiplier)

**Average Retry Cost Multiplier**: 1.15-1.30x baseline

**RT-001 Integration**:
- Baseline cost (no retries): $0.33-0.39 per course
- With retries (15-30% overhead): $0.38-0.51 per course
- **Still within acceptable range** (<$0.60)

### Self-Healing Cost Savings

**Schema Repair** (80% success, context >1K tokens):
- Full regeneration: 500 input + 300 output = 800 tokens
- Self-healing: 300 (original) + 100 (error) + 50 (prompt) + 100 (delta) = 550 tokens
- **Savings**: 31% when repair succeeds
- **Break-even**: 2-3 repairs = 1 regeneration cost

**Expected Savings**: 10-20% reduction in retry costs via self-healing

---

## Production Deployment Checklist

### Phase 1: Validation Infrastructure

- [ ] Implement Jina-v3 embedding service for semantic similarity
- [ ] Implement Pydantic schema validation with field_validators
- [ ] Implement FSM-based JSON repair (json-repair library)
- [ ] Set up monitoring dashboards (quality, retry, cost, latency)
- [ ] Configure alert thresholds per MONITORING_CONFIG

### Phase 2: Retry Logic

- [ ] Implement 10-attempt retry strategy with exponential backoff
- [ ] Implement temperature reduction sequence (1.0 → 0.7 → 0.3)
- [ ] Implement progressive prompt enhancement
- [ ] Implement model escalation (OSS 120B → qwen3-max)
- [ ] Implement circuit breaker (5 failures → 60s cooldown)

### Phase 3: Failure Handling

- [ ] Implement error classification (NON_RETRYABLE, TRANSIENT, RATE_LIMIT, etc.)
- [ ] Implement self-healing schema repair (FSM + LLM)
- [ ] Implement partial acceptance logic (8/10 lessons)
- [ ] Set up manual review queue (BullMQ/Redis)
- [ ] Implement alerting for hard failures (engineering team)

### Phase 4: Integration Testing

- [ ] Test 10 courses across all languages (EN, DE, ES, RU)
- [ ] Validate retry behavior (network, quality, schema errors)
- [ ] Validate self-healing repair rates (80%+ for schema)
- [ ] Validate cost per course ($0.38-0.51 with retries)
- [ ] Validate quality (90%+ pass rate after retries)

### Phase 5: Production Rollout

- [ ] Deploy to staging environment
- [ ] Run 100 test courses, collect metrics
- [ ] Adjust thresholds based on actual data
- [ ] Gradual rollout: 10% → 50% → 100%
- [ ] Monitor for 2 weeks, optimize based on patterns

---

## Integration with Other Research Tasks

### RT-001 (Model Routing) ✅ VALIDATED

**RT-004 confirms RT-001 decisions**:
- 0.75 semantic similarity = **industry standard** ✅
- Phase-specific thresholds (0.70-0.90) = **production best practice** ✅
- Model escalation (OSS 120B → qwen3-max) = **proven pattern** ✅

**RT-004 adds retry logic**:
- 10-attempt strategy for batch processing
- Temperature reduction before model escalation
- Self-healing for cost optimization

### RT-003 (Token Budget) ✅ INTEGRATED

**RT-004 respects RT-003 limits**:
- INPUT_BUDGET_MAX = 90K tokens per batch (no change)
- RAG_MAX_TOKENS = 40K tokens (no change)
- GEMINI_TRIGGER = 108K input / 115K total (no change)

**RT-004 adds retry overhead**:
- Prompt enhancement +10% tokens (attempts 6-7)
- Total budget with retries: ~95K-100K input max
- **Still within Gemini fallback threshold** ✅

### RT-006 (Bloom's Taxonomy) - PENDING

**RT-004 prepares for RT-006 integration**:
- Lesson objective validation hooks ready
- Zod field_validator integration documented
- Quality metrics track pedagogical alignment

**Next**: RT-006 will define Bloom's taxonomy validation rules (whitelist action verbs, topic specificity)

---

## Conclusion: Production-Ready Validation

**RT-004 delivers production-grade validation infrastructure**:
- ✅ Validates RT-001 threshold decisions (0.75 = industry standard)
- ✅ Provides 10-attempt retry strategy optimized for batch processing
- ✅ Enables 90-95% quality achievement with 15-30% cost overhead
- ✅ Integrates self-healing for 10-20% retry cost reduction
- ✅ Includes comprehensive monitoring and continuous optimization

**Cost Impact**:
- RT-001 baseline: $0.33-0.39 per course
- RT-004 with retries: $0.38-0.51 per course (15-30% overhead)
- **Total: $0.38-0.51 per course ✅ ACCEPTABLE**

**Quality Impact**:
- Baseline (no retries): 75-80% pass rate
- With retries: 90-95% pass rate
- **+15-20% quality improvement for +15-30% cost ✅ JUSTIFIED**

**Next Steps**:
1. Implement validation infrastructure (Pydantic, Jina-v3, json-repair)
2. Implement retry logic in generation-phases.ts (T029-B)
3. Integrate with metadata-generator.ts (T019) and section-batch-generator.ts (T020)
4. Deploy to staging, run 100 test courses, adjust thresholds
5. Production rollout with monitoring

**Status**: ✅ READY FOR IMPLEMENTATION

---

**Document Version**: 1.0
**Last Updated**: 2025-11-07
**Owner**: CourseAI Generation Team
**Related**: RT-001 (Model Routing), RT-003 (Token Budget), RT-006 (Bloom's Taxonomy - Pending)
