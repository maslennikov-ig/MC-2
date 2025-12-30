# Course Viewer Update - Implementation Tasks

**Created:** 2025-12-30
**Status:** In Progress (Phase 3 partially complete)
**Spec:** [spec.md](./spec.md)

---

## Phase 1: Fix Content Parsing (CRITICAL)

### Task 1.1: Create Lesson Content Parser
- **Status:** [X] Completed
- **Executor:** fullstack-nextjs-specialist
- **Files:**
  - CREATE: `packages/web/lib/lesson-content-parser.ts`
- **Requirements:**
  - Handle JSONB `lesson.content` with various structures
  - Handle legacy `lesson.content_text` string
  - Return `{ markdown: string, structured?: object }`
  - Export `parseLessonContent(lesson: Lesson): ParsedLessonContent`
- **Artifacts:** → [lesson-content-parser.ts](../../packages/web/lib/lesson-content-parser.ts)

### Task 1.2: Update LessonContent Component
- **Status:** [X] Completed
- **Executor:** fullstack-nextjs-specialist
- **Depends on:** Task 1.1
- **Files:**
  - UPDATE: `packages/web/components/common/lesson-content.tsx`
- **Requirements:**
  - Import and use `parseLessonContent`
  - Replace `lesson.content_text || lesson.content || ''`
  - Handle structured content sections if present
- **Artifacts:** → [lesson-content.tsx](../../packages/web/components/common/lesson-content.tsx)

---

## Phase 2: Load Enrichments from Database

### Task 2.1: Add Enrichments Query to Course Page
- **Status:** [X] Completed
- **Executor:** fullstack-nextjs-specialist
- **Files:**
  - UPDATE: `packages/web/app/[locale]/courses/[slug]/page.tsx`
  - UPDATE: `packages/web/lib/course-data-utils.ts`
- **Requirements:**
  - Query `lesson_enrichments` table for completed enrichments
  - Filter by `status = 'completed'`
  - Create `groupEnrichmentsByLessonId()` utility
  - Pass enrichments to CourseViewerEnhanced
- **Artifacts:**
  - → [page.tsx](../../packages/web/app/[locale]/courses/[slug]/page.tsx)
  - → [course-data-utils.ts](../../packages/web/lib/course-data-utils.ts)

### Task 2.2: Update Component Props Chain
- **Status:** [X] Completed
- **Executor:** fullstack-nextjs-specialist
- **Depends on:** Task 2.1
- **Files:**
  - UPDATE: `packages/web/components/course/viewer/types/index.ts`
  - UPDATE: `packages/web/components/course/course-viewer-enhanced.tsx`
  - UPDATE: `packages/web/components/course/viewer/components/LessonView.tsx`
- **Requirements:**
  - Add `enrichments?: Record<string, LessonEnrichment[]>` to CourseViewerProps
  - Thread enrichments through to LessonView
  - Add enrichments to useViewerState return
- **Artifacts:**
  - → [types/index.ts](../../packages/web/components/course/viewer/types/index.ts)
  - → [course-viewer-enhanced.tsx](../../packages/web/components/course/course-viewer-enhanced.tsx)
  - → [LessonView.tsx](../../packages/web/components/course/viewer/components/LessonView.tsx)

---

## Phase 3: Create Enrichment Display Components

### Task 3.1: Create EnrichmentsPanel Container
- **Status:** [X] Completed
- **Executor:** nextjs-ui-designer
- **Depends on:** Task 2.2
- **Files:**
  - CREATE: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`
- **Requirements:**
  - Group enrichments by type
  - Display appropriate component for each type
  - Show empty state when no enrichments
  - Support collapsible sections per type
- **Artifacts:** → [EnrichmentsPanel.tsx](../../packages/web/components/course/viewer/components/EnrichmentsPanel.tsx)

### Task 3.2: Create AudioPlayer Component
- **Status:** [X] Completed
- **Executor:** nextjs-ui-designer
- **Files:**
  - CREATE: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`
- **Requirements:**
  - Play/pause, seek, volume controls
  - Speed control (0.5x - 2x)
  - Progress bar with time display
  - Script display (from enrichment.content.script)
  - Use existing tRPC `enrichment.getPlaybackUrl` for signed URL
- **Artifacts:** → [AudioPlayer.tsx](../../packages/web/components/course/viewer/enrichments/AudioPlayer.tsx)

### Task 3.3: Create VideoPlayer Component
- **Status:** [ ] Pending
- **Executor:** nextjs-ui-designer
- **Files:**
  - CREATE: `packages/web/components/course/viewer/enrichments/VideoPlayer.tsx`
