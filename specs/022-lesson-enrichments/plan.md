# Implementation Plan: Lesson Enrichments (Stage 7)

**Branch**: `022-lesson-enrichments` | **Date**: 2025-12-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-lesson-enrichments/spec.md`
**Technical Reference**: [stage-7-lesson-enrichments.md](./stage-7-lesson-enrichments.md)

## Summary

Stage 7 extends the course generation pipeline with AI-generated supplementary content for lessons. After Stage 6 generates lesson text content, Stage 7 enables users to enrich lessons with video presentations, audio narrations, slide presentations, and comprehension quizzes. The implementation follows established Stage 6 patterns (BullMQ, tRPC, LangGraph) while introducing a new three-layer UI (badge indicators, floating menu, inspector panel) that avoids "graph explosion" by keeping enrichments as metadata on LessonNodes rather than separate nodes.

## Technical Context

**Language/Version**: TypeScript 5.3+ (Strict Mode)
**Primary Dependencies**: tRPC 10.x, BullMQ, LangGraph, @xyflow/react, Supabase (PostgreSQL), Zustand
**Storage**: Supabase PostgreSQL + Supabase Storage (for video/audio/presentation files)
**Testing**: Vitest (unit/integration), pgTAP (database)
**Target Platform**: Web (Next.js 14), responsive for desktop and mobile
**Project Type**: Monorepo (pnpm workspaces)
**Performance Goals**:
  - Enrichment status updates in UI within 2 seconds
  - Graph with 50+ lessons + enrichments renders smoothly (no lag on pan/zoom)
  - Add enrichment action completes in under 10 seconds
**Constraints**:
  - LessonNode height increase from 50px to 64px for Asset Dock
  - Must not break ELK layout engine stability
  - Generation time varies by type (quiz: ~30s, audio: 1-2min, video: 3-5min)
**Scale/Scope**: ~4 enrichment types initially (video, audio, presentation, quiz), ~50 lessons per course max

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Context-First Architecture** | ✅ PASS | Explored Stage 6 patterns, React Flow structure, existing schemas before planning |
| **II. Single Source of Truth** | ✅ PASS | Types in `shared-types`, enums in shared location, re-exports from central files |
| **III. Strict Type Safety** | ✅ PASS | Zod schemas for all inputs, TypeScript strict mode, explicit return types |
| **IV. Atomic Evolution** | ✅ PASS | 6 phases with incremental tasks, commits after each task |
| **V. Quality Gates** | ✅ PASS | Build/lint/test/type-check before commits, RLS for all tables, Zod validation |
| **VI. Library-First Development** | ⚠️ RESEARCH | Need to evaluate TTS libraries, video generation APIs |
| **VII. Task Tracking** | ✅ PASS | Tasks.md with artifacts, TodoWrite for progress |

## Project Structure

### Documentation (this feature)

```text
specs/022-lesson-enrichments/
├── plan.md              # This file
├── spec.md              # Feature specification
├── stage-7-lesson-enrichments.md  # Technical reference (original requirements)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI/tRPC schemas)
└── tasks.md             # Phase 2 output (from /speckit.tasks)
```

### Source Code (repository structure)

```text
packages/
├── shared-types/src/
│   ├── lesson-enrichment.ts          # Enrichment types, schemas
│   ├── enrichment-content.ts         # Type-specific content structures
│   └── bullmq-jobs.ts                # EnrichmentJobData schema (updated)
│
├── course-gen-platform/
│   ├── supabase/migrations/
│   │   └── 20241224_stage7_enrichments.sql
│   ├── src/
│   │   ├── queues/
│   │   │   └── enrichment-queue.ts   # Queue + Worker factory
│   │   ├── stages/stage7-enrichments/
│   │   │   ├── config/
│   │   │   │   └── index.ts          # HANDLER_CONFIG
│   │   │   ├── factory.ts            # createStage7Worker(), gracefulShutdown()
│   │   │   ├── types/
│   │   │   │   └── index.ts          # Stage7JobInput, Stage7JobResult
│   │   │   ├── services/
│   │   │   │   ├── job-processor.ts  # Main job handler
│   │   │   │   ├── database-service.ts
│   │   │   │   ├── storage-service.ts  # Asset upload + signed URLs
│   │   │   │   └── enrichment-router.ts
│   │   │   ├── handlers/
│   │   │   │   ├── video-handler.ts
│   │   │   │   ├── audio-handler.ts
│   │   │   │   ├── presentation-handler.ts
│   │   │   │   └── quiz-handler.ts
│   │   │   ├── prompts/              # Agent system prompts (TZ Section 6)
│   │   │   │   ├── video-prompt.ts   # Video script generation
│   │   │   │   ├── audio-prompt.ts   # TTS text optimization
│   │   │   │   ├── presentation-prompt.ts  # Slide deck generation
│   │   │   │   └── quiz-prompt.ts    # Quiz with Bloom's taxonomy
│   │   │   └── nodes/                # LangGraph nodes (if needed)
│   │   ├── server/routers/enrichment/
│   │   │   ├── index.ts
│   │   │   ├── router.ts
│   │   │   ├── schemas.ts
│   │   │   └── procedures/
│   │   │       ├── create.ts
│   │   │       ├── get-by-lesson.ts
│   │   │       ├── get-summary.ts
│   │   │       ├── regenerate.ts
│   │   │       ├── delete.ts
│   │   │       ├── reorder.ts
│   │   │       └── cancel.ts
│   │   └── shared/i18n/messages.ts   # Backend translations (updated)
│
└── web/
    ├── messages/
    │   ├── ru/enrichments.json
    │   └── en/enrichments.json
    └── components/
        ├── generation-graph/
        │   ├── nodes/
        │   │   ├── LessonNode.tsx    # Updated with AssetDock
        │   │   └── AssetDock.tsx     # New component
        │   ├── components/
        │   │   └── EnrichmentNodeToolbar.tsx  # React Flow NodeToolbar (deep-links)
        │   ├── stores/
        │   │   └── enrichment-inspector-store.ts  # Zustand store for Inspector state
        │   ├── hooks/
        │   │   ├── useEnrichmentData.ts       # Fetch + realtime
        │   │   └── useEnrichmentSelection.ts  # Selection sync
        │   └── panels/
        │       └── stage7/                    # Inspector panel with Stack Navigator
        │           ├── EnrichmentInspectorPanel.tsx   # Main panel (view router)
        │           ├── views/
        │           │   ├── RootView.tsx              # List + fallback add button
        │           │   ├── CreateView.tsx            # Configuration form
        │           │   ├── DetailView.tsx            # Preview/edit specific enrichment
        │           │   └── EmptyStateCards.tsx       # Discovery cards for first enrichment
        │           ├── components/
        │           │   ├── EnrichmentList.tsx
        │           │   ├── EnrichmentListItem.tsx
        │           │   ├── EnrichmentStatusBadge.tsx
        │           │   ├── EnrichmentAddPopover.tsx  # Popover menu for fallback add
        │           │   ├── GenerationProgress.tsx    # Progress display during generation
        │           │   └── DiscardChangesDialog.tsx  # Confirm dirty state discard
        │           ├── forms/
        │           │   ├── QuizCreateForm.tsx
        │           │   ├── AudioCreateForm.tsx
        │           │   ├── VideoCreateForm.tsx
        │           │   └── PresentationCreateForm.tsx
        │           └── previews/
        │               ├── QuizPreview.tsx
        │               ├── VideoPreview.tsx
        │               ├── AudioPreview.tsx
        │               └── PresentationPreview.tsx
        └── lib/
            └── generation-graph/
                └── translations.ts   # enrichmentTypeIcons map (updated)
