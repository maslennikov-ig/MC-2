# Research: Lesson Enrichments (Stage 7)

**Date**: 2025-12-24
**Status**: Complete
**Plan Reference**: [plan.md](./plan.md)

This document captures research decisions for the Stage 7 enrichments feature.

---

## 1. TTS Library Evaluation (Audio Enrichments)

### Decision: **OpenAI TTS API** (tts-1-hd model)

### Candidates Evaluated

| Provider | Russian Support | Cost | Quality | API Latency |
|----------|-----------------|------|---------|-------------|
| OpenAI TTS | Yes (Alloy, Nova voices) | $0.015/1K chars | HD quality available | ~2-3s first byte |
| ElevenLabs | Yes (multilingual) | $0.03/1K chars | Best quality | ~1-2s first byte |
| Azure Cognitive | Yes (25+ voices) | $0.016/1K chars | Good quality | ~2s first byte |
| Edge TTS | Yes (free) | Free | Medium quality | Variable |

### Rationale

1. **OpenAI TTS** selected as primary for:
   - Consistent quality with `tts-1-hd` model
   - Native Russian support via Alloy, Echo, Fable, Onyx, Nova, Shimmer voices
   - Competitive pricing ($0.015/1K chars = ~$0.08/min for average content)
   - Simple REST API compatible with existing OpenAI SDK usage
   - Streaming support via SSE (`stream_format: 'sse'`)

2. **API Usage Pattern**:
   ```typescript
   POST /audio/speech
   {
     model: 'tts-1-hd',
     input: lessonContent,
     voice: 'nova',           // Good for educational content
     response_format: 'mp3',  // Supported: mp3, opus, aac, flac, wav, pcm
     speed: 1.0               // Adjustable 0.25-4.0
   }
   ```

3. **Cost Estimation**:
   - Average lesson: ~3000 characters
   - Cost per lesson: ~$0.045
   - 50 lessons course: ~$2.25 for audio

### Alternatives Rejected

- **ElevenLabs**: 2x cost, overkill for educational content where naturalness is less critical than clarity
- **Edge TTS**: Free but unreliable availability, rate limits, no SLA
- **Azure Cognitive**: Similar cost to OpenAI but requires separate Azure subscription

---

## 2. Video Generation API (Video Enrichments)

### Decision: **Stub Implementation Initially** (defer to future phase)

### Rationale

Video generation APIs (HeyGen, Synthesia, D-ID) are:
1. **Expensive**: $0.50-2.00+ per minute of video
2. **Complex**: Require avatar selection, lip-sync, slide sync
3. **Slow**: 3-10 minutes generation time per video
4. **Scope creep risk**: High effort, lower initial priority

### Implementation Strategy

1. **Phase 1**: Implement `video-handler.ts` as stub returning placeholder content
2. **Video content stored as script** (text + slide sync points) for future generation
3. **Future integration** can convert stored scripts to actual videos

### Alternative Considered

- Implement simple slide-to-video conversion with TTS overlay
- Decision: Still too complex for MVP, deferred

---

## 3. Presentation Format (Slides Enrichments)

### Decision: **reveal.js JSON format with in-app preview**

### Candidates Evaluated

| Format | In-App Preview | Export | Implementation |
|--------|---------------|--------|----------------|
| reveal.js JSON | Yes (iframe) | HTML export | Simple |
| PPTX generation | Requires library | Native download | Complex |
| PDF slides | Read-only | PDF download | Medium |
| Markdown slides | Custom renderer | MD export | Simple |

### Rationale

1. **reveal.js JSON** selected because:
   - JSON structure aligns with JSONB storage
   - Can render in iframe for preview
   - Export to standalone HTML possible
   - Existing patterns in codebase (markdown rendering)

2. **Storage Format**:
   ```typescript
   interface PresentationEnrichmentContent {
     type: 'presentation';
     theme: 'default' | 'dark' | 'academic';
     slides: Array<{
       index: number;
       title: string;
       content: string;           // Markdown content
       layout: 'title' | 'content' | 'two-column' | 'image';
       speaker_notes?: string;
       visual_suggestion?: string;
     }>;
     total_slides: number;
   }
   ```

3. **Preview Component**:
   - Use `@radix-ui/react-dialog` for fullscreen preview
   - Carousel navigation for slides
   - Markdown rendering for content

### Alternatives Rejected

- **PPTX generation**: Requires `pptxgenjs` or similar, adds complexity,
  download-only (no in-app preview), harder to regenerate individual slides
- **PDF**: Static, no interactive preview

---

## 4. Quiz Storage Format

### Decision: **Custom JSONB aligned with QTI structure**

### Design Considerations