- **Requirements:**
  - All AudioPlayer features
  - Fullscreen support
  - Picture-in-picture (optional)
  - Responsive aspect ratio
- **Artifacts:**

### Task 3.4: Create PresentationViewer Component
- **Status:** [ ] Pending
- **Executor:** nextjs-ui-designer
- **Files:**
  - CREATE: `packages/web/components/course/viewer/enrichments/PresentationViewer.tsx`
- **Requirements:**
  - Navigate slides (arrows, keyboard)
  - Show slide content (markdown)
  - Support themes: default, dark, academic
  - Speaker notes toggle
  - Slide counter
  - Fullscreen mode
- **Artifacts:**

### Task 3.5: Create QuizPlayer Component
- **Status:** [X] Completed
- **Executor:** nextjs-ui-designer
- **Files:**
  - CREATE: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`
- **Requirements:**
  - Display questions one at a time or all
  - Support: multiple_choice, true_false, short_answer
  - Track selected answers
  - Calculate score on submit
  - Show explanations after submit
  - Display bloom level and difficulty badges
  - Passing score indicator
- **Artifacts:** → [QuizPlayer.tsx](../../packages/web/components/course/viewer/enrichments/QuizPlayer.tsx)

### Task 3.6: Create DocumentViewer Component
- **Status:** [ ] Pending
- **Executor:** nextjs-ui-designer
- **Files:**
  - CREATE: `packages/web/components/course/viewer/enrichments/DocumentViewer.tsx`
- **Requirements:**
  - Download button with file info
  - PDF preview if possible (react-pdf)
  - Fallback to simple download card
- **Artifacts:**

### Task 3.7: Create Enrichments Index Export
- **Status:** [X] Completed
- **Executor:** MAIN
- **Files:**
  - CREATE: `packages/web/components/course/viewer/enrichments/index.ts`
- **Requirements:**
  - Export all enrichment components
- **Artifacts:** → [index.ts](../../packages/web/components/course/viewer/enrichments/index.ts)

---

## Phase 4: Update LessonView with Enrichments Tab

### Task 4.1: Add Enrichments Tab to LessonView
- **Status:** [X] Completed
- **Executor:** fullstack-nextjs-specialist
- **Depends on:** Task 3.1
- **Files:**
  - UPDATE: `packages/web/components/course/viewer/components/LessonView.tsx`
- **Requirements:**
  - Add new tab "Media & Materials" / "Медиа и материалы"
  - Show EnrichmentsPanel in tab content
  - Show enrichment count badge on tab
  - Handle empty state gracefully
- **Artifacts:** → [LessonView.tsx](../../packages/web/components/course/viewer/components/LessonView.tsx)

---

## Phase 5: Type Safety and Cleanup

### Task 5.1: Add LessonEnrichment Type to Web Package
- **Status:** [X] Completed
- **Executor:** MAIN
- **Files:**
  - UPDATE: `packages/web/types/database.ts`
- **Requirements:**
  - Add LessonEnrichment interface matching shared-types
  - Add EnrichmentType and EnrichmentStatus types
  - Re-export from shared-types if possible
- **Artifacts:** → [database.ts](../../packages/web/types/database.ts)

### Task 5.2: Run Type Check and Fix Errors
- **Status:** [X] Completed
- **Executor:** MAIN
- **Files:**
  - Various
- **Requirements:**
  - Run `pnpm type-check`
  - Fix all TypeScript errors
- **Artifacts:** Type-check passed

---

## Execution Plan

### Parallel Group 1 (Independent tasks):
- Task 1.1: Create Lesson Content Parser
- Task 2.1: Add Enrichments Query (partially parallel)
- Task 5.1: Add LessonEnrichment Type

### Sequential Group 2 (After Group 1):
- Task 1.2: Update LessonContent (after 1.1)
- Task 2.2: Update Component Props Chain (after 2.1)

### Parallel Group 3 (Enrichment Components - after Task 2.2):
- Task 3.1: EnrichmentsPanel
- Task 3.2: AudioPlayer
- Task 3.3: VideoPlayer
- Task 3.4: PresentationViewer
- Task 3.5: QuizPlayer
- Task 3.6: DocumentViewer

### Sequential Group 4 (Integration):
- Task 3.7: Enrichments Index (after 3.1-3.6)
- Task 4.1: Add Enrichments Tab (after 3.1)
- Task 5.2: Type Check (after all)

---

## Notes

- Use Context7 for React/Next.js documentation
- Check existing `enrichment-config.ts` for icons/colors
- Reuse existing UI components (Button, Tabs, Badge, etc.)
- Follow existing code patterns in the viewer
