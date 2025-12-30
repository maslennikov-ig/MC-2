# Technical Specification: Course Viewer Update

**Version:** 1.0
**Date:** 2025-12-30
**Status:** Draft

---

## 1. Executive Summary

The current Course Viewer (`course-viewer-enhanced.tsx`) is outdated and does not display all available data entities. Critical issues include:
- **Lessons not displaying** - content rendering broken due to JSONB type mismatch
- **Enrichments not shown** - Stage 7 enrichments (video, audio, quiz, presentation, document) completely absent
- **Missing lesson types** - no differentiation by lesson_type (video, text, quiz, interactive, assignment)
- **Outdated data model** - viewer uses legacy fields instead of current database schema

---

## 2. Current State Analysis

### 2.1 Database Schema (Actual)

#### Table: `lessons`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| section_id | uuid | Parent section |
| title | text | Lesson title |
| order_index | integer | Sort order |
| duration_minutes | integer | Estimated duration |
| **lesson_type** | enum | `video`, `text`, `quiz`, `interactive`, `assignment` |
| **status** | enum | lesson_status |
| **content** | JSONB | Structured lesson content |
| content_text | text | Legacy plain text content |
| objectives | text[] | Learning objectives |
| metadata | JSONB | Additional metadata |
| created_at, updated_at | timestamptz | Timestamps |

#### Table: `lesson_enrichments` (NOT USED IN VIEWER!)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| lesson_id | uuid | Parent lesson |
| course_id | uuid | Parent course (denormalized) |
| **enrichment_type** | enum | `video`, `audio`, `presentation`, `quiz`, `document` |
| order_index | integer | Display order |
| title | text | Custom title |
| **content** | JSONB | Type-specific content (see 2.2) |
| asset_id | uuid | Supabase Storage reference |
| **status** | enum | `pending`, `draft_generating`, `draft_ready`, `generating`, `completed`, `failed`, `cancelled` |
| generation_attempt | integer | Retry counter |
| error_message | text | Error info |
| metadata | JSONB | Generation metrics |
| created_at, updated_at, generated_at | timestamptz | Timestamps |

#### Table: `assets`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| lesson_id | uuid | Parent lesson |
| asset_type | text | Type identifier |
| url | text | Direct URL |
| download_url | text | Download link |
| filename | text | Original filename |
| mime_type | text | MIME type |
| duration_seconds | integer | For audio/video |
| file_size_bytes | bigint | File size |
| metadata | JSONB | Additional data |

### 2.2 Enrichment Content Structures

#### Quiz Enrichment
```typescript
{
  type: 'quiz',
  quiz_title: string,
  instructions: string,
  questions: [{
    id: string,
    type: 'multiple_choice' | 'true_false' | 'short_answer',
    bloom_level: 'remember' | 'understand' | 'apply' | 'analyze',
    difficulty: 'easy' | 'medium' | 'hard',
    question: string,
    options?: [{ id: string, text: string }],
    correct_answer: string | boolean,
    explanation: string,
    points: number
  }],
  passing_score: number,
  time_limit_minutes?: number,
  shuffle_questions: boolean,
  shuffle_options: boolean,
  metadata: { total_points, estimated_minutes, bloom_coverage }
}
```

#### Presentation Enrichment
```typescript
{
  type: 'presentation',
  theme: 'default' | 'dark' | 'academic',
  slides: [{
    index: number,
    title: string,
    content: string, // Markdown
    layout: 'title' | 'content' | 'two-column' | 'image',
    speaker_notes?: string,
    visual_suggestion?: string
  }],
  total_slides: number
}
```

#### Audio Enrichment
```typescript
{
  type: 'audio',
  voice_id: string,
  script: string,
  duration_seconds: number,
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav'
}
```

#### Video Enrichment
```typescript
{
  type: 'video',
  script: string,
  avatar_id?: string,
  slides_sync_points?: [{ timestamp_seconds, slide_index }],
  estimated_duration_seconds?: number
}
```