```

**Structure Decision**: Follows existing monorepo pattern with stage-specific directories. Backend in `course-gen-platform`, frontend in `web` package. Shared types in `shared-types` package following SSOT principle.

## Complexity Tracking

> **No constitution violations requiring justification.**

The implementation follows established patterns from Stage 6 without adding unnecessary complexity:
- Reuses existing BullMQ/LangGraph infrastructure
- Extends React Flow nodes rather than creating parallel visualization
- Follows existing tRPC router structure
- No new patterns or architectures beyond what already exists

---

## Phase 0: Research & Library Evaluation

### Research Tasks

1. **TTS Library Evaluation** (for Audio Enrichments)
   - Evaluate: OpenAI TTS, ElevenLabs, Azure Cognitive Services
   - Criteria: Russian language support, voice quality, cost per minute, latency
   - Decision required: Which TTS provider to use

2. **Video Generation API** (for Video Enrichments)
   - Evaluate: HeyGen, Synthesia, D-ID
   - Criteria: API availability, avatar quality, cost, Russian support
   - Decision: Start with placeholder/stub, implement in Phase 6+

3. **Presentation Format** (for Slides Enrichments)
   - Evaluate: reveal.js JSON, PPTX generation, PDF slides
   - Criteria: In-app preview, export capability, complexity
   - Decision required: Format for slides storage and preview

4. **Quiz Storage Format**
   - Evaluate existing quiz JSONB patterns in LMS integrations
   - Align with potential Open edX QTI export requirements
   - Decision required: JSONB structure for quiz questions

5. **Supabase Storage Bucket Strategy**
   - Confirm RLS policy patterns for course-scoped storage
   - Determine signed URL expiration strategy
   - Decision required: Bucket naming, path conventions

### Library-First Research (MANDATORY)

| Component | Candidate Libraries | Selection Criteria |
|-----------|--------------------|--------------------|
| TTS | OpenAI TTS API, ElevenLabs | Russian support, cost <$0.01/word |
| Presentation | reveal.js, slidev | JSON-serializable, in-browser preview |
| Quiz | Custom JSONB | Align with QTI standard for LMS export |
| Drag-Reorder | @dnd-kit/sortable | Already used in codebase |
| Video Player | react-player | Universal format support |
| Audio Player | Native HTML5 | No extra dependency needed |

### Research Output

Create `research.md` with:
- Decision for each component
- Rationale and alternatives considered
- Library versions and integration notes

---

## Phase 1: Database & Types Foundation

### 1.1 Database Migration

**File**: `packages/course-gen-platform/supabase/migrations/20251224_stage7_enrichments.sql`

Create:
- `enrichment_type` enum (video, audio, presentation, quiz, document)
- `enrichment_status` enum with two-stage support:
  - `pending` - Queued for generation
  - `draft_generating` - Phase 1: Generating draft/script (two-stage)
  - `draft_ready` - Phase 1 complete: Awaiting user review (two-stage)
  - `generating` - Phase 2: Final content (or single-stage)
  - `completed` - Successfully generated
  - `failed` - Generation failed
  - `cancelled` - User cancelled
- `lesson_enrichments` table with JSONB content column
- RLS policies for admin/instructor access
- Indexes on lesson_id, status, type
- Enable Realtime with REPLICA IDENTITY FULL
- `updated_at` trigger

### 1.2 TypeScript Types

**File**: `packages/shared-types/src/lesson-enrichment.ts`

Create:
- `EnrichmentType` and `EnrichmentStatus` Zod schemas (with two-stage statuses)
- `isDraftPhase(status)` - Helper to check if in draft phase
- `isAwaitingAction(status)` - Helper to check if user action needed
- `LessonEnrichment` interface
- `EnrichmentMetadata` interface
- `EnrichmentSummary` interface (for React Flow node data)
- Export all from shared-types package index

**File**: `packages/shared-types/src/enrichment-content.ts`

Create:
- `VideoEnrichmentContent` interface
- `AudioEnrichmentContent` interface
- `PresentationEnrichmentContent` interface
- `QuizEnrichmentContent` interface
- `DocumentEnrichmentContent` interface (placeholder)
- `EnrichmentContent` union type

**File**: `packages/shared-types/src/enrichment-type-registry.ts`

Create Type Registry for extensibility:
- `EnrichmentTypeDefinition` interface (type, icon, label, generationFlow, contentSchema, settingsSchema, components, features)
- `EnrichmentTypeRegistry` class (register, get, getAll, getEnabled)
- `enrichmentRegistry` singleton export

### 1.3 BullMQ Job Types

**File**: `packages/shared-types/src/bullmq-jobs.ts` (update)

Add:
- `EnrichmentJobDataSchema` extending BaseJobDataSchema
- Include enrichmentId, lessonId, courseId, enrichmentType, lessonContent, settings

### 1.4 Database Types Regeneration

Run: `mcp__supabase__generate_typescript_types` → update `packages/shared-types/src/database.types.ts`

---

## Phase 2: Backend - BullMQ Pipeline

### 2.1 Stage 7 Config

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/config/index.ts`