1. **QTI Compatibility**: Structure inspired by IMS QTI standard for future LMS export
2. **Bloom's Taxonomy**: Include cognitive level for pedagogical value
3. **Explanation Support**: Required for learning-oriented quizzes

### Storage Format

```typescript
interface QuizEnrichmentContent {
  type: 'quiz';
  quiz_title: string;
  instructions: string;
  questions: Array<{
    id: string;
    type: 'multiple_choice' | 'true_false' | 'short_answer';
    bloom_level: 'remember' | 'understand' | 'apply' | 'analyze';
    difficulty: 'easy' | 'medium' | 'hard';
    question: string;
    options?: Array<{ id: string; text: string }>;  // For multiple_choice
    correct_answer: string | boolean | number;
    explanation: string;
    points: number;
  }>;
  passing_score: number;          // Percentage 0-100
  time_limit_minutes?: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  metadata: {
    total_points: number;
    estimated_minutes: number;
    bloom_coverage: Record<string, number>;
  };
}
```

### QTI Export Consideration

Structure allows straightforward mapping to QTI 2.1:
- `question.type` → QTI `responseDeclaration`
- `question.options` → QTI `simpleChoice`
- `correct_answer` → QTI `correctResponse`
- `explanation` → QTI `feedbackInline`

---

## 5. Supabase Storage Bucket Strategy

### Decision: **course-enrichments bucket with course-scoped paths**

### Bucket Configuration

```sql
-- Bucket: course-enrichments
-- Structure: {course_id}/{lesson_id}/{enrichment_id}.{ext}
-- Example: abc123/lesson456/enrich789.mp3

-- RLS Policy Pattern (aligns with existing course access patterns)
CREATE POLICY "Users can access own course enrichments"
ON storage.objects FOR ALL
USING (
  bucket_id = 'course-enrichments'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM courses WHERE user_id = auth.uid()
  )
);
```

### Signed URL Strategy

- **Expiration**: 1 hour for playback URLs
- **Regeneration**: On each preview request (not cached)
- **Format**: `{bucket}.supabase.co/...?token=...&t=...`

### File Types

| Enrichment | Extension | MIME Type | Max Size |
|------------|-----------|-----------|----------|
| Audio | .mp3 | audio/mpeg | 50 MB |
| Video | .mp4 | video/mp4 | 500 MB |
| Presentation | .html | text/html | 10 MB |

---

## 6. Drag-Reorder Library

### Decision: **@dnd-kit/sortable** (already in codebase)

### Verification

Searched codebase - `@dnd-kit` already used:
- Package installed in `packages/web/package.json`
- Pattern established for sortable lists

### Implementation Pattern (from Context7)

```tsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

function EnrichmentList({ enrichments, onReorder }) {
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = enrichments.findIndex(e => e.id === active.id);
      const newIndex = enrichments.findIndex(e => e.id === over.id);
      onReorder(arrayMove(enrichments, oldIndex, newIndex));
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={enrichments.map(e => e.id)} strategy={verticalListSortingStrategy}>
        {enrichments.map(e => <SortableEnrichmentItem key={e.id} enrichment={e} />)}
      </SortableContext>
    </DndContext>
  );
}
```

---

## 7. Video/Audio Player Libraries

### Decisions

| Type | Library | Reason |
|------|---------|--------|
| Audio | Native HTML5 `<audio>` | No dependency needed, good browser support |
| Video | Native HTML5 `<video>` | Same as audio, sufficient for MP4 playback |

### Alternative Considered

- **react-player**: Would add dependency, overkill for simple playback
- **video.js**: Heavy, enterprise features not needed

### Implementation

```tsx
// AudioPreview.tsx
<audio controls src={signedUrl} className="w-full" />

// VideoPreview.tsx
<video controls src={signedUrl} className="w-full rounded-lg" />
```

---

## 8. Summary Table

| Component | Decision | Library/Tool | Version |
|-----------|----------|--------------|---------|
| TTS | OpenAI TTS API | openai SDK | tts-1-hd |
| Video Gen | Stub (deferred) | - | - |
| Presentation | reveal.js JSON | Native rendering | - |
| Quiz Format | Custom JSONB | QTI-aligned | - |
| Storage | Supabase Storage | course-enrichments | - |
| Drag-Reorder | @dnd-kit/sortable | Existing | ^6.x |
| Audio Player | HTML5 native | - | - |
| Video Player | HTML5 native | - | - |

---

## 9. Cost Projections

### Per-Course Costs (50 lessons)

| Enrichment Type | Cost Estimate |
|-----------------|---------------|
| Audio (all lessons) | ~$2.25 |
| Quiz (all lessons) | ~$0.50 (LLM tokens) |
| Presentation (all) | ~$0.50 (LLM tokens) |
| Video | Deferred |
| **Total per course** | **~$3.25** |

