# Fix: Course title not translated to target language

## Context

Course YTH-0951 was created with `language = 'en'` but the user typed the title in Russian ("Как стать счастливым"). All generated content (sections, lessons) is correctly in English, but `courses.title` stayed in Russian.

**Root cause** (two issues):

1. **Prompt gap**: Stage 5 metadata prompt passes `**Course Title**: <user input>` and `**Target Language**: en` but **never explicitly instructs** the LLM to generate `course_title` in the target language. The LLM sometimes preserves the user's original language.

2. **Missing sync-back**: Even when Stage 5 generates a proper `course_title` in `course_structure` JSONB, this value is **never written back** to `courses.title`. The UI always reads `courses.title`, not `course_structure.course_title`.

## Plan

### Step 1: Add language instruction to metadata prompt

**File**: `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts` (~line 607)

In `buildMetadataPrompt()`, add an explicit instruction in the Quality Requirements section:

```
6. ALL generated text (course_title, course_description, learning_outcomes, etc.) MUST be written in the **Target Language** (${language}). Even if the input Course Title is in a different language, translate/adapt it to the target language.
```

### Step 2: Sync `course_structure.course_title` back to `courses.title`

**File**: `packages/course-gen-platform/src/stages/stage5-generation/handler.ts` (~line 385)

In `commitAndFinalize()`, add `title` (and `course_description` if generated) to the update:

```typescript
const { error: structureError } = await supabaseAdmin
  .from('courses')
  .update({
    course_structure: structureWithIds,
    generation_metadata: result.generation_metadata,
    // Sync LLM-generated title/description back to courses table
    ...(structureWithIds.course_title ? { title: structureWithIds.course_title } : {}),
    ...(structureWithIds.course_description
      ? { course_description: structureWithIds.course_description }
      : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', courseId);
```

### Step 3: Fix alignment validation for cross-language titles

**File**: `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts` (~line 750)

Current code only skips alignment penalty for non-English languages, but for `language === 'en'` it penalizes if `course_title` doesn't contain the first 10 chars of user input. When user input is in Russian and target is English, this wrongly penalizes a correct English translation.

Fix: Skip alignment check when input title language differs from target language (detect via character set or simply skip the check entirely, since the LLM's title is validated elsewhere).

```typescript
// Check title matches - skip when input title uses different script than target language
// (e.g., Russian input with language="en" should generate English title)
const inputTitle = input.frontend_parameters.course_title || '';
const inputHasCyrillic = /[\u0400-\u04FF]/.test(inputTitle);
const targetIsNonCyrillic = language !== 'ru';

if (
  language === 'en' &&
  !(inputHasCyrillic && targetIsNonCyrillic) &&
  metadata.course_title &&
  inputTitle &&
  !metadata.course_title.toLowerCase().includes(inputTitle.toLowerCase().substring(0, 10))
) {
  alignmentScore -= 0.3;
}
```

## Files to modify

1. `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts` (prompt + validation)
2. `packages/course-gen-platform/src/stages/stage5-generation/handler.ts` (sync-back)

## Verification

1. `pnpm --filter course-gen-platform type-check` — no type errors
2. `pnpm --filter course-gen-platform build` — builds successfully
3. `pnpm --filter course-gen-platform test` — existing tests pass
4. Manual: create a test course with Russian title + `language=en`, verify title is translated after Stage 5
