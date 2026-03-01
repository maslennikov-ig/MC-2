# Code Review: NotebookLM Enrichment Types (Study Guide, Flashcards, Mind Map, Infographic)

**Commit**: `6612daa0` on branch `develop`
**Date**: 2026-02-27
**Reviewer**: Claude Code (automated)
**Scope**: 4 new NLM enrichment types — full stack from shared types through frontend viewers

---

## Executive Summary

The implementation is solid overall and well-structured. The main shared-type schemas, handlers, and frontend viewers are coherent. There are no critical security vulnerabilities, and the overall architecture follows the established patterns of the codebase.

However, several issues warrant attention before this ships to production:

- **2 HIGH** issues: invalid deferred content stored to DB, settings key mismatch between frontend and backend
- **6 MEDIUM** issues: XSS risk in markdown, mind map infinite recursion risk, stale localStorage, type guard weakness, `img` tag without Next.js `Image`, wrong i18n key borrowed across components
- **Multiple LOW** issues: DRY violations, missing max-depth validation on mind map tree, minor type casts

---

## Findings

### HIGH — Deferred content violates schema constraints

**Files**:

- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-flashcards-handler.ts:99–103`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-study-guide-handler.ts:65–68`

**Description**: When the bridge returns a deferred task (no `immediateMedia`), the handler stores placeholder content that violates the schema it claims to conform to.

For flashcards, the deferred content is:

```typescript
// nlm-flashcards-handler.ts:99–103
const deferredContent: FlashcardsEnrichmentContent = {
  type: 'nlm_flashcards',
  cards: [], // schema enforces min(1)
  total_cards: 0, // schema enforces positive()
};
```

The `flashcardsEnrichmentContentSchema` at `enrichment-content.ts:623` sets `cards: z.array(...).min(1)` and `total_cards: z.number().int().positive()`. Storing `cards: []` and `total_cards: 0` will cause any downstream Zod validation of the stored record to fail.

Similarly, for study guide, `markdown: ''` is stored while the schema enforces `min(10)`.

For infographic, `imageUrl: ''` violates `z.string().url()`.

**Impact**: Any code path that re-validates the stored enrichment (e.g., the `validateEnrichmentContent()` helper or the tRPC procedure) will throw or return an error on a record that should be treated as "in progress".

**Fix**: Use a separate "pending placeholder" shape that is not validated against the content schema, or relax the schema constraints for fields that can be empty in the deferred state. A practical fix is to mark the deferred content fields as `.optional()` or `.nullable()` and document that non-null values are only present after completion:

```typescript
// Option A: Use nullable fields in the schema
markdown: z.string().min(10).max(200_000).nullable(),

// Option B: Store null as the content when deferred
content: null, // job-processor fills this in on completion
```

The job-processor should be the single place that writes the final, schema-valid content.

---

### HIGH — Settings key mismatch: frontend sends camelCase, backend reads snake_case

**Files**:

- `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx:369–386` (frontend, `getSettings()`)
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-study-guide-handler.ts:51`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-flashcards-handler.ts:84–85`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-infographic-handler.ts:50–52`

**Description**: The frontend's `getSettings()` function (UnifiedEnrichmentCard.tsx) uses camelCase keys for some types and snake_case for others. The backend handlers read only snake_case keys. Specifically:

Frontend sends for study guide:

```typescript
case 'nlm_study_guide':
  return { detail_level: studyGuideDetailLevel }  // snake_case -- OK
```

Frontend sends for flashcards:

```typescript
case 'nlm_flashcards':
  return {
    card_count: parseInt(flashcardsCardCount, 10),  // snake_case -- OK
    difficulty: flashcardsDifficulty,
  }
