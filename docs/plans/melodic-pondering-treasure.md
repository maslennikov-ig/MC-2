# Plan: Fix Stage 5 ignoring Stage 4 user-edited constraints

**Issue:** GitHub #6 - Stage 4 parameters are saved but NOT used in Stage 5 generation
**Status:** Phase 2 complete - Design finalized
**Beads:** To be created on approval

---

## Recent Changes (commit 6f0f99df) - ALREADY DONE

Другой агент добавил передачу **form fields** в промпты:

- ✅ `course_size` → передаётся как `llmGuidance` из preset
- ✅ `target_audience`, `description` → передаются в промпт
- ✅ `desired_lessons_count`, `desired_modules_count` → читаются из courses table

**НО ЭТО НЕ РЕШАЕТ ПРОБЛЕМУ!**

Проблема в том, что пользователь **редактирует значения в Stage 4 UI** (не в форме создания курса), и эти **user-edited** значения сохраняются в:

```
analysis_result.recommended_structure.total_lessons = 30
analysis_result.recommended_structure.total_sections = 6
```

Эти значения **НЕ передаются** в промпт LLM.

---

## Problem Summary

Тестер (2026-01-24):

> "The changes are saved and persistent now but they do NOT affect the Stage 5 generation!"

Пользователь редактирует **в Stage 4 Output Tab**:

- `Уроков = 30`, `Модулей = 6`

Эти значения сохраняются в `analysis_result.recommended_structure`, но:

- ❌ НЕ передаются в `buildBatchPrompt()`
- ❌ Строка 99: "Generate ${estimatedLessons} lessons (can be 3-5 if pedagogically justified)"

Сгенерированный курс:

- 8 модулей, 46 уроков (вместо 6/30)

---

## Root Cause

`buildBatchPrompt()` использует только `section.estimated_lessons` для ОДНОЙ секции, но НЕ знает о глобальных ограничениях:

```
analysis_result.recommended_structure (Stage 4 user edits)
  ↓
total_lessons: 30, total_sections: 6  ← ЕСТЬ в input
  ↓
Stage 5 orchestrator (логирует, но НЕ передает дальше)
  ↓
section-batch-generator.ts → generator-core.ts → buildBatchPrompt()
  ↓
Промпт: "Generate ${estimatedLessons} lessons (can be 3-5)"  ← НЕТ total_lessons/total_sections
  ↓
LLM генерирует секции независимо → 46 уроков в 8 модулях
```

---

## Solution

Добавить **user-edited constraints** из `analysis_result.recommended_structure` в промпт:

```
**CRITICAL COURSE CONSTRAINTS** (from Stage 4):
- Total sections: 6 (HARD LIMIT)
- Total lessons: 30 (HARD LIMIT)
- This is section 2 of 6
- Lessons budget for THIS section: ~5 lessons
```

---

## Files to Modify

### 1. `prompt-builder.ts`

**Path:** `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/prompt-builder.ts`

**Changes:**

1. Add interface `CourseConstraints`
2. Add optional parameter `constraints?: CourseConstraints`
3. Add CRITICAL COURSE CONSTRAINTS block in prompt (after line 87, after Generation Guidance block)
4. Modify lesson breakdown guidance based on constraints (line 99)

```typescript
// NEW Interface (add before buildBatchPrompt, around line 16)
export interface CourseConstraints {
  totalSections: number;
  totalLessons: number;
  currentSectionIndex: number;  // 0-based
  lessonsPerSectionBudget: number;
}

// MODIFY function signature (line 19-24)
export function buildBatchPrompt(
  input: GenerationJobInput,
  sectionIndex: number,
  qdrantClient: QdrantClient | undefined,
  attemptNumber: number,
  constraints?: CourseConstraints  // NEW
): string {
```

**New prompt section (after line 87, after Generation Guidance block):**

```typescript
// Add user-edited course constraints from Stage 4
if (constraints) {
  prompt += `**CRITICAL COURSE CONSTRAINTS** (from Stage 4 user settings):
- Total sections in this course: ${constraints.totalSections} (HARD LIMIT - user specified)
- Total lessons in this course: ${constraints.totalLessons} (HARD LIMIT - user specified)
- This is section ${constraints.currentSectionIndex + 1} of ${constraints.totalSections}
- Lessons budget for THIS section: approximately ${constraints.lessonsPerSectionBudget} lessons