Define:
- QUEUE_NAME: 'stage7-lesson-enrichments'
- CONCURRENCY: 30 (same as Stage 6)
- MAX_RETRIES: 3
- RETRY_DELAY_MS: 5000
- Type-specific timeouts (quiz: 60s, audio: 120s, video: 300s)

### 2.2 Factory Pattern

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/factory.ts`

Implement:
- `createStage7Worker()` - Returns BullMQ Worker
- `createStage7Queue()` - Returns BullMQ Queue
- `gracefulShutdown()` - Clean shutdown handler
- Event listeners: completed, failed, progress, stalled, error

### 2.3 Job Processor

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts`

Implement:
- `processEnrichmentJob(job)` - Main entry point
- `updateJobProgress(job, update)` - Progress streaming
- `processWithFallback(job, modelConfig)` - Model fallback strategy
- Error classification and structured logging

### 2.4 Enrichment Router

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/enrichment-router.ts`

Implement:
- Route to type-specific handler based on enrichment_type
- `handlers: Record<EnrichmentType, EnrichmentHandler>`

### 2.5 Type Handlers (Two-Stage & Single-Stage)

Create handlers for each type with appropriate generation flow:

**Two-Stage Types (Video, Presentation):**
- `video-handler.ts` - Phase 1: Generate script → Phase 2: Call video API
- `presentation-handler.ts` - Phase 1: Generate slide structure → Phase 2: Render HTML

**Single-Stage Types (Audio, Quiz):**
- `audio-handler.ts` - Direct TTS API call (low cost, fast)
- `quiz-handler.ts` - Full implementation (first enrichment type)

**Handler Interface:**
```typescript
interface EnrichmentHandler {
  generationFlow: 'single-stage' | 'two-stage';