### Monthly Projections (100 courses/month)

- Audio generation: ~$225/month
- Quiz/Presentation: ~$100/month
- Total enrichments: ~$325/month

---

## 10. UX Architecture: DeepThink Analysis (2025-12-24)

### Problem Statement

Initial spec defined a three-layer system (Asset Dock → NodeToolbar → Inspector Panel) but left a critical UX gap: **Where does the user configure enrichment options before generation?**

User mental model (from n8n): "I click a node, a panel opens with full description and configuration options."

### DeepThink Analysis Process

Two rounds of DeepThink analysis were conducted:
1. **Round 1**: Evaluated 5 options (Modal, Inspector immediate, Hover+Modal, Separate nodes, Inline in Inspector)
2. **Round 2**: Clarified edge cases (post-generation flow, multiple enrichments, batch operations, navigation)

### Decision: Contextual Deep-Link Pattern

**Core Concept**: NodeToolbar buttons act as **shortcuts (deep links)** into the Inspector Panel's internal views.

```
NodeToolbar [+ Quiz] click
        ↓
Inspector Panel opens directly in CREATE view (skips ROOT)
        ↓
User sees configuration form with description + smart defaults
        ↓
Click [Generate] → Panel transitions to DETAIL view (progress → result)
```

### Inspector Panel Architecture (Stack Navigator)

Three internal views with navigation rules:

| View | Purpose | Entry Points |
|------|---------|--------------|
| **ROOT** | List enrichments + fallback add button | Node body click, Back from other views |
| **CREATE** | Configuration form for new enrichment | NodeToolbar button, [+ Add Enrichment] popover |
| **DETAIL** | Preview/edit specific enrichment | Asset Dock icon click (count=1), Generation complete |

### Key UX Decisions

#### 1. Post-Generation Flow: "Optimistic Handoff"
- Click [Generate] → Panel immediately transitions CREATE → DETAIL
- DETAIL shows progress state ("Building...") with terminal-style log
- When complete → content appears with live update (no page reload)
- User can close panel and return later (Asset Dock shows pulsing icon)

#### 2. Multiple Same-Type Enrichments: "Count-Based Smart Routing"
- **Count = 1**: Asset Dock icon click → DETAIL view directly
- **Count > 1**: Asset Dock icon click → ROOT view with auto-scroll to section
- Visual: Single item `[❓]`, Multiple items `[❓ 2]` (badge)

#### 3. Fallback Add Button: Popover Menu
- Desktop: Popover anchored to [+ Add Enrichment] button
- Mobile: Bottom Sheet
- Menu mirrors NodeToolbar (Icons + Labels)

#### 4. Batch Operations: Module Inspector
- Click ModuleGroup → Opens **Module Details** Inspector (not Lesson Inspector)
- "Batch Enrichments" section with type buttons
- Example: [Generate Quizzes for All 12 Lessons]
- **Why**: Keeps Lesson Inspector focused; safe space for bulk operations

#### 5. Cancel/Back Navigation: "Safe Harbor"
- **Rule**: "Back" always returns to ROOT view, never closes panel
- Dirty form state → Show "Discard unsaved changes?" dialog
- Pristine form → Switch immediately without confirm
- **Why**: Closing panel feels like crash; ROOT view re-orients user

#### 6. Empty State: "Discovery Cards"
- When lesson has 0 enrichments, ROOT view shows educational cards
- Each card explains enrichment type + [Add] button
- After first enrichment added → standard list view takes over
- **Why**: Transforms "dead end" into onboarding; improves discoverability

### Navigation Rules Summary (Golden Rule)

| User Action | Result |
|-------------|--------|
| Click lesson node body | Inspector opens in ROOT view |
| Click NodeToolbar [+ Type] | Inspector opens in CREATE view (deep-link) |
| Click Asset Dock icon (count=1) | Inspector opens in DETAIL view |
| Click Asset Dock icon (count>1) | Inspector opens in ROOT view + scroll |
| Click [+ Add Enrichment] | Popover menu → CREATE view |
| Click item in ROOT list | Transition to DETAIL view |
| Click Back in CREATE/DETAIL | Transition to ROOT view (Safe Harbor) |

### Why This Pattern Works

1. **Matches n8n Mental Model**: Side panel is the "properties engine"
2. **Solves Mobile Constraint**: No hover-dependent interactions
3. **Prevents Graph Explosion**: Enrichments as metadata, not separate nodes
4. **Smart Defaults**: Users can generate immediately or customize
5. **Keeps Module Inspector for Batch**: Clean separation of concerns

