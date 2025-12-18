# Schema Unification - Implementation Tasks

**Source**: `docs/FUTURE/SPEC-2025-11-12-001-unify-stage4-stage5-schemas.md`
**Owner**: Backend Team (Stage 4/Stage 5 schemas collaboration)
**Total Effort**: 2.5-3.5 days ✅ **REDUCED** (was 3-4 days)
**Status**: PENDING

> **🎉 DISCOVERY**: Zod schemas already exist! Full `AnalysisResultSchema` found in `packages/course-gen-platform/src/types/analysis-result.ts`. Phase 1 simplified from 4-6h to 2-3h (**saved 2-3 hours!**)

**Progress Summary**:
- ⏳ **U01-U05**: Schema unification (Zod validator, helper functions) - PENDING
- ⏳ **U06-U10**: Stage 5 services update - PENDING
- ⏳ **U11-U15**: Test updates - PENDING
- ⏳ **U16-U18**: Documentation and validation - PENDING

**Key Objectives**:
- Unify Stage 4 (Analyze) and Stage 5 (Generation) schemas
- **Generation ALWAYS receives FULL data from Analyze** (100% of cases, no exceptions)
- Eliminate schema mismatch causing validation failures
- Preserve ALL information from Analyze (no transformation layer)
- **ALL fields are REQUIRED** (no optional fields - production Best Practice)
- Align with RT-002 architecture (Generation uses full context)

**Artifacts to Create**:
1. `packages/shared-types/src/analysis-result-validator.ts` - Zod validator for full AnalysisResult
2. `packages/course-gen-platform/src/services/stage5/analysis-formatters.ts` - 7 helper functions
3. `packages/course-gen-platform/tests/unit/stage5/analysis-formatters.test.ts` - Helper tests (100% coverage)
4. `docs/migrations/MIGRATION-unified-schemas.md` - Migration guide

**Files to Modify**:
- `packages/shared-types/src/generation-job.ts` - Replace simplified schema with full schema
- `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts` - Use helper functions
- `packages/course-gen-platform/src/services/stage5/metadata-generator.ts` - Use helper functions
- `packages/course-gen-platform/src/services/stage5/generation-phases.ts` - Use helper functions
- `packages/course-gen-platform/tests/contract/generation.test.ts` - Update fixtures
- 15+ test files using `analysis_result` - Update to full schema

---

## 🎯 EXECUTION SEQUENCE

### Phase 1: Schema Unification (Day 1) - 2-3 hours (SIMPLIFIED)

**Objective**: Use existing Zod schemas and create helper functions

**DISCOVERY**: ✅ Zod schemas ALREADY EXIST!
- **Full AnalysisResultSchema**: `packages/course-gen-platform/src/types/analysis-result.ts` (lines 41-108)
- **PedagogicalPatternsSchema**: `packages/shared-types/src/analysis-schemas.ts` (lines 147-152)
- **GenerationGuidanceSchema**: `packages/shared-types/src/analysis-schemas.ts` (lines 156-166)
- **All nested schemas**: course_category, contextual_language, topic_analysis, pedagogical_strategy

**What's Missing**: Enhancement fields not yet in main schema (ALL REQUIRED):
- `pedagogical_patterns` - Analyze always generates
- `generation_guidance` - Analyze always generates
- `document_relevance_mapping` - Analyze always generates, Generation decides whether to use RAG
- `document_analysis` - Analyze always generates, Generation decides whether to use RAG

#### U01: Extend existing AnalysisResultSchema with 4 REQUIRED enhancement fields ⏳

**Task**: Add 4 REQUIRED enhancement fields to existing schema (production Best Practice)

**Architecture Note**: Analyze (Stage 4) ALWAYS generates ALL these fields, even if input was title-only. Generation (Stage 5) receives ALL fields and decides whether to use RAG.

**Files to Modify**:
- `packages/course-gen-platform/src/types/analysis-result.ts` (lines 88-91)

