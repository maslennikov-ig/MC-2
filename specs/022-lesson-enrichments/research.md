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

*Research complete. Ready for Phase 1 implementation.*
