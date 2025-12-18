# INV-2025-11-19-004: Enum Validation Strategy - Strict vs Flexible Zod Schemas

**Date**: 2025-11-19
**Status**: RESEARCH NEEDED
**Priority**: HIGH (affects generation reliability and LLM prompt engineering)
**Category**: Architecture / Validation Strategy / LLM Prompt Engineering

---

## Executive Summary

**Problem**: LLMs frequently generate enum values that don't match strict Zod schema constraints, causing RT-006 validation failures and generation retries.

**Latest Example**:
```
RT-006 validation failed: 0.lessons.2.practical_exercises.0.exercise_type:
Invalid enum value. Expected 'self_assessment' | 'case_study' | 'hands_on' |
'discussion' | 'quiz' | 'simulation' | 'reflection', received 'analysis'
```

**Root Question**: Should we use **strict validation** (hard errors) or **flexible validation** (warnings + coercion) for enum fields in LLM-generated content?

**NEW PERSPECTIVE** (2025-11-19):
> "We're strongly binding ourselves to exact parameters and values during analysis. But they're not always needed. These fields should be **recommendations**, not hard constraints. The downstream LLM (Stage 5) will read them and understand the semantic intent even if the exact enum value differs. We might be over-engineering this."

**Key Insight**:
- Stage 4 LLM generates recommendations in analysis_result
- Stage 5 LLM reads analysis_result and understands recommendations semantically
- **Why enforce exact enum matching between LLM stages?**
- LLMs naturally communicate via meaning, not rigid schemas
- Perhaps we should **eliminate enum lists entirely** and let LLMs choose values by semantic meaning

**Impact**:
- 🔴 **Current approach**: Strict validation causes generation failures, retries, and wasted API costs (~460s wasted)
- 🟡 **Alternative 1**: Flexible validation allows generation to succeed but may compromise data quality
- 🟢 **Alternative 2**: Improved prompt engineering makes strict validation viable
- 🟢 **Alternative 3 (NEW)**: Remove enum validation, rely on LLM-to-LLM semantic understanding

---

## Problem Context

### Enum Validation in Zod Schemas

Throughout the codebase, we use **strict enum constraints** in Zod schemas:

```typescript
export const ExerciseTypeSchema = z.enum([
  'self_assessment',
  'case_study',
  'hands_on',
  'discussion',
  'quiz',
  'simulation',
  'reflection',
]);
```

This creates a **hard constraint**: any value outside this list causes Zod validation to fail completely.

### How LLMs See These Constraints

LLMs receive enum constraints through `zodToPromptSchema()`:

```
"exercise_type": "enum: self_assessment | case_study | hands_on | discussion | quiz | simulation | reflection"
```

**Problem**: Even with clear instructions, LLMs sometimes:
- Generate semantically similar values (`'analysis'` instead of `'case_study'`)
- Hallucinate new values that make sense contextually
- Use different casing or formatting (`'self-assessment'` vs `'self_assessment'`)
- Translate values to target language (Russian course, English schema)

---

## Current Failures in Production

### E2E Test Evidence

**Test**: `t053-synergy-sales-course.test.ts`
**Failure Point**: Section 6, Lesson 2, Exercise 0
**Error**: `exercise_type: 'analysis'` (not in allowed enum)

**Impact**:
- Section batch generation failed after 2 retry attempts
- Quality validation failed (no sections generated)
- Lesson count validation failed (no sections generated)
- **Total time wasted**: ~460 seconds (~7.7 minutes) before failure

### Pattern: Multiple Enum Fields at Risk

Searching the codebase reveals **many enum fields** that could fail similarly:

**Exercise-related enums**:
- `exercise_type` (7 values) ← **CURRENT FAILURE**
- `difficulty_level` (beginner, intermediate, advanced)
- `exercise_format` (multiple choice, short answer, essay, etc.)

**Content-related enums**:
- `content_type` (video, text, interactive, quiz, etc.)
- `bloom_level` (remember, understand, apply, analyze, evaluate, create)
- `interaction_type` (passive, active, collaborative)

**Course structure enums**:
- `section_type` (introduction, core, practice, assessment)
- `lesson_type` (lecture, lab, discussion, project)

**Each of these is a potential failure point** where LLMs might generate non-conforming values.

---

## Research Questions

### Primary Research Questions

1. **Frequency**: How often do enum validation failures occur across all generation stages?
   - Analyze logs/metrics from recent E2E tests
   - Identify which enum fields fail most frequently
   - Calculate retry rate and cost impact

2. **Prompt Engineering**: Can we make LLMs reliably follow enum constraints?
   - Test different prompt formulations
   - Compare instruction clarity vs actual compliance
   - Evaluate model-specific behavior (qwen3 vs OSS 120B vs Gemini)