**Implementation**:
```typescript
// CURRENT (line 88):
  scope_instructions: z.string().min(100),
  content_strategy: z.enum(['create_from_scratch', 'expand_and_enhance', 'optimize_existing']),
  expansion_areas: z.array(ExpansionAreaSchema).nullable(),
  research_flags: z.array(ResearchFlagSchema),

// ADD AFTER line 91 (before metadata):
  // NEW: REQUIRED enhancement fields from Analyze Enhancement (production Best Practice)
  // Analyze (Stage 4) ALWAYS generates ALL these fields for Generation (architectural requirement)
  // Generation (Stage 5) receives ALL fields and decides whether to use RAG
  pedagogical_patterns: z.object({
    primary_strategy: z.enum(['problem-based learning', 'lecture-based', 'inquiry-based', 'project-based', 'mixed']),
    theory_practice_ratio: z.string().regex(/^\d+:\d+$/),
    assessment_types: z.array(z.enum(['coding', 'quizzes', 'projects', 'essays', 'presentations', 'peer-review'])),
    key_patterns: z.array(z.string()),
  }),

  generation_guidance: z.object({
    tone: z.enum(['conversational but precise', 'formal academic', 'casual friendly', 'technical professional']),
    use_analogies: z.boolean(),
    specific_analogies: z.array(z.string()),
    avoid_jargon: z.array(z.string()),
    include_visuals: z.array(z.enum(['diagrams', 'flowcharts', 'code examples', 'screenshots', 'animations', 'plots'])),
    exercise_types: z.array(z.enum(['coding', 'derivation', 'interpretation', 'debugging', 'refactoring', 'analysis'])),
    contextual_language_hints: z.string(),
    real_world_examples: z.array(z.string()),
  }),

  // REQUIRED: RAG planning fields (Analyze ALWAYS generates, Generation decides whether to use)
  document_relevance_mapping: z.record(
    z.string(),
    z.object({
      primary_documents: z.array(z.string()),
      key_search_terms: z.array(z.string()),
      expected_topics: z.array(z.string()),
      document_processing_methods: z.record(z.string(), z.enum(['full_text', 'hierarchical'])),
    })
  ),

  document_analysis: z.object({
    source_materials: z.array(z.string()),
    main_themes: z.array(z.object({
      theme: z.string(),
      importance: z.enum(['high', 'medium', 'low']),
      coverage: z.string(),
    })),
    complexity_assessment: z.string(),
    estimated_total_hours: z.number().min(0.5),
  }),

  metadata: z.object({
    // ... existing metadata fields
  }),
});
```

**Recommended Approach** (cleaner separation, Best Practice):
Create `packages/shared-types/src/analysis-result-validator.ts` that imports and extends:
```typescript
import {
  AnalysisResultSchema as BaseSchema,
  SectionBreakdownSchema,
  ExpansionAreaSchema,
  ResearchFlagSchema
} from '../../course-gen-platform/src/types/analysis-result';

import {
  PedagogicalPatternsSchema,
  GenerationGuidanceSchema,
  DocumentRelevanceMappingSchema,
  DocumentAnalysisSchema
} from './analysis-schemas';

// Extended schema with ALL fields REQUIRED (production Best Practice)
// Analyze (Stage 4) ALWAYS generates ALL fields for Generation
// Generation (Stage 5) receives ALL fields and decides whether to use RAG
export const FullAnalysisResultSchema = BaseSchema.extend({
  pedagogical_patterns: PedagogicalPatternsSchema,          // REQUIRED (Analyze always generates)
  generation_guidance: GenerationGuidanceSchema,            // REQUIRED (Analyze always generates)
  document_relevance_mapping: DocumentRelevanceMappingSchema,  // REQUIRED (Analyze always generates, Generation decides if use)
  document_analysis: DocumentAnalysisSchema,                // REQUIRED (Analyze always generates, Generation decides if use)
});

export { FullAnalysisResultSchema as AnalysisResultSchema };
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// Re-export nested schemas for convenience
export {
  SectionBreakdownSchema,
  ExpansionAreaSchema,
  ResearchFlagSchema,
  PedagogicalPatternsSchema,
  GenerationGuidanceSchema,
  DocumentRelevanceMappingSchema,
  DocumentAnalysisSchema
};
```

**Validation**:
- ✅ ALL 4 fields REQUIRED (Analyze always generates ALL fields, even if input was title-only)
- ✅ All schemas imported correctly
- ✅ Type exports work
- ✅ Generation ALWAYS receives full data from Analyze (architectural requirement)
- ✅ Generation decides whether to use RAG (not controlled by schema)

**Estimated Effort**: 30-40 minutes (down from 2 hours!)

---

#### U02: Update generation-job.ts to use full schema ⏳

**Task**: Replace simplified AnalysisResultSchema with import from existing Zod schema

**Files to Modify**:
- `packages/shared-types/src/generation-job.ts` (lines 24-54)

