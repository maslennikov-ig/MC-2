# Plan: Quiz Enrichment - Unhide, Rename, Multi-Select, Andragogy

## Context

Quiz enrichment (`type: 'quiz'`) fully implemented in backend (handler, prompt, schemas, tRPC) and frontend (QuizPlayer, EnrichmentCard, settings form), but **hidden on the frontend** since early development. User wants to:

1. Unhide and rename "Тест" -> "Квиз"
2. Add multi-select questions (several correct answers)
3. Mark open questions as "coming soon" (needs AI verification)
4. Adjust question count options (3-5 for short lessons)
5. Enhance quiz prompt with andragogy (adult learning) principles

Existing `QuizPlayer` component is production-ready (706 lines) - reuse fully.
`QuestionCard` from clarifying questions is NOT suitable (different UX pattern).

---

## Step 1: Add `multi_select` question type to schemas

**File: `packages/shared-types/src/enrichment-content.ts`**

- Add `'multi_select'` to `quizQuestionTypeSchema` (line 94-110):

  ```
  createLLMEnumSchema(
    ['multiple_choice', 'multi_select', 'true_false', 'short_answer'] as const,
    {
      mc: 'multiple_choice', 'select-one': 'multiple_choice',
      'multi-select': 'multi_select', 'select-many': 'multi_select', checkbox: 'multi_select',
      ...existing aliases...
    }
  )
  ```

- Extend `correct_answer` in `quizQuestionSchema` (line 150) to support arrays:
  ```
  correct_answer: z.union([z.string(), z.boolean(), z.number(), z.array(z.string())])
  ```

**File: `packages/shared-types/src/enrichment-settings.ts`** (line 77-80)

- Add `'multi_select'` to `question_types` enum:
  ```
  z.array(z.enum(['multiple_choice', 'multi_select', 'true_false', 'short_answer']))
  ```
- Change default to `['multiple_choice', 'multi_select', 'true_false']` (exclude `short_answer`)

**File: `packages/shared-types/src/enrichment-on-demand.ts`** (line 63-69)

- No changes needed - on-demand settings only expose `questionCount` and `difficulty`, question types are determined by the prompt

After changes: `pnpm --filter @megacampus/shared-types build`

---

## Step 2: Unhide quiz on the frontend (2 surgical changes)

**File: `packages/web/components/course/viewer/components/enrichment-config.ts`** (line 59-67)

- Add `'quiz'` to `ALL_PLACEHOLDER_TYPES` array (after images, before NLM types):
  ```ts
  export const ALL_PLACEHOLDER_TYPES: GeneratableEnrichmentType[] = [
    'cover',
    'card',
    'quiz', // <-- ADD
    'nlm_audio',
    'nlm_video',
    'nlm_flashcards',
    'nlm_mind_map',
    'nlm_infographic',
  ];
  ```

**File: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`** (line 328)

- Remove `'quiz'` from hidden types:
  ```ts
  // Before:
  if (['audio', 'video', 'presentation', 'quiz'].includes(e.enrichment_type)) return false;
  // After:
  if (['audio', 'video', 'presentation'].includes(e.enrichment_type)) return false;
  ```

---

## Step 3: Add multi-select rendering in QuizPlayer

**File: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`**

- Import `Checkbox` from `@/components/ui/checkbox`
- Add new rendering block for `multi_select` type (after the `multiple_choice` block, ~line 600):
  - Use Checkbox components (not RadioGroup) for multi-select
  - Store answers as comma-separated string of selected option IDs (e.g. `"a,c"`)
  - Show checkboxes with labels, same styling as RadioGroup items
- Update `handleAnswerChange` to support toggling individual options for multi_select
- Update score calculation in `handleSubmit` (~line 200-226):
  - For `multi_select`: compare sorted arrays of user answers vs correct_answer array
  - Partial credit option: full points if exact match
- Update `isAnswerCorrect` function (~line 317-332) for multi_select
- Update results display (~line 410-460) to show multi-select answers correctly
- Mark `short_answer` questions as disabled/"coming soon" with a badge overlay

---

## Step 4: Adjust question count options in settings form

**File: `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx`** (~line 203)

- Change default `quizQuestions` from `'10'` to `'5'`

**File: `packages/web/components/course/viewer/components/EnrichmentCardOptions.tsx`** (lines 333-337)

- Change quiz question count options from `5, 10, 15` to `3, 5, 7, 10`:
  ```tsx
  <SelectItem value="3">3</SelectItem>
  <SelectItem value="5">5</SelectItem>
  <SelectItem value="7">7</SelectItem>
  <SelectItem value="10">10</SelectItem>
  ```

**File: `packages/shared-types/src/enrichment-on-demand.ts`** (line 65)

- Adjust min from 5 to 3: `z.number().int().min(3).max(15).default(5)`

---

## Step 5: Rename "Тест" -> "Квиз" in Russian i18n

**File: `packages/web/messages/ru/enrichments.json`**

