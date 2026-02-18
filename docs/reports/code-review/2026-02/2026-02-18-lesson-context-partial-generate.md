# Code Review: lesson_context for partialGenerate + clickable next-lesson card

**Commit**: `089de18a`
**Date**: 2026-02-18
**Reviewer**: Code Review Agent
**Branch**: `develop`

---

## Summary

This commit adds `lesson_context` (with `course_position`, previous/next lesson, and already-covered
concepts) to `partialGenerate` and `generateMissing`, and makes the "next lesson" card a clickable
button in the frontend. The implementation is generally correct and well-structured. Six issues were
found — one major, three minor, and two nits — none of which are blockers for merge.

---

## Comparison with Stage 5 (v2-converter.ts)

The reference implementation is `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/v2-converter.ts`
function `buildLessonContext`.

The new `buildLessonContextFromStructure` in `helpers.ts` largely mirrors Stage 5. Differences found:

| Aspect                                | Stage 5 (`v2-converter.ts`)             | New (`helpers.ts`)                                     | Delta          |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------ | -------------- |
| `previous_lesson.key_concepts` source | `prev.lesson.key_topics`                | `prev.objectives` (lesson_objectives)                  | **Diverges**   |
| `next_lesson.key_concepts` count      | max 3                                   | max 5                                                  | Minor          |
| `previous_lesson.summary_preview`     | included (`objectives.slice(0,2).join`) | omitted (comment says "no summary_preview per schema") | Schema-correct |
| `concepts_already_covered`            | `key_topics` from all previous          | same                                                   | Matches        |
| `terms_already_defined`               | `prev.key_topics.slice(0,10)`           | same                                                   | Matches        |
| `course_position`                     | all fields populated                    | all fields populated                                   | Matches        |
| `section_title` lookup                | via `allSections[sectionIndex]`         | via `sections.find` with section_number                | Equivalent     |

---

## Issues Found

### MAJOR

---

#### M-1: `previous_lesson.key_concepts` uses `objectives` instead of `key_topics`

**File**: `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts`
**Lines**: 169-175

**Description**:

In Stage 5 (`v2-converter.ts` line 130), `previous_lesson.key_concepts` is populated from
`prev.lesson.key_topics`. In the new implementation it is populated from `prev.objectives`
(which maps to `lesson_objectives`):

```typescript
// helpers.ts — current (WRONG)
const previous_lesson = prev
  ? {
      lesson_id: prev.id,
      title: prev.title,
      key_concepts: prev.objectives.slice(0, 5), // objectives = lesson_objectives
    }
  : null;
```

```typescript
// v2-converter.ts — reference (CORRECT)
previousLesson = {
  lesson_id: getLessonId(prev.sectionIdx, prev.lessonIdx),
  title: prev.lesson.lesson_title,
  key_concepts: (prev.lesson.key_topics || []).slice(0, 5), // key_topics
  summary_preview: (prev.lesson.lesson_objectives || []).slice(0, 2).join('. ') || undefined,
};
```

`key_concepts` is semantically meant to be the actual topic concepts (vocabulary, terms), not
learning objectives (which are outcome statements). Sending objectives in place of key concepts
causes the LLM to receive goal-oriented statements ("The student will be able to...") where it
expects concept labels ("REST API", "HTTP methods"). This degrades inter-lesson coherence.

**Fix**:

In `buildLessonContextFromStructure`, store `keyTopics` per lesson and use it:

```typescript
// The flat list already collects keyTopics; use that, not objectives
const previous_lesson = prev
  ? {
      lesson_id: prev.id,
      title: prev.title,
      key_concepts: prev.keyTopics.slice(0, 5), // was: prev.objectives
    }
  : null;
```

`prev.keyTopics` is already in the `allLessons` array — no other change needed.

---

### MINOR

---

#### m-1: `next_lesson.key_concepts` cap is 5 vs Stage 5's 3 — inconsistency

**File**: `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts`
**Line**: 183

**Description**:

Stage 5 caps `next_lesson.key_concepts` at 3 (`(next.lesson.key_topics || []).slice(0, 3)`).
The new implementation caps at 5 (`next.objectives.slice(0, 5)`). Beyond the wrong source
field (covered in M-1), the cap itself differs. The `AdjacentLessonContextSchema` allows
max 5 (`.max(5)`) for `key_concepts`, so 5 is schema-valid, but it is inconsistent with
Stage 5 which uses 3 for the next lesson.

Additionally, `next.objectives` is being used here for the same reason as M-1 — should be
`next.keyTopics`.

**Fix**:

```typescript
const next_lesson = next
  ? {
      lesson_id: next.id,
      title: next.title,
      key_concepts: next.keyTopics.slice(0, 3), // consistent with Stage 5
    }
  : null;
```

---

#### m-2: `currentIdx === -1` is not handled — silent wrong data if lessonId not found

**File**: `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts`
**Lines**: 164-165, 200-212

**Description**:

If `lessonId` is not found in `allLessons` (e.g. a corrupt `course_structure` where
`section_number` gaps cause the generated ID to differ from `lessonId`), `currentIdx`
is `-1`. The code continues:

```typescript
const currentIdx = allLessons.findIndex(l => l.id === lessonId);
const current = allLessons[currentIdx]; // allLessons[-1] is undefined in JS
```

In JavaScript `array[-1]` is `undefined`, not a runtime error, so:

- `current` is `undefined`
- `prev` check `currentIdx > 0` is false (since `-1 > 0` is false) → `previous_lesson = null`
- `next` check `currentIdx < allLessons.length - 1` is true for any non-empty array → wrong next lesson
- `course_position.module_title` falls back to `Module ${sectionNumber}` which is fine
- But `lesson_index_in_course` becomes `0` (i.e. `-1 + 1`) which is invalid per schema (`min(1)`)

The returned `LessonContext` would have `course_position.lesson_index_in_course = 0` which
fails Zod validation if the spec is ever re-validated.

**Fix**:

Add an early guard and log:

```typescript
const currentIdx = allLessons.findIndex(l => l.id === lessonId);
if (currentIdx === -1) {
  // lessonId not in flat list — return minimal context without adjacency
  return {
    previous_lesson: null,
    next_lesson: null,
    concepts_already_covered: [],
    terms_already_defined: [],
    course_position: {
      lesson_index_in_module: parseInt(lessonId.split('.')[1] ?? '1', 10),
      total_lessons_in_module: 1,
      module_index: sectionNumber,
      total_modules: sections.length,
      lesson_index_in_course: 1,
      total_lessons_in_course: allLessons.length,
      module_title: `Module ${sectionNumber}`,
    },
  };
}
```

---

#### m-3: N+1 Supabase queries for lesson existence check in both procedures

**File**: `packages/course-gen-platform/src/server/routers/lesson-content/procedures/partial-generate.ts`
**Lines**: 488-571

**File**: `packages/course-gen-platform/src/server/routers/lesson-content/procedures/generate-missing.ts`
**Lines**: 451-516

**Description**:

In Step 5.5 (partial-generate) and Step 9.5 (generate-missing), the code iterates over each
`lessonSpec` and issues two Supabase queries per lesson:

1. `SELECT id FROM sections WHERE course_id = ? AND order_index = ?`
2. `SELECT id FROM lessons WHERE section_id = ? AND order_index = ?`

For a course with 30 missing lessons this is 60 sequential queries, all inside a for-loop
(not parallelized). This was pre-existing in partial-generate but is now replicated in
generate-missing.

The section lookup is especially inefficient: for lessons in the same section the same section
row is re-fetched. The section IDs could be resolved once before the loop.

This is unlikely to cause user-visible latency issues for typical courses (5-20 lessons), but
it is an anti-pattern worth noting.

**Suggested improvement** (non-blocking):

Batch the section IDs lookup before the loop:

```typescript
// Resolve section IDs once, grouped by sectionNum
const sectionNumToId = new Map<number, string>();
const uniqueSectionNums = [
  ...new Set(lessonSpecs.map(s => parseLessonId(s.lesson_id)?.sectionNum).filter(Boolean)),
];
const { data: sectionRows } = await supabase
  .from('sections')
  .select('id, order_index')
  .eq('course_id', courseId)
  .in('order_index', uniqueSectionNums);
(sectionRows ?? []).forEach(r => sectionNumToId.set(r.order_index, r.id));
```