#### Document Enrichment
```typescript
{
  type: 'document',
  file_name: string,
  file_url: string,
  format?: 'pdf' | 'docx' | 'html'
}
```

---

## 3. Identified Problems

### 3.1 Critical Issues

| # | Issue | Impact | Root Cause |
|---|-------|--------|------------|
| 1 | **Lesson content not displaying** | Users see empty content area | `lesson.content` is JSONB but code treats it as string |
| 2 | **Enrichments not loaded** | No video/audio/quiz/presentation shown | `lesson_enrichments` table not queried |
| 3 | **Enrichments not rendered** | Even if loaded, no components exist | Missing enrichment display components |

### 3.2 Missing Features

| # | Feature | Current State | Required |
|---|---------|--------------|----------|
| 4 | Lesson type handling | All lessons rendered same | Different UI per lesson_type |
| 5 | Interactive quiz | Static display only | Interactive quiz with scoring |
| 6 | Presentation viewer | Not implemented | Reveal.js or similar slides |
| 7 | Audio player | Legacy video-only | Dedicated audio player with waveform |
| 8 | Video player | Basic only | Enhanced player with captions, speed |
| 9 | Document viewer | Not implemented | PDF/DOCX preview or download |
| 10 | lesson.content parsing | Assumes string | Parse JSONB structure |

### 3.3 Data Type Mismatches

```typescript
// Current (BROKEN):
const markdownContent = lesson.content_text || lesson.content || ''
// lesson.content is JSONB object, not string!

// Required:
const markdownContent = lesson.content_text ||
  (typeof lesson.content === 'object' ? lesson.content?.markdown : lesson.content) || ''
```

---

## 4. Technical Requirements

### 4.1 Data Loading (Page Level)

#### 4.1.1 Update `[slug]/page.tsx`

Add enrichments query:
```typescript
// After loading lessons
let enrichments: EnrichmentRow[] | null = null;

if (lessons && lessons.length > 0) {
  const lessonIds = lessons.map(l => l.id);
  const { data } = await supabase
    .from('lesson_enrichments')
    .select('*')
    .in('lesson_id', lessonIds)
    .eq('status', 'completed')
    .order('order_index');
  enrichments = data;
}

// Group enrichments by lesson_id
const enrichmentsByLessonId = groupEnrichmentsByLessonId(enrichments);
```

#### 4.1.2 Update Component Props

```typescript
interface CourseViewerProps {
  course: Course;
  sections: Section[];
  lessons: Lesson[];
  assets?: Record<string, Asset[]>;
  enrichments?: Record<string, LessonEnrichment[]>; // NEW
  readOnly?: boolean;
}
```

### 4.2 Content Parsing

Create content parser utility:

```typescript
// lib/lesson-content-parser.ts
export interface ParsedLessonContent {
  markdown: string;
  structured?: {
    sections?: Array<{ title: string; content: string }>;
    keyPoints?: string[];
    examples?: Array<{ title: string; code?: string; explanation: string }>;
  };
}

export function parseLessonContent(lesson: Lesson): ParsedLessonContent {
  // Priority 1: content_text (legacy plain markdown)
  if (lesson.content_text) {
    return { markdown: lesson.content_text };
  }

  // Priority 2: content JSONB
  if (lesson.content && typeof lesson.content === 'object') {
    const content = lesson.content as Record<string, unknown>;

    // Handle various JSONB structures
    if (typeof content.markdown === 'string') {
      return { markdown: content.markdown, structured: content as any };
    }
    if (typeof content.text === 'string') {
      return { markdown: content.text };
    }
    if (typeof content.content === 'string') {
      return { markdown: content.content };
    }

    // Fallback: stringify for debugging
    return { markdown: JSON.stringify(content, null, 2) };
  }

  // Priority 3: content as string
  if (typeof lesson.content === 'string') {
    return { markdown: lesson.content };
  }

  return { markdown: '' };
}
```

### 4.3 Enrichment Components

#### 4.3.1 Quiz Player Component