**IMPORTANT**: The user has explicitly configured these limits. You MUST:
1. Generate approximately ${constraints.lessonsPerSectionBudget} lessons for this section
2. Each section contributes proportionally to the ${constraints.totalLessons} total lessons target
3. Do NOT exceed the section lesson budget significantly

`;
}
```

**Modify line 99 to use dynamic lesson guidance:**

```typescript
// BEFORE (line 99):
1. **Lesson Breakdown**: Generate ${estimatedLessons} lessons (can be 3-5 if pedagogically justified)

// AFTER:
const lessonGuidance = constraints
  ? `Generate exactly ${constraints.lessonsPerSectionBudget} lessons (budget from course structure, ±1 if pedagogically necessary)`
  : `Generate ${estimatedLessons} lessons (can be 3-5 if pedagogically justified)`;
// ... use in prompt:
1. **Lesson Breakdown**: ${lessonGuidance}
```

### 2. `generator-core.ts`

**Path:** `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/generator-core.ts`

**Changes:**

1. Import `CourseConstraints` type
2. Add `constraints?` parameter to `generateWithRetry()` (line 265-274)
3. Pass constraints to `buildBatchPrompt()` (line 281)

```typescript
// Line 265-274: Add parameter
export async function generateWithRetry(
  ...existing params...,
  constraints?: CourseConstraints  // NEW
): Promise<SectionBatchResult> {

// Line 281: Pass constraints
const prompt = buildBatchPrompt(input, sectionIndex, qdrantClient, retryCount + 1, constraints);
```

### 3. `section-batch-generator.ts`

**Path:** `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/section-batch-generator.ts`

**Changes:**

1. Import `CourseConstraints` type
2. Calculate constraints from `analysis_result` (after line 36)
3. Pass constraints to `generateWithRetry()` (line 64-73)

```typescript
// After line 36: Calculate constraints
const recommendedStructure = input.analysis_result?.recommended_structure;
let constraints: CourseConstraints | undefined;

if (recommendedStructure?.total_sections && recommendedStructure?.total_lessons) {
  constraints = {
    totalSections: recommendedStructure.total_sections,
    totalLessons: recommendedStructure.total_lessons,
    currentSectionIndex: sectionIndex,
    lessonsPerSectionBudget: Math.round(
      recommendedStructure.total_lessons / recommendedStructure.total_sections
    ),
  };
}

// Line 64-73: Pass constraints
return await generateWithRetry(
  ...existing args...,
  constraints  // NEW
);
```

### 4. `generation-phases.ts`

**Path:** `packages/course-gen-platform/src/stages/stage5-generation/phases/generation-phases.ts`

**Changes:**

1. Use `total_sections` instead of `sections_breakdown.length` (lines 437-438)
2. Add logging for constraint awareness

```typescript
// Lines 437-438: Use user-edited total_sections
const recommendedStructure = state.input.analysis_result.recommended_structure;
const totalSections =
  recommendedStructure.total_sections ?? recommendedStructure.sections_breakdown.length;
```

---

## Backward Compatibility

1. **`constraints` is optional** - если не передан, поведение идентично текущему
2. **Fallback to `sections_breakdown.length`** - если `total_sections` не задан
3. **No breaking API changes** - все изменения аддитивные

---

## Verification

### Type Check & Build

```bash
pnpm type-check
pnpm build
```

### Manual Test

1. Создать курс, пройти до Stage 4
2. Отредактировать: `Уроков = 30`, `Модулей = 6`
3. Approve → Stage 5
4. Проверить логи: должны быть "CRITICAL COURSE CONSTRAINTS"
5. Дождаться генерации
6. Проверить результат: ~6 секций, ~30 уроков (±20% допуск)

### Test Cases

| Input                  | Expected Output                 |
| ---------------------- | ------------------------------- |
| 30 lessons, 6 sections | ~5 lessons/section, total 24-36 |
| 20 lessons, 4 sections | ~5 lessons/section, total 16-24 |
| 15 lessons, 5 sections | ~3 lessons/section, total 12-18 |

---

## Implementation Order

1. Modify `prompt-builder.ts` - add interface and parameter
2. Modify `generator-core.ts` - pass through constraints
3. Modify `section-batch-generator.ts` - calculate constraints
4. Modify `generation-phases.ts` - use total_sections
5. Run type-check and build
6. Manual verification

---

## Risk Mitigation

- **Existing validator unchanged** - MinimumLessonsValidator (orchestrator.ts:776-844) remains as safety net
- **Optional constraints** - backward compatible
- **±20% tolerance** - already implemented in post-validation
