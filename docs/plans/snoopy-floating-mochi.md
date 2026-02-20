# Fix: Intro/Sections Content Duplication (KVU-2757)

## Context

Course KVU-2757, lesson 2.1 shows content duplication: the `## Введение` section is extracted into a separate `intro` field, rendered in a styled box, and then sections repeat the same topics below it. Weak models (xiaomi/mimo-v2-flash) ignore the 100-150 word intro limit and generate a full lesson as the introduction, causing visible content overlap.

This is the same pattern as the conclusion duplication fixed in `770b331d`. The fix follows the same approach: **stop treating the introduction as a separate structural element**.

### Root Cause

1. `parseMarkdownContent()` extracts `## Введение` into `introduction` field (without the `##` header), and filters it out of the `sections` array via `SPECIAL_SECTIONS`
2. `extractContentBody()` maps it to `contentBody.intro`
3. Frontend renders `intro` in a styled blue box, then renders sections WITHOUT `## Title` headers below it
4. Duplication detector only compares sections vs sections, not intro vs sections

## Plan

### Step 1: Relax Zod schema for `intro` field

**File**: `packages/shared-types/src/lesson-content.ts:290`

```
// From:
intro: z.string().min(50),
// To:
intro: z.string(),
```

This allows empty `intro` for new content while remaining backward-compatible with old data.

### Step 2: Stop excluding Introduction from `sections` array

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/markdown-parser.ts`

In `buildSpecialSections()` (~line 117): **remove** the line that adds introduction labels:

```
sections.add(labels.introduction.toLowerCase());
```

Result: `extractSections()` will now include `## Введение` as a regular section with `{ title: "Введение", content: "..." }`.

### Step 3: Set `intro` to empty in markdown-to-body conversion

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/judge-helpers.ts:77`

```
// From:
intro: parsedMarkdown.introduction || parsedMarkdown.summary || '',
// To:
intro: '',
```

Introduction content is now in `sections[0]`, not in `intro`.

### Step 4: Remove 'introduction' from required heuristic sections

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/constants.ts:33`

```
// From:
requiredSections: ['introduction', 'exercises'],
// To:
requiredSections: ['exercises'],
```

The intro section will now be detected as a regular section by `checkRequiredSections()`.

### Step 5: Make intro conditional in judge prompts

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts:212-214`

```typescript
// From:
## ${labels.introduction}
${lessonContent.intro}
// To:
${lessonContent.intro ? `## ${labels.introduction}\n${lessonContent.intro}\n` : ''}
```

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/single-judge.ts:40-42`

Same change as clev-voter.

### Step 6: Update targeted-refinement content-utils

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/content-utils.ts:24-26`

For `sec_intro` / `intro` case: fall back to first section content when `body.intro` is empty:

```typescript
if (sectionId === 'sec_intro' || sectionId === 'intro') {
  if (body.intro) return body.intro;
  return body.sections.length > 0 ? body.sections[0].content : '';
}
```

### Step 7: Fix frontend rendering

**File**: `packages/web/components/common/lesson-content.tsx`

**7a.** Lines 159-182 — stop extracting intro separately, fix missing section titles:

```typescript
const sectionParts: string[] = [];

// If old data has intro, prepend it as a regular section
const oldIntro = typeof innerContent.intro === 'string' ? innerContent.intro.trim() : '';
if (oldIntro) {
  sectionParts.push(oldIntro);
}

// Add sections WITH ## Title headers (currently missing!)
if (Array.isArray(innerContent.sections)) {
  for (const section of innerContent.sections) {
    const sectionObj = section as { title?: string; content?: string };
    if (sectionObj.title && sectionObj.content) {
      sectionParts.push(`## ${sectionObj.title}\n\n${sectionObj.content}`);
    }
  }
}

return {
  introText: '', // Never show intro box
  mainContent: sectionParts.join('\n\n'),
};
```

**7b.** Lines 398-406 — the intro box will never render since `introText` is always empty. Can be removed or left as dead code (cleaned up later).

### Step 8: Cleanup section-regenerator intro path

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/section-regenerator.ts`

The `regenerateIntroduction()` function (lines 106-135) and its usage at line 222 handle the `introduction` section ID. Since `introduction` is now a regular section, this path should redirect to the standard `generateSection()` path. Update `findSectionSpec()` to match introduction sections:

```typescript
// Lines 82-86: Instead of returning null for 'introduction', find the first section
if (sectionId === 'introduction') {
  return lessonSpec.sections.length > 0 ? lessonSpec.sections[0] : null;
}
```

## Files Modified (Summary)

| File                                                    | Change                                          |
| ------------------------------------------------------- | ----------------------------------------------- |
| `shared-types/src/lesson-content.ts`                    | Relax `intro` Zod `.min(50)` to allow empty     |
| `stage6/.../utils/markdown-parser.ts`                   | Remove intro from `SPECIAL_SECTIONS` exclusion  |
| `stage6/.../judge/judge-helpers.ts`                     | Set `intro: ''` in markdown fallback path       |
| `stage6/.../judge/cascade/constants.ts`                 | Remove `'introduction'` from `requiredSections` |
| `stage6/.../judge/clev-voter.ts`                        | Make intro conditional in prompt                |
| `stage6/.../judge/cascade/single-judge.ts`              | Make intro conditional in prompt                |
| `stage6/.../judge/targeted-refinement/content-utils.ts` | Fallback to first section when intro empty      |
| `stage6/.../utils/section-regenerator.ts`               | Route `introduction` to standard section path   |
| `web/components/common/lesson-content.tsx`              | Stop intro box, fix section title rendering     |

## Verification

1. `pnpm type-check` — type safety across shared-types and course-gen-platform
2. `pnpm build` — successful build
3. Regenerate lesson 2.1 of KVU-2757 and verify:
   - No styled intro box rendered separately
   - `## Введение` appears as normal section with header
   - Sections have `## Title` headers
   - No content duplication between intro and sections
4. Check that existing courses (old data format with populated `intro`) render correctly:
   - Old intro content appears as text before sections
   - No crash, no missing content
5. Run duplication-checks — intro section now included in section-vs-section overlap detection automatically