**Option A: Direct import from course-gen-platform** (Quick, 5 min):
```typescript
// OLD (lines 24-54) - DELETE:
export const AnalysisResultSchema = z.object({
  category: z.string(),
  difficulty: z.enum([...]),
  contextual_language: z.string(),
  // ... simplified fields
});

// NEW - REPLACE WITH:
import { AnalysisResultSchema } from '../../course-gen-platform/src/types/analysis-result';
export { AnalysisResultSchema };
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
```

**Option B: Import from new shared-types validator** (Cleaner, 10 min, requires U01 Alternative Approach):
```typescript
// OLD (lines 24-54) - DELETE:
export const AnalysisResultSchema = z.object({
  category: z.string(),
  // ... simplified fields
});

// NEW - REPLACE WITH:
import { AnalysisResultSchema } from './analysis-result-validator';
export { AnalysisResultSchema };
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
```

**Recommended**: Option A for speed, Option B for cleaner architecture

**Validation**:
- ✅ Import works correctly
- ✅ Type exports unchanged for consumers
- ✅ No breaking changes to GenerationJobInputSchema structure
- ✅ Full schema now includes all nested objects

**Estimated Effort**: 5-10 minutes (down from 15!)

---

#### U03: Create analysis-formatters.ts helper functions ⏳

**Task**: Create 7 helper functions to format nested AnalysisResult fields for prompts

**Files to Create**:
- `packages/course-gen-platform/src/services/stage5/analysis-formatters.ts`

**Functions to Implement**:

1. `formatCourseCategoryForPrompt(category)` → "Professional (95% confidence)\nReasoning: ..."
2. `formatContextualLanguageForPrompt(contextual, strategy)` → Full/Summary/Specific field
3. `formatPedagogicalStrategyForPrompt(strategy)` → "Teaching Style: hands-on\nAssessment: ..."
4. `formatPedagogicalPatternsForPrompt(patterns)` → REQUIRED patterns formatted
5. `formatGenerationGuidanceForPrompt(guidance)` → REQUIRED guidance formatted
6. `getDifficultyFromAnalysis(analysis)` → Map target_audience to difficulty
7. `getCategoryFromAnalysis(analysis)` → Extract primary category

**Key Features**:
- ✅ ALL fields REQUIRED (Analyze always generates ALL 4 enhancement fields)
- ✅ Multiple strategies for contextual_language (full/summary/specific)
- ✅ Clear formatting with headers and sections
- ✅ JSDoc documentation with examples
- ✅ Type-safe (use AnalysisResult types)
- ✅ RAG usage decision is in Generation logic (not schema-level)

**Estimated Effort**: 2 hours

---

#### U04: Add unit tests for helper functions ⏳

**Task**: Comprehensive unit tests for all 7 helper functions

**Files to Create**:
- `packages/course-gen-platform/tests/unit/stage5/analysis-formatters.test.ts`

**Test Cases** (50+ tests total):
1. formatCourseCategoryForPrompt:
   - All category types
   - With/without secondary category
   - Confidence formatting
2. formatContextualLanguageForPrompt:
   - 'full' strategy (all 6 fields)
   - 'summary' strategy (concatenated)
   - Each specific field extraction
3. formatPedagogicalStrategyForPrompt:
   - All teaching styles
   - All 5 fields present
4. formatPedagogicalPatternsForPrompt:
   - Valid patterns object (REQUIRED - Analyze always generates)
   - All fields populated
5. formatGenerationGuidanceForPrompt:
   - All fields present (REQUIRED - Analyze always generates)
   - All arrays populated (specific_analogies, real_world_examples)
6. getDifficultyFromAnalysis:
   - beginner → beginner
   - intermediate → intermediate
   - advanced → advanced
   - mixed → intermediate (default)
7. getCategoryFromAnalysis:
   - Extracts primary correctly

**Coverage Target**: 100%

**Estimated Effort**: 1.5 hours

---

#### U05: Run type-check for Phase 1 ⏳

**Task**: Verify no TypeScript errors after schema changes

**Commands**:
```bash
cd packages/shared-types
pnpm type-check

cd packages/course-gen-platform
pnpm type-check
```

**Expected Results**:
- ✅ No type errors in shared-types
- ✅ No type errors in course-gen-platform
- ✅ Imports resolve correctly
- ✅ Types exported correctly
- ✅ AnalysisResultSchema now includes all nested objects