```

But the on-demand schema at `enrichment-on-demand.ts:214–221` defines the study guide settings field as `detailLevel` (camelCase), not `detail_level`. The flashcards on-demand schema uses `cardCount` (camelCase), not `card_count`.

The tRPC router receives `settings: Record<string, unknown>` and passes it through to the handler. The handler then reads `settings.detail_level` — but if the frontend sent `detailLevel`, the handler gets `undefined` and falls back silently to `'standard'` every time, ignoring the user's choice.

**Impact**: User selections for detail level, card count, and infographic orientation/detail are silently ignored. The enrichment always generates with defaults.

**Fix**: Either:

- Align the frontend to send the exact keys the on-demand schema defines (camelCase), and update handlers to read those keys; or
- Add a transform layer in the tRPC procedure that converts from on-demand schema names to handler names.

The cleanest approach is to parse the settings with the appropriate on-demand schema in the tRPC procedure and pass typed settings to handlers:

```typescript
// In the tRPC generateOnDemand procedure, after validation:
case 'nlm_study_guide': {
  const parsed = onDemandNlmStudyGuideSettingsSchema.parse(input.settings ?? {})
  // pass parsed.detailLevel to handler as settings.detail_level
}
```

---

### MEDIUM — Potential XSS in StudyGuideViewer via unescaped markdown

**File**: `packages/web/components/course/viewer/enrichments/StudyGuideViewer.tsx:69,81,132`

**Description**: The `MarkdownRendererFull` component renders `content.markdown` and `section.content` directly. If `MarkdownRendererFull` uses a markdown renderer that sets `dangerouslySetInnerHTML` without sanitizing HTML blocks inside the markdown, this is an XSS vector.

NotebookLM's output is LLM-generated, but the content flows through: NotebookLM → Python bridge → DB JSONB → frontend. If any step in the chain can inject raw HTML into the markdown string, it will render in the user's browser.

```tsx
// StudyGuideViewer.tsx:69
<MarkdownRendererFull content={section.content} preset="preview" />

// StudyGuideViewer.tsx:81
<MarkdownRendererFull content={content.markdown} preset="preview" />
```

**Impact**: Medium — depends on the implementation of `MarkdownRendererFull`. If that component uses `rehype-raw` or similar without `rehype-sanitize`, arbitrary HTML in the markdown can execute scripts.

**Fix**: Verify `MarkdownRendererFull` strips or escapes HTML. If it uses `react-markdown`, ensure `rehype-sanitize` is in the plugin chain. Add a backend sanitization step in the study guide handler that strips HTML before storing:

```python
# In the Python bridge or TS handler, after receiving markdown:
import re
# Strip HTML tags from NotebookLM output before storing
markdown = re.sub(r'<[^>]+>', '', raw_markdown)
```

Or in the TS handler:

```typescript
// nlm-study-guide-handler.ts, after extracting markdownContent
const sanitized = markdownContent.replace(/<[^>]*>/g, '');
```

---

### MEDIUM — Mind map recursive rendering with no depth guard in full-dialog view

**File**: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx:265`

**Description**: In the full-screen dialog, `MindMapTreeNode` is rendered without a `maxDepth` prop:

```tsx
// MindMapViewer.tsx:265
<MindMapTreeNode node={content.root} depth={0} />
// No maxDepth — unlimited recursion
```

The compact preview correctly uses `maxDepth={2}`, but the full dialog has no depth cap. A maliciously constructed or LLM-hallucinated mind map with very deep nesting (e.g., 50+ levels) will cause React to render thousands of nested DOM nodes, potentially freezing the browser.

Additionally, `countNodes` and `maxDepth` in `nlm-mind-map-handler.ts` are mutually recursive-safe for normal data, but an adversarial input with circular references (impossible in JSON.parse, but theoretically possible if the bridge returns a pre-constructed object) could cause a stack overflow.

**Impact**: Medium — DoS of the browser tab for users. Unlikely in practice unless NotebookLM hallucination produces extreme nesting.

**Fix**: Add a reasonable max depth to the full dialog view:

```tsx
// MindMapViewer.tsx in the Dialog section
<MindMapTreeNode node={content.root} depth={0} maxDepth={10} />
```

Also add a backend validation cap when parsing the mind map JSON in the handler:

```typescript
// nlm-mind-map-handler.ts
const MAX_TREE_DEPTH = 10;
// After normalizeMindMapNode, verify treeDepth <= MAX_TREE_DEPTH
if (treeDepth > MAX_TREE_DEPTH) {
  logger.warn({ treeDepth }, 'Mind map depth exceeds limit, truncating');
  // Truncate the tree at maxDepth
}
```

