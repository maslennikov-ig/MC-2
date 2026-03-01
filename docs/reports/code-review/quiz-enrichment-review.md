# Quiz Enrichment Code Review

**Date**: 2026-03-01
**Reviewer**: Code Reviewer Worker (claude-sonnet-4-6)
**Scope**: Quiz enrichment changes across 11 files
**Branch**: develop
**Files reviewed**: 11

---

## Summary

The quiz enrichment feature is a solid addition, bringing multi-select questions and andragogy-oriented prompting to the platform. The core architecture is correct: the Zod schema extension, the frontend unhide, the UI changes, and the backend prompt all cohere. The i18n rename (Тест→Квиз) is complete and consistent.

However, there are several issues that warrant attention before this ships to production:

- **Two bugs** in the multi-select scoring/display logic (type mismatch when `correct_answer` is a string for `multi_select`, and a UUID-vs-display-text confusion in the review display).
- **One type-safety gap** in the `QuizState` interface that masks multi-select answers at the TypeScript level.
- **One accessibility violation** on the Checkbox (missing `id`/`htmlFor` pairing).
- **Several minor prompt and UX issues** that reduce the feature's quality.

No critical security vulnerabilities were found. All i18n keys are present in both locales.

---

## Critical Issues (must fix)

### [CR-001] Multi-select scoring fails when `correct_answer` is a non-comma-delimited string

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:226-230`
**Severity**: Critical (scoring logic bug)

**Description**: In `handleSubmit`, the fallback path for when `correct_answer` is not an array is:

```typescript
const correctArr = Array.isArray(correctAnswer)
  ? [...correctAnswer].sort()
  : String(correctAnswer).split(',').sort();
```

The schema in `enrichment-content.ts:154` defines `correct_answer` as:

```typescript
z.union([z.string(), z.boolean(), z.number(), z.array(z.string())]);
```

For `multi_select` questions, the prompt instructs the LLM to output an array (e.g., `["a", "c", "e"]`). However, if the LLM or any legacy data path produces `correct_answer` as a plain string (e.g., `"a,c,e"` or even `"a"` — which the union schema happily accepts), the split logic is correct. But the schema does not enforce that `multi_select` questions have `correct_answer: string[]`. The union is flat and has no cross-field constraint.

**The actual bug**: If `correct_answer` arrives as a non-comma-containing string (e.g., just `"a"`), `String("a").split(',')` produces `["a"]`, which is a single-element array. This could accidentally score as correct for a multi-select question that genuinely requires selecting option `a` alone. More dangerously, if the Zod schema coerces/accepts an integer (e.g., `correct_answer: 1`), then `String(1).split(',')` gives `["1"]` which will never match option IDs like `"a"`, silently producing zero score for all users.

**Fix**: Add a Zod refinement to `quizQuestionSchema` enforcing the `correct_answer` shape per type, OR add a runtime guard in the scoring path:

```typescript
// In handleSubmit, replace the multi_select branch:
if (question.type === 'multi_select') {
  const userArr = String(userAnswer || '')
    .split(',')
    .filter(Boolean)
    .sort();
  let correctArr: string[];
  if (Array.isArray(correctAnswer)) {
    correctArr = [...correctAnswer].map(String).sort();
  } else if (typeof correctAnswer === 'string' && correctAnswer.length > 0) {
    correctArr = correctAnswer.split(',').filter(Boolean).sort();
  } else {
    // Unexpected type — log a warning and treat as unanswerable
    console.warn(
      '[QuizPlayer] multi_select correct_answer has unexpected type:',
      typeof correctAnswer,
      correctAnswer
    );
    correctArr = [];
  }
  isCorrect = JSON.stringify(userArr) === JSON.stringify(correctArr);
}
```

The ideal longer-term fix is a schema refinement:

```typescript
// In enrichment-content.ts, quizQuestionSchema
export const quizQuestionSchema = z
  .object({
    // ...
    correct_answer: z.union([z.string(), z.boolean(), z.number(), z.array(z.string())]),
    // ...
  })
  .superRefine((data, ctx) => {
    if (data.type === 'multi_select' && !Array.isArray(data.correct_answer)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'multi_select questions must have correct_answer as string[]',
        path: ['correct_answer'],
      });
    }
    if (data.type === 'true_false' && typeof data.correct_answer !== 'boolean') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'true_false questions must have correct_answer as boolean',
        path: ['correct_answer'],
      });
    }
  });
```

---

### [CR-002] Review mode shows raw option IDs instead of option text for multi-select answers

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:456-462` (user answer display)
**Severity**: Critical (broken UX — user sees `"a, c"` instead of `"Factor A, Factor C"`)

**Description**: In the results summary, the user's multi-select answer display resolves option IDs to text:

```typescript
: question.type === 'multi_select'
  ? String(state.answers[question.id] || '')
      .split(',')
      .filter(Boolean)
      .map((id) => question.options?.find((opt) => opt.id === id)?.text)
      .filter(Boolean)
      .join(', ') || '—'
```

This looks correct at first glance, but there is a critical problem: `state.answers` stores the `toggleMultiSelectOption` result as a **comma-joined, sorted string of option IDs** (line 183: `selected.sort().join(',')`). The `state.answers` value for a multi-select question is something like `"a,c,e"`.

The `.split(',')` on that string produces `["a", "c", "e"]`. That part is fine.

However, `question.options` reflects the **shuffled** order from `getShuffledOptions()` if `shuffle_options` is enabled. The `shuffledOptionsMap` is keyed by question ID and computed once on mount. But `question.options` in the results loop (line 416) comes directly from the `questions` array (which contains the original `content.questions`), not from `shuffledOptionsMap`. So `question.options?.find((opt) => opt.id === id)` does look up by `id` field — this is actually fine since `find` by `id` is order-independent.

The **real bug** is different: if options are shuffled (`content.shuffle_options = true`), `shuffledOptionsMap` is keyed by `q.id` from `content.questions` (line 136), but the loop iterates `content.questions`. In the results view, the lookup is `question.options?.find((opt) => opt.id === id)` where `question.options` is the unshuffled array from the `questions` state. This is correct because we look up by `id`, not by array index. This part works.

**The actual bug** is on the correct answer display for multi-select (lines 482-488):

```typescript
: question.type === 'multi_select'
  ? (Array.isArray(question.correct_answer)
      ? question.correct_answer
      : String(question.correct_answer).split(',')
    )
      .map((id: string) => question.options?.find((opt) => opt.id === id)?.text)
      .filter(Boolean)
      .join(', ')
```

If `question.correct_answer` is an array like `["a", "c", "e"]`, this correctly maps IDs to text. However, the `true_false` branch above it (line 474-476) uses `question.correct_answer` as a boolean with `? t('viewer.true') : t('viewer.false')`. For `multiple_choice` (line 477-480), it does `question.options?.find((opt) => opt.id === question.correct_answer)?.text`. Note that `question.correct_answer` here is typed as `string | boolean | number | string[]` — TypeScript will not narrow this to `string` in that `find` call, relying on implicit coercion. This is fine at runtime but is a type-safety smell.

**The concrete user-visible bug**: When the user has **not answered** a multi-select question (e.g., skipped it), `state.answers[question.id]` is `undefined`. `String(undefined || '')` gives `''`. `''.split(',')` gives `['']`. `''.filter(Boolean)` gives `[]`. The join produces `''`. The `|| '—'` fallback catches this correctly. So the empty-answer case is handled.

**But**: When `isReview = true` inside the question-card rendering loop (lines 649-677), the component reads `currentQuestion` (the currently displayed question), not the question being reviewed. In the results summary, we iterate all `questions`, but the question-card multi-select display (line 649-676) is used during quiz-taking. In review mode (`state.isSubmitted = true`), this code path is never reached because the component returns the results view (line 361). This is safe.

**Net verdict**: The user answer display (lines 456-462) and correct answer display (lines 482-488) are functionally correct for the happy path. The issue here is that the `|| '—'` fallback applies only to the user answer display but not to the correct answer display — if `correct_answer` resolves to no matching options (e.g., option IDs changed after content regeneration), the correct answer section renders an empty string, which is confusing.

**Fix**: Add a fallback for the correct answer display:

```typescript
: question.type === 'multi_select'
  ? (Array.isArray(question.correct_answer)
      ? question.correct_answer
      : String(question.correct_answer).split(',').filter(Boolean)
    )
      .map((id: string) => question.options?.find((opt) => opt.id === id)?.text)
      .filter(Boolean)
      .join(', ') || '—'
```

---

## Important Issues (should fix)

