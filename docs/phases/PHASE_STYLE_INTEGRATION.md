# Phase: Style Integration & Field Cleanup

> **Phase ID**: PHASE_STYLE_INTEGRATION
> **Target Stage**: Stage 5 (will be applied to Stages 1-4 retroactively)
> **Status**: 📋 Planning
> **Priority**: High
> **Estimated Scope**: Large (Frontend + Backend + All Stages)

---

## Problem Statement

### Current Issues

1. **`style` parameter unused** - Frontend sends `course.style`, but it's never used in analysis phases
2. **`difficulty` redundant** - Duplicates `target_audience`, confuses users
3. **Missing fields** - Important frontend fields not in backend:
   - `desired_lessons_count` (user preference)
   - `desired_modules_count` (user preference)
   - `learning_outcomes` (expected outcomes)

### Impact

- User's style preference ignored during content generation
- Redundant UI fields (`difficulty` vs `target_audience`)
- Missing data flow for user preferences

---

## Solution Overview

### Goals

1. ✅ Remove `difficulty` field completely (frontend + backend + all stages)
2. ✅ Integrate `style` prompts into all content generation phases
3. ✅ Add missing fields to data flow
4. ✅ Ensure all optional fields work correctly (only `title` is required)

### Non-Goals

- ❌ Change `teaching_style` generation (Phase 3 continues to generate it)
- ❌ Modify analysis logic (only add style context)

---

## Field Specifications

### Required Fields

- **`title`** - ONLY mandatory field, everything else optional

### Optional Fields (Keep)

- `language` - Content language (default: `'en'`)
- `style` - Content tone/style (default: `'conversational'`)
- `target_audience` - Who the course is for (free text, not enum)

### Optional Settings (Add)

- `desired_lessons_count` - User preference (not guaranteed, LLM decides final count)
- `desired_modules_count` - User preference (not guaranteed, LLM decides final count)
- `learning_outcomes` - Expected learning outcomes (text)

### Fields to Remove

- **`difficulty`** - Remove completely (use `target_audience` instead)

---

## Style System

### Available Styles (21 types)

Source: `workflows n8n/style.js`

**Core Styles**:
- `conversational` (default fallback) - Friendly dialogue
- `practical` - Action-focused, step-by-step
- `academic` - Scholarly rigor
- `professional` - Business tone

**Creative Styles**:
- `storytelling` - Narrative-driven
- `gamified` - Game mechanics
- `visual` - Mental imagery

**Learning Styles**:
- `socratic` - Question-driven
- `problem_based` - Real problems
- `research` - Inquiry-based
- `interactive` - Active participation

**Others**: `motivational`, `minimalist`, `engaging`, `technical`, `microlearning`, `inspirational`, `analytical`, `collaborative`

### Style Prompt Format

Each style has a comprehensive prompt describing tone, structure, and approach:

```typescript
stylePrompts[style] // Returns ~100-200 char description
```

**Example**:
```
practical: "Focus entirely on actionable implementation. Provide step-by-step
instructions, numbered procedures, and clear checklists. Use imperative mood..."
```

---

## Implementation Tasks

### Task 1: Frontend Changes

**Files**:
- Course creation form/wizard
- Type definitions (if any)

**Actions**:
1. Remove `difficulty` field from UI
2. Add fields:
   - `desired_lessons_count` (number input, optional)
   - `desired_modules_count` (number input, optional)
   - `learning_outcomes` (textarea, optional)
3. Update validation: only `title` required
4. Add help text: "Desired counts are preferences - actual count determined by AI"

**References**:
- Current fields: Check existing course form
- Style dropdown: Should already exist

---

### Task 2: Database Migration

**File**: `packages/course-gen-platform/supabase/migrations/YYYYMMDD_add_missing_course_fields.sql`

**Actions**:
1. Check if fields exist in `courses` table:
   - `desired_lessons_count` (INTEGER, nullable)
   - `desired_modules_count` (INTEGER, nullable)
   - `learning_outcomes` (TEXT, nullable)
2. If missing, add migration
3. Remove `difficulty` column if exists (breaking change - check usage first)

**References**:
- Existing migration: `20251021150000_add_missing_course_fields.sql`

---

### Task 3: TypeScript Types

**Files**:
- `packages/shared-types/src/analysis-job.ts`
- `packages/shared-types/src/database.types.ts`

**Actions**:
1. Update `StructureAnalysisInput` interface:
   ```typescript
   interface StructureAnalysisInput {
     topic: string;
     language: string;
     style: string;  // Keep, will use in prompts
     answers?: string;
     target_audience: string;  // Keep (free text)
     // difficulty: string;  // REMOVE
     lesson_duration_minutes: number;
     desired_lessons_count?: number;  // ADD
     desired_modules_count?: number;  // ADD
     learning_outcomes?: string;  // ADD
     document_summaries?: DocumentSummary[];
   }
   ```