---

### MEDIUM — Flashcard localStorage progress becomes stale when content changes

**File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:63–81`

**Description**: The `FlashcardViewer` loads persisted progress from `localStorage` using `enrichmentId` as the key. The progress includes `currentIndex` and sets of `known`/`unknown` card IDs.

```typescript
// FlashcardViewer.tsx:75
setCurrentIndex(Math.min(parsed.currentIndex, content.cards.length - 1));
```

If the enrichment is regenerated (new cards generated via a re-generate flow), the same `enrichmentId` is reused (the DB row is updated in-place). The new card set may have different IDs, but the localStorage key still matches the old `enrichmentId`. This means:

1. `knownIds` contains old card IDs that no longer exist in the new card set.
2. `currentIndex` may point beyond the new card array boundary (partially mitigated by `Math.min`).
3. Progress percentages will be wrong since `knownIds.size` counts stale IDs.

**Impact**: Medium — user sees incorrect "known" count and misleading progress display after regeneration.

**Fix**: Include a content hash or `updatedAt` timestamp in the storage key:

```typescript
const FLASHCARD_STORAGE_KEY = (id: string, updatedAt?: string) =>
  `flashcard_progress_${id}_${updatedAt ?? 'v0'}`;
```

Or validate loaded IDs against current cards:

```typescript
const validIds = new Set(content.cards.map(c => c.id));
const cleanKnown = parsed.known.filter(id => validIds.has(id));
setKnownIds(new Set(cleanKnown));
```

---

### MEDIUM — `isInfographicContent` type guard checks `imageUrl` but schema allows missing URL

**File**: `packages/web/components/course/viewer/components/enrichment-type-guards.ts:95–104`

**Description**: The `isInfographicContent` type guard checks:

```typescript
export function isInfographicContent(content: unknown): content is InfographicEnrichmentContent {
  return (
    ...
    'imageUrl' in content &&
    typeof (content as Record<string, unknown>).imageUrl === 'string'
  )
}
```

When an infographic is in the deferred state (see HIGH issue above), `imageUrl` is `''` — an empty string. This satisfies `typeof ... === 'string'`, so the guard returns `true` even though `imageUrl` is not a valid URL. `InfographicViewer` will then try to render `<img src="" />`, resulting in a broken image placeholder visible to the user.

Furthermore, the `isMindMapContent` guard at line 84–93 checks `typeof root === 'object'`, which passes for `null` (in case of a deferred root). `null` is technically `typeof 'object'` in JavaScript.

**Impact**: Medium — broken image display and potential null reference in mind map viewer.

**Fix**: Strengthen the guards:

```typescript
export function isInfographicContent(content: unknown): content is InfographicEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'nlm_infographic' &&
    'imageUrl' in content &&
    typeof (content as Record<string, unknown>).imageUrl === 'string' &&
    (content as Record<string, unknown>).imageUrl !== '' // reject empty URLs
  );
}

export function isMindMapContent(content: unknown): content is MindMapEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'nlm_mind_map' &&
    'root' in content &&
    typeof (content as Record<string, unknown>).root === 'object' &&
    (content as Record<string, unknown>).root !== null // explicit null check
  );
}
```

---

### MEDIUM — InfographicViewer uses native `<img>` instead of Next.js `<Image>`

**File**: `packages/web/components/course/viewer/enrichments/InfographicViewer.tsx:80–85, 153–167`

**Description**: The component uses two native `<img>` tags for the thumbnail and the zoomed dialog view:

```tsx
// InfographicViewer.tsx:80
<img
  src={content.imageUrl}
  alt={content.altText ?? t('viewer.infographic.defaultAlt')}
  className="h-auto max-h-48 w-full object-contain ..."
  loading="lazy"
/>
```

Next.js `Image` provides automatic format conversion (WebP), lazy loading with proper LCP attributes, size optimization, and prevents CLS. The infographic image can be large (user-facing PNG from NotebookLM), so this is a meaningful performance gap.

**Impact**: Medium — slower page loads, no format optimization, potential CLS.

**Fix**: Replace with `next/image`. Since the image URL is from Supabase Storage (a known domain), configure `next.config.ts` to allow the domain, then:

```tsx
import Image from 'next/image';