  // For single-stage types
  generate?(job: EnrichmentJobData): Promise<EnrichmentContent>;

  // For two-stage types
  generateDraft?(job: EnrichmentJobData): Promise<DraftContent>;
  generateFinal?(job: EnrichmentJobData, approvedDraft: DraftContent): Promise<EnrichmentContent>;
}
```

### 2.6 Database Service

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/database-service.ts`

Implement:
- `saveEnrichmentContent(enrichmentId, content, metadata)`
- `updateEnrichmentStatus(enrichmentId, status, errorInfo?)`
- `getEnrichmentWithLesson(enrichmentId)` - Fetch lesson content for prompt

### 2.7 Agent System Prompts

**Files in**: `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/`

Create structured prompts for each enrichment type following the patterns defined in TZ Section 6:

| Prompt File | Purpose | Key Output Fields |
|-------------|---------|-------------------|
| `video-prompt.ts` | Generate video script with narration | `script.intro`, `script.sections[]`, `script.conclusion`, `metadata` |
| `audio-prompt.ts` | Optimize text for TTS | `transcript`, `ssml_hints[]`, `estimated_duration_seconds` |
| `presentation-prompt.ts` | Generate slide deck | `title_slide`, `content_slides[]`, `summary_slide`, `metadata` |
| `quiz-prompt.ts` | Create comprehension quiz | `quiz_title`, `questions[]`, `passing_score`, `metadata.bloom_coverage` |

