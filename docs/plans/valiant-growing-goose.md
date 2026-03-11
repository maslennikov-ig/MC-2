# Plan: Enrichments open on the card, not below it

## Context

When a user clicks "Start" on quiz/flashcards/study guide/mind map enrichments, the viewer content currently renders **inside the info area** of the card (below the image), expanding the card height significantly. This looks like the content opens "below the card" rather than "on the card."

Audio/video enrichments work correctly — they play directly in the image area as overlays. The goal is to bring the same "on the card" feel to all interactive enrichment types.

## Approach: Full-card overlay

When `isActive` is true for quiz/flashcards/study guide/mind map, render an **absolute overlay** that covers the entire card (image + info areas). The card keeps its `min-h-[480px]` — no grid reflow. Content scrolls inside the overlay.

### Why this approach

- Consistent with audio/video pattern (content appears on the card itself)
- Grid layout stays stable (card height never changes)
- Internal scroll handles tall content (quiz results, study guide)
- Fullscreen mode for flashcards/mind map (already `fixed inset-0 z-50`) layers correctly above overlay (`z-20`)
- Only 1 file to modify

## File to modify

`packages/web/components/course/viewer/components/EnrichmentCard.tsx`

## Changes

### 1. Add overlay type check (after line ~110)

```ts
const isOverlayType = ['quiz', 'nlm_study_guide', 'nlm_flashcards', 'nlm_mind_map'].includes(type);
```

### 2. Remove inline viewer blocks from info area (lines 505-542)

Delete the 5 conditional viewer blocks currently inside the info `<div>`:

- Quiz (lines 506-514)
- Study Guide (lines 517-521)
- Flashcards (lines 524-528)
- Mind Map (lines 531-535)
- Infographic (lines 538-542) — **keep this one** (thumbnail, doesn't expand card)

### 3. Add overlay block — inside the main card `<div>`, after the info area

```tsx
<AnimatePresence>
  {isActive && isOverlayType && (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header: type icon + title + close */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', config.color)} />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {enrichment.title || label}
          </span>
        </div>
        <Button size="icon" variant="ghost" onClick={onToggle} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable viewer content */}
      <div className="flex-1 overflow-y-auto p-4">
        {type === 'quiz' && isQuizContent(enrichment.content) && (
          <QuizPlayer
            content={enrichment.content}
            enrichmentId={enrichment.id}
            onComplete={() => {}}
          />
        )}
        {type === 'nlm_study_guide' && isStudyGuideContent(enrichment.content) && (
          <StudyGuideViewer content={enrichment.content} />
        )}
        {type === 'nlm_flashcards' && isFlashcardsContent(enrichment.content) && (
          <FlashcardViewer content={enrichment.content} enrichmentId={enrichment.id} />
        )}
        {type === 'nlm_mind_map' && isMindMapContent(enrichment.content) && (
          <MindMapViewer content={enrichment.content} />
        )}
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

### 4. No changes to other files

- `EnrichmentsPanel.tsx` — parent manages `activeEnrichmentId` toggle, no changes needed
- `QuizPlayer.tsx` — works inside scrollable container as-is
- `FlashcardViewer.tsx` — fullscreen at `z-50` layers above overlay at `z-20`
- `MindMapViewer.tsx` — same fullscreen coexistence
- `StudyGuideViewer.tsx` — Dialog for full content still works
- `InfographicViewer.tsx` — stays as thumbnail in info area (not moved to overlay)

## Verification

1. `pnpm --filter web build` — no type/build errors
2. Open lesson with enrichments in browser
3. Click "Start Quiz" — quiz appears as overlay on the card, not below
4. Click "Start Flashcards" — flashcards on the card, fullscreen button still works
5. Click "View Mind Map" — mind map on the card, fullscreen still works
6. Click "Open Study Guide" — study guide on the card, "Read Full" dialog still works
7. Close each overlay via X button — card returns to normal
8. Verify audio/video still play in image area (unchanged)
9. Verify infographic thumbnail still shows in info area (unchanged)
10. Check mobile viewport — overlay scrolls properly on touch