**Note**: Since we're using existing schemas, type errors should be minimal. Most likely issues:
- Import path resolution (if using Option B in U02)
- Missing re-exports

**Estimated Effort**: 10 minutes

---

### Phase 1 Summary

**Time Saved**: 2-3 hours (was 4-6h, now 2-3h)
**Reason**: Existing Zod schemas found, only need to extend and import

**Completed Tasks**:
- [ ] U01: Extend existing AnalysisResultSchema (30-40 min)
- [ ] U02: Update generation-job.ts import (5-10 min)
- [ ] U03: Create helper functions (2h, unchanged)
- [ ] U04: Add helper tests (1.5h, unchanged)
- [ ] U05: Run type-check (10 min)

**Total Phase 1**: ~2-3 hours (down from 4-6 hours! ✅ 50% time reduction)

---

### Phase 2: Update Stage 5 Services (Day 2) - 6-8 hours

**Objective**: Update all Stage 5 services to use full schema with helper functions

#### U06: Update section-batch-generator.ts ⏳

**Task**: Replace flat field access with helper functions

**Files to Modify**:
- `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`

**Locations to Update**:
1. **Lines 655-658**: Analysis context in prompt
   ```typescript
   // OLD:
   - Difficulty: ${input.analysis_result.difficulty}
   - Category: ${input.analysis_result.category}

   // NEW:
   import { getDifficultyFromAnalysis, formatCourseCategoryForPrompt, ... } from './analysis-formatters';

   const difficulty = getDifficultyFromAnalysis(input.analysis_result);
   const category = formatCourseCategoryForPrompt(input.analysis_result.course_category);
   ```

2. **Add ALL 4 enhancement fields** (ALL REQUIRED):
   - pedagogical_patterns (Analyze always generates)
   - generation_guidance (Analyze always generates)
   - document_relevance_mapping (Analyze always generates, Generation decides if use)
   - document_analysis (Analyze always generates, Generation decides if use)

**Search Command**:
```bash
grep -n "analysis_result\.\(category\|difficulty\|contextual_language\|pedagogical_strategy\)" section-batch-generator.ts
```

**Validation**:
- ✅ All flat field access replaced
- ✅ Prompts include rich context from ALL nested fields
- ✅ ALL 4 REQUIRED fields available (Analyze always generates)
- ✅ Generation decides whether to use RAG data (logic-level decision, not schema)
- ✅ No type errors

**Estimated Effort**: 2 hours

---

#### U07: Update metadata-generator.ts ⏳

**Task**: Replace flat field access with helper functions

**Files to Modify**:
- `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`

**Locations to Update**:
1. **Lines 312-315**: Analysis context in prompt
2. **Line 257**: Language priority comment (contextual_language reference)
3. **Line 492**: Difficulty comparison

**Implementation**:
```typescript
import { getDifficultyFromAnalysis, formatCourseCategoryForPrompt, formatPedagogicalStrategyForPrompt } from './analysis-formatters';

// Update prompt construction:
const difficulty = getDifficultyFromAnalysis(analysis);
const category = formatCourseCategoryForPrompt(analysis.course_category);
const strategy = formatPedagogicalStrategyForPrompt(analysis.pedagogical_strategy);

prompt += `**Analysis Context**:
- Category: ${category}
- Difficulty: ${difficulty}
- Pedagogical Strategy:
${strategy}
`;
```

**Validation**:
- ✅ All references updated
- ✅ No type errors
- ✅ Prompts formatted correctly

**Estimated Effort**: 1.5 hours

---

#### U08: Update generation-phases.ts ⏳

**Task**: Replace direct pedagogical_strategy usage with formatter

**Files to Modify**:
- `packages/course-gen-platform/src/services/stage5/generation-phases.ts`

**Locations to Update**:
1. **Line 725**: pedagogical_strategy in parts array

**Implementation**:
```typescript
import { formatPedagogicalStrategyForPrompt } from './analysis-formatters';

// OLD:
parts.push(input.analysis_result.pedagogical_strategy);

// NEW:
const strategyFormatted = formatPedagogicalStrategyForPrompt(input.analysis_result.pedagogical_strategy);
parts.push(strategyFormatted);
```

**Validation**:
- ✅ Strategy formatted correctly
- ✅ No type errors
- ✅ Prompt construction works

**Estimated Effort**: 30 minutes

---

#### U09: Search and update all other Stage 5 files ⏳