2. Update database types to match migration

**References**:
- Current: `packages/shared-types/src/analysis-job.ts:66-90`

---

### Task 4: Router Changes

**File**: `packages/course-gen-platform/src/server/routers/analysis.ts`

**Actions**:
1. Update job payload creation (line ~345):
   ```typescript
   const settings = course.settings || {};
   const jobData = {
     // ...
     input: {
       topic: settings.topic || course.title,
       language: course.language || 'en',
       style: course.style || 'conversational',  // Default fallback
       answers: settings.answers,
       target_audience: course.target_audience || '',
       // difficulty: REMOVE
       lesson_duration_minutes: settings.lesson_duration_minutes || 30,
       desired_lessons_count: settings.desired_lessons_count,  // ADD
       desired_modules_count: settings.desired_modules_count,  // ADD
       learning_outcomes: settings.learning_outcomes,  // ADD
       document_summaries,
     }
   };
   ```

2. Remove `difficulty` references

**References**:
- Current: `analysis.ts:345-354`

---

### Task 5: Style Prompt Integration

**File**: Create `packages/course-gen-platform/src/shared/styles/style-prompts.ts`

**Actions**:
1. Port `stylePrompts` from `workflows n8n/style.js` to TypeScript:
   ```typescript
   export const STYLE_PROMPTS: Record<string, string> = {
     academic: "Write with scholarly rigor...",
     conversational: "Write as friendly dialogue...",
     // ... all 21 styles
   };

   export const DEFAULT_STYLE = 'conversational';

   export function getStylePrompt(style: string): string {
     return STYLE_PROMPTS[style] || STYLE_PROMPTS[DEFAULT_STYLE];
   }
   ```

2. Add validation:
   ```typescript
   export function isValidStyle(style: string): boolean {
     return style in STYLE_PROMPTS;
   }
   ```

**References**:
- Source: `workflows n8n/style.js`

---

### Task 6: Phase 1 Integration

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phase-1-classifier.ts`

**Actions**:
1. Update `Phase1Input` interface:
   - Remove `difficulty` (not used)
   - Keep `style` (add to prompt)

2. Update prompt (line ~145):
   ```typescript
   const stylePrompt = getStylePrompt(input.style || 'conversational');

   const humanMessage = new HumanMessage(`COURSE INFORMATION:
   Topic: ${input.topic}
   Input Language: ${input.language}
   Content Style: ${input.style || 'conversational'}
   Target Audience: ${input.target_audience || 'mixed'}
   Lesson Duration: ${input.lesson_duration_minutes || 15} minutes
   ${input.answers ? `\nUser Requirements:\n${input.answers}` : ''}

   STYLE GUIDE:
   ${stylePrompt}

   Apply this style to all generated text...`);
   ```

**References**:
- Current: `phase-1-classifier.ts:144-159`
- Import: `import { getStylePrompt } from '../../../shared/styles/style-prompts';`

---

### Task 7: Phase 2 Integration

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts`

**Actions**:
1. Update `Phase2Input` interface (add `style`, `desired_*` fields)

2. Update prompt (line ~312):
   ```typescript
   const stylePrompt = getStylePrompt(input.style || 'conversational');
   const desiredLessons = input.desired_lessons_count
     ? `\n\nUser Preference: ${input.desired_lessons_count} lessons (use as guidance, not constraint)`
     : '';
   const desiredModules = input.desired_modules_count
     ? `\nUser Preference: ${input.desired_modules_count} modules`
     : '';

   const userPrompt = `Analyze this course:

   **Course Topic**: ${topic}
   **Style**: ${input.style}${desiredLessons}${desiredModules}

   **Style Guide**:
   ${stylePrompt}

   Consider this style when estimating lesson structure...`;
   ```

**References**:
- Current: `phase-2-scope.ts:312-388`

---

### Task 8: Phase 3 Integration

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phase-3-expert.ts`

**Actions**:
1. Update `Phase3Input` interface (add `style`, `learning_outcomes`)

2. Update prompt (line ~107):
   ```typescript
   const stylePrompt = getStylePrompt(input.style || 'conversational');
   const learningOutcomes = input.learning_outcomes
     ? `\n\nEXPECTED LEARNING OUTCOMES (from user):\n${input.learning_outcomes}`
     : '';

   const fullPrompt = `CONTEXT:
   TOPIC: ${topic}
   CONTENT STYLE: ${input.style}

   **Style Guide**:
   ${stylePrompt}
   ${learningOutcomes}

   Design pedagogical strategy aligned with this style...`;
   ```

**References**:
- Current: `phase-3-expert.ts:107-199`

---

### Task 9: Phase 4 Integration

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phase-4-synthesis.ts`

**Actions**:
1. Update `Phase4Input` interface (add `style`, all new fields)