**Prompt Design Requirements:**
- All prompts must include: Role, Input, Output Format, Guidelines, Constraints
- Output as structured JSON for Zod validation
- Language support: ru/en with appropriate tone adjustments
- Bloom's taxonomy coverage tracking for quizzes
- 6x6 rule for presentations (max 6 bullets, max 6 words per bullet)
- SSML hints for audio pauses and emphasis

### 2.8 Storage Service

**File**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/storage-service.ts`

Implement asset upload flow for video/audio/presentation files:

```typescript
// Key functions:
- uploadEnrichmentAsset(enrichmentId, courseId, lessonId, content, mimeType)
  → Upload to Supabase Storage: course-enrichments/{course_id}/{lesson_id}/{enrichment_id}.{ext}
  → Create asset record in assets table
  → Link asset_id to lesson_enrichments record
  → Return asset.id

- getSignedPlaybackUrl(assetId, expirySeconds = 3600)
  → Generate signed URL for media playback
```

---

## Phase 3: Backend - tRPC Router

### 3.1 Router Structure

**File**: `packages/course-gen-platform/src/server/routers/enrichment/router.ts`

Implement procedures:
- `create` - Insert enrichment + enqueue job
- `createBatch` - Batch create for multiple lessons
- `getByLesson` - List enrichments for lesson
- `getSummaryByCourse` - Aggregated summary for graph nodes
- `regenerate` - Retry failed enrichment
- `regenerateDraft` - Regenerate Phase 1 draft only (two-stage)
- `updateDraft` - Save user edits to draft content (two-stage)
- `approveDraft` - Approve draft and start Phase 2 (two-stage)
- `delete` - Remove enrichment + asset
- `reorder` - Update order_index values
- `cancel` - Cancel in-progress generation
- `getPlaybackUrl` - Generate signed URL for assets

### 3.2 Input Schemas

**File**: `packages/course-gen-platform/src/server/routers/enrichment/schemas.ts`

Define:
- `createEnrichmentSchema` - lessonId, enrichmentType, settings
- `createBatchSchema` - lessonIds, enrichmentType
- `reorderSchema` - lessonId, orderedIds array

### 3.3 Middleware

Apply:
- `protectedProcedure` - Authentication
- `createRateLimiter` - Prevent abuse
- Course ownership verification

---

## Phase 4: Frontend - UI Components

### 4.1 LessonNode Update

**File**: `packages/web/components/generation-graph/nodes/LessonNode.tsx`

Changes:
- Increase height from 50px to 64px
- Add AssetDock component at bottom (24px zone)
- Update semantic zoom logic for dock visibility
- Add enrichmentsSummary to LessonNodeData type

### 4.2 AssetDock Component

**File**: `packages/web/components/generation-graph/nodes/AssetDock.tsx`

Implement:
- Compact icon row showing enrichment types
- Status colors (gray/blue/green/red)
- Click handler to open inspector
- Semantic zoom: dot → count → icons

### 4.3 EnrichmentNodeToolbar

**File**: `packages/web/components/generation-graph/components/EnrichmentNodeToolbar.tsx`

Implement:
- React Flow `<NodeToolbar>` appearing on node selection
- Buttons for each enrichment type
- Document button disabled with "Coming Soon" tooltip

### 4.4 Inspector Panel (Stack Navigator Pattern)

**Architecture**: The Inspector Panel functions as a **Stack Navigator** with three internal views, implementing the **Contextual Deep-Link Pattern** from DeepThink analysis.

**Main File**: `packages/web/components/generation-graph/panels/stage7/EnrichmentInspectorPanel.tsx`

```tsx
// View router component
export const EnrichmentInspectorPanel = () => {
  const { view, activeCreateType, activeEnrichmentId } = useEnrichmentInspectorStore();

  return (
    <SheetContent>
      {view === 'ROOT' && <RootView />}
      {view === 'CREATE' && <CreateView type={activeCreateType} />}
      {view === 'DETAIL' && <DetailView enrichmentId={activeEnrichmentId} />}
    </SheetContent>
  );
};
```

**Views in**: `packages/web/components/generation-graph/panels/stage7/views/`

| View | Purpose | Entry Points |
|------|---------|--------------|
| `RootView.tsx` | List enrichments + fallback add button | Node body click, Back from CREATE/DETAIL |
| `CreateView.tsx` | Configuration form for new enrichment | NodeToolbar button, [+ Add Enrichment] |
| `DetailView.tsx` | Preview/edit specific enrichment | Asset Dock icon click (count=1), Generation complete |
| `EmptyStateCards.tsx` | Discovery cards when no enrichments | RootView when enrichments.length === 0 |

**DETAIL View Modes (Two-Stage Support):**
```typescript
// DetailView automatically adapts based on status
switch (enrichment.status) {
  case 'draft_generating':
    return <DraftGeneratingState />; // Progress spinner for Phase 1
  case 'draft_ready':
    return <DraftReviewMode />;      // Editable preview + [Approve & Generate]
  case 'generating':
    return <GeneratingState />;       // Progress for Phase 2 (or single-stage)
  case 'completed':
    return <FinalPreviewMode />;      // Final content preview
  case 'failed':
    return <ErrorState />;            // Error + [Retry] button
}
```

**Components in**: `packages/web/components/generation-graph/panels/stage7/components/`

Create:
- `EnrichmentList.tsx` - Sortable list with @dnd-kit
- `EnrichmentListItem.tsx` - Individual enrichment row (click → DETAIL view)
- `EnrichmentStatusBadge.tsx` - Status indicator (✓, ●, ✗)
- `EnrichmentAddPopover.tsx` - Popover/Bottom Sheet for fallback add
- `GenerationProgress.tsx` - Progress display during generation (terminal style)
- `DiscardChangesDialog.tsx` - Confirm dialog for dirty form state

**Forms in**: `packages/web/components/generation-graph/panels/stage7/forms/`

Create type-specific configuration forms with smart defaults:
- `QuizCreateForm.tsx` - Question count, difficulty, types
- `AudioCreateForm.tsx` - Voice selection, speed
- `VideoCreateForm.tsx` - Voice, avatar, resolution
- `PresentationCreateForm.tsx` - Slide count, theme

**Navigation Rules (Safe Harbor):**
- "Back" always returns to ROOT view, never closes panel
- Dirty form state → show DiscardChangesDialog before navigation
- Pristine form → allow immediate navigation without confirm

### 4.5 Preview Components

**Files in**: `packages/web/components/generation-graph/panels/stage7/previews/`

Create:
- `QuizPreview.tsx` - Display questions, answers, explanations
- `VideoPreview.tsx` - Video player with react-player
- `AudioPreview.tsx` - HTML5 audio player
- `PresentationPreview.tsx` - Slide carousel

### 4.6 Theme Support (Design Tokens)

**File**: `packages/web/components/generation-graph/styles/enrichment-tokens.ts`

Define consistent color tokens for both light and dark themes:

```typescript
// Enrichment type icon colors
const enrichmentIconColors = {
  video: 'text-purple-600 dark:text-purple-400',
  audio: 'text-blue-600 dark:text-blue-400',
  presentation: 'text-orange-600 dark:text-orange-400',
  quiz: 'text-green-600 dark:text-green-400',
  document: 'text-slate-600 dark:text-slate-400',
};