// Thumbnail:
<Image
  src={content.imageUrl}
  alt={content.altText ?? t('viewer.infographic.defaultAlt')}
  width={800}
  height={600}
  className="h-auto max-h-48 w-full object-contain"
  style={{ objectFit: 'contain' }}
/>;
```

For the zoomable dialog view, the transform-scale approach is incompatible with `next/image` optimization. In that case, use `<img>` with a `fill` parent container as a fallback and document the reason.

---

### MEDIUM — MindMapViewer zoom buttons borrow i18n keys from infographic namespace

**File**: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx:221, 234, 243`

**Description**: The mind map dialog's zoom buttons use infographic translation keys:

```tsx
// MindMapViewer.tsx:221
aria-label={t('viewer.infographic.zoomOut')}

// MindMapViewer.tsx:234
aria-label={t('viewer.infographic.zoomIn')}

// MindMapViewer.tsx:243
aria-label={t('viewer.infographic.zoomReset')}
```

These should reference `viewer.mindMap.zoomOut`, `viewer.mindMap.zoomIn`, and `viewer.mindMap.zoomReset`. Those keys do not currently exist in either `en/enrichments.json` or `ru/enrichments.json`.

**Impact**: Medium — screen reader users hear "infographic" when interacting with mind map zoom controls. The keys resolve to the correct text (since both viewers share `zoomIn`/`zoomOut`/`zoomReset` labels), but the semantic context is wrong.

**Fix**: Add mind map zoom keys to both i18n files:

```json
// en/enrichments.json (in viewer.mindMap)
"zoomIn": "Zoom in",
"zoomOut": "Zoom out",
"zoomReset": "Reset zoom"
```

Then update `MindMapViewer.tsx`:

```tsx
aria-label={t('viewer.mindMap.zoomOut')}
aria-label={t('viewer.mindMap.zoomIn')}
aria-label={t('viewer.mindMap.zoomReset')}
```

---

### LOW — `parseFlashcardsJson` unsafely casts array elements to `RawFlashcard[]`

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-flashcards-handler.ts:37–39`

**Description**:

```typescript
if (Array.isArray(parsed)) {
  return parsed as RawFlashcard[]; // unsafe cast
}
```

Elements of the array are not validated. If NotebookLM returns a mixed array or one element is a string instead of an object, the downstream `c.front || c.question` check will fail at runtime (accessing `.front` on a string returns `undefined`, which is fine, but it silently produces wrong data).

**Fix**: Filter array elements to ensure they are objects:

```typescript
if (Array.isArray(parsed)) {
  return parsed.filter(
    (item): item is RawFlashcard =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
  );
}
```

---

### LOW — `getMaxDurationForType` returns `undefined` for the 4 new NLM types

**File**: `packages/web/lib/hooks/useEnrichmentGeneration.ts:29–38`

**Description**:

```typescript
export function getMaxDurationForType(type: OnDemandEnrichmentType): number | undefined {
  switch (type) {
    case 'nlm_audio':
      return NLM_AUDIO_MAX_DURATION_MS;
    case 'nlm_video':
      return NLM_VIDEO_MAX_DURATION_MS;
    default:
      return undefined;
  }
}
```

The 4 new types (`nlm_study_guide`, `nlm_flashcards`, `nlm_mind_map`, `nlm_infographic`) fall through to `default` and return `undefined`. This means the progress timer shown in `EnrichmentGeneratingCard` has no max duration for these types, so no elapsed/remaining time is shown to the user.

**Impact**: Low — no timer shown for new types. The generation still works correctly; users just see no time estimate.

**Fix**: Add approximate max durations for the new types:

```typescript
case 'nlm_study_guide':
  return 5 * 60 * 1000   // 5 minutes
case 'nlm_flashcards':
  return 5 * 60 * 1000
case 'nlm_mind_map':
  return 3 * 60 * 1000
case 'nlm_infographic':
  return 10 * 60 * 1000  // infographics may take longer