```typescript
// components/course/viewer/enrichments/QuizPlayer.tsx
interface QuizPlayerProps {
  enrichment: LessonEnrichment;
  onComplete?: (score: number, totalPoints: number) => void;
}

// Features:
// - Question navigation
// - Answer selection (MC, T/F, short answer)
// - Progress tracking
// - Score calculation
// - Explanation reveal
// - Time limit (if set)
```

#### 4.3.2 Presentation Viewer Component

```typescript
// components/course/viewer/enrichments/PresentationViewer.tsx
interface PresentationViewerProps {
  enrichment: LessonEnrichment;
  initialSlide?: number;
}

// Features:
// - Slide navigation (arrows, keyboard)
// - Fullscreen mode
// - Speaker notes toggle
// - Theme support
// - Slide overview
```

#### 4.3.3 Audio Player Component

```typescript
// components/course/viewer/enrichments/AudioPlayer.tsx
interface AudioPlayerProps {
  enrichment: LessonEnrichment;
  playbackUrl: string;
}

// Features:
// - Play/pause/seek
// - Speed control (0.5x - 2x)
// - Waveform visualization
// - Script display with sync
// - Download option
```

#### 4.3.4 Video Player Component

```typescript
// components/course/viewer/enrichments/VideoPlayer.tsx
interface VideoPlayerProps {
  enrichment: LessonEnrichment;
  playbackUrl: string;
}

// Features:
// - All audio player features
// - Picture-in-picture
// - Fullscreen
// - Quality selection
// - Captions (if available)
// - Slide sync (if available)
```

#### 4.3.5 Document Viewer Component

```typescript
// components/course/viewer/enrichments/DocumentViewer.tsx
interface DocumentViewerProps {
  enrichment: LessonEnrichment;
}

// Features:
// - PDF preview (pdf.js)
// - Download button
// - Page navigation
// - Zoom controls
```

### 4.4 Lesson Type UI

```typescript
// components/course/viewer/components/LessonTypeIndicator.tsx
const LESSON_TYPE_CONFIG = {
  video: { icon: Video, label: 'Video Lesson', color: 'red' },
  text: { icon: FileText, label: 'Text Lesson', color: 'blue' },
  quiz: { icon: HelpCircle, label: 'Quiz', color: 'green' },
  interactive: { icon: MousePointer, label: 'Interactive', color: 'purple' },
  assignment: { icon: ClipboardList, label: 'Assignment', color: 'orange' },
};
```

### 4.5 Updated LessonView Structure

```typescript
// LessonView.tsx - Updated structure
<Tabs defaultValue="content">
  <TabsList>
    <TabsTrigger value="content">Content</TabsTrigger>
    <TabsTrigger value="enrichments">Media & Materials</TabsTrigger>
    <TabsTrigger value="activities">Activities</TabsTrigger>
    <TabsTrigger value="structure">Course Structure</TabsTrigger>
  </TabsList>

  <TabsContent value="content">
    <LessonTypeIndicator type={lesson.lesson_type} />
    <LessonContent lesson={lesson} />
  </TabsContent>

  <TabsContent value="enrichments">
    <EnrichmentsPanel enrichments={enrichments} />
  </TabsContent>

  <TabsContent value="activities">
    <ActivitiesPanel lesson={lesson} />
  </TabsContent>

  <TabsContent value="structure">
    <StructurePanel sections={sections} />
  </TabsContent>
</Tabs>
```

### 4.6 Enrichments Panel Component