3. **Schema Design**: Are our enum constraints too strict or poorly designed?
   - Review enum value naming (semantic clarity)
   - Check for missing values that LLMs naturally generate
   - Evaluate alternative schema patterns (unions, literals, flexible strings)

4. **Validation Strategy**: What's the optimal validation approach?
   - Strict (fail fast, maintain data quality)
   - Flexible (warnings + coercion, allow generation to succeed)
   - Hybrid (strict for critical fields, flexible for non-critical)

---

## Solution Options Overview

### Option 1: Strict Validation (Current Approach)

**Description**: Keep Zod schemas strict, improve prompt engineering and retry logic.

**When to use**: Critical fields where data quality is non-negotiable.

**Pros**:
- ✅ Guarantees data quality and type safety
- ✅ Catches LLM errors early
- ✅ Database schema constraints align with validation
- ✅ TypeScript types remain accurate

**Cons**:
- ❌ Causes generation failures and retries
- ❌ Wastes API costs on failed attempts
- ❌ Increases latency (retries + escalation)
- ❌ May never succeed if LLM consistently fails

### Option 2: Flexible Validation (Warning-based)

**Description**: Convert enum validations to warnings, coerce invalid values to closest match or default.

**When to use**: Non-critical fields where generation success is more important than perfect accuracy.

**Pros**:
- ✅ Generation succeeds even with LLM errors
- ✅ Reduces retries and API costs
- ✅ Lower latency (no retry loops)
- ✅ Better user experience (faster course generation)

**Cons**:
- ❌ Data quality degradation
- ❌ TypeScript types become less reliable
- ❌ Harder to debug issues
- ❌ Potential database constraint violations

### Option 3: Improved Prompt Engineering

**Description**: Keep strict validation, but invest in better prompts and examples.

**When to use**: When testing shows prompt improvements significantly reduce failures.

**Pros**:
- ✅ Maintains data quality
- ✅ No schema changes needed
- ✅ Addresses root cause (LLM understanding)
- ✅ Scales to all enum fields

**Cons**:
- ❌ Requires extensive testing
- ❌ May not work for all models
- ❌ Increases prompt token usage
- ❌ Still risk of occasional failures

### Option 4: Hybrid Approach

**Description**: Strict validation for critical fields, flexible for non-critical. Use field-level configuration.

**When to use**: When different fields have different quality requirements.

**Pros**:
- ✅ Balances quality and reliability
- ✅ Configurable per field
- ✅ Can evolve over time
- ✅ Clear separation of concerns

**Cons**:
- ❌ More complex implementation
- ❌ Requires field classification
- ❌ Mixed validation logic
- ❌ Harder to reason about

### Option 5: Schema Redesign

**Description**: Replace strict enums with more flexible alternatives (string unions, AI-friendly values, post-processing).

**When to use**: When enum constraints don't align with LLM natural language understanding.

**Pros**:
- ✅ More LLM-friendly schemas
- ✅ Reduces mismatch between intent and constraint
- ✅ Allows semantic validation
- ✅ Post-processing can normalize values

**Cons**:
- ❌ Large refactoring required
- ❌ Loses compile-time type safety
- ❌ Post-processing adds complexity
- ❌ May hide real LLM issues

### Option 6: LLM-to-LLM Semantic Communication (NEW)

**Description**: Eliminate enum validation entirely for inter-LLM communication. Let Stage 4 LLM generate recommendations in natural language or flexible values, let Stage 5 LLM understand semantically.

**Rationale**:
> "These fields are recommendations. The downstream LLM will understand intent even if exact enum differs. We're thinking in traditional software terms, not LLM-native patterns."

**When to use**: When fields are advisory/contextual, not hard constraints enforced by database or business logic.

**Pros**:
- ✅ Zero validation failures between LLM stages
- ✅ LLMs communicate naturally (semantic understanding)
- ✅ No retry costs or latency overhead
- ✅ Simpler schemas (less enum maintenance)
- ✅ More flexible evolution (no breaking changes)

**Cons**:
- ❌ Loss of explicit type safety
- ❌ Harder to enforce database constraints
- ❌ Potential "drift" in terminology over time
- ❌ Debugging becomes more semantic, less structural
- ❌ Unclear how to catch real errors vs semantic variations

---

## Research Tasks for Sub-Agent

### Task 1: Analyze Enum Usage Across Codebase

**Goal**: Identify all enum fields in Zod schemas used for LLM generation.

**Deliverables**:
1. Complete list of enum fields with:
   - Field name and path
   - Number of enum values
   - Where used (Stage 2/3/4/5)
   - Criticality (high/medium/low)