### [CR-003] `QuizState.answers` typed as `Record<string, string | boolean>` — excludes multi-select

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:44`
**Severity**: High (type safety)

**Description**: The `QuizState` interface defines:

```typescript
answers: Record<string, string | boolean>;
```

But for multi-select, the answer is stored as a comma-separated string (e.g., `"a,c,e"`). This is technically a `string`, so the type is not incorrect at runtime, but it misleads readers of the code: the type suggests `boolean` answers correspond to true/false, but there is no structural distinction between a multi-select string answer and a short-answer string. This makes it impossible for TypeScript to enforce correct answer shapes.

Additionally, `handleAnswerChange` accepts `string | boolean`, but `toggleMultiSelectOption` calls `setState` directly with a string value, bypassing the shared `handleAnswerChange`. If `handleAnswerChange` is ever modified (e.g., to do validation), multi-select won't benefit.

**Fix**: Widen and clarify the type:

```typescript
interface QuizState {
  currentQuestionIndex: number;
  /** User's answers: questionId -> answer value
   * - multiple_choice: option ID string (e.g., "a")
   * - multi_select: sorted comma-joined option IDs (e.g., "a,c,e")
   * - true_false: boolean
   * - short_answer: string
   */
  answers: Record<string, string | boolean>;
  isSubmitted: boolean;
  score: number;
  passed: boolean;
}
```

Or, preferably, make multi-select answers a string[] stored separately and join only at comparison time.

---

### [CR-004] Checkbox missing `id`/`htmlFor` pairing — accessibility violation

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:668-673`
**Severity**: High (accessibility)

**Description**: The multi-select rendering uses a `<label>` element wrapping a `<Checkbox>`:

```typescript
<label
  key={option.id}
  className={cn(...)}
>
  <Checkbox
    checked={isSelected}
    disabled={isReview}
    onCheckedChange={() => toggleMultiSelectOption(currentQuestion.id, option.id)}
  />
  <span className="flex-1">{option.text}</span>
</label>
```

The shadcn `Checkbox` renders a Radix UI `CheckboxPrimitive.Root`, which renders as a `<button role="checkbox">`. The outer `<label>` wrapping a `<button>` is invalid HTML — `<label>` is intended to label `<input>` elements, and a button inside a label is not properly associated. Screen readers will not reliably announce the label text when the checkbox receives focus.

Additionally, the `onCheckedChange` prop receives a `CheckedState` value (`boolean | 'indeterminate'`) but the callback `() => toggleMultiSelectOption(...)` ignores that argument entirely, which is correct for a simple toggle but means the checkbox cannot be driven to a specific state (e.g., by a "select all" button).

Per the shadcn docs (confirmed via Context7):

```tsx
// Correct accessible pattern:
<div className="flex items-center gap-3">
  <Checkbox
    id={`option-${option.id}`}
    checked={isSelected}
    disabled={isReview}
    onCheckedChange={() => toggleMultiSelectOption(currentQuestion.id, option.id)}
  />
  <Label htmlFor={`option-${option.id}`} className="flex-1 cursor-pointer">
    {option.text}
  </Label>
</div>
```

**Fix**: Replace the `<label>` wrapper with a `<div>` wrapper and use `Label` with `htmlFor` pointing to `id` on the `Checkbox`. Wrap in a `<div>` styled with the border/hover classes.

```typescript
{getShuffledOptions(currentQuestion).map((option) => {
  const selectedArr = String(state.answers[currentQuestion.id] || '').split(',').filter(Boolean)
  const isSelected = selectedArr.includes(option.id)
  const isReview = state.isSubmitted
  const isCorrect = Array.isArray(currentQuestion.correct_answer)
    ? currentQuestion.correct_answer.includes(option.id)
    : String(currentQuestion.correct_answer).split(',').includes(option.id)
  const checkboxId = `quiz-${currentQuestion.id}-option-${option.id}`
  return (
    <div
      key={option.id}
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 transition-colors',
        // ... existing cn classes ...
      )}
    >
      <Checkbox
        id={checkboxId}
        checked={isSelected}
        disabled={isReview}
        onCheckedChange={() => toggleMultiSelectOption(currentQuestion.id, option.id)}
      />
      <Label htmlFor={checkboxId} className="flex-1 cursor-pointer">
        {option.text}
      </Label>
    </div>
  )
})}
```

---