```typescript
// components/course/viewer/components/EnrichmentsPanel.tsx
interface EnrichmentsPanelProps {
  enrichments: LessonEnrichment[];
}

export function EnrichmentsPanel({ enrichments }: EnrichmentsPanelProps) {
  const [activeEnrichment, setActiveEnrichment] = useState<string | null>(null);

  // Group by type for organized display
  const groupedEnrichments = useMemo(() =>
    enrichments.reduce((acc, e) => {
      const type = e.enrichment_type;
      if (!acc[type]) acc[type] = [];
      acc[type].push(e);
      return acc;
    }, {} as Record<EnrichmentType, LessonEnrichment[]>),
    [enrichments]
  );

  return (
    <div>
      {/* Video section */}
      {groupedEnrichments.video?.map(e => (
        <VideoPlayer key={e.id} enrichment={e} />
      ))}

      {/* Audio section */}
      {groupedEnrichments.audio?.map(e => (
        <AudioPlayer key={e.id} enrichment={e} />
      ))}

      {/* Presentation section */}
      {groupedEnrichments.presentation?.map(e => (
        <PresentationViewer key={e.id} enrichment={e} />
      ))}

      {/* Quiz section */}
      {groupedEnrichments.quiz?.map(e => (
        <QuizPlayer key={e.id} enrichment={e} />
      ))}

      {/* Document section */}
      {groupedEnrichments.document?.map(e => (
        <DocumentViewer key={e.id} enrichment={e} />
      ))}
    </div>
  );
}
```

---

## 5. Implementation Tasks

### Phase 1: Fix Critical Content Display (Priority: CRITICAL)

| # | Task | Files | Estimate |
|---|------|-------|----------|
| 1.1 | Create `parseLessonContent` utility | `lib/lesson-content-parser.ts` | 1h |
| 1.2 | Update `LessonContent` to use parser | `components/common/lesson-content.tsx` | 2h |
| 1.3 | Add lesson_type to Lesson TypeScript type | `types/database.ts` | 0.5h |
| 1.4 | Test content rendering with various JSONB structures | Tests | 2h |

### Phase 2: Load Enrichments Data (Priority: HIGH)

| # | Task | Files | Estimate |
|---|------|-------|----------|
| 2.1 | Add enrichments query to course page | `app/[locale]/courses/[slug]/page.tsx` | 1h |
| 2.2 | Create `groupEnrichmentsByLessonId` utility | `lib/course-data-utils.ts` | 0.5h |
| 2.3 | Update `CourseViewerProps` interface | `viewer/types/index.ts` | 0.5h |
| 2.4 | Pass enrichments through component chain | Multiple files | 1h |

### Phase 3: Create Enrichment Components (Priority: HIGH)

| # | Task | Files | Estimate |
|---|------|-------|----------|
| 3.1 | Create `EnrichmentsPanel` container | `viewer/components/EnrichmentsPanel.tsx` | 2h |
| 3.2 | Create `AudioPlayer` component | `viewer/enrichments/AudioPlayer.tsx` | 4h |
| 3.3 | Create `VideoPlayer` component | `viewer/enrichments/VideoPlayer.tsx` | 4h |
| 3.4 | Create `PresentationViewer` component | `viewer/enrichments/PresentationViewer.tsx` | 6h |
| 3.5 | Create `QuizPlayer` component | `viewer/enrichments/QuizPlayer.tsx` | 8h |
| 3.6 | Create `DocumentViewer` component | `viewer/enrichments/DocumentViewer.tsx` | 3h |

### Phase 4: Lesson Type Support (Priority: MEDIUM)

| # | Task | Files | Estimate |
|---|------|-------|----------|
| 4.1 | Create `LessonTypeIndicator` component | `viewer/components/LessonTypeIndicator.tsx` | 1h |
| 4.2 | Update sidebar to show lesson types | `viewer/components/Sidebar.tsx` | 1h |
| 4.3 | Add type-specific styling to LessonView | `viewer/components/LessonView.tsx` | 2h |

### Phase 5: UI/UX Improvements (Priority: MEDIUM)

| # | Task | Files | Estimate |
|---|------|-------|----------|
| 5.1 | Update tab structure in LessonView | `viewer/components/LessonView.tsx` | 2h |
| 5.2 | Add enrichment count badges | Multiple files | 1h |
| 5.3 | Improve mobile responsiveness | CSS updates | 2h |
| 5.4 | Add loading states for enrichments | Multiple files | 1h |

### Phase 6: Testing & Polish (Priority: HIGH)