// Status colors (consistent with existing node status)
const enrichmentStatusColors = {
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  generating: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
};
```

**Component Styling Guidelines:**
- Asset Dock: `border-t border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/30`
- Inspector Panel: `bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700`
- List Items: `bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800`

### 4.7 Error Display Patterns

Implement error grouping to prevent "Christmas Tree" visual clutter:

**Asset Dock Error Indicator:**
- Single failed enrichment: Red warning dot on specific icon
- Multiple failures: Single grouped indicator with count badge
- Click opens Inspector with error filter applied

**Inspector Panel Error State:**
```tsx
// Error state component structure:
<div className="error-state bg-red-50 dark:bg-red-900/20 p-3 rounded">
  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
    <AlertCircle className="w-4 h-4" />
    <span className="font-medium">{status}</span>
  </div>
  <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error_message}</p>
  <div className="mt-3 flex gap-2">
    <Button variant="outline" size="sm">[Regenerate]</Button>
    <Button variant="ghost" size="sm">[Delete]</Button>
  </div>
</div>
```

**Generation Progress Display:**
- Progress bar with stage label and percentage
- Stages: `fetching_context` → `building_prompt` → `calling_llm` → `processing_response` → `completed`

---

## Phase 5: Frontend - State & Integration

### 5.1 Inspector Store (Zustand)

**File**: `packages/web/components/generation-graph/stores/enrichment-inspector-store.ts`

Implement Zustand store for Inspector Panel state management:

```typescript
type InspectorView = 'ROOT' | 'CREATE' | 'DETAIL';