Then use `sectionNumToId.get(sectionNum)` inside the loop.

---

### NIT

---

#### n-1: Import order violation — imports are split across the file

**File**: `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts`
**Lines**: 19-41

**Description**:

The exported types `LessonFromStructure` and `SectionFromStructure` are declared at lines 19-26,
then there is a second `import` block at lines 34-41 (the semantic-scaffolding imports). TypeScript
`import` statements after `export type` declarations is legal but breaks the conventional pattern
of grouping all imports at the top of the file. This was likely a merge artefact.

**Fix**: Move the `import { inferTargetAudience, ... }` block to the top with the other imports.

---

#### n-2: `onNextLesson` is not passed in the non-focus-mode `ContentFormatSwitcher` in LessonView — duplicate navigation opportunity missing

**File**: `packages/web/components/course/viewer/components/LessonView.tsx`
**Lines**: 285-302

**Description**:

In focus mode (line 193), `onNextLesson={onNext}` is correctly passed to `LessonContent`.
In the tab-based (non-focus) mode, `onNextLesson={onNext}` is also passed to `ContentFormatSwitcher`
(line 300) which passes it through to `LessonContent` — this is correct.

No issue here with the implementation itself. However, the navigation footer (lines 196-232,
"Previous/Next" buttons) appears only in focus mode. In normal tab mode the next-lesson card
is the only in-content navigation element. This is intentional design and not a bug, but worth
a comment clarifying that the bottom nav bar is focus-mode-only, to avoid future confusion.

---

## Accessibility Review (Frontend)

**File**: `packages/web/components/common/lesson-content.tsx`
**Lines**: 416-444

The clickable next-lesson card uses `<button type="button">` with `onClick`. This is correct
semantically. The button:

- Has `type="button"` — prevents accidental form submission.
- Contains visible text (lesson title) — screen readers can announce it.
- Has `cursor-pointer` class — visual affordance is correct.
- `ArrowRight` icon has no `aria-hidden="true"` — screen readers will try to read the SVG title.
  This is a nit: decorative icons should have `aria-hidden="true"` or a `title` attribute.

No critical accessibility issues. The `hover:translate-x-1` arrow animation is purely visual
with no adverse effect on screen readers.

---

## Security Review (Frontend)

No XSS or injection concerns found. The `nextLesson.title` and `nextLesson.objectives` are
rendered as React text nodes (not `dangerouslySetInnerHTML`), so they are safe regardless of
content. No user-controlled URLs are constructed.

---

## Code Duplication

The following helper functions are duplicated verbatim between `partial-generate.ts` and
`generate-missing.ts`:

- `buildLessonId`
- `resolveSectionNumber`
- `parseLessonId`
- `findLessonByOrder`

These were already present before this commit and are pre-existing debt. They could be moved
to `helpers.ts` (which already serves as the shared utility module for this router). This commit
did not introduce the duplication, but it is an opportune moment to consolidate.

The FSM status transition logic (Steps 3.5/7 in each procedure) is also near-identical, and
could be extracted to a shared `transitionToStage6` helper function.

---

## Overall Assessment

**Verdict: Approve with fixes recommended**

The implementation is functionally sound and matches Stage 5 logic in structure. The most
important issue (M-1) causes the LLM to receive learning objectives instead of key concepts
as `previous_lesson.key_concepts`, which will degrade inter-lesson coherence quality. This
should be fixed before the feature is promoted to staging.

The other issues are either minor quality concerns (M-2: edge case guard) or pre-existing
patterns (M-3: N+1 queries). The frontend changes are clean and accessible.

**Priority fixes before staging deploy:**

1. Fix M-1 — `previous_lesson.key_concepts` must use `keyTopics`, not `objectives`
2. Fix m-2 — guard against `currentIdx === -1`

**Can be deferred:**

3. m-1 — Align `next_lesson.key_concepts` cap with Stage 5 (3 vs 5)
4. m-3 — Batch section ID queries
5. n-1 — Import order
6. n-2 — Add `aria-hidden` to decorative icons