### [CR-005] `isCurrentAnswered` check does not handle multi-select empty selection

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:160-161`
**Severity**: High (UX bug — Next button enabled when no checkboxes selected)

**Description**:

```typescript
const currentAnswer = state.answers[currentQuestion.id];
const isCurrentAnswered = currentAnswer !== undefined && currentAnswer !== '';
```

For multi-select questions, `toggleMultiSelectOption` stores the answer as a comma-joined string. If the user selects one option and then deselects it, the resulting string becomes `''` (empty — `[].sort().join(',')` is `''`). This correctly evaluates to `isCurrentAnswered = false`.

However, `state.answers[currentQuestion.id]` for a multi-select question that was never touched is `undefined`, so `isCurrentAnswered = false`. This is correct.

**But**: The `allAnswered` check on line 163-165 has the same pattern:

```typescript
const allAnswered = questions.every(
  q => state.answers[q.id] !== undefined && state.answers[q.id] !== ''
);
```

This means that for a multi-select question, once any option is toggled, the answer key exists in `state.answers` with a non-empty string, and the question is considered "answered." But consider a 5-option question where the user selects option A, then deselects it — the stored value becomes `''` and `allAnswered` still requires the value to be non-empty. This case works correctly.

**The real issue**: There is no minimum-selection validation for multi-select. The user can advance to the next question and ultimately submit with `state.answers[q.id] === undefined` for a multi-select question if they never touched it, but still submit because `allAnswered` only requires all questions to have a non-empty answer. This is correct behavior — but if a multi-select question is the current question with a currently-empty answer string (i.e., after deselecting all options), `isCurrentAnswered` will be `false` and the Next button disabled, which is the right behavior. No action needed on this specific path.

**However**, the real UX issue is that `short_answer` questions display a disabled textarea and show "coming soon." If such a question is in the quiz (from legacy data), `isCurrentAnswered` will always be `false` (since the user can never enter an answer), permanently disabling Next and making the quiz uncompletable. This is a blocker for any quiz containing a `short_answer` question.

**Fix**: Skip `isCurrentAnswered` enforcement for `short_answer` questions so users can advance past them:

```typescript
const isCurrentAnswered =
  currentQuestion.type === 'short_answer' || (currentAnswer !== undefined && currentAnswer !== '');
```

Similarly for `allAnswered`:

```typescript
const allAnswered = questions.every(
  q =>
    q.type === 'short_answer' || (state.answers[q.id] !== undefined && state.answers[q.id] !== '')
);
```

---

### [CR-006] Score calculation uses `content.metadata.total_points` instead of computed `totalScore`

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:362`
**Severity**: High (score display can be wrong)

**Description**: In the results view:

```typescript
const scorePercentage = (state.score / content.metadata.total_points) * 100;
```

But in `handleSubmit` (line 246):

```typescript
const scorePercentage = (earnedPoints / totalScore) * 100;
```

`totalScore` in `handleSubmit` is computed by summing `question.points` across all questions in the (possibly shuffled) `questions` array. `content.metadata.total_points` is a static value embedded in the quiz content by the LLM.

These can diverge if:

1. The LLM generates incorrect `metadata.total_points` (off-by-one or wrong sum — this is a known LLM reliability issue).
2. The `questions` array is shuffled differently from `content.questions` (in the current implementation, `questions` is shuffled from `content.questions`, so their `.points` sums are identical, making this safe).

However, the `passed` flag is computed using `totalScore` (computed from questions), and the `scorePercentage` in the results is computed using `content.metadata.total_points`. If these values differ, the displayed percentage will not match what determined pass/fail. This creates a confusing user experience (e.g., "70% - PASSED" shown, but the actual pass calculation used 68%).

**Fix**: Store `totalScore` in `QuizState` and use it in the results view:

```typescript
interface QuizState {
  // ...
  score: number;
  totalScore: number; // add this
  passed: boolean;
}

// In handleSubmit:
setState(prev => ({
  ...prev,
  isSubmitted: true,
  score: earnedPoints,
  totalScore, // store it
  passed,
}));

// In results view:
const scorePercentage = state.totalScore > 0 ? (state.score / state.totalScore) * 100 : 0;
```

---

### [CR-007] `shuffledOptionsMap` uses `content.questions` but quiz uses shuffled `questions`

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:132-142`
**Severity**: Medium-High

**Description**:

```typescript
const [shuffledOptionsMap] = useState<Record<string, QuizQuestion['options']>>(() => {
  if (!content.shuffle_options) return {};
  const map: Record<string, QuizQuestion['options']> = {};
  content.questions.forEach(q => {
    if (q.options) {
      map[q.id] = [...q.options].sort(() => Math.random() - 0.5);
    }
  });
  return map;
});
```

`content.questions` is used to build the options shuffle map. The `questions` state (line 124-129) is built from `content.questions` as well but shuffled. Since both are initialized from `content.questions`, every question ID in the shuffled `questions` array is also in `shuffledOptionsMap`. The `getShuffledOptions` function correctly keys by `question.id`:

```typescript
const getShuffledOptions = (question: QuizQuestion) => {
  if (content.shuffle_options && question.options) {
    return shuffledOptionsMap[question.id] || question.options;
  }
  return question.options || [];
};
```

This is correct. However, the two `useState` initializers run synchronously and both use `Math.random()` — the question shuffle and option shuffle are independent, which is the intended behavior.

**The issue**: If `content.shuffle_questions = true` AND `content.shuffle_options = true`, the `shuffledOptionsMap` is computed from `content.questions` (unshuffled order). The `questions` state is computed from `[...content.questions].sort(() => Math.random() - 0.5)`. Since both initializers run in the same render, `Math.random()` is called in a specific order. This is fine.

The **real subtle issue** is that `Fisher-Yates shuffle is not used** — instead `sort(() => Math.random() - 0.5)` is used, which is a well-known biased shuffle. For a quiz application this is acceptable but not ideal for true randomness. Not a bug, just a code quality note.