**Task**: Find and update any remaining references in Stage 5 services

**Search Command**:
```bash
cd packages/course-gen-platform/src/services/stage5
grep -rn "analysis_result\.\(category\|difficulty\|contextual_language\|pedagogical_strategy\)" .
```

**Files to Check**:
- quality-validator.ts
- qdrant-search.ts
- cost-calculator.ts
- sanitize-course-structure.ts
- field-name-fix.ts
- Any other service files

**Action**:
- Update each occurrence with helper functions
- Ensure type safety
- Add imports

**Validation**:
- ✅ All occurrences found and updated
- ✅ No type errors across all files
- ✅ Grep search returns zero results

**Estimated Effort**: 2 hours

---

#### U10: Run type-check for Phase 2 ⏳

**Task**: Verify no TypeScript errors after Stage 5 updates

**Commands**:
```bash
cd packages/course-gen-platform
pnpm type-check
```

**Validation**:
- ✅ No type errors in Stage 5 services
- ✅ All imports resolve correctly
- ✅ Helper functions work as expected

**Estimated Effort**: 15 minutes

---

### Phase 3: Update Tests (Day 3) - 6-8 hours

**Objective**: Update all test fixtures and test files to use full schema

#### U11: Update test fixture createMinimalAnalysisResult() ⏳

**Task**: Update fixture to return FULL schema with nested objects

**Files to Modify**:
- `packages/course-gen-platform/tests/contract/generation.test.ts` (lines 64-141)

**Implementation**:
```typescript
// OLD (SIMPLIFIED):
function createMinimalAnalysisResult(title: string) {
  return {
    category: 'professional',  // ❌ Flat field
    difficulty: 'intermediate',  // ❌ Doesn't exist in Stage 4
    contextual_language: 'English',  // ❌ Should be object
    // ...
  };
}

// NEW (FULL):
function createMinimalAnalysisResult(title: string) {
  return {
    course_category: {  // ✅ Nested object
      primary: 'professional' as const,
      confidence: 0.9,
      reasoning: 'Test course for contract testing',
      secondary: null,
    },
    contextual_language: {  // ✅ 6 fields
      why_matters_context: 'Test context for learning importance',
      motivators: 'Test motivators for engagement',
      experience_prompt: 'Test experience description',
      problem_statement_context: 'Test problem context',
      knowledge_bridge: 'Test knowledge bridge',
      practical_benefit_focus: 'Test practical benefits',
    },
    topic_analysis: {  // ✅ Full object
      determined_topic: title,
      information_completeness: 80,
      complexity: 'medium' as const,
      reasoning: 'Test topic analysis',
      target_audience: 'intermediate' as const,
      missing_elements: null,
      key_concepts: ['concept1', 'concept2', 'concept3'],
      domain_keywords: ['keyword1', 'keyword2', 'keyword3', 'keyword4', 'keyword5'],
    },
    pedagogical_strategy: {  // ✅ 5 fields
      teaching_style: 'mixed' as const,
      assessment_approach: 'Test assessment approach',
      practical_focus: 'medium' as const,
      progression_logic: 'Test progression logic',
      interactivity_level: 'medium' as const,
    },
    // ... all other required fields
  };
}
```

**Validation**:
- ✅ Returns full AnalysisResult type
- ✅ All nested objects correct
- ✅ Passes AnalysisResultSchema.safeParse() validation
- ✅ No flat fields (category, difficulty removed)

**Estimated Effort**: 1 hour

---

#### U12: Update createTestCourseWithStructure() ⏳

**Task**: Ensure language and style fields are set correctly

**Files to Modify**:
- `packages/course-gen-platform/tests/contract/generation.test.ts` (line 393)

**Changes**:
```typescript
const { data, error } = await supabase
  .from('courses')
  .insert({
    ...
    language: 'en',  // ✅ Add explicit language
    style: 'conversational',  // ✅ Add explicit style (not null)
    analysis_result: createMinimalAnalysisResult(title) as any,
    settings: { topic: title },
  })
```

**Validation**:
- ✅ No null style errors
- ✅ Validation passes in Phase 1

**Estimated Effort**: 15 minutes

---

#### U13: Update all test files using analysis_result ⏳

**Task**: Find and update 15+ test files that use analysis_result

**Search Command**:
```bash
cd packages/course-gen-platform/tests
grep -rl "analysis_result" . | grep "\.test\.ts$"
```