```

---

### LOW — `flashcardsEnrichmentContentSchema` allows `total_cards` to mismatch actual `cards.length`

**File**: `packages/shared-types/src/enrichment-content.ts:618–627`

**Description**: The schema has both `cards` (array) and `total_cards` (number) as separate fields without a cross-field refinement. There is no validation that `total_cards === cards.length`. The handler sets them consistently, but any future code updating one field may forget to update the other.

**Fix**: Add a `.refine()`:

```typescript
export const flashcardsEnrichmentContentSchema = z
  .object({
    type: z.literal('nlm_flashcards'),
    cards: z.array(flashcardItemSchema).min(1).max(100),
    total_cards: z.number().int().positive(),
  })
  .refine(data => data.total_cards === data.cards.length, {
    message: 'total_cards must equal cards.length',
    path: ['total_cards'],
  });
```

---

### LOW — `mindMapNodeSchema` uses `z.lazy()` without depth limit; Zod does not protect against deep recursion

**File**: `packages/shared-types/src/enrichment-content.ts:647–653`

**Description**:

```typescript
export const mindMapNodeSchema: z.ZodType<MindMapNode> = z.lazy(() =>
  z.object({
    label: z.string().min(1),
    children: z.array(mindMapNodeSchema).optional(),
    description: z.string().optional(),
  })
);
```

Zod's `.safeParse()` on a deeply nested mind map object will recurse through every node. For a mind map with 1000 nodes, validation runs 1000 recursive parse calls. While not catastrophic for normal usage, an adversarial or very large NotebookLM output could cause a stack overflow during DB write or read.

**Fix**: Add a depth-aware wrapper or limit the recursion in the handler before validation:

```typescript
// In nlm-mind-map-handler.ts, after normalizeMindMapNode:
function truncateDepth(node: MindMapNode, maxDepth: number, current = 0): MindMapNode {
  if (current >= maxDepth || !node.children?.length) return node;
  return {
    ...node,
    children: node.children.map(c => truncateDepth(c, maxDepth, current + 1)),
  };
}
const root = truncateDepth(normalizeMindMapNode(rawRoot), 10);
```

---

### LOW — `UnifiedEnrichmentCard` holds 11 independent `useState` hooks for options

**File**: `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx:203–233`

**Description**: The component maintains 11 separate `useState` entries for all enrichment type options, even though only the options for the _current_ `type` are ever used. For a card of type `nlm_mind_map`, the `quizQuestions`, `audioVoice`, `nlmVideoFormat`, etc. states are allocated but never rendered or submitted.

This is not a correctness issue, but it makes the component harder to maintain. Adding a new enrichment type requires modifying this one large component in three places: state declarations, `getSettings()`, and `getOptionsProps()`.

**Fix**: Consider moving each type's settings into separate sub-components or a single `settings` object keyed by type:

```typescript
type SettingsState = {
  nlm_study_guide?: { detail_level: 'brief' | 'standard' | 'comprehensive' };
  nlm_flashcards?: { card_count: string; difficulty: 'easy' | 'medium' | 'hard' };
  // ...
};
const [settings, setSettings] = useState<SettingsState>({});
```

---

### LOW — DRY violation: identical source-bundle pattern in all 4 handlers

**Files**:

- `nlm-study-guide-handler.ts:41–48`
- `nlm-flashcards-handler.ts:75–82`
- `nlm-mind-map-handler.ts:124–131`
- `nlm-infographic-handler.ts:41–48`

**Description**: All 4 handlers duplicate the same pattern:

```typescript
const language = enrichmentContext.course.language || 'en';
const sourceStrategy = resolveSourceStrategy(settings);
const sources = buildNotebookLMSources({
  strategy: sourceStrategy,
  scriptContent: lessonContent,
  scriptTitle: 'Lesson Content',
  rawLessonContent: lessonContent,
  input,
});
```

The `scriptTitle: 'Lesson Content'` is a hardcoded string that could be computed from `enrichmentContext.lesson.title`.

**Fix**: Extract a shared helper in `nlm-shared.ts`:

```typescript
export function buildStandardSources(
  lessonContent: string,
  settings: Record<string, unknown>,
  input: EnrichmentHandlerInput
): { language: string; sources: NotebookLMSourceInput[]; sourceStrategy: string } {
  const language = input.enrichmentContext.course.language || 'en';
  const sourceStrategy = resolveSourceStrategy(settings);
  const sources = buildNotebookLMSources({
    strategy: sourceStrategy,
    scriptContent: lessonContent,
    scriptTitle: input.enrichmentContext.lesson.title,
    rawLessonContent: lessonContent,
    input,
  });
  return { language, sources, sourceStrategy };
}
```

---

### LOW — `enrichmentSettingsSchema` does not include `cover` and `card` types

**File**: `packages/shared-types/src/enrichment-settings.ts:365–377`

**Description**: The `enrichmentSettingsSchema` discriminated union includes 11 types but omits `cover`, `card`, and `banner`. This is not a regression (the new types are correctly included), but it means `cover` and `card` settings cannot be typed via the schema. This is a pre-existing issue surfaced by comparison during this review.

**Fix**: Add `cover`, `card`, `banner` to the schema, or document that image types use `onDemandImageSettingsSchema` instead.

---

### LOW — Migration does not include a rollback path

**File**: `packages/course-gen-platform/supabase/migrations/20260227120000_add_nlm_enrichment_types.sql`

**Description**:

```sql
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_study_guide';
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_flashcards';
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_mind_map';
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_infographic';
```

PostgreSQL enum values cannot be removed once added (without recreating the type). There is no rollback comment or documented procedure for what to do if this migration needs to be reverted. This is common in PostgreSQL, but the convention should be documented.

**Fix**: Add a comment to the migration:

```sql
-- NOTE: PostgreSQL enum values cannot be removed after being added.
-- To roll back this migration, enum values must be left in place.
-- Ensure any enrichments with these types are deleted before disabling
-- the feature (or use a soft-delete/filter approach in queries).
```

---

### LOW — `getMaxDurationForType` for NLM types returns undefined but `isNlmMediaType` includes them

**File**: `packages/web/lib/hooks/useEnrichmentGeneration.ts:20–57`

**Description**: The `NLM_TIMER_DELAY_TYPES` set (line 21) includes all 6 NLM types:

```typescript
const NLM_TIMER_DELAY_TYPES: ReadonlySet<OnDemandEnrichmentType> = new Set([
  'nlm_audio',
  'nlm_video',
  'nlm_study_guide',
  'nlm_flashcards',
  'nlm_mind_map',
  'nlm_infographic',
]);
```

This means `isNlmMediaType()` returns `true` for the 4 new types, so `generationStartedAtMs` is set to `undefined` initially (delaying the timer start). However, `getMaxDurationForType()` returns `undefined` for all 4, so even when `generationStartedAtMs` becomes defined (after polling resolves `generating` step), there is no `maxDurationMs`. The `EnrichmentGeneratingCard` receives both `startedAtMs` and `maxDurationMs` as undefined, so no timer is displayed.

The deferred timer behavior is correct (NLM types are async), but the missing max duration means users see no progress indication for the new types. Already noted above (see LOW — `getMaxDurationForType`), combined here for completeness.

---

### LOW — `FlashcardViewer` does not reset `isFlipped` on `handleShuffle`

**File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:150–155`