Replace all occurrences (15 keys):
| Key | Old | New |
|-----|-----|-----|
| `types.quiz` | "Тест" | "Квиз" |
| `typeDescriptions.quiz` | "Проверочный тест для закрепления материала" | "Квиз для проверки и закрепления знаний" |
| `forms.quiz.title` | "Настройки теста" | "Настройки квиза" |
| `viewer.quizLabel` | "Тест" | "Квиз" |
| `viewer.startQuiz` | "Начать тест" | "Начать квиз" |
| `viewer.quizPassed` | "Тест пройден!" | "Квиз пройден!" |
| `viewer.quizFailed` | "Тест не пройден" | "Квиз не пройден" |
| `viewer.finishQuiz` | "Завершить тест" | "Завершить квиз" |
| `viewer.quizProgress` | "Прогресс теста" | "Прогресс квиза" |
| `viewer.quizResult` | "Результат теста" | "Результат квиза" |
| `viewer.submitQuiz` | "Завершить тест и показать результаты" | "Завершить квиз и показать результаты" |
| `viewer.retryQuiz` | "Пройти тест заново" | "Пройти квиз заново" |
| `viewer.enrichmentTypes.quiz` | "Тест" | "Квиз" |
| `placeholder.quiz.title` | "Тест" | "Квиз" |

Add new keys for multi-select and short_answer coming soon:

```json
"viewer.selectAll": "Выберите все правильные варианты",
"viewer.comingSoonQuestion": "Скоро",
"viewer.shortAnswerComingSoon": "Открытые вопросы появятся в будущих обновлениях"
```

**File: `packages/web/messages/en/enrichments.json`** - equivalent English keys for new multi-select strings

---

## Step 6: Enhance quiz prompt with andragogy principles

**File: `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/quiz-prompt.ts`**

In `buildQuizSystemPrompt()` function, add after "# Bloom's Taxonomy Guidelines" section (~line 206):

```
# Andragogy (Adult Learning) Principles

Design questions following adult education best practices:

## Self-Directed Assessment
- Frame questions to help learners identify their own knowledge gaps
- Include reflection-oriented questions ("Based on what you learned, how would YOU approach...")

## Experience-Based & Scenario Questions
- Connect content to practical, real-world professional scenarios
- Use case studies, situational prompts: "A colleague asks you to solve X..."
- Prioritize Apply/Analyze levels for adult relevance

## Immediate Applicability
- Prioritize questions about concepts with immediate practical value
- "How would you use this tomorrow?" type questions
- Avoid purely theoretical questions with no practical connection

## Problem-Centered Approach
- Frame questions around realistic problems, not abstract recall
- Use multi_select questions for scenarios with multiple valid approaches

## Motivation Through Competence
- Start with easier questions to build confidence (progressive difficulty)
- Write educational explanations focusing on "why this matters" not just correctness
- Celebrate learning gaps as growth opportunities in explanations
```

Also add `multi_select` question type to the prompt:

```
## Multi-Select (New! - 20-30% of quiz)
- **Best for**: Scenarios with multiple correct approaches/factors
- **Format**: Checkbox-style, 2+ correct answers from 4-6 options
- **Use when**: "Which of the following factors contribute to X?"
- **Correct answer**: Array of option IDs, e.g. ["a", "c", "e"]
- **Scoring**: Full points for exact match only
```

Mark `short_answer` as deprecated in prompt:

```
## Short Answer (DISABLED - do not generate)
- Currently disabled pending AI-powered answer evaluation
- Use multiple_choice or multi_select instead
```

---

## Step 7: Update quiz handler for multi_select validation

**File: `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/quiz-handler.ts`**

- No structural changes needed - the handler uses `quizEnrichmentContentSchema.parse()` which will accept the updated schema
- The schema changes in Step 1 handle validation

---

## Verification

1. `pnpm --filter @megacampus/shared-types build` - rebuild shared types
2. `pnpm type-check` - verify no TypeScript errors across all packages
3. `pnpm build` - full build succeeds
4. Manual test:
   - Open lesson viewer -> Enrichments tab
   - Verify quiz placeholder card appears with "Квиз" label
   - Click options -> verify question count (3/5/7/10) and difficulty selector
   - Generate quiz -> verify progress tracking and completion
   - Verify QuizPlayer displays with multiple_choice, multi_select, true_false questions
   - Verify multi-select questions show checkboxes
   - Complete quiz -> verify scoring, results, review screen
   - Verify "Квиз" label appears everywhere (not "Тест")

---

## Files Modified (Summary)

| File                                       | Change                                                         |
| ------------------------------------------ | -------------------------------------------------------------- |
| `shared-types/src/enrichment-content.ts`   | Add `multi_select` type, extend `correct_answer` for arrays    |
| `shared-types/src/enrichment-settings.ts`  | Add `multi_select` to question_types, update defaults          |
| `shared-types/src/enrichment-on-demand.ts` | Min questionCount 3 (was 5)                                    |
| `web/.../enrichment-config.ts`             | Add `'quiz'` to `ALL_PLACEHOLDER_TYPES`                        |
| `web/.../EnrichmentsPanel.tsx`             | Remove `'quiz'` from hidden types filter                       |
| `web/.../QuizPlayer.tsx`                   | Add multi_select rendering, scoring, short_answer coming soon  |
| `web/.../UnifiedEnrichmentCard.tsx`        | Default quiz questions to 5                                    |
| `web/.../EnrichmentCardOptions.tsx`        | Question count options: 3, 5, 7, 10                            |
| `web/messages/ru/enrichments.json`         | Rename "Тест" -> "Квиз", add multi-select strings              |
| `web/messages/en/enrichments.json`         | Add multi-select strings                                       |
| `course-gen-platform/.../quiz-prompt.ts`   | Add andragogy section, multi_select type, disable short_answer |