**Expected Files** (from investigation report):
1. tests/contract/generation.test.ts ✅ Done in U11
2. tests/unit/stage5/metadata-generator.test.ts
3. tests/unit/stage5/section-batch-generator.test.ts
4. tests/unit/stage5/generation-phases.test.ts
5. tests/integration/*.test.ts (multiple files)
6. ... ~10 more files

**Action for Each File**:
- Replace simplified fixtures with full schema
- Update test expectations (nested objects)
- Ensure validation passes
- Run tests after each file

**Validation**:
- ✅ All test files updated
- ✅ Fixtures use full schema
- ✅ Tests pass individually

**Estimated Effort**: 4 hours

---

#### U14: Run full test suite ⏳

**Task**: Run all tests and verify 100% pass rate

**Commands**:
```bash
# Unit tests
pnpm test

# Contract tests (17 tests - should all pass now)
pnpm test:contract

# Integration tests
pnpm test:integration
```

**Expected Results**:
- ✅ All unit tests pass
- ✅ 17/17 contract tests pass (was 16/17)
- ✅ All integration tests pass
- ✅ Zero regressions

**Fix Regressions**:
- If any tests fail, investigate and fix
- Update fixtures or test expectations
- Re-run until 100% pass

**Estimated Effort**: 1.5 hours

---

#### U15: Run type-check and lint ⏳

**Task**: Verify code quality across all packages

**Commands**:
```bash
# Type check
pnpm type-check

# Lint
pnpm lint
```

**Validation**:
- ✅ No type errors
- ✅ No lint errors
- ✅ Code quality maintained

**Estimated Effort**: 15 minutes

---

### Phase 4: Documentation and Final Validation (Day 4) - 4-6 hours

**Objective**: Update documentation and perform final validation

#### U16: Update data-model.md ⏳

**Task**: Document unified schema approach

**Files to Modify**:
- `docs/008-generation-generation-json/data-model.md`

**Sections to Add/Update**:
1. **Schema Unification Note**: Explain that AnalysisResult is now unified across stages
2. **Helper Functions**: Document analysis-formatters.ts usage
3. **Migration Note**: Reference MIGRATION-unified-schemas.md

**Validation**:
- ✅ Documentation clear and accurate
- ✅ Examples updated
- ✅ References correct

**Estimated Effort**: 1 hour

---

#### U17: Create migration guide ⏳

**Task**: Document migration for developers

**Files to Create**:
- `docs/migrations/MIGRATION-unified-schemas.md`

**Content**:
```markdown
# Migration Guide: Unified Stage 4/Stage 5 Schemas

## What Changed

**Before**: Stage 5 used simplified AnalysisResultSchema
**After**: Stage 5 uses full AnalysisResult from Stage 4 (unified)

## Breaking Changes

1. `AnalysisResultSchema` in generation-job.ts now matches Stage 4 schema
2. Fields changed:
   - `category` → `course_category.primary`
   - `difficulty` → Derived from `topic_analysis.target_audience`
   - `contextual_language` → Object with 6 fields (not string)
   - `pedagogical_strategy` → Object with 5 fields (not string)

## Migration Steps

### For Test Code

Replace simplified fixtures with full schema:

[Examples...]

### For Service Code

Use helper functions from analysis-formatters.ts:

[Examples...]

## Helper Functions Reference

[Document all 7 functions with examples]
```

**Validation**:
- ✅ Migration guide complete
- ✅ Examples clear
- ✅ Breaking changes documented

**Estimated Effort**: 1.5 hours

---

#### U18: Manual testing and final validation ⏳

**Task**: Test Stage 4 → Stage 5 pipeline with real data

**Steps**:
1. Run Stage 4 (Analyze) on test course (title-only or with documents)
2. Verify Analyze generates ALL 4 fields (even if input was title-only)
3. Verify analysis_result saved to database (JSONB) with ALL fields present
4. Trigger Stage 5 (Generation) with that course_id
5. Verify:
   - ✅ Validation passes (ALL 4 fields REQUIRED)
   - ✅ Prompts correctly formatted with full nested data
   - ✅ ALL 4 REQUIRED fields present (Analyze always generates)
   - ✅ Generation decides whether to use RAG data (logic-level)
   - ✅ Generation completes successfully

**Test Cases**:
- Title-only course (Analyze still generates ALL 4 fields)
- Course with documents (Analyze generates ALL 4 fields with document analysis)
- Different course categories and difficulty levels
- Different pedagogical strategies

**CRITICAL**:
- Analyze (Stage 4) ALWAYS generates ALL 4 fields, even if input was title-only
- Generation (Stage 5) ALWAYS receives ALL 4 fields (ALL REQUIRED in schema)
- Generation decides whether to use RAG data (logic-level decision, not schema-level)

**Validation**:
- ✅ All test cases pass
- ✅ No errors in logs
- ✅ Prompts look correct

**Estimated Effort**: 2 hours

---

## 📊 Progress Tracking

### Phase 1: Schema Unification (Day 1)
- [ ] U01: Extend existing Zod validator ✨ SIMPLIFIED (was: create from scratch)
- [ ] U02: Update generation-job.ts import ✨ SIMPLIFIED (just import)
- [ ] U03: Create helper functions
- [ ] U04: Add helper tests
- [ ] U05: Run type-check

**Status**: ⏳ PENDING
**Estimated**: 2-3 hours ✅ (was 4-6h, **50% faster** thanks to existing schemas!)

---

### Phase 2: Update Stage 5 Services (Day 2)
- [ ] U06: Update section-batch-generator.ts
- [ ] U07: Update metadata-generator.ts
- [ ] U08: Update generation-phases.ts
- [ ] U09: Update all other Stage 5 files
- [ ] U10: Run type-check

**Status**: ⏳ PENDING
**Estimated**: 6-8 hours

---

### Phase 3: Update Tests (Day 3)
- [ ] U11: Update createMinimalAnalysisResult()
- [ ] U12: Update createTestCourseWithStructure()
- [ ] U13: Update 15+ test files
- [ ] U14: Run full test suite
- [ ] U15: Run type-check and lint

**Status**: ⏳ PENDING
**Estimated**: 6-8 hours

---

### Phase 4: Documentation (Day 4)
- [ ] U16: Update data-model.md
- [ ] U17: Create migration guide
- [ ] U18: Manual testing

**Status**: ⏳ PENDING
**Estimated**: 4-6 hours

---

## ✅ Acceptance Criteria

### Must Have (BLOCKING)
- [ ] ✅ Zod validator created (U01)
- [ ] ✅ generation-job.ts uses full schema (U02)
- [ ] ✅ All 7 helper functions implemented (U03)
- [ ] ✅ Helper tests 100% coverage (U04)
- [ ] ✅ section-batch-generator.ts updated (U06)
- [ ] ✅ metadata-generator.ts updated (U07)
- [ ] ✅ generation-phases.ts updated (U08)
- [ ] ✅ All contract tests pass 17/17 (U14)
- [ ] ✅ All integration tests pass (U14)
- [ ] ✅ No type errors (U15)
- [ ] ✅ No lint errors (U15)
- [ ] ✅ Test fixtures use full schema (U11)
- [ ] ✅ Documentation updated (U16, U17)

### Should Have (IMPORTANT)
- [ ] ✅ Stage 5 uses pedagogical_patterns if available
- [ ] ✅ Stage 5 uses generation_guidance if available
- [ ] ✅ Manual testing passes (U18)

---

## 🎯 Success Metrics

### Technical Metrics
- **Schema Validation Pass Rate**: 100%
- **Type Coverage**: 100% (no `any` types)
- **Test Pass Rate**: 100% (unit + contract + integration)
- **Helper Function Coverage**: 100%

### Business Metrics
- **Stage 4 → Stage 5 Pipeline**: Works without transformation
- **Information Preservation**: 100% (no data loss)
- **RT-002 Compliance**: Generation has full context

---

## 📚 References

**Specification**: `docs/FUTURE/SPEC-2025-11-12-001-unify-stage4-stage5-schemas.md`
**Research**: `specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md`
**Investigation**: `docs/investigations/INV-2025-11-11-003-regenerate-section-validation-failures.md`

---

**Status**: ⏳ PENDING START
**Total Estimated Effort**: 18-26 hours (2.5-3.5 days, 1 developer) ✅ **REDUCED**
  - Phase 1: 2-3h (was 4-6h, **saved 2-3h** thanks to existing Zod schemas!)
  - Phase 2: 6-8h (unchanged)
  - Phase 3: 6-8h (unchanged)
  - Phase 4: 4-6h (unchanged)
**Created**: 2025-11-12
**Last Updated**: 2025-11-12 (updated after discovering existing schemas)
