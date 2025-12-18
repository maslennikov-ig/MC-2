# UNIFIED SPECIFICATION: Unify Stage 4 and Stage 5 Schemas

**Date Created**: 2025-11-12
**Last Updated**: 2025-11-12
**Status**: READY FOR IMPLEMENTATION
**Priority**: 🔴 HIGH (Architectural Fix)
**Type**: Bugfix + Refactoring
**Affects**: Stage 4 (Analyze) output, Stage 5 (Generation) input, all integration points

**Related Documents**:
- `specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md`
- `docs/investigations/INV-2025-11-11-003-regenerate-section-validation-failures.md`
- `docs/FUTURE/SPEC-2025-11-11-001-stage4-stage5-schema-mismatch.md` (superseded by this spec)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Root Cause Analysis](#root-cause-analysis)
3. [Architecture Context (RT-002)](#architecture-context-rt-002)
4. [Problem Statement](#problem-statement)
5. [Solution Design](#solution-design)
6. [Implementation Plan](#implementation-plan)
7. [Testing Strategy](#testing-strategy)
8. [Acceptance Criteria](#acceptance-criteria)
9. [Risks and Mitigation](#risks-and-mitigation)

---

## Executive Summary

### Problem Statement

**Root Cause**: Schema mismatch between Stage 4 output (FULL nested schema) and Stage 5 input (SIMPLIFIED flat schema) caused by miscommunication during initial design. The `AnalysisResultSchema` in `generation-job.ts` was incorrectly designed as a simplified schema when it should mirror the full `AnalysisResult` from Stage 4.

**Impact**:
- ❌ Stage 5 validation fails when receiving real Stage 4 output
- ❌ Tests failing with "Expected string, received object" errors
- ❌ Loss of information if transformation layer added (not acceptable)
- ❌ Architectural inconsistency violating RT-002 design principles

**Architectural Clarification** (from product owner):
- ✅ Title-only applies to Analyze INPUT ONLY (Analyze can work without documents)
- ✅ **Analyze ALWAYS generates ALL 4 enhancement fields** (even if input was title-only)
- ✅ **Generation ALWAYS receives FULL data from Analyze** (100% of cases, no exceptions)
- ✅ ALL 4 enhancement fields are REQUIRED in schema (no optional fields - production Best Practice)
- ✅ RAG usage decision is in Generation logic (not schema-level)
- ✅ Analyze works with full files or summary (not RAG - receives complete data)
- ✅ Product is in development → no legacy data → can make breaking changes
- ✅ NO reason for schema simplification → this was a design error

### Solution

**Unify schemas** by updating Stage 5 to accept and use the FULL `AnalysisResult` schema from Stage 4:

1. **Update `AnalysisResultSchema` in generation-job.ts** to match full Stage 4 schema
2. **ALL 4 enhancement fields are REQUIRED** - no optional fields (production Best Practice)
3. **Analyze ALWAYS generates ALL 4 fields** - even if input was title-only
4. **Refactor Stage 5 services** to work with nested objects (not flattened strings)
5. **Add helper functions** for formatting nested data in prompts
6. **Update all tests** to use full schema
7. **NO transformation layer** - single source of truth

**Critical Requirements**:
- Analyze ALWAYS generates ALL 4 enhancement fields (even if input was title-only)
- Generation ALWAYS receives full data from Analyze (100% of cases)
- ALL 4 fields REQUIRED in schema (no .optional())
- RAG usage is logic-level decision in Generation (not schema-level)

**Benefits**:
- ✅ Zero information loss
- ✅ Simpler architecture (no transformation layer)
- ✅ Aligns with RT-002 research (Generation uses full context)
- ✅ Stage 5 can access all rich data from Analyze
- ✅ Easier to maintain (one schema, not two)

**Timeline**: 3-4 days (one developer)

---

## Root Cause Analysis

### The Design Error

**When Created**: Initial Stage 5 implementation (generation-job.ts)
**Who**: Developer created simplified schema without consulting Stage 4 team
**Why**: Misunderstanding - assumed LLM prompts need flat strings for simplicity

### Incorrect Assumption

```typescript
// WRONG ASSUMPTION:
// "LLM prompts are easier with strings, so let's simplify the schema"
category: z.string()  // ❌ Lost course_category.confidence, reasoning
contextual_language: z.string()  // ❌ Lost 6 structured fields
difficulty: z.enum([...])  // ❌ This field doesn't exist in Stage 4!
```

### What Should Have Happened

```typescript
// CORRECT APPROACH (from RT-002):
// "Generation uses full context from Analyze to make reasoning decisions"
course_category: z.object({
  primary: z.enum([...]),
  confidence: z.number(),
  reasoning: z.string(),
  secondary: z.string().optional()
})  // ✅ Full context preserved
```

### Why This Violates RT-002 Architecture

From RT-002 research (lines 21-28):

> **Analyze Stage (Stage 4)** → Section-level structure:
> - ✅ Document analysis (themes, concept graph, patterns)
> - ✅ Pedagogical strategy (theory/practice balance, approach)
> - ✅ Section breakdown (3-7 sections, high-level objectives)
> - ✅ Generation guidance (tone, constraints, examples)

**Generation needs ALL this rich data** to make reasoning decisions. Simplifying to flat strings loses critical context.

### Architectural Principle Violated

**RT-002 Key Insight** (line 28):
> "Over-specification in Analyze reduces quality by 15-30%. Let reasoning models reason."

**BUT**: Providing LESS data than Analyze produced also reduces quality. Generation needs:
- `confidence` scores to assess reliability
- `reasoning` explanations to understand context
- All 6 `contextual_language` fields for nuanced prompt construction
- `course_category.secondary` for hybrid courses

**Conclusion**: The simplified schema violated the principle of "letting Generation reason" by removing the data it needs to reason about.

---

## Architecture Context (RT-002)

### Division of Labor

From `rt-002-architecture-balance.md` (lines 12-28):

#### Analyze Stage (Stage 4)
**Models**: Gemini 2.5 Flash (1M tokens context)
**Purpose**: Process large documents, extract structure
**Output**: FULL `AnalysisResult` with:
- Nested objects with confidence scores
- 6-field contextual_language for nuanced guidance
- Pedagogical patterns from document analysis
- Section-level structure (3-7 sections)

#### Generation Stage (Stage 5)
**Models**: qwen3-max (128K context), OSS 120B
**Purpose**: Reasoning and detailed content creation
**Input**: FULL `AnalysisResult` from Stage 4
**Output**: Lesson-level detail (3-5 lessons per section)

### Why Full Schema Matters

From `rt-002-full-analysis.md` (lines 65-100):

Generation must:
1. **Assess confidence**: Use `course_category.confidence` to determine how strictly to follow guidance
2. **Understand reasoning**: Use `course_category.reasoning` to grasp Analyze's logic
3. **Nuanced prompts**: Use all 6 `contextual_language` fields for different prompt contexts
4. **Adaptive decisions**: Use `pedagogical_patterns` to maintain consistency

**Example**:
```typescript
// Generation reasoning with FULL data:
if (analysis.course_category.confidence < 0.7) {
  // Low confidence → be more flexible with categorization
  tone = 'exploratory';
} else if (analysis.course_category.confidence > 0.9) {
  // High confidence → strictly follow category constraints
  tone = 'authoritative';
}

// Use specific contextual language fields in different contexts:
lessonIntro = analysis.contextual_language.why_matters_context;
exerciseMotivation = analysis.contextual_language.motivators;
practicalExamples = analysis.contextual_language.practical_benefit_focus;
```

**With simplified schema**: ALL this reasoning is impossible.

---

## Problem Statement

### Current Broken State

#### Stage 4 Output (CORRECT - analysis-result.ts)

```typescript
export interface AnalysisResult {
  // FULL nested objects
  course_category: {
    primary: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic';
    confidence: number; // 0-1
    reasoning: string;
    secondary?: string | null;
  };

  contextual_language: {
    why_matters_context: string;    // 50-300 chars
    motivators: string;             // 100-600 chars
    experience_prompt: string;      // 100-600 chars
    problem_statement_context: string;  // 50-300 chars
    knowledge_bridge: string;       // 100-600 chars
    practical_benefit_focus: string;    // 100-600 chars
  };

  topic_analysis: {
    determined_topic: string;
    target_audience: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
    key_concepts: string[];
    // ... 5 more fields
  };

  pedagogical_strategy: {
    teaching_style: 'hands-on' | 'theory-first' | 'project-based' | 'mixed';
    assessment_approach: string;
    practical_focus: 'high' | 'medium' | 'low';
    progression_logic: string;
    interactivity_level: 'high' | 'medium' | 'low';
  };

  // Optional enhancement fields (already in schema)
  pedagogical_patterns?: {
    primary_strategy: 'problem-based learning' | 'lecture-based' | 'inquiry-based' | 'project-based' | 'mixed';
    theory_practice_ratio: string;
    assessment_types: string[];
    key_patterns: string[];
  };

  generation_guidance?: {
    tone: string;
    use_analogies: boolean;
    specific_analogies?: string[];
    avoid_jargon: string[];
    include_visuals: string[];
    exercise_types: string[];
    contextual_language_hints: string;
    real_world_examples?: string[];
  };

  recommended_structure: {
    total_sections: number;
    total_lessons: number;
    sections_breakdown: SectionBreakdown[];
    // ... other fields
  };

  // ... other fields
}
```

#### Stage 5 Input (INCORRECT - generation-job.ts)

```typescript
// ❌ WRONG: Simplified schema that doesn't match Stage 4
export const AnalysisResultSchema = z.object({
  // FLAT fields (missing nested structure)
  category: z.string(),  // ❌ Should be course_category.primary
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),  // ❌ Should be topic_analysis.target_audience
  contextual_language: z.string(),  // ❌ Should be object with 6 fields
  pedagogical_strategy: z.string(),  // ❌ Should be object with 5 fields

  // MISSING fields
  // ❌ No course_category.confidence
  // ❌ No course_category.reasoning
  // ❌ No pedagogical_patterns
  // ❌ No generation_guidance
  // ❌ No topic_analysis (except determined_topic, key_concepts extracted)

  // Some correct fields
  recommended_structure: z.object({...}),  // ✅ Correct
  determined_topic: z.string(),  // ✅ Correct (but should be in topic_analysis)
  key_concepts: z.array(z.string()),  // ✅ Correct (but should be in topic_analysis)
});
```

### Validation Failures

From investigation report `INV-2025-11-11-003`:

```json
{
  "level": 50,
  "phase": "validate_input",
  "errors": [
    "analysis_result.category: Required",  // ❌ Doesn't exist in Stage 4
    "analysis_result.difficulty: Required",  // ❌ Doesn't exist in Stage 4
    "analysis_result.contextual_language: Expected string, received object",  // ❌ Type mismatch
    "analysis_result.pedagogical_strategy: Expected string, received object"  // ❌ Type mismatch
  ]
}
```

### Stage 5 Code Failures

**File**: `section-batch-generator.ts:655-658`

```typescript
// ❌ BROKEN: Tries to access non-existent fields
prompt += `**Analysis Context** (from Stage 4):
- Difficulty: ${input.analysis_result.difficulty}  // ❌ DOESN'T EXIST
- Category: ${input.analysis_result.category}  // ❌ DOESN'T EXIST
- Pedagogical Strategy: ${input.analysis_result.pedagogical_strategy}  // ❌ WRONG TYPE (object, not string)
- Topic: ${input.analysis_result.determined_topic}  // ❌ WRONG LOCATION (should be topic_analysis.determined_topic)
`;
```

**File**: `metadata-generator.ts:312-315`

```typescript
// ❌ BROKEN: Same issues
const analysis = input.analysis_result!;
prompt += `**Analysis Context**:
- Category: ${analysis.category}  // ❌ DOESN'T EXIST
- Difficulty: ${analysis.difficulty}  // ❌ DOESN'T EXIST
- Strategy: ${analysis.pedagogical_strategy}  // ❌ WRONG TYPE
`;
```

---

## Solution Design

### Approach: Full Schema Unification

**Decision**: Modify Stage 5 to accept and use FULL `AnalysisResult` schema from Stage 4.

**Rationale**:
1. ✅ **Aligns with RT-002** - Generation uses full context for reasoning
2. ✅ **No information loss** - All rich data preserved
3. ✅ **Simpler architecture** - No transformation layer needed
4. ✅ **Single source of truth** - One schema definition
5. ✅ **Product in development** - No legacy data to migrate
6. ✅ **No backward compatibility needed** - Can make breaking changes

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ Stage 4: Analyze (Phase 5 Assembly)                                  │
├──────────────────────────────────────────────────────────────────────┤
│ Outputs: AnalysisResult (FULL SCHEMA)                                │
│  - course_category: { primary, confidence, reasoning, secondary }    │
│  - contextual_language: { 6 fields }                                 │
│  - topic_analysis: { 8 fields }                                      │
│  - pedagogical_strategy: { 5 fields }                                │
│  - pedagogical_patterns: { 4 fields } (optional)                     │
│  - generation_guidance: { 8 fields } (optional)                      │
│  - recommended_structure: { ... }                                    │
│  ↓                                                                    │
│ Saves to courses.analysis_result (JSONB) ✅ NO CHANGES               │
└──────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│ DATABASE: courses.analysis_result (JSONB)                            │
│  - Stores FULL schema (same as Stage 4 output)                       │
└──────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Stage 5: Generation Handler                                          │
├──────────────────────────────────────────────────────────────────────┤
│ 1. Read from database (FULL schema) ✅ NO CHANGES                    │
│ 2. **UPDATED** Validate with unified AnalysisResultSchema            │
│     - Accept FULL nested objects                                     │
│     - Validate all rich fields                                       │
│ 3. Pass FULL schema to Generation workflow                           │
└──────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Generation Services (5 phases)                                       │
├──────────────────────────────────────────────────────────────────────┤
│ **UPDATED** Use FULL schema:                                         │
│  - Access course_category.primary, confidence, reasoning             │
│  - Use all 6 contextual_language fields                              │
│  - Access topic_analysis.target_audience (not "difficulty")          │
│  - Use pedagogical_strategy object (not string)                      │
│  - Access pedagogical_patterns for consistency                       │
│  - Access generation_guidance for constraints                        │
│                                                                       │
│ Helper functions added:                                              │
│  - formatCourseCategoryForPrompt()                                   │
│  - formatContextualLanguageForPrompt()                               │
│  - formatPedagogicalStrategyForPrompt()                              │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Changes

#### 1. Update AnalysisResultSchema (generation-job.ts)

**Change from** (lines 24-54):
```typescript
export const AnalysisResultSchema = z.object({
  category: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  contextual_language: z.string(),
  pedagogical_strategy: z.string(),
  // ... simplified fields
});
```

**Change to**:
```typescript
// Import from shared types (DRY principle)
import { AnalysisResultSchema as FullAnalysisResultSchema } from '@megacampus/shared-types/analysis-result';

// Use the SAME schema as Stage 4 output
export const AnalysisResultSchema = FullAnalysisResultSchema;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
```

**Alternative** (if Zod schema doesn't exist in analysis-result.ts):
Create Zod validator from TypeScript interface:

```typescript
// NEW FILE: packages/shared-types/src/analysis-result-validator.ts
import { z } from 'zod';
import type { AnalysisResult, SectionBreakdown, ExpansionArea, ResearchFlag } from './analysis-result';

export const CourseCategorySchema = z.object({
  primary: z.enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  secondary: z.enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic']).optional().nullable(),
});

export const ContextualLanguageSchema = z.object({
  why_matters_context: z.string().min(50).max(300),
  motivators: z.string().min(100).max(600),
  experience_prompt: z.string().min(100).max(600),
  problem_statement_context: z.string().min(50).max(300),
  knowledge_bridge: z.string().min(100).max(600),
  practical_benefit_focus: z.string().min(100).max(600),
});

export const TopicAnalysisSchema = z.object({
  determined_topic: z.string().min(3).max(200),
  information_completeness: z.number().min(0).max(100),
  complexity: z.enum(['narrow', 'medium', 'broad']),
  reasoning: z.string().min(50),
  target_audience: z.enum(['beginner', 'intermediate', 'advanced', 'mixed']),
  missing_elements: z.array(z.string()).nullable(),
  key_concepts: z.array(z.string()).min(3).max(10),
  domain_keywords: z.array(z.string()).min(5).max(15),
});

export const PedagogicalStrategySchema = z.object({
  teaching_style: z.enum(['hands-on', 'theory-first', 'project-based', 'mixed']),
  assessment_approach: z.string().min(50).max(200),
  practical_focus: z.enum(['high', 'medium', 'low']),
  progression_logic: z.string().min(100).max(500),
  interactivity_level: z.enum(['high', 'medium', 'low']),
});

export const PedagogicalPatternsSchema = z.object({
  primary_strategy: z.enum(['problem-based learning', 'lecture-based', 'inquiry-based', 'project-based', 'mixed']),
  theory_practice_ratio: z.string().regex(/^\d{1,2}:\d{1,2}$/),
  assessment_types: z.array(z.enum(['coding', 'quizzes', 'projects', 'essays', 'presentations', 'peer-review'])).min(1).max(5),
  key_patterns: z.array(z.string()).min(1).max(5),
}).optional();

export const GenerationGuidanceSchema = z.object({
  tone: z.enum(['conversational but precise', 'formal academic', 'casual friendly', 'technical professional']),
  use_analogies: z.boolean(),
  specific_analogies: z.array(z.string()).optional(),
  avoid_jargon: z.array(z.string()),
  include_visuals: z.array(z.enum(['diagrams', 'flowcharts', 'code examples', 'screenshots', 'animations', 'plots'])),
  exercise_types: z.array(z.enum(['coding', 'derivation', 'interpretation', 'debugging', 'refactoring', 'analysis'])),
  contextual_language_hints: z.string().min(50).max(300),
  real_world_examples: z.array(z.string()).optional(),
}).optional();

export const SectionBreakdownSchema = z.object({
  area: z.string(),
  estimated_lessons: z.number().int().min(1),
  importance: z.enum(['core', 'important', 'optional']),
  learning_objectives: z.array(z.string()).min(2).max(5),
  key_topics: z.array(z.string()).min(3).max(8),
  pedagogical_approach: z.string().min(50).max(200),
  difficulty_progression: z.enum(['flat', 'gradual', 'steep']),
  // Enhanced fields (optional)
  section_id: z.string().optional(),
  estimated_duration_hours: z.number().min(0.5).max(20).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  prerequisites: z.array(z.string()).optional(),
});

export const RecommendedStructureSchema = z.object({
  estimated_content_hours: z.number().min(0.5).max(200),
  scope_reasoning: z.string().min(100).max(500),
  lesson_duration_minutes: z.number().int().min(3).max(45),
  calculation_explanation: z.string().min(50).max(300),
  total_lessons: z.number().int().min(10).max(100),
  total_sections: z.number().int().min(1).max(30),
  scope_warning: z.string().nullable(),
  sections_breakdown: z.array(SectionBreakdownSchema),
});

export const ExpansionAreaSchema = z.object({
  area: z.string(),
  priority: z.enum(['critical', 'important', 'nice-to-have']),
  specific_requirements: z.array(z.string()).min(1).max(5),
  estimated_lessons: z.number().int().min(1).max(10),
});

export const ResearchFlagSchema = z.object({
  topic: z.string(),
  reason: z.string(),
  context: z.string().min(50).max(200),
});

export const AnalysisResultMetadataSchema = z.object({
  analysis_version: z.string(),
  total_duration_ms: z.number(),
  phase_durations_ms: z.record(z.string(), z.number()),
  model_usage: z.record(z.string(), z.string()),
  total_tokens: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  total_cost_usd: z.number(),
  retry_count: z.number(),
  quality_scores: z.record(z.string(), z.number()),
  created_at: z.string().datetime(),
});

// FULL AnalysisResult schema matching TypeScript interface
export const AnalysisResultSchema = z.object({
  course_category: CourseCategorySchema,
  contextual_language: ContextualLanguageSchema,
  topic_analysis: TopicAnalysisSchema,
  recommended_structure: RecommendedStructureSchema,
  pedagogical_strategy: PedagogicalStrategySchema,
  pedagogical_patterns: PedagogicalPatternsSchema,
  scope_instructions: z.string().min(100).max(800),
  generation_guidance: GenerationGuidanceSchema,
  content_strategy: z.enum(['create_from_scratch', 'expand_and_enhance', 'optimize_existing']),
  document_relevance_mapping: z.record(z.string(), z.object({
    primary_documents: z.array(z.string()),
    key_search_terms: z.array(z.string()),
    expected_topics: z.array(z.string()),
    document_processing_methods: z.record(z.string(), z.enum(['full_text', 'hierarchical'])),
  })).optional(),
  document_analysis: z.object({
    source_materials: z.array(z.string()),
    main_themes: z.array(z.object({
      theme: z.string(),
      importance: z.enum(['high', 'medium', 'low']),
      coverage: z.string(),
    })),
    complexity_assessment: z.string(),
    estimated_total_hours: z.number(),
  }).optional(),
  expansion_areas: z.array(ExpansionAreaSchema).nullable(),
  research_flags: z.array(ResearchFlagSchema),
  metadata: AnalysisResultMetadataSchema,
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
```

Then in `generation-job.ts`:
```typescript
import { AnalysisResultSchema } from '@megacampus/shared-types/analysis-result-validator';
```

#### 2. Add Helper Functions for Prompt Formatting

**NEW FILE**: `packages/course-gen-platform/src/services/stage5/analysis-formatters.ts`

```typescript
/**
 * Helper functions to format nested AnalysisResult fields for LLM prompts
 *
 * These functions convert rich nested objects into formatted strings suitable
 * for prompt construction while preserving semantic information.
 *
 * @module services/stage5/analysis-formatters
 */

import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';

/**
 * Format course_category for prompt inclusion
 *
 * Converts nested object with confidence and reasoning into readable format.
 * Includes confidence level and optional secondary category.
 *
 * @example
 * Input: { primary: 'professional', confidence: 0.95, reasoning: 'Technical content', secondary: 'academic' }
 * Output: "Professional (95% confidence, also Academic)\nReasoning: Technical content"
 */
export function formatCourseCategoryForPrompt(category: AnalysisResult['course_category']): string {
  const confidence = Math.round(category.confidence * 100);
  const secondary = category.secondary ? `, also ${capitalize(category.secondary)}` : '';

  return `${capitalize(category.primary)} (${confidence}% confidence${secondary})
Reasoning: ${category.reasoning}`;
}

/**
 * Format contextual_language for prompt inclusion
 *
 * Strategies:
 * - FULL: Include all 6 fields with headers (use for course-level prompts)
 * - SUMMARY: Concatenate key fields (use for lesson-level prompts with token limits)
 * - SPECIFIC: Extract one field by key (use for targeted contexts)
 *
 * @example
 * formatContextualLanguageForPrompt(contextual, 'full')
 * // Output:
 * // Why it matters: [why_matters_context]
 * // Motivators: [motivators]
 * // ...
 */
export function formatContextualLanguageForPrompt(
  contextual: AnalysisResult['contextual_language'],
  strategy: 'full' | 'summary' | keyof AnalysisResult['contextual_language'] = 'full'
): string {
  if (strategy === 'full') {
    return `Why it matters: ${contextual.why_matters_context}

Motivators: ${contextual.motivators}

Experience: ${contextual.experience_prompt}

Problem context: ${contextual.problem_statement_context}

Knowledge bridge: ${contextual.knowledge_bridge}

Practical benefits: ${contextual.practical_benefit_focus}`;
  }

  if (strategy === 'summary') {
    return `${contextual.why_matters_context} ${contextual.motivators} ${contextual.practical_benefit_focus}`;
  }

  // Specific field
  return contextual[strategy];
}

/**
 * Format pedagogical_strategy for prompt inclusion
 *
 * Converts 5-field object into structured string with clear sections.
 * Use for maintaining pedagogical consistency across lessons.
 */
export function formatPedagogicalStrategyForPrompt(strategy: AnalysisResult['pedagogical_strategy']): string {
  return `Teaching Style: ${strategy.teaching_style}
Assessment: ${strategy.assessment_approach}
Practical Focus: ${strategy.practical_focus}
Progression: ${strategy.progression_logic}
Interactivity: ${strategy.interactivity_level}`;
}

/**
 * Format pedagogical_patterns for prompt inclusion (if present)
 *
 * Enhanced field for quality improvement - use to maintain consistency
 * in exercise types, theory/practice balance.
 */
export function formatPedagogicalPatternsForPrompt(patterns?: AnalysisResult['pedagogical_patterns']): string {
  if (!patterns) return '';

  return `Primary Strategy: ${patterns.primary_strategy}
Theory:Practice Ratio: ${patterns.theory_practice_ratio}
Assessment Types: ${patterns.assessment_types.join(', ')}
Key Patterns: ${patterns.key_patterns.join('; ')}`;
}

/**
 * Format generation_guidance for prompt inclusion (if present)
 *
 * Enhanced field for quality improvement - use as constraints for generation.
 */
export function formatGenerationGuidanceForPrompt(guidance?: AnalysisResult['generation_guidance']): string {
  if (!guidance) return '';

  const analogies = guidance.specific_analogies?.length
    ? `\nAnalogies to use: ${guidance.specific_analogies.join(', ')}`
    : '';

  const examples = guidance.real_world_examples?.length
    ? `\nReal-world examples: ${guidance.real_world_examples.join(', ')}`
    : '';

  return `Tone: ${guidance.tone}
Use analogies: ${guidance.use_analogies ? 'Yes' : 'No'}${analogies}
Avoid jargon: ${guidance.avoid_jargon.join(', ')}
Include visuals: ${guidance.include_visuals.join(', ')}
Exercise types: ${guidance.exercise_types.join(', ')}
Audience: ${guidance.contextual_language_hints}${examples}`;
}

/**
 * Get difficulty level from topic_analysis.target_audience
 *
 * Maps target_audience to difficulty (for backward compatibility with old code).
 * Note: Prefer using topic_analysis.target_audience directly in new code.
 */
export function getDifficultyFromAnalysis(analysis: AnalysisResult): 'beginner' | 'intermediate' | 'advanced' {
  const audience = analysis.topic_analysis.target_audience;

  // Map 'mixed' to 'intermediate' as default
  if (audience === 'mixed') return 'intermediate';

  return audience;
}

/**
 * Get category string from course_category.primary
 *
 * For backward compatibility with old code that expected flat 'category' field.
 * Note: Prefer using course_category directly in new code to access confidence.
 */
export function getCategoryFromAnalysis(analysis: AnalysisResult): string {
  return analysis.course_category.primary;
}

// Helper function
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

#### 3. Update Stage 5 Services

**File**: `section-batch-generator.ts:655-658`

**Change from**:
```typescript
if (input.analysis_result) {
  prompt += `**Analysis Context** (from Stage 4):
- Difficulty: ${input.analysis_result.difficulty}
- Category: ${input.analysis_result.category}
- Pedagogical Strategy: ${input.analysis_result.pedagogical_strategy}
- Topic: ${input.analysis_result.determined_topic}
`;
}
```

**Change to**:
```typescript
import {
  formatCourseCategoryForPrompt,
  formatPedagogicalStrategyForPrompt,
  formatContextualLanguageForPrompt,
  getDifficultyFromAnalysis
} from './analysis-formatters';

if (input.analysis_result) {
  const difficulty = getDifficultyFromAnalysis(input.analysis_result);
  const category = formatCourseCategoryForPrompt(input.analysis_result.course_category);
  const strategy = formatPedagogicalStrategyForPrompt(input.analysis_result.pedagogical_strategy);
  const topic = input.analysis_result.topic_analysis.determined_topic;

  prompt += `**Analysis Context** (from Stage 4):
- Difficulty: ${difficulty}
- Category: ${category}
- Pedagogical Strategy:
${strategy}
- Topic: ${topic}
- Key Concepts: ${input.analysis_result.topic_analysis.key_concepts.join(', ')}
`;

  // Optional: Include contextual language for richer context
  if (input.analysis_result.contextual_language) {
    const contextual = formatContextualLanguageForPrompt(
      input.analysis_result.contextual_language,
      'summary' // Use summary to save tokens
    );
    prompt += `- Context: ${contextual}\n`;
  }

  // Optional: Include pedagogical patterns if available (quality enhancement)
  if (input.analysis_result.pedagogical_patterns) {
    const patterns = formatPedagogicalPatternsForPrompt(input.analysis_result.pedagogical_patterns);
    prompt += `\n**Pedagogical Patterns**:\n${patterns}\n`;
  }

  // Optional: Include generation guidance if available (quality enhancement)
  if (input.analysis_result.generation_guidance) {
    const guidance = formatGenerationGuidanceForPrompt(input.analysis_result.generation_guidance);
    prompt += `\n**Generation Constraints**:\n${guidance}\n`;
  }
}
```

**File**: `metadata-generator.ts:312-315`

**Change from**:
```typescript
const analysis = input.analysis_result!;
prompt += `**Analysis Context**:
- Category: ${analysis.category}
- Difficulty: ${analysis.difficulty}
- Strategy: ${analysis.pedagogical_strategy}
`;
```

**Change to**:
```typescript
import {
  formatCourseCategoryForPrompt,
  formatPedagogicalStrategyForPrompt,
  getDifficultyFromAnalysis
} from './analysis-formatters';

const analysis = input.analysis_result!;
const difficulty = getDifficultyFromAnalysis(analysis);
const category = formatCourseCategoryForPrompt(analysis.course_category);
const strategy = formatPedagogicalStrategyForPrompt(analysis.pedagogical_strategy);

prompt += `**Analysis Context**:
- Category: ${category}
- Difficulty: ${difficulty}
- Pedagogical Strategy:
${strategy}
- Topic: ${analysis.topic_analysis.determined_topic}
`;
```

**File**: `generation-phases.ts:725`

**Change from**:
```typescript
parts.push(input.analysis_result.pedagogical_strategy);
```

**Change to**:
```typescript
import { formatPedagogicalStrategyForPrompt } from './analysis-formatters';

const strategyFormatted = formatPedagogicalStrategyForPrompt(input.analysis_result.pedagogical_strategy);
parts.push(strategyFormatted);
```

---

## Implementation Plan

### Phase 1: Schema Unification (Day 1)

**Tasks**:
1. ✅ Create Zod validator for full AnalysisResult
   - File: `packages/shared-types/src/analysis-result-validator.ts` (NEW)
   - Export `AnalysisResultSchema` matching TypeScript interface
   - Include all nested objects, optional fields
   - Add validation rules (min/max lengths, enums)

2. ✅ Update generation-job.ts to use full schema
   - File: `packages/shared-types/src/generation-job.ts`
   - Replace simplified `AnalysisResultSchema` with import from `analysis-result-validator.ts`
   - Update type exports
   - Remove old flat schema definition

3. ✅ Create helper functions for prompt formatting
   - File: `packages/course-gen-platform/src/services/stage5/analysis-formatters.ts` (NEW)
   - Implement all 7 helper functions
   - Add JSDoc documentation with examples
   - Add unit tests

**Estimated Effort**: 4-6 hours

**Files to Create**:
- `packages/shared-types/src/analysis-result-validator.ts`
- `packages/course-gen-platform/src/services/stage5/analysis-formatters.ts`
- `packages/course-gen-platform/tests/unit/stage5/analysis-formatters.test.ts`

**Files to Modify**:
- `packages/shared-types/src/generation-job.ts` (replace schema)

---

### Phase 2: Update Stage 5 Services (Day 2)

**Tasks**:
1. ✅ Update section-batch-generator.ts
   - Import helper functions
   - Replace flat field access with formatters
   - Update prompt construction (lines 655-658, other locations)
   - Add optional pedagogical_patterns, generation_guidance usage

2. ✅ Update metadata-generator.ts
   - Import helper functions
   - Replace flat field access with formatters
   - Update prompt construction (lines 312-315, other locations)

3. ✅ Update generation-phases.ts
   - Import helper functions
   - Replace direct pedagogical_strategy usage
   - Update other field access points

4. ✅ Search and update all other Stage 5 files
   - Run: `grep -r "analysis_result\.\(category\|difficulty\|contextual_language\|pedagogical_strategy\)" packages/course-gen-platform/src/services/stage5/`
   - Update all occurrences

**Estimated Effort**: 6-8 hours

**Files to Modify**:
- `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
- `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`
- `packages/course-gen-platform/src/services/stage5/generation-phases.ts`
- Other Stage 5 service files as needed

---

### Phase 3: Update Tests (Day 3)

**Tasks**:
1. ✅ Update test fixtures
   - File: `tests/contract/generation.test.ts`
   - Update `createMinimalAnalysisResult()` to return FULL schema
   - Use nested objects (course_category, contextual_language, etc.)
   - Remove flat fields (category, difficulty)

2. ✅ Update all test files using analysis_result
   - Run: `grep -r "analysis_result" packages/course-gen-platform/tests/ --files-with-matches`
   - Update 15 test files identified in investigation report
   - Ensure tests use full schema

3. ✅ Add unit tests for helper functions
   - File: `tests/unit/stage5/analysis-formatters.test.ts` (NEW)
   - Test all 7 formatter functions
   - Test edge cases (optional fields, null values)
   - 100% coverage

4. ✅ Run regression tests
   - `pnpm test` (unit tests)
   - `pnpm test:contract` (contract tests - 17 tests)
   - `pnpm test:integration` (integration tests)
   - Fix any failures

**Estimated Effort**: 6-8 hours

**Files to Modify**:
- `packages/course-gen-platform/tests/contract/generation.test.ts`
- 15 test files using `analysis_result`

**Files to Create**:
- `packages/course-gen-platform/tests/unit/stage5/analysis-formatters.test.ts`

---

### Phase 4: Documentation and Validation (Day 4)

**Tasks**:
1. ✅ Update documentation
   - Update `docs/008-generation-generation-json/data-model.md`
     - Document unified schema approach
     - Update schema diagrams
     - Add note about helper functions
   - Update `docs/FUTURE/enhance-analyze-schema-for-generation.md`
     - Mark as superseded by this spec
     - Reference new unified approach
   - Create migration guide: `docs/migrations/MIGRATION-unified-schemas.md`

2. ✅ Run type-check
   - `pnpm type-check` (ensure no TypeScript errors)
   - Fix any type mismatches

3. ✅ Run linter
   - `pnpm lint` (ensure code quality)
   - Fix any lint errors

4. ✅ Manual testing
   - Test Stage 4 → Stage 5 pipeline with real data
   - Verify validation passes
   - Verify prompts are correctly formatted
   - Check that optional fields (pedagogical_patterns, generation_guidance) work

**Estimated Effort**: 4-6 hours

**Files to Create**:
- `docs/migrations/MIGRATION-unified-schemas.md`

**Files to Modify**:
- `docs/008-generation-generation-json/data-model.md`
- `docs/FUTURE/enhance-analyze-schema-for-generation.md`

---

### Phase 5: Final Validation and Commit (Day 4)

**Tasks**:
1. ✅ Run full test suite
   - Verify all unit tests pass
   - Verify all contract tests pass (17/17)
   - Verify all integration tests pass
   - Zero regressions

2. ✅ Verify acceptance criteria
   - Check all items in Acceptance Criteria section

3. ✅ Commit changes
   - Use `/push minor` (breaking change to generation-job.ts schema)
   - Version bump to 0.17.0
   - Comprehensive commit message

**Estimated Effort**: 2-3 hours

---

## Testing Strategy

### Unit Tests (NEW)

**File**: `packages/course-gen-platform/tests/unit/stage5/analysis-formatters.test.ts`

**Test Cases**:
1. ✅ `formatCourseCategoryForPrompt()`
   - Test with all category types
   - Test with/without secondary category
   - Test confidence formatting (0.95 → 95%)

2. ✅ `formatContextualLanguageForPrompt()`
   - Test 'full' strategy (all 6 fields)
   - Test 'summary' strategy (concatenated)
   - Test specific field extraction

3. ✅ `formatPedagogicalStrategyForPrompt()`
   - Test all 5 fields formatted correctly
   - Test different teaching_style values

4. ✅ `formatPedagogicalPatternsForPrompt()`
   - Test with valid patterns object
   - Test with undefined (optional field)

5. ✅ `formatGenerationGuidanceForPrompt()`
   - Test with all fields
   - Test with optional fields (analogies, examples)
   - Test with undefined (optional field)

6. ✅ `getDifficultyFromAnalysis()`
   - Test 'beginner' → 'beginner'
   - Test 'intermediate' → 'intermediate'
   - Test 'advanced' → 'advanced'
   - Test 'mixed' → 'intermediate' (default)

7. ✅ `getCategoryFromAnalysis()`
   - Test extraction of primary category

**Coverage Target**: 100%

---

### Contract Tests (MODIFY EXISTING)

**File**: `packages/course-gen-platform/tests/contract/generation.test.ts`

**Changes**:
1. ✅ Update `createMinimalAnalysisResult()` (lines 64-141)
   - Return FULL schema with nested objects
   - Remove flat fields (category, difficulty)
   - Add all required nested objects

2. ✅ Update `createTestCourseWithStructure()` (line 393)
   - Ensure `language` and `style` are set
   - Use updated `createMinimalAnalysisResult()`

3. ✅ Verify all 17 tests pass
   - "should regenerate section successfully" (previously failing)
   - All other contract tests

**Expected Result**: 17/17 tests passing (currently 16/17)

---

### Integration Tests (RUN ALL)

**Files**: 30+ integration test files

**Action**: Run `pnpm test:integration` and verify all pass

**Focus Areas**:
- Stage 4 → Stage 5 pipeline
- Analysis pipeline (Phase 5 Assembly → Generation)
- E2E tests (full pipeline)

---

### Regression Tests (CRITICAL)

**Action**: Run FULL test suite after implementation

**Commands**:
```bash
# Unit tests
pnpm test

# Contract tests
pnpm test:contract

# Integration tests
pnpm test:integration

# Type check
pnpm type-check

# Lint
pnpm lint
```

**Success Criteria**: 100% pass rate (no regressions)

---

## Acceptance Criteria

### Must Have (BLOCKING)

- [ ] ✅ Zod validator for full AnalysisResult created and exported
- [ ] ✅ generation-job.ts uses full schema (no simplified version)
- [ ] ✅ All 7 helper functions implemented with tests (100% coverage)
- [ ] ✅ section-batch-generator.ts updated to use full schema
- [ ] ✅ metadata-generator.ts updated to use full schema
- [ ] ✅ generation-phases.ts updated to use full schema
- [ ] ✅ All contract tests pass (17/17)
- [ ] ✅ All integration tests pass
- [ ] ✅ No type errors (`pnpm type-check` passes)
- [ ] ✅ No lint errors (`pnpm lint` passes)
- [ ] ✅ Test fixtures use full schema (no flat fields)
- [ ] ✅ Documentation updated (data model, migration guide)

### Should Have (IMPORTANT)

- [ ] ✅ Stage 5 services use pedagogical_patterns (if available)
- [ ] ✅ Stage 5 services use generation_guidance (if available)
- [ ] ✅ Helper functions handle optional fields gracefully
- [ ] ✅ Manual testing confirms Stage 4 → Stage 5 pipeline works
- [ ] ✅ Prompts are correctly formatted with rich context

### Could Have (NICE-TO-HAVE)

- [ ] ⏳ Add examples in documentation showing helper function usage
- [ ] ⏳ Create utility script to validate existing analysis_result data
- [ ] ⏳ Add logging to track usage of optional fields (pedagogical_patterns, generation_guidance)

---

## Risks and Mitigation

### High Risk

**Risk 1: Type Errors in Zod Schema**
- **Description**: Zod schema may not perfectly match TypeScript interface
- **Mitigation**: Use TypeScript's `satisfies` operator to validate, comprehensive unit tests
- **Impact**: MEDIUM (solvable, but time-consuming)

**Risk 2: Test Regressions**
- **Description**: Updating 15 test files may introduce new failures
- **Mitigation**: Update tests incrementally, run after each file change, use Git to track
- **Impact**: MEDIUM (time-consuming but solvable)

### Medium Risk

**Risk 3: Prompt Quality Changes**
- **Description**: Formatted prompts may differ from original, affecting LLM output
- **Mitigation**: Review formatted prompts manually, compare before/after, A/B test if needed
- **Impact**: LOW (semantic similarity validation will catch quality issues)

**Risk 4: Missing Usage Locations**
- **Description**: May miss some files that access analysis_result fields
- **Mitigation**: Use comprehensive grep search, type-check will catch compile errors
- **Impact**: LOW (TypeScript catches at compile time)

### Low Risk

**Risk 5: Optional Fields Not Used**
- **Description**: pedagogical_patterns, generation_guidance may not be populated by Stage 4 yet
- **Mitigation**: Helper functions handle undefined gracefully, add defaults
- **Impact**: VERY LOW (optional fields are optional, system works without them)

---

## Success Metrics

### Technical Metrics

- ✅ **Schema Validation Pass Rate:** 100% (no validation errors)
- ✅ **Type Coverage:** 100% (no `any` types in updated code)
- ✅ **Test Pass Rate:** 100% (unit + contract + integration)
- ✅ **Helper Function Coverage:** 100%

### Business Metrics

- ✅ **Stage 4 → Stage 5 Pipeline:** Works without transformation layer
- ✅ **Information Preservation:** 100% (no data loss)
- ✅ **Maintainability:** Single source of truth for schema
- ✅ **RT-002 Compliance:** Generation has access to full Analyze context

### Quality Metrics (OPTIONAL - Monitor After Deployment)

- [ ] **Generation Quality:** No regression in semantic similarity scores (≥0.75)
- [ ] **Pedagogical Consistency:** Maintained across lessons
- [ ] **Prompt Effectiveness:** LLMs use rich context appropriately

---

## Timeline

**Total Estimated Effort:** 3-4 days (1 developer)

| Phase | Days | Tasks |
|-------|------|-------|
| **Phase 1: Schema Unification** | 0.5-0.75 | Create Zod validator, update generation-job.ts, create helpers |
| **Phase 2: Update Stage 5 Services** | 0.75-1 | Update section-batch-generator, metadata-generator, generation-phases, others |
| **Phase 3: Update Tests** | 0.75-1 | Update fixtures, 15 test files, add helper tests, run regression |
| **Phase 4: Documentation & Validation** | 0.5-0.75 | Update docs, type-check, lint, manual testing |
| **Phase 5: Final Validation** | 0.25-0.5 | Full test suite, acceptance criteria, commit |

**Critical Path:** Phase 1 → Phase 2 → Phase 3 (cannot parallelize)

**Buffer:** +0.5 day for unexpected issues (total 3.5-4.5 days)

---

## References

### Related Documents

- **Research:** `specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md`
- **Research:** `specs/008-generation-generation-json/research-decisions/rt-002-full-analysis.md`
- **Investigation:** `docs/investigations/INV-2025-11-11-003-regenerate-section-validation-failures.md`
- **Old Spec (Superseded):** `docs/FUTURE/SPEC-2025-11-11-001-stage4-stage5-schema-mismatch.md`
- **Enhancement Task:** `docs/FUTURE/enhance-analyze-schema-for-generation.md`

### Code References

- **Stage 4 Output:** `packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts:228-263`
- **Stage 4 Schema:** `packages/shared-types/src/analysis-result.ts`
- **Stage 5 Input (BROKEN):** `packages/shared-types/src/generation-job.ts:24-54`
- **Stage 5 Usage:** `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts:655-658`
- **Test Fixtures:** `packages/course-gen-platform/tests/contract/generation.test.ts:64-94`

### Schema Definitions

- **FULL Schema (Correct):** `packages/shared-types/src/analysis-result.ts`
- **SIMPLIFIED Schema (Incorrect):** `packages/shared-types/src/generation-job.ts` (to be replaced)

---

**Status:** ⏭️ READY FOR IMPLEMENTATION
**Owner:** TBD (assign to backend engineer)
**Created:** 2025-11-12
**Last Updated:** 2025-11-12