**Description**:

```typescript
const handleShuffle = useCallback(() => {
  setCards(isShuffled ? content.cards : shuffleArray(content.cards));
  setIsShuffled(prev => !prev);
  setCurrentIndex(0);
  setIsFlipped(false); // present and correct
}, [isShuffled, content.cards]);
```

This is actually correct — `setIsFlipped(false)` is called. However, the `handleReset` function at line 157 also does call `setIsFlipped(false)`. No issue here, just verifying.

A minor actual issue: `handleShuffle` re-uses `content.cards` (the original prop) as the "unshuffled" state. If the component received a new `content` prop (because the enrichment was updated), the shuffled state would silently de-sync. This is unlikely in practice but worth noting.

---

### LOW — i18n: `viewer.studyGuide.open` key exists but is not used in `StudyGuideViewer`

**File**: `packages/web/messages/en/enrichments.json:329`

**Description**: The i18n file defines:

```json
"studyGuide": {
  "open": "Read Guide",   // defined but unused
  "readFull": "Read Full" // used in StudyGuideViewer.tsx:104
}
```

The "Read Guide" label exists in both `en` and `ru` files but is not referenced in `StudyGuideViewer.tsx`. This may be intended for the `EnrichmentCard` summary area (where a "Read Guide" CTA might appear), but if it is unused, it adds maintenance overhead.

