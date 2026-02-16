# Plan: Course Structure Improvement + Lesson Position Awareness + Mermaid Fix

## Context

Course JAM-6506 ("Как стать счастливым", 10 modules x 5 lessons = 50 lessons) revealed three categories of issues:

1. **Premature "course finished" message** (Module 2, Lesson 4): Conclusion says "Вы завершили курс" — this is lesson 9 of 50.
2. **Missing introductory context** (Module 1, Lesson 1): First lesson dives into "eNPS" metrics without explaining what the course is about.
3. **Mermaid diagram issues** (Lessons 2.5 and 3.1): Escaped quotes and/or missing rendering.

Deep Research results (3 documents provided by user) confirm these are well-known instructional design anti-patterns with clear evidence-based solutions.

---

## Task 1: Add Position Awareness to Stage 6 (Code Fix)

**Root cause**: Model has NO information about its position in the course. When `next_lesson` is null (last in module), it incorrectly infers "course is finished."

**User's direction**: Give positive position info (e.g., "lesson 4 of 5 in module 2 of 10") instead of negative rules ("don't write..."). The model will naturally understand it's not the last lesson.

### Files to Modify

#### 1. `packages/shared-types/src/lesson-specification-v2.ts` (~line 354)

Add `CoursePositionSchema` to `LessonContextSchema`:

```typescript
export const CoursePositionSchema = z.object({
  lesson_index_in_module: z.number().int().min(1),
  total_lessons_in_module: z.number().int().min(1),
  module_index: z.number().int().min(1),
  total_modules: z.number().int().min(1),
  lesson_index_in_course: z.number().int().min(1),
  total_lessons_in_course: z.number().int().min(1),
  module_title: z.string(),
});

// Add to LessonContextSchema:
course_position: CoursePositionSchema.optional(),
```

#### 2. `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/v2-converter.ts` (~line 94, `buildLessonContext()`)

Populate `course_position` using data already available in the function:

```typescript
course_position: {
  lesson_index_in_module: lessonIndex + 1,
  total_lessons_in_module: allSections[sectionIndex].lessons?.length || 0,
  module_index: sectionIndex + 1,
  total_modules: allSections.length,
  lesson_index_in_course: currentFlatIndex + 1,
  total_lessons_in_course: allLessons.length,
  module_title: allSections[sectionIndex].section_title,
},
```

#### 3. `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-helpers.ts` (`formatInterLessonContextXML()`)

Add `<course_position>` block to the XML output:

```xml
<course_position>
  <current>Lesson 4 of 5 in Module "Хронотипы и биоритмы" (module 2 of 10)</current>
  <global>Lesson 9 of 50 in the entire course</global>
</course_position>
```

Derive booleans from position data in code:

- `is_first_in_course` = lesson_index_in_course === 1
- `is_last_in_course` = lesson_index_in_course === total_lessons_in_course
- `is_first_in_module` = lesson_index_in_module === 1
- `is_last_in_module` = lesson_index_in_module === total_lessons_in_module

#### 4. `packages/course-gen-platform/src/shared/prompts/stage6-prompts.ts` (~line 388, INTER-LESSON CONTINUITY)

Update prompt rules:

```
- INTER-LESSON CONTINUITY (from inter_lesson_context if provided):
  - Reference previous lesson naturally if context is given
  - Do NOT re-explain terms from terms_already_defined
  - In summary, tease next lesson if next_lesson info is provided
  - COURSE POSITION (from course_position if provided):
    - Use position awareness to write appropriate conclusions
    - If this is the last lesson in a module but NOT the last in the course, write a MODULE summary and bridge to the next module
    - If this is the last lesson of the entire course, write a comprehensive COURSE conclusion
    - If this is the first lesson of a module, briefly introduce the module theme
    - If this is the first lesson of the entire course, include course-level context and motivation
```

---

## Task 2: Improve Stage 5 Structure Generation Prompt (Research-Based)

Based on Deep Research findings (Gagné, Merrill, Bloom, Dick & Carey, Quality Matters), update Stage 5 prompt to enforce pedagogical structure.

### File to Modify

#### `packages/course-gen-platform/src/shared/prompts/stage5-prompts.ts` — `stage5_sections_generator` prompt

Add pedagogical constraints to the structure generation prompt:

```
PEDAGOGICAL STRUCTURE RULES:

1. COURSE ARC (4-Phase Progression):
   - Phase 1 (first ~15% of modules): ORIENTATION & FOUNDATIONS — establish "Why this matters", basic definitions, context
   - Phase 2 (next ~35%): CORE CONCEPTS — main theories, frameworks, mechanisms
   - Phase 3 (next ~35%): DEEP DIVE & APPLICATION — complex nuances, case studies, practical application
   - Phase 4 (final ~15%): SYNTHESIS & INTEGRATION — putting it all together, real-world application, reflection

2. MODULE ANATOMY:
   - First lesson of each module: introduces the module theme, bridges from previous module
   - Middle lessons: core content with progressive complexity
   - Last lesson of each module: synthesis, practical application, or milestone check

3. FIRST MODULE RULES:
   - Must establish the "Why" — motivation, context, big picture
   - Must NOT start with specific metrics, tools, or advanced frameworks
   - Lesson 1 of Module 1 should be a welcoming overview of the course topic

4. LAST MODULE RULES:
   - Must focus on integration and real-world application
   - Must NOT introduce entirely new complex topics
   - Final lesson should provide synthesis and next steps

5. COGNITIVE PROGRESSION (Bloom's Taxonomy):
   - Early modules: Remember/Understand verbs (Define, Describe, Explain)
   - Middle modules: Apply/Analyze verbs (Calculate, Solve, Compare)
   - Late modules: Evaluate/Create verbs (Design, Critique, Construct)
```

### Also update Stage 5 validation rules

#### `packages/course-gen-platform/src/stages/stage5-generation/orchestrator-helpers.ts` (~line 140, quality checks)

Add structural quality checks:

- First module title should contain orientation/intro/foundation keywords (not specific technical terms)
- Last module title should contain integration/synthesis/capstone keywords
- No module should contain >40% of total lessons

---

## Task 3: Investigate Mermaid Pipeline Failure (Bug Fix)

### Investigation Findings

**Mermaid fix pipeline IS wired in**: `generator-node.ts:96` calls `runMermaidFixPipeline(generatedContent)` on every lesson.

**The 5-stage cascade**:

1. Regex sanitization (`sanitizeMermaidBlocks`) — removes `\"`, fixes arrows, balances brackets
2. Mermaid parser validation (`validateMermaidSyntax`)
3. LLM fix (if parser fails)
4. Re-validation
5. Fallback (HTML comment)

**Dead code found**: `validateLessonContent()` in `content-validator.ts` is NEVER called in the pipeline. It was meant to be used "in patcher/index.ts and generator" (per comments) but isn't integrated.

### Potential Root Causes

For **lesson 2.5** (timeline with `\"До\"` and `\"После\"`):

- The pipeline ran but MAY have errored silently (catch block on line 107-116 keeps original content)
- OR: the `timeline` diagram type has specific syntax issues not caught by the regex sanitizer
- OR: JSON serialization in the content storage path re-introduced escaped quotes AFTER sanitization

For **lesson 3.1** (HRV lesson):

- No mermaid block found in content at all — the diagram may have been removed by the fallback stage or never generated

### Action Plan

1. Check `error_logs` and `generation_trace` for lessons 2.5 and 3.1 for mermaid pipeline errors
2. Write a targeted test: take the actual content from lesson 2.5, run `sanitizeMermaidBlocks()` on the `raw_markdown` and verify it catches the `\"`
3. Check if the `raw_markdown` extraction path preserves the sanitized content or re-serializes it
4. If the issue is in JSON serialization: fix the serialization path
5. If the issue is in the timeline diagram type: add timeline-specific sanitization rules

### Files to Investigate

- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator-node.ts:96-116` — where pipeline is called
- `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts` — where content is saved to DB
- Content serialization between generator output and DB storage

---

## Beads Tasks to Create

1. **`feat: add course position awareness to Stage 6`** — Task 1 above (priority P1)
2. **`feat: add pedagogical rules to Stage 5 structure generation`** — Task 2 above (priority P2)
3. **`bug: investigate mermaid pipeline failure in JAM-6506`** — Task 3 above (priority P2)

---

## Verification

### Task 1 (Position Awareness)

1. `pnpm type-check` — passes after schema changes
2. `pnpm build` — passes
3. Run existing tests: `pnpm test -- --grep "lesson.context|v2-converter"`
4. Manual: generate a test lesson and verify XML output contains `<course_position>` block

### Task 2 (Stage 5 Prompt)

1. `pnpm type-check` && `pnpm build`
2. Generate a test course and verify:
   - Module 1 has intro/orientation title (not specific metrics)
   - Last module has synthesis/integration title
   - Cognitive complexity progresses across modules

### Task 3 (Mermaid)

1. Check DB logs: `SELECT * FROM error_logs WHERE course_id = 'ba4ec34d-...' AND metadata::text ILIKE '%mermaid%'`
2. Run sanitizer unit test with actual content from lesson 2.5
3. Trace content from generator output through DB save to verify no re-escaping