2. Classification by domain:
   - Exercise types
   - Content types
   - Bloom taxonomy
   - Course structure
   - Other

### Task 2: Review Prompt Engineering

**Goal**: Analyze how enum constraints are communicated to LLMs.

**Deliverables**:
1. Current prompt patterns for enum fields
2. Analysis of `zodToPromptSchema()` output quality
3. Comparison with best practices (OpenAI, Anthropic docs)
4. Specific recommendations for improvement

### Task 3: Evaluate Validation Failures

**Goal**: Determine frequency and patterns of enum validation failures.

**Deliverables**:
1. Search logs/tests for RT-006 errors
2. List most frequently failing enums
3. Calculate retry rate and cost impact
4. Identify patterns (specific models, stages, fields)

### Task 4: Solution Design & Prioritization

**Goal**: Design concrete solutions with implementation details.

**Deliverables**:
1. Detailed design for each option (1-5 above)
2. Effort estimation (hours, files affected)
3. Risk assessment (data quality, breaking changes)
4. Pros/cons with **quantitative metrics** where possible
5. **Prioritized recommendation list** (best → worst)

### Task 5: Prototype Testing (If Time Permits)

**Goal**: Validate solutions with real tests.

**Deliverables**:
1. Implement top 2 solutions as prototypes
2. Run E2E tests with both approaches
3. Measure success rate, latency, quality
4. Report results with data

---

## Success Criteria

**Research is complete when**:
- [ ] All enum fields catalogued and classified
- [ ] Prompt engineering quality analyzed
- [ ] Failure patterns documented with data
- [ ] 5 solution options fully designed
- [ ] Solutions prioritized with clear rationale
- [ ] Effort, risk, and impact estimated for each
- [ ] Recommendation made with confidence level

---

## Out of Scope (For Now)

- Implementing chosen solution (separate task after decision)
- Database schema migrations
- Full codebase refactoring
- Changing core Zod libraries

---

## References

- **Current Failure**: `/tmp/t053-with-regular-model.log` (line with RT-006 error)
- **Zod Schema Utils**: `/packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts`
- **Exercise Schema**: Search for `ExerciseTypeSchema` in codebase
- **Validation Logic**: `/packages/course-gen-platform/src/services/stage5/` (generators)
- **Prompt Templates**: Search for `.zodToPromptSchema(` usage

---

## Timeline

**Research Phase**: 1-2 hours (sub-agent autonomous work)
**Decision Phase**: 15-30 minutes (user reviews recommendations)
**Implementation Phase**: TBD (depends on chosen solution)

---

## Context for Sub-Agent

### Current Architecture

**Generation Flow**:
1. **Zod Schema** defines structure with strict enums
2. **zodToPromptSchema()** converts to human-readable format
3. **Prompt Template** includes schema + instructions
4. **LLM** generates JSON
5. **Zod Validation** checks compliance (strict fail/pass)
6. **Retry Logic** (max 3 attempts) if validation fails

**Problem Point**: Step 5 → If enum doesn't match, entire generation fails

### Key Files to Review

**Schemas**:
- `/packages/course-gen-platform/src/schemas/` (all `*Schema.ts` files)
- Search for `z.enum(` usage

**Prompt Engineering**:
- `/packages/course-gen-platform/src/services/stage5/metadata-generator.ts`
- `/packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
- Search for `.zodToPromptSchema(` calls

**Validation Logic**:
- `/packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts`
- `/packages/course-gen-platform/src/services/stage5/generation-phases.ts`

**Test Evidence**:
- `/tmp/t053-with-regular-model.log` (latest failure)
- `/packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts`

---

## Expected Output Format

Sub-agent should produce a **comprehensive research report** structured as:

```markdown
# Enum Validation Strategy Research Report

## Executive Summary
[1-2 paragraphs with key findings and top recommendation]

## Part 1: Enum Field Catalog
[Complete list with classification]

## Part 2: Current Prompt Engineering Analysis
[Detailed review with examples]

## Part 3: Failure Pattern Analysis
[Data-driven insights]

## Part 4: Solution Designs
[5 solutions with full details]

## Part 5: Prioritized Recommendations
[Ranked list from best to worst with rationale]

## Part 6: Implementation Roadmap (for chosen solution)
[Step-by-step plan]

## Appendices
[Supporting data, code examples, test results]
```

---

## Notes

- **Language**: Report should be in English (code/docs standard)
- **Depth**: Prefer data and examples over speculation
- **Actionability**: Each recommendation must be implementable
- **Metrics**: Include quantitative comparisons where possible (% success rate, latency, cost)