| # | Task | Files | Estimate |
|---|------|-------|----------|
| 6.1 | Write unit tests for content parser | Tests | 2h |
| 6.2 | Write integration tests for enrichment loading | Tests | 2h |
| 6.3 | E2E tests for quiz interaction | Tests | 3h |
| 6.4 | Accessibility audit and fixes | Multiple files | 2h |

---

## 6. Dependencies

### NPM Packages (Already in project)
- `framer-motion` - animations
- `lucide-react` - icons
- `@radix-ui/*` - UI primitives

### NPM Packages (May need to add)
- `react-pdf` or `pdfjs-dist` - PDF viewing
- `wavesurfer.js` - Audio waveform (optional)
- `reveal.js` or custom - Presentation viewer

---

## 7. Success Criteria

1. **Lesson content displays correctly** for all content JSONB structures
2. **All enrichment types render** with appropriate UI
3. **Quiz is interactive** with scoring and feedback
4. **Presentation navigable** with keyboard support
5. **Audio/Video players** have full playback controls
6. **Lesson types** visually distinguished
7. **No TypeScript errors** in strict mode
8. **Mobile responsive** on all screen sizes

---

## 8. File Structure

```
packages/web/components/course/viewer/
├── components/
│   ├── LessonView.tsx (UPDATE)
│   ├── Sidebar.tsx (UPDATE)
│   ├── LessonTypeIndicator.tsx (NEW)
│   ├── EnrichmentsPanel.tsx (NEW)
│   └── ...
├── enrichments/
│   ├── AudioPlayer.tsx (NEW)
│   ├── VideoPlayer.tsx (NEW)
│   ├── QuizPlayer.tsx (NEW)
│   ├── PresentationViewer.tsx (NEW)
│   ├── DocumentViewer.tsx (NEW)
│   └── index.ts (NEW)
├── hooks/
│   ├── useViewerState.ts (UPDATE)
│   ├── useEnrichments.ts (NEW)
│   └── useQuizState.ts (NEW)
└── types/
    └── index.ts (UPDATE)

packages/web/lib/
├── lesson-content-parser.ts (NEW)
└── course-data-utils.ts (UPDATE)
```

---

## 9. API Changes

### 9.1 New tRPC Endpoint (if needed)

```typescript
// For signed playback URLs
enrichment.getPlaybackUrl.query({ enrichmentId: string })
// Returns: { playbackUrl: string, expiresAt: string }
```

### 9.2 Existing Endpoints to Use

```typescript
// Already exists in enrichment router
enrichment.getByLesson.query({ lessonId: string })
```

---

## 10. Migration Notes

- **Breaking Change**: None for end users
- **Data Migration**: Not required (data exists, just not displayed)
- **Feature Flag**: Consider `NEXT_PUBLIC_ENABLE_ENRICHMENTS=true` for gradual rollout

---

## Appendix A: Current vs Required Component Comparison

| Component | Current | Required | Gap |
|-----------|---------|----------|-----|
| LessonContent | Uses `content_text \|\| content` | Parse JSONB `content` | Parser needed |
| ContentFormatSwitcher | Checks `availableFormats` prop | Load from enrichments | Data source change |
| Video Player | Basic HTML5/ReactPlayer | Full controls + sync | Enhancement |
| Audio Player | Reuses video player | Dedicated with waveform | New component |
| Quiz | Static checklist | Interactive with scoring | New component |
| Presentation | Not implemented | Slide viewer | New component |
| Document | Not implemented | PDF preview | New component |

---

## Appendix B: JSONB Content Examples

### Example: lesson.content structure
```json
{
  "markdown": "# Introduction\n\nThis lesson covers...",
  "sections": [
    { "title": "Overview", "content": "..." },
    { "title": "Details", "content": "..." }
  ],
  "keyPoints": ["Point 1", "Point 2"],
  "examples": [
    { "title": "Example 1", "code": "...", "explanation": "..." }
  ]
}
```

### Example: Legacy content_text
```text
# Introduction

This is plain markdown content...
```