2. Update prompt:
   ```typescript
   const stylePrompt = getStylePrompt(input.style || 'conversational');

   const fullPrompt = `Course Topic: ${input.topic}
   Target Language: ${input.language}
   Content Style: ${input.style}

   **Style Guide for Final Content**:
   ${stylePrompt}

   ALL scope instructions MUST follow this style...`;
   ```

**References**:
- Current: `phase-4-synthesis.ts:365-417`

---

### Task 10: Orchestrator Updates

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/analysis-orchestrator.ts`

**Actions**:
1. Pass `style` and new fields to all phases:
   ```typescript
   // Phase 1
   const phase1Output = await runPhase1Classification({
     // ...
     style: input.style,
     // Remove difficulty
   });

   // Phase 2
   const phase2Output = await runPhase2Scope({
     // ...
     style: input.style,
     desired_lessons_count: input.desired_lessons_count,
     desired_modules_count: input.desired_modules_count,
   });

   // Phase 3
   const phase3Output = await runPhase3Expert({
     // ...
     style: input.style,
     learning_outcomes: input.learning_outcomes,
   });

   // Phase 4
   const phase4Output = await runPhase4Synthesis({
     // ...
     style: input.style,
     desired_lessons_count: input.desired_lessons_count,
     desired_modules_count: input.desired_modules_count,
     learning_outcomes: input.learning_outcomes,
   });
   ```

**References**:
- Current: `analysis-orchestrator.ts:158-251`

---

### Task 11: Validation & Tests

**Files**:
- `packages/course-gen-platform/src/shared/validation/`
- `packages/course-gen-platform/tests/`

**Actions**:
1. Add style validation:
   ```typescript
   import { isValidStyle } from '../styles/style-prompts';

   if (input.style && !isValidStyle(input.style)) {
     throw new Error(`Invalid style: ${input.style}`);
   }
   ```

2. Update tests to remove `difficulty` references
3. Add test cases for new fields
4. Test style prompt retrieval

---

### Task 12: Documentation

**Files**:
- `docs/FRONTEND_COURSE_DATA_REFERENCE.md` ✅ (already updated)
- `docs/STAGE4_PARAMETERS_USAGE_AUDIT.md` ✅ (already updated)
- API documentation (if exists)
- README/CHANGELOG

**Actions**:
1. Update API docs with new fields
2. Add changelog entry
3. Update migration guide (breaking change: remove `difficulty`)

---

## Migration Strategy

### Breaking Changes

1. **`difficulty` field removal**:
   - Check all code references to `difficulty`
   - Update frontend to use `target_audience` instead
   - Migration: Drop column (optional - can leave for backward compat)

### Backward Compatibility

- All new fields are optional
- Existing courses continue to work
- Default style is `conversational`

### Rollout Plan

1. **Stage 5**: Implement all changes for new content generation
2. **Stages 1-4**: Retroactively add style integration
3. **Frontend**: Update form (breaking change coordinated with backend)
4. **Database**: Run migrations

---

## Testing Checklist

- [ ] Frontend: Course creation with all new fields
- [ ] Frontend: Course creation with only `title` (all others optional)
- [ ] Backend: Router accepts new fields
- [ ] Backend: Job payload includes new fields
- [ ] Phase 1: Style prompt integrated
- [ ] Phase 2: Style + desired counts integrated
- [ ] Phase 3: Style + learning outcomes integrated
- [ ] Phase 4: Style + all fields integrated
- [ ] Validation: Invalid style rejected
- [ ] Validation: Missing style defaults to `conversational`
- [ ] Database: New fields stored correctly
- [ ] E2E: Full course creation with style

---

## Success Criteria

✅ `difficulty` removed from codebase
✅ `style` used in all content generation phases
✅ All 21 styles available and working
✅ Default fallback is `conversational`
✅ New fields (`desired_*`, `learning_outcomes`) flow through system
✅ Only `title` is required, all else optional
✅ Tests pass
✅ Documentation updated

---

## References

### Code Files

- **Style Prompts**: `workflows n8n/style.js`
- **Router**: `packages/course-gen-platform/src/server/routers/analysis.ts`
- **Types**: `packages/shared-types/src/analysis-job.ts`
- **Phases**: `packages/course-gen-platform/src/orchestrator/services/analysis/`

### Documentation

- **Data Reference**: `docs/FRONTEND_COURSE_DATA_REFERENCE.md`
- **Audit**: `docs/STAGE4_PARAMETERS_USAGE_AUDIT.md`
- **This Phase**: `docs/phases/PHASE_STYLE_INTEGRATION.md`

---

## Notes

- This is a **large phase** - will be broken into tasks in Stage 5
- Coordinates frontend + backend + all stages
- Breaking change: `difficulty` removal
- User experience improvement: consistent style across all content
- Technical debt resolution: unused parameters cleaned up

---