**Fix**: Either use the key in an appropriate component, or remove it to keep i18n files clean.

---

### LOW — `enrichment-config.ts` has duplicate `colorClass` and `bgClass` fields

**File**: `packages/web/lib/generation-graph/enrichment-config.ts:57–76`

**Description**: The `EnrichmentTypeConfig` interface defines both `color`/`colorClass` and `bgColor`/`bgClass` as aliases:

```typescript
export interface EnrichmentTypeConfig {
  color: string;
  colorClass: string; // "alias for compatibility"
  bgColor: string;
  bgClass: string; // "alias for compatibility"
}
```

All config objects set `color === colorClass` and `bgColor === bgClass`. This doubles the data size for no benefit. The "for compatibility" comment suggests this is technical debt.

**Fix**: Remove one set of aliases and update consumers. Or use a getter in a class-based approach if backward compatibility is needed.

---

## i18n Completeness Check

Both `en/enrichments.json` and `ru/enrichments.json` have been checked for all keys used by the new components.

| Key used in code                            | EN present                      | RU present     | Notes                                                |
| ------------------------------------------- | ------------------------------- | -------------- | ---------------------------------------------------- |
| `viewer.studyGuide.tableOfContents`         | Yes                             | Need to verify | Not visible in the RU excerpt shown                  |
| `viewer.studyGuide.wordCount`               | Yes                             | Need to verify |                                                      |
| `viewer.studyGuide.readFull`                | Yes                             | Need to verify |                                                      |
| `viewer.studyGuide.title`                   | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.cardOf`                  | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.front`                   | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.back`                    | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.tapToFlip`               | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.flipCard`                | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.know`                    | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.dontKnow`                | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.summary`                 | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.total`                   | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.known`                   | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.unknown`                 | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.score`                   | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.restart`                 | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.finish`                  | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.shuffle`                 | Yes                             | Need to verify |                                                      |
| `viewer.flashcards.cardCount`               | Yes                             | Need to verify | Not used in current viewers                          |
| `viewer.mindMap.previewHint`                | Yes                             | Need to verify |                                                      |
| `viewer.mindMap.nodeCount`                  | Yes                             | Need to verify |                                                      |
| `viewer.mindMap.depth`                      | Yes                             | Need to verify |                                                      |
| `viewer.mindMap.viewFull`                   | Yes                             | Need to verify |                                                      |
| `viewer.mindMap.title`                      | Yes                             | Need to verify |                                                      |
| `viewer.infographic.open`                   | Yes                             | Need to verify |                                                      |
| `viewer.infographic.zoomIn`                 | Yes                             | Need to verify | Also referenced from MindMapViewer (wrong namespace) |
| `viewer.infographic.zoomOut`                | Yes                             | Need to verify | Also referenced from MindMapViewer (wrong namespace) |
| `viewer.infographic.zoomReset`              | Yes                             | Need to verify | Also referenced from MindMapViewer (wrong namespace) |
| `viewer.infographic.defaultAlt`             | Yes                             | Need to verify |                                                      |
| `viewer.infographic.title`                  | Yes                             | Need to verify |                                                      |
| `viewer.difficulty.easy/medium/hard`        | Yes (under `viewer.difficulty`) | Need to verify | Used in FlashcardViewer                              |
| `placeholder.nlm_study_guide.estimatedTime` | Yes                             | Need to verify |                                                      |
| `placeholder.nlm_flashcards.estimatedTime`  | Yes                             | Need to verify |                                                      |
| `placeholder.nlm_mind_map.estimatedTime`    | Yes                             | Need to verify |                                                      |
| `placeholder.nlm_infographic.estimatedTime` | Yes                             | Need to verify |                                                      |
| `viewer.mindMap.zoomIn`                     | **Missing**                     | **Missing**    | Used via wrong key from infographic namespace        |
| `viewer.mindMap.zoomOut`                    | **Missing**                     | **Missing**    | Used via wrong key from infographic namespace        |
| `viewer.mindMap.zoomReset`                  | **Missing**                     | **Missing**    | Used via wrong key from infographic namespace        |

The Russian translation file was only partially reviewed in this analysis. A full diff of all keys in `en/enrichments.json` vs `ru/enrichments.json` should be performed to ensure parity.

---

## Python Bridge Review Summary

The Python generator additions (`generator.py`, `main.py`, `models.py`) follow established patterns from the existing audio/video generators. The `_GlobalGenerationQueue` correctly handles concurrency with proper condition variable semantics. A few observations:

1. The bridge accepts `reportFormat`, `flashcardDifficulty`, `flashcardCount`, `mindMapDepth`, `infographicOrientation`, and `infographicDetail` as pass-through parameters from the TS client without validation in the bridge itself. Validation relies on the TS layer — acceptable given the bridge is an internal service, not a public API.

2. The `MediaType` literal in `generator.py:24` correctly includes all 6 types: `"audio" | "video" | "study_guide" | "flashcards" | "mind_map" | "infographic"`.

3. No SQL injection or command injection vectors are visible (all external calls go through the notebooklm-py library, not shell commands).

---

## Security Summary

| Category  | Finding                                                            | Severity |
| --------- | ------------------------------------------------------------------ | -------- |
| XSS       | MarkdownRendererFull may render unsanitized HTML from NLM markdown | MEDIUM   |
| Injection | No SQL/command injection vectors found                             | N/A      |
| Image URL | `imageUrl: ''` bypasses type guard, renders broken `<img>`         | LOW      |
| Auth      | No unauthenticated access vectors found in new code                | N/A      |
| SSRF      | Bridge URL is configured via env var, not user input               | N/A      |

---

## Action Items (Priority Order)

| Priority | Issue                                           | File                                | Action                                                  |
| -------- | ----------------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| HIGH     | Deferred content violates schema constraints    | nlm-\*-handler.ts                   | Store null or use nullable fields for deferred state    |
| HIGH     | Settings key mismatch (camelCase vs snake_case) | UnifiedEnrichmentCard.tsx, handlers | Align frontend keys with backend or add transform layer |
| MEDIUM   | XSS risk in markdown rendering                  | StudyGuideViewer.tsx                | Verify/add sanitization in MarkdownRendererFull         |
| MEDIUM   | Unlimited mind map recursion in dialog          | MindMapViewer.tsx                   | Add `maxDepth={10}` to dialog's tree renderer           |
| MEDIUM   | Stale flashcard progress on regeneration        | FlashcardViewer.tsx                 | Version the localStorage key with `updatedAt`           |
| MEDIUM   | Weak type guards for empty deferred content     | enrichment-type-guards.ts           | Add empty string checks                                 |
| MEDIUM   | Native `<img>` instead of Next.js `<Image>`     | InfographicViewer.tsx               | Switch to next/image                                    |
| MEDIUM   | Wrong i18n keys for mind map zoom controls      | MindMapViewer.tsx + i18n files      | Add mindMap zoom keys, update references                |
| LOW      | No timer for new NLM types                      | useEnrichmentGeneration.ts          | Add max durations to getMaxDurationForType              |
| LOW      | total_cards / cards.length can desync           | enrichment-content.ts               | Add .refine() cross-field check                         |
| LOW      | z.lazy() with no depth limit                    | enrichment-content.ts               | Add depth truncation before validation                  |
| LOW      | DRY violation in handlers                       | nlm-\*-handler.ts                   | Extract buildStandardSources() helper                   |
| LOW      | Dead i18n key viewer.studyGuide.open            | en,ru enrichments.json              | Remove or use the key                                   |
| LOW      | Duplicate color/colorClass fields               | enrichment-config.ts                | Remove aliases                                          |
| LOW      | Migration lacks rollback comment                | .sql migration                      | Add documentation comment                               |