interface EnrichmentInspectorState {
  isOpen: boolean;
  nodeId: string | null;
  nodeType: 'lesson' | 'module' | null;
  view: InspectorView;
  activeCreateType: EnrichmentType | null;
  createFormDirty: boolean;
  activeEnrichmentId: string | null;
  scrollToType: EnrichmentType | null;  // For count-based routing

  // Actions
  openRoot: (nodeId: string) => void;
  openCreate: (nodeId: string, type: EnrichmentType) => void;
  openDetail: (nodeId: string, enrichmentId: string) => void;
  goBack: () => void;
  close: () => void;
  setFormDirty: (dirty: boolean) => void;
  setScrollToType: (type: EnrichmentType | null) => void;
}
```

**Key behaviors:**
- `openCreate()` - Called by NodeToolbar buttons (deep-link pattern)
- `goBack()` - Safe Harbor: always goes to ROOT, never closes panel
- `createFormDirty` - Tracks unsaved changes for discard confirmation

### 5.2 Enrichment Data Hook

**File**: `packages/web/components/generation-graph/hooks/useEnrichmentData.ts`

Implement:
- tRPC query for getSummaryByCourse
- Supabase realtime subscription
- Update node data on status changes
- Count-based routing logic for Asset Dock clicks

### 5.3 Selection Sync Hook

**File**: `packages/web/components/generation-graph/hooks/useEnrichmentSelection.ts`

Implement:
- React Flow `useOnSelectionChange` integration
- Node body click → `openRoot(nodeId)`
- NodeToolbar button click → `openCreate(nodeId, type)` (deep-link)
- Asset Dock icon click → Count-based routing:
  - count === 1 → `openDetail(nodeId, enrichmentId)`
  - count > 1 → `openRoot(nodeId)` + `setScrollToType(type)`

### 5.4 Post-Generation Flow Hook

**File**: `packages/web/components/generation-graph/hooks/useGenerationStatus.ts`

Implement optimistic handoff behavior:
- Watch for status changes on generating enrichments
- When status changes to 'completed' → transition from progress to preview in DETAIL view
- When generation starts → Asset Dock icon starts pulsing blue
- Handle return paths (specific icon click vs generic node click)

### 5.5 Optimistic UI Updates

Implement in tRPC mutation hooks:
- Optimistic add (ghost icon)
- Rollback on error
- Cache invalidation on settle
- CREATE → DETAIL transition on generate click

### 5.6 ELK Layout Update

Update ELK configuration:
- Increase node height from 50 to 64
- Verify layout stability with enrichments

---

## Phase 6: i18n & Polish

### 6.1 Translation Files

Create:
- `packages/web/messages/ru/enrichments.json`
- `packages/web/messages/en/enrichments.json`

Keys: types, actions, status, batch, inspector, errors, progress

### 6.2 Backend Translations

Update: `packages/course-gen-platform/src/shared/i18n/messages.ts`

Add stage7 section with phase messages.

### 6.3 Mobile Adaptation

Implement:
- Inspector as bottom sheet on mobile
- Touch-friendly targets (44x44px minimum)

### 6.4 Accessibility

Implement:
- `nodesFocusable={true}` for keyboard navigation
- ARIA labels for all enrichment icons
- `aria-live="polite"` for status announcements
- Focus trap in inspector panel

---

## Dependencies Between Phases

```
Phase 0 (Research) ───► Phase 1 (Database & Types)
                              │
                              ├───► Phase 2 (BullMQ Pipeline)
                              │           │
                              │           └───► Phase 3 (tRPC Router)
                              │                       │
                              └───► Phase 4 (UI Components)
                                            │
                                            └───► Phase 5 (State & Integration)
                                                          │
                                                          └───► Phase 6 (i18n & Polish)