### Files Documenting DeepThink Analysis

- `docs/DeepThink/enrichment-add-flow-ux-analysis.md` - Initial analysis prompt
- `docs/DeepThink/enrichment-add-flow-followup.md` - Follow-up clarifications

---

## 11. Two-Stage Generation Flow Decision (2025-12-24)

### Problem Statement

Some enrichment types involve expensive operations (video generation at $0.50+/min, complex rendering). Users need to review and approve content before these costs are incurred.

### Decision: Two-Stage Flow for Video and Presentation

**Single-Stage Types**: Audio, Quiz
- Fast, inexpensive generation
- Immediate final output
- Regenerate if unsatisfied

**Two-Stage Types**: Video, Presentation
- **Phase 1 (Draft)**: Generate script/structure via LLM (cheap)
- **User Review**: View, edit, approve or regenerate draft
- **Phase 2 (Final)**: Generate final content (expensive)

### Status Enum Extension

```sql
CREATE TYPE enrichment_status AS ENUM (
    'pending',           -- Queued for generation
    'draft_generating',  -- Phase 1: Generating draft/script
    'draft_ready',       -- Phase 1 complete: Awaiting user review
    'generating',        -- Phase 2: Final content (or single-stage)
    'completed',         -- Successfully generated
    'failed',            -- Generation failed
    'cancelled'          -- User cancelled
);
```

### Handler Interface

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

### DETAIL View Modes

```typescript
switch (enrichment.status) {
  case 'draft_generating': return <DraftGeneratingState />;
  case 'draft_ready':      return <DraftReviewMode />;      // Edit + [Approve & Generate]
  case 'generating':       return <GeneratingState />;
  case 'completed':        return <FinalPreviewMode />;
  case 'failed':           return <ErrorState />;
}
```

### tRPC Procedures Added

- `regenerateDraft` - Regenerate Phase 1 draft only
- `updateDraft` - Save user edits to draft content
- `approveDraft` - Approve draft and start Phase 2

### Benefits

1. **Cost Control**: Users see estimated cost before expensive generation
2. **Quality Control**: Users can fix issues before final render
3. **Transparency**: Users understand exactly what will be generated
4. **Professional Workflow**: Matches real video/presentation production

---

## 12. Type Registry Pattern Decision (2025-12-24)

### Problem Statement

The enrichment system needs to support adding new enrichment types (flashcards, summaries, mindmaps, etc.) with minimal code changes and no modifications to core components.

### Decision: Pluggable Type Registry

Create a **Type Constructor** pattern where each enrichment type is self-describing and the system dynamically adapts.

### Core Interface

```typescript
interface EnrichmentTypeDefinition {
  type: string;                              // Unique type key
  version: number;                           // Schema version
  icon: string;                              // Lucide icon name
  label: { en: string; ru: string };
  description: { en: string; ru: string };
  generationFlow: 'single-stage' | 'two-stage';
  contentSchema: ZodSchema;
  settingsSchema: ZodSchema;
  components: {
    CreateForm: () => Promise<Component>;
    DetailView: () => Promise<Component>;
    DraftEditor?: () => Promise<Component>;  // For two-stage
  };
  features: {
    canEdit: boolean;
    canRegenerate: boolean;
    canExport: boolean;
    requiresAsset: boolean;
    supportsPreview: boolean;
  };
}
```

### Adding New Type Checklist

1. Database: `ALTER TYPE enrichment_type ADD VALUE 'flashcards'`
2. Schemas: Define content/settings in `shared-types`
3. Register: Call `enrichmentRegistry.register({...})`
4. UI Components: Create form, detail view, (draft editor if two-stage)
5. Worker Handler: Implement generation logic

**No changes needed to**:
- Inspector Panel (reads from registry)
- Asset Dock (uses registry icons)
- BullMQ router (dispatches by type)
- Database schema (JSONB is flexible)

### Type Configuration Matrix

| Type | Flow | Asset | Preview | Edit | Export |
|------|------|-------|---------|------|--------|
| video | two-stage | ✅ MP4 | ✅ | ❌ | ✅ |
| audio | single | ✅ MP3 | ✅ | ❌ | ✅ |
| presentation | two-stage | ❌ | ✅ | ✅ | ✅ HTML |
| quiz | single | ❌ | ✅ | ✅ | ✅ QTI |
| flashcards* | single | ❌ | ✅ | ✅ | ✅ Anki |
| summary* | single | ❌ | ✅ | ✅ | ✅ MD |
| mindmap* | single | ❌ | ✅ | ❌ | ✅ SVG |

*Future types showing extensibility pattern*

---

*Research complete. Ready for Phase 1 implementation.*