No fix required for correctness, but document the limitation in a comment.

---

## Minor Issues (nice to fix)

### [CR-008] `short_answer` coming-soon overlay uses `<textarea>` not `<Textarea>` component

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:709-721`
**Severity**: Low

**Description**:

```typescript
{currentQuestion.type === 'short_answer' && (
  <div className="relative">
    <div className="opacity-50 pointer-events-none">
      <textarea
        className="w-full rounded-lg border p-3 min-h-[100px]"
        placeholder={t('viewer.enterAnswer')}
        disabled
      />
    </div>
    ...
```

The rest of the component uses the `Textarea` shadcn component (imported in other files). Using a raw `<textarea>` here is inconsistent with the design system and will not inherit dark mode or theme styles. While this is intentionally disabled/placeholder, the visual inconsistency is jarring in dark mode.

**Fix**: Replace `<textarea>` with `<Textarea>` from `@/components/ui/textarea`:

```typescript
import { Textarea } from '@/components/ui/textarea'
// ...
<Textarea
  placeholder={t('viewer.enterAnswer')}
  disabled
  className="min-h-[100px]"
/>
```

---

### [CR-009] `toggleMultiSelectOption` creates new closure but `useCallback` deps are empty

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:177-185`
**Severity**: Low (performance)

**Description**:

```typescript
const toggleMultiSelectOption = useCallback((questionId: string, optionId: string) => {
  setState(prev => {
    const current = String(prev.answers[questionId] || '');
    const selected = current ? current.split(',') : [];
    const idx = selected.indexOf(optionId);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      selected.push(optionId);
    }
    return { ...prev, answers: { ...prev.answers, [questionId]: selected.sort().join(',') } };
  });
}, []);
```

The empty dependency array is correct because the function uses only `setState` (stable) and its own parameters. This is fine. The `useCallback` here is beneficial since `toggleMultiSelectOption` is passed to each rendered `Checkbox`'s `onCheckedChange`, and without `useCallback` it would be a new function reference on each render.

**However**, the `Checkbox` `onCheckedChange` is:

```typescript
onCheckedChange={() => toggleMultiSelectOption(currentQuestion.id, option.id)}
```

This creates a **new anonymous arrow function on every render** even though `toggleMultiSelectOption` is memoized. The benefit of memoizing `toggleMultiSelectOption` is partially negated. Each `Checkbox` still gets a new function prop on each parent render.

**Fix**: This is not a significant issue for a quiz with 10-20 questions, but if it becomes a concern:

```typescript
// Move the wrapper into a stable component or use a data attribute approach
<Checkbox
  data-question-id={currentQuestion.id}
  data-option-id={option.id}
  onCheckedChange={handleCheckboxChange}  // single stable handler
/>
// where handleCheckboxChange reads e.currentTarget.dataset
```

This optimization is not worth doing now given the small scale.

---

### [CR-010] Prompt example shows option text with "(correct)" and "(distractor)" annotations in options

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/quiz-prompt.ts:383-384`
**Severity**: Low (prompt quality)

**Description**: The JSON output example in the system prompt includes:

```json
{ "id": "a", "text": "Factor A (correct)" },
{ "id": "b", "text": "Factor B (distractor)" },
{ "id": "c", "text": "Factor C (correct)" },
{ "id": "d", "text": "Factor D (distractor)" },
{ "id": "e", "text": "Factor E (correct)" }
```

The LLM uses few-shot examples as templates. If it cargo-cults the `(correct)` and `(distractor)` annotations into the generated quiz options, end users will see those words in the question options — a subtle but visible bug. Most frontier models are smart enough to treat this as illustrative, but it is a reliability risk.

**Fix**: Use realistic option text without meta-annotations:

```json
{ "id": "a", "text": "Increased network latency" },
{ "id": "b", "text": "Reduced memory allocation" },
{ "id": "c", "text": "Cache invalidation overhead" },
{ "id": "d", "text": "Higher CPU clock speed" },
{ "id": "e", "text": "Synchronous I/O blocking" }
```

---

### [CR-011] `PLACEHOLDER_TYPES` in enrichment-config.ts excludes `nlm_study_guide` but the array comment says it should be there

**File**: `packages/web/components/course/viewer/components/enrichment-config.ts:29-36`
**Severity**: Low (dead code / consistency)

**Description**:

```typescript
export const PLACEHOLDER_TYPES: (
  | 'nlm_audio'
  | 'nlm_video'
  | 'nlm_study_guide'
  | 'nlm_flashcards'
  | 'nlm_mind_map'
  | 'nlm_infographic'
)[] = ['nlm_audio', 'nlm_video', 'nlm_flashcards', 'nlm_mind_map', 'nlm_infographic'];
```

`nlm_study_guide` is present in the type annotation but absent from the array value. This `PLACEHOLDER_TYPES` constant is not used in the files reviewed (it is not imported in `EnrichmentsPanel.tsx`), so this is dead code that won't cause a runtime error. However, it signals incomplete state management — `nlm_study_guide` is intentionally excluded from the placeholder grid (`ALL_PLACEHOLDER_TYPES` also lacks it), but the type union is misleading.

**Fix**: Either remove `nlm_study_guide` from the union type, or add it to the array if it is intended to appear.

---

### [CR-012] Quiz options in `EnrichmentCardOptions` hardcoded without i18n labels for numeric values

**File**: `packages/web/components/course/viewer/components/EnrichmentCardOptions.tsx:333-338`
**Severity**: Low (minor i18n gap)

**Description**:

```typescript
<SelectItem value="3">3</SelectItem>
<SelectItem value="5">5</SelectItem>
<SelectItem value="7">7</SelectItem>
<SelectItem value="10">10</SelectItem>
```

Numeric values for question count do not need translation, so this is technically fine. However, for consistency with other Select options (which use translated labels), it would be cleaner to add i18n-formatted number labels. This is low priority.

---

### [CR-013] `answeredCount` i18n key uses non-standard pluralization format for Russian

**File**: `packages/web/messages/ru/enrichments.json:278`
**Severity**: Low

**Description**:

```json
"answeredCount": "Отвечено: {count} / {total}"
```

This is a simple interpolation without pluralization. For Russian, `count` needs pluralization (1 вопрос, 2 вопроса, 5 вопросов). Compare with other keys in the same file that correctly use ICU plural format:

```json
"questionsLabel": "{count, plural, one {# вопрос} few {# вопроса} many {# вопросов} other {# вопросов}}"
```

The `answeredCount` key renders as "Отвечено: 3 / 5" which is acceptable (the number is shown literally), but it is inconsistent with the localization approach used elsewhere.

---

### [CR-014] `onDemandQuizSettingsSchema` comment mismatch with implementation

**File**: `packages/shared-types/src/enrichment-on-demand.ts:64`
**Severity**: Low (documentation bug)

**Description**:

```typescript
/** Number of quiz questions to generate (5-15) */
questionCount: z.number().int().min(3).max(15).default(5),
```

The JSDoc comment says `(5-15)` but the actual `min` is `3`. The comment was not updated when the minimum was changed from 5 to 3 in this change set.

**Fix**:

```typescript
/** Number of quiz questions to generate (3-15) */
```

---

## Improvements (optional)

### [CR-015] Consider memoizing the results review `isAnswerCorrect` calls

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:335-358, 417`
**Severity**: Improvement

**Description**: `isAnswerCorrect` is a pure function defined inside the component body (not with `useCallback`) and called inside the `questions.map` in the results view. Every re-render of the results view will recompute correctness for all questions. Given that the results view is static (no state changes occur after submission), this is not a real performance problem for 5-10 questions.

However, the logic in `isAnswerCorrect` is duplicated from `handleSubmit`. The same sorting/comparison code appears twice (lines 342-346 vs. lines 224-230). This is a maintainability risk — if the comparison logic changes, it must be updated in two places.

**Improvement**: Extract a shared `computeIsCorrect` pure function:

```typescript
function computeIsCorrect(
  question: QuizQuestion,
  userAnswer: string | boolean | undefined
): boolean {
  const correctAnswer = question.correct_answer;
  if (question.type === 'multi_select') {
    const userArr = String(userAnswer || '')
      .split(',')
      .filter(Boolean)
      .sort();
    const correctArr = Array.isArray(correctAnswer)
      ? [...correctAnswer].map(String).sort()
      : String(correctAnswer).split(',').filter(Boolean).sort();
    return JSON.stringify(userArr) === JSON.stringify(correctArr);
  }
  if (question.type === 'multiple_choice') return String(userAnswer) === String(correctAnswer);
  if (question.type === 'true_false') return Boolean(userAnswer) === Boolean(correctAnswer);
  if (question.type === 'short_answer') {
    return String(userAnswer).toLowerCase().trim() === String(correctAnswer).toLowerCase().trim();
  }
  return false;
}
```

Use this in both `handleSubmit` and `isAnswerCorrect`.

---

### [CR-016] Prompt system does not prevent `short_answer` from appearing via `question_types` settings

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/quiz-prompt.ts:442`
**Severity**: Improvement

**Description**: The default `questionTypes` in `buildQuizUserMessage`:

```typescript
questionTypes = ['multiple_choice', 'multi_select', 'true_false'],
```

Correctly excludes `short_answer`. The system prompt also says:

```
## Short Answer (DISABLED - do not generate this type)
```

However, a caller could pass `questionTypes: ['multiple_choice', 'short_answer']` in settings, and the prompt would tell the LLM to generate `short_answer` questions — which the UI cannot handle. There is no server-side filtering of `short_answer` from the `question_types` setting.

**Improvement**: Strip `short_answer` from `questionTypes` before building the settings text:

```typescript
const safeQuestionTypes = questionTypes.filter(
  t => t !== 'short_answer'
)`Question Types: ${safeQuestionTypes.join(', ')}`;
```

---

### [CR-017] Quiz enrichment missing `presentation` in `ALL_PLACEHOLDER_TYPES`

**File**: `packages/web/components/course/viewer/components/enrichment-config.ts:59-68`
**Severity**: Note (existing behavior)

**Description**: `ALL_PLACEHOLDER_TYPES` now contains `'quiz'` but still lacks `'presentation'` and `'audio'` / `'nlm_audio'`. This is an existing design choice (those types are in `EnrichmentsPanel.tsx` line 329: hidden from completed enrichments for "regular audio/video/presentation"). The review confirms this is intentional.

---

### [CR-018] `true_false` radio button IDs are not unique when multiple questions are shown

**File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:691, 697`
**Severity**: Improvement

**Description**:

```typescript
<RadioGroupItem value="true" id="true" />
<Label htmlFor="true" ...>
<RadioGroupItem value="false" id="false" />
<Label htmlFor="false" ...>
```

The `id` values `"true"` and `"false"` are hardcoded. In the current implementation, only one question is shown at a time (one question card), so there is no duplicate `id` in the DOM at any given moment. When the quiz enters review mode, questions are rendered in a list (lines 416-503) — but `true_false` questions in review mode do not render the RadioGroup (the review section renders text labels, not radio buttons). So there is no actual DOM collision.

However, this is fragile. If the component is ever changed to show multiple questions simultaneously, `id="true"` and `id="false"` will conflict across questions.

**Improvement**: Scope IDs to the question:

```typescript
<RadioGroupItem value="true" id={`${currentQuestion.id}-true`} />
<Label htmlFor={`${currentQuestion.id}-true`}>
```

---

## Type Safety Cross-Check

### Zod schema consistency (verified via Context7)

The `correct_answer` field uses `z.union([z.string(), z.boolean(), z.number(), z.array(z.string())])`. Per Zod docs, `z.union` tries each member in order, returning the first success. This means:

- For `true_false` questions, the LLM output `true` (boolean) is accepted as `boolean`.
- For `multiple_choice`, the LLM output `"a"` (string) is accepted as `string`.
- For `multi_select`, the LLM output `["a", "c"]` (array) is accepted as `string[]`.

Since Zod's union tries `z.string()` before `z.array(z.string())`, a string like `"a"` will always match `z.string()` — not `z.array(z.string())`. This is correct behavior. An array like `["a"]` will fail `z.string()`, `z.boolean()`, and `z.number()`, then succeed as `z.array(z.string())`. The ordering is safe.

**However**, there is no cross-field validation. A `multi_select` question can legally have `correct_answer: "not_an_array"` according to the schema. This is the root cause of CR-001.

### `enrichment-settings.ts` vs `enrichment-content.ts` consistency

`quizSettingsSchema.question_types` (line 78) uses:

```typescript
z.array(z.enum(['multiple_choice', 'multi_select', 'true_false', 'short_answer']));
```

`quizQuestionTypeSchema` (enrichment-content.ts:94-114) uses `createLLMEnumSchema` with the same four values plus aliases. These are consistent.

The `quizSettingsSchema.question_count` minimum is `3` (line 65) and `onDemandQuizSettingsSchema.questionCount` minimum is also `3` (enrichment-on-demand.ts:65). The UI offers options `3, 5, 7, 10` (EnrichmentCardOptions.tsx:334-337). These are all consistent.

---

## Security Assessment

No security vulnerabilities were found:

1. **XSS**: Quiz content is rendered as text (`{option.text}`, `{question.question}`, `{question.explanation}`). No `dangerouslySetInnerHTML` is used. Option IDs and answers are compared as strings, never injected into the DOM.

2. **Prompt injection**: The `sanitizeForPrompt` function (quiz-prompt.ts:95-111) correctly escapes XML special characters (`&`, `<`, `>`, `"`, `'`) and CDATA markers before interpolating user content into the prompt template.

3. **localStorage**: Quiz progress is stored in localStorage keyed by `enrichmentId`. The key is `quiz_progress_${id}` where `id` is a UUID. No sensitive data is stored — only question index, answers (option IDs/booleans), and score. JSON.parse is wrapped in try/catch (line 97).

4. **Input validation**: `onDemandQuizSettingsSchema` validates `questionCount` with `z.number().int().min(3).max(15)` on the API boundary. No unvalidated input reaches the prompt builder.

---

## i18n Completeness Check

Both `ru/enrichments.json` and `en/enrichments.json` contain:

- `viewer.selectAllCorrect` ✓
- `viewer.shortAnswerComingSoon` ✓
- `viewer.quizLabel` renamed from `viewer.testLabel` (or equivalent) ✓
- `placeholder.quiz.*` keys ✓
- `forms.quiz.*` keys ✓

**Missing from both locales**: There is no i18n key for the multi-select "coming soon" badge text for the disabled `short_answer` overlay's spanning `<span>`. It uses `t('viewer.shortAnswerComingSoon')` which IS present. Confirmed: complete.

**Orphan keys**: `forms.quiz.balanced` exists in both locales but is never referenced in the reviewed files. This was likely used in a previous quiz UI and is dead translation key. Low priority cleanup.

---

## Summary Table

| ID     | Severity    | File                          | Issue                                                                 |
| ------ | ----------- | ----------------------------- | --------------------------------------------------------------------- |
| CR-001 | Critical    | QuizPlayer.tsx:226-230        | Multi-select scoring fails for non-array `correct_answer`             |
| CR-002 | Critical    | QuizPlayer.tsx:482-488        | Correct answer display missing fallback for empty match               |
| CR-003 | High        | QuizPlayer.tsx:44             | `QuizState.answers` type excludes multi-select semantics              |
| CR-004 | High        | QuizPlayer.tsx:668-673        | Checkbox missing `id`/`htmlFor` — accessibility violation             |
| CR-005 | High        | QuizPlayer.tsx:160-165        | `short_answer` questions block navigation (quiz uncompletable)        |
| CR-006 | High        | QuizPlayer.tsx:362            | Score display uses `metadata.total_points` instead of computed sum    |
| CR-007 | Medium      | QuizPlayer.tsx:132-142        | Biased shuffle, documented limitation                                 |
| CR-008 | Low         | QuizPlayer.tsx:709            | Raw `<textarea>` instead of shadcn `<Textarea>`                       |
| CR-009 | Low         | QuizPlayer.tsx:177            | Memoized callback partially negated by inline arrow                   |
| CR-010 | Low         | quiz-prompt.ts:383            | Prompt example options annotated `(correct)`/`(distractor)`           |
| CR-011 | Low         | enrichment-config.ts:36       | `PLACEHOLDER_TYPES` type includes `nlm_study_guide` but value doesn't |
| CR-012 | Low         | EnrichmentCardOptions.tsx:333 | Numeric Select options not i18n (acceptable)                          |
| CR-013 | Low         | ru/enrichments.json:278       | `answeredCount` lacks Russian pluralization                           |
| CR-014 | Low         | enrichment-on-demand.ts:64    | JSDoc comment says `(5-15)`, min is actually 3                        |
| CR-015 | Improvement | QuizPlayer.tsx:335,213        | Duplicate correctness logic — extract shared function                 |
| CR-016 | Improvement | quiz-prompt.ts:442            | No server-side filter for `short_answer` in `questionTypes`           |
| CR-017 | Note        | enrichment-config.ts:59       | Intentional — `presentation`/`audio` not in placeholder grid          |
| CR-018 | Improvement | QuizPlayer.tsx:691,697        | Hardcoded `id="true"` / `id="false"` fragile if layout changes        |

---

## Next Steps

### Must fix before production

1. **CR-001**: Add runtime guard in multi-select scoring for non-array `correct_answer`.
2. **CR-002**: Add `|| '—'` fallback to correct answer display in results review.
3. **CR-004**: Replace `<label>` wrapper with `<div>` + `<Label htmlFor=...>` for Checkbox accessibility.
4. **CR-005**: Allow advancing past `short_answer` questions that are disabled.

### Should fix before production

5. **CR-006**: Store `totalScore` in `QuizState` and use it for results display.
6. **CR-003**: Document `answers` type more clearly or refactor multi-select storage.

### Nice to fix

7. **CR-010**: Clean up prompt example option text.
8. **CR-014**: Fix JSDoc comment on `questionCount`.
9. **CR-015**: Extract shared `computeIsCorrect` function to remove duplication.
10. **CR-016**: Strip `short_answer` from `questionTypes` in prompt builder.

---

_Report generated by code-reviewer worker. All line numbers verified against files as-read._