```

Phases 2-3 (Backend) and Phase 4 (UI) can proceed in parallel after Phase 1 completes.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| TTS API costs exceed budget | Medium | Medium | Start with OpenAI TTS ($0.015/1K chars), add cost tracking |
| Video generation complexity | High | High | Stub video handler, implement in later phase |
| ELK layout breaks with 64px nodes | Low | High | Test with 50-lesson courses before commit |
| Realtime subscription latency | Low | Medium | Debounce updates, batch state changes |
| Quiz quality varies by content | Medium | Medium | Add quality threshold, auto-regenerate below 0.7 |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Enrichment add time | < 10 seconds | Time from click to ghost icon |
| Status update latency | < 2 seconds | Supabase realtime to UI |
| Quiz generation success | > 95% | First attempt + retries |
| Graph performance | 60 fps | Pan/zoom with 50 lessons |
| Mobile usability | 44x44px targets | Lighthouse accessibility audit |
| i18n coverage | 100% | All strings in ru/en |

---

## Next Steps

1. Run `/speckit.tasks` to generate detailed task breakdown
2. Begin Phase 1: Database migration and types
3. Parallel: Start Phase 4 UI component scaffolding
4. First enrichment type: Quiz (simplest, text-only)

---

## Appendix A: Adding New Enrichment Type

See **TZ Section 6.5** in [stage-7-lesson-enrichments.md](./stage-7-lesson-enrichments.md#65-adding-new-enrichment-type-agent-creation-guide) for the complete guide on adding new enrichment types (flashcards, summary, mindmap, etc.).

**Quick Reference** (6 steps):
1. Database: `ALTER TYPE enrichment_type ADD VALUE 'new_type'`
2. Types: Add interface to `enrichment-content.ts`
3. Handler: Create `new-type-handler.ts`
4. Router: Register in `enrichment-router.ts`
5. UI: Add icon, translations, preview component
6. Prompt: Create agent prompt following existing patterns

---

## Appendix B: TZ Section References

| Plan Section | TZ Reference | Status |
|--------------|--------------|--------|
| Phase 2.7 Agent Prompts | TZ Section 6 (lines 745-1073) | ✅ Added |
| Phase 2.8 Storage Service | TZ Section 10.3 (lines 1494-1536) | ✅ Added |
| Phase 4.6 Theme Support | TZ Section 12 (lines 1712-1757) | ✅ Added |
| Phase 4.7 Error Display | TZ Section 9.2-9.3 (lines 1374-1444) | ✅ Added |
| Appendix A: New Type Guide | TZ Section 6.5 (lines 1006-1073) | ✅ Added |
