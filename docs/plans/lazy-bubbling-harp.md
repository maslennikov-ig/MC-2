# Plan: Hide audio, video, presentation, quiz from UI

## Context

Regular enrichment types (`audio`, `video`, `presentation`, `quiz`) should be temporarily hidden from the UI. Only NLM variants (`nlm_audio`, `nlm_video`) and image types (`cover`, `card`) remain visible, along with NLM-specific types (`nlm_flashcards`, `nlm_mind_map`, `nlm_infographic`).

The user confirmed these 4 types should be hidden: **audio, video, presentation, quiz**.

## Changes

### 1. `packages/web/components/course/viewer/components/enrichment-config.ts`

**`PLACEHOLDER_TYPES` (line 29)** — remove `'quiz'`, `'audio'`, `'presentation'`, `'video'`:

```ts
// Before: ['quiz', 'audio', 'presentation', 'video', 'nlm_audio', 'nlm_video', ...]
// After:
export const PLACEHOLDER_TYPES = [
  'nlm_audio',
  'nlm_video',
  'nlm_flashcards',
  'nlm_mind_map',
  'nlm_infographic',
];
```

**`ALL_PLACEHOLDER_TYPES` (line 73)** — remove `'quiz'`, `'audio'`, `'presentation'`, `'video'`:

```ts
// Before: ['cover', 'card', 'quiz', 'audio', 'nlm_audio', 'presentation', 'video', 'nlm_video', ...]
// After:
export const ALL_PLACEHOLDER_TYPES = [
  'cover',
  'card',
  'nlm_audio',
  'nlm_video',
  'nlm_flashcards',
  'nlm_mind_map',
  'nlm_infographic',
];
```

Type definitions (`EnrichmentType`, `GeneratableEnrichmentType`) and `ENRICHMENT_CONFIG` — **keep unchanged** (they're used by type guards and may still have completed DB rows).

### 2. `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

**`completedEnrichments` filter (line 319)** — also hide completed regular audio/video/presentation/quiz:

```ts
// Add after line 326 (nlm_study_guide filter):
const HIDDEN_ENRICHMENT_TYPES = new Set(['audio', 'video', 'presentation', 'quiz']);
// ...
if (HIDDEN_ENRICHMENT_TYPES.has(e.enrichment_type)) return false;
```

This prevents legacy completed rows in DB from appearing.

### 3. `packages/web/components/common/lesson-materials-switcher.tsx`

**Video lookup (line 88)** — restrict to NLM only:

```ts
// Before: isType(e, 'video') || isType(e, 'nlm_video')
// After:  isType(e, 'nlm_video')
```

**Audio lookup (line 111)** — restrict to NLM only:

```ts
// Before: isType(e, 'audio') || isType(e, 'nlm_audio')
// After:  isType(e, 'nlm_audio')
```

**Quiz lookup (line 117)** — hide:

```ts
// Before: completedEnrichments.find((e) => isType(e, 'quiz') && !!e.content)
// After: set hasQuiz = false (or remove the find, keep the variable)
const quizEnrichment = null;
const hasQuiz = false;
```

**Presentation lookup (line 121)** — hide:

```ts
const presentationEnrichment = null;
const hasPresentation = false;
```

## NOT changing

- Type definitions — DB may have existing rows with these types
- `ENRICHMENT_CONFIG` — metadata record, used by type guards
- Backend / generation handlers — unchanged
- `nlm_study_guide` — already hidden separately
- Generation-graph inspector config — already doesn't show these

## Verification

1. `pnpm --filter @megacampus/web type-check` passes
2. `pnpm --filter @megacampus/web build` passes
3. Open lesson with enrichments on dev → no Audio, Video, Presentation, Quiz cards visible
4. NLM Audio, NLM Video cards still visible
5. Cover and Card image placeholders still visible
6. Lesson materials switcher: only NLM audio/video tabs appear (not regular)
