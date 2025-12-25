# Data Model: Lesson Enrichments (Stage 7)

**Date**: 2025-12-24
**Status**: Complete
**Plan Reference**: [plan.md](./plan.md)

---

## 1. Entity Relationship Diagram

```
┌─────────────────────┐
│       courses       │
│  (existing table)   │
└──────────┬──────────┘
           │ 1:N
           ▼
┌─────────────────────┐        ┌─────────────────────┐
│       lessons       │        │       assets        │
│  (existing table)   │        │  (existing table)   │
└──────────┬──────────┘        └──────────▲──────────┘
           │ 1:N                          │ 1:1 (optional)
           ▼                              │
┌─────────────────────────────────────────┴──────────┐
│               lesson_enrichments                    │
│  (NEW TABLE)                                        │
├─────────────────────────────────────────────────────┤
│  id: UUID (PK)                                      │
│  lesson_id: UUID (FK → lessons.id)                 │
│  course_id: UUID (FK → courses.id)                 │
│  enrichment_type: enrichment_type (ENUM)           │
│  order_index: INTEGER                               │
│  title: TEXT                                        │
│  content: JSONB (type-specific)                     │
│  asset_id: UUID (FK → assets.id, nullable)         │
│  status: enrichment_status (ENUM)                  │
│  generation_attempt: INTEGER                        │
│  error_message: TEXT                                │
│  error_details: JSONB                               │
│  metadata: JSONB                                    │
│  created_at: TIMESTAMPTZ                            │
│  updated_at: TIMESTAMPTZ                            │
│  generated_at: TIMESTAMPTZ                          │
└─────────────────────────────────────────────────────┘
```

---

## 2. Database Schema (SQL)

### 2.1 Enums

```sql
-- Enrichment types (extensible via future ALTER TYPE ADD VALUE)
CREATE TYPE enrichment_type AS ENUM (
    'video',
    'audio',
    'presentation',
    'quiz',
    'document'
);

-- Enrichment generation status (supports two-stage flow)
CREATE TYPE enrichment_status AS ENUM (
    'pending',           -- Queued for generation
    'draft_generating',  -- Phase 1: Generating draft/script
    'draft_ready',       -- Phase 1 complete: Awaiting user review
    'generating',        -- Phase 2: Generating final content (or single-stage)
    'completed',         -- Successfully generated
    'failed',            -- Generation failed
    'cancelled'          -- User cancelled
);
```

### 2.2 Main Table

```sql
CREATE TABLE lesson_enrichments (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

    -- Type and ordering
    enrichment_type enrichment_type NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 1,

    -- Content
    title TEXT,
    content JSONB DEFAULT '{}',

    -- Asset reference (for video/audio/presentation files)
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,

    -- Generation tracking
    status enrichment_status NOT NULL DEFAULT 'pending',
    generation_attempt INTEGER DEFAULT 0,
    error_message TEXT,
    error_details JSONB,

    -- Metadata (duration, tokens, cost, quality)
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    generated_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT enrichments_order_positive CHECK (order_index > 0),
    CONSTRAINT enrichments_unique_order UNIQUE (lesson_id, enrichment_type, order_index)
);

-- Comments
COMMENT ON TABLE lesson_enrichments IS 'Stage 7: AI-generated lesson supplements (video, audio, quiz, etc.)';
COMMENT ON COLUMN lesson_enrichments.content IS 'Type-specific JSONB: quiz questions, presentation slides, document metadata';
COMMENT ON COLUMN lesson_enrichments.metadata IS 'Generation metrics: duration_seconds, tokens_used, cost_usd, quality_score';
```

### 2.3 Indexes

```sql
-- Query optimization indexes
CREATE INDEX idx_enrichments_lesson_id ON lesson_enrichments(lesson_id);
CREATE INDEX idx_enrichments_course_id ON lesson_enrichments(course_id);
CREATE INDEX idx_enrichments_status ON lesson_enrichments(status);
CREATE INDEX idx_enrichments_type ON lesson_enrichments(enrichment_type);

-- Composite index for common query patterns
CREATE INDEX idx_enrichments_lesson_type_order
ON lesson_enrichments(lesson_id, enrichment_type, order_index);
```

### 2.4 RLS Policies

```sql
-- Enable RLS
ALTER TABLE lesson_enrichments ENABLE ROW LEVEL SECURITY;

-- Admin access (organization-scoped)
CREATE POLICY "admin_enrichments_all" ON lesson_enrichments
    FOR ALL TO authenticated
    USING (
        course_id IN (
            SELECT c.id FROM courses c
            WHERE c.organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid() AND role = 'admin'
            )
        )
    );

-- Instructor access (own courses only)
CREATE POLICY "instructor_enrichments_own" ON lesson_enrichments
    FOR ALL TO authenticated
    USING (
        course_id IN (
            SELECT id FROM courses WHERE user_id = auth.uid()
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
    );
```

### 2.5 Triggers

```sql
-- Auto-update updated_at timestamp
CREATE TRIGGER update_lesson_enrichments_updated_at
    BEFORE UPDATE ON lesson_enrichments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 2.6 Realtime Configuration

```sql
-- Enable REPLICA IDENTITY for Supabase Realtime
-- Required for real-time subscriptions with old/new record values
ALTER TABLE lesson_enrichments REPLICA IDENTITY FULL;
```

---

## 3. Content JSONB Structures

### 3.1 Video Enrichment Content

```typescript
interface VideoEnrichmentContent {
  type: 'video';
  script: {
    intro: {
      text: string;
      duration_seconds: number;
    };
    sections: Array<{
      title: string;
      narration: string;
      key_points: string[];
      visual_suggestions: string;
      duration_seconds: number;
    }>;
    conclusion: {
      text: string;
      duration_seconds: number;
    };
  };
  metadata: {
    total_duration_seconds: number;
    tone: 'professional' | 'conversational' | 'energetic';
    pacing: 'slow' | 'moderate' | 'fast';
  };
  // Asset reference in parent table (asset_id)
}
```

### 3.2 Audio Enrichment Content

```typescript
interface AudioEnrichmentContent {
  type: 'audio';
  transcript: string;           // Optimized text for TTS
  voice_id: string;             // OpenAI voice: alloy, echo, fable, onyx, nova, shimmer
  ssml_hints?: Array<{
    position: number;
    type: 'pause' | 'emphasis';
    value: string;
  }>;
  estimated_duration_seconds: number;
  word_count: number;
  format: 'mp3' | 'wav';
}
```

### 3.3 Presentation Enrichment Content

```typescript
interface PresentationEnrichmentContent {
  type: 'presentation';
  theme: 'default' | 'dark' | 'academic' | 'modern' | 'minimal';
  title_slide: {
    title: string;
    subtitle?: string;
    layout: 'title';
  };
  content_slides: Array<{
    index: number;
    title: string;
    layout: 'bullets' | 'two-column' | 'image-left' | 'quote' | 'diagram';
    content: {
      main: string[];           // Bullet points
      secondary?: string;       // Secondary content area
      notes: string;            // Speaker notes
    };
    visual_suggestion?: string;
  }>;
  summary_slide: {
    title: string;
    points: string[];
    layout: 'bullets';
  };
  metadata: {
    total_slides: number;
    estimated_presentation_minutes: number;
  };
}
```

### 3.4 Quiz Enrichment Content

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
    options?: Array<{
      id: string;
      text: string;
    }>;
    correct_answer: string | boolean | number;
    explanation: string;
    points: number;
  }>;
  passing_score: number;            // Percentage 0-100
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

### 3.5 Document Enrichment Content (Placeholder)

```typescript
interface DocumentEnrichmentContent {
  type: 'document';
  description: string;
  placeholder: true;    // Indicates coming soon feature
  // Future fields:
  // file_url?: string;
  // file_size_bytes?: number;
  // mime_type?: string;
}
```

### 3.6 Union Type

```typescript
type EnrichmentContent =
  | VideoEnrichmentContent
  | AudioEnrichmentContent
  | PresentationEnrichmentContent
  | QuizEnrichmentContent
  | DocumentEnrichmentContent;
```

---

## 4. Metadata Structure

```typescript
interface EnrichmentMetadata {
  // Generation metrics
  duration_seconds?: number;      // For audio/video
  tokens_used?: number;           // LLM tokens consumed
  cost_usd?: number;              // Estimated cost
  quality_score?: number;         // 0-1 quality rating

  // Model information
  model_used?: string;            // e.g., 'tts-1-hd', 'claude-sonnet-4-20250514'
  generation_duration_ms?: number; // Processing time

  // Type-specific
  word_count?: number;            // For audio/video scripts
  slide_count?: number;           // For presentations
  question_count?: number;        // For quizzes

  // Retry information
  previous_attempts?: Array<{
    timestamp: string;
    error: string;
    model: string;
  }>;
}
```

---

## 5. TypeScript Interfaces

### 5.1 Core Entity

```typescript
// packages/shared-types/src/lesson-enrichment.ts

import { z } from 'zod';

export const enrichmentTypeSchema = z.enum([
  'video',
  'audio',
  'presentation',
  'quiz',
  'document'
]);

export type EnrichmentType = z.infer<typeof enrichmentTypeSchema>;

export const enrichmentStatusSchema = z.enum([
  'pending',
  'draft_generating',  // Two-stage: Phase 1 in progress
  'draft_ready',       // Two-stage: Awaiting user review
  'generating',        // Final generation (or single-stage)
  'completed',
  'failed',
  'cancelled'
]);

export type EnrichmentStatus = z.infer<typeof enrichmentStatusSchema>;

/** Helper to check if status is in draft phase (two-stage flow) */
export const isDraftPhase = (status: EnrichmentStatus): boolean =>
  status === 'draft_generating' || status === 'draft_ready';

/** Helper to check if enrichment is actionable by user */
export const isAwaitingAction = (status: EnrichmentStatus): boolean =>
  status === 'draft_ready' || status === 'failed';

export interface LessonEnrichment {
  id: string;
  lesson_id: string;
  course_id: string;
  enrichment_type: EnrichmentType;
  order_index: number;
  title: string | null;
  content: EnrichmentContent;
  asset_id: string | null;
  status: EnrichmentStatus;
  generation_attempt: number;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  metadata: EnrichmentMetadata;
  created_at: string;
  updated_at: string;
  generated_at: string | null;
}
```

### 5.2 Summary Type (for React Flow)

```typescript
/** Lightweight summary for Asset Dock in LessonNode */
export interface EnrichmentSummary {
  type: EnrichmentType;
  status: EnrichmentStatus;
  hasError: boolean;
  title?: string;
}

/** Extended lesson data with enrichments */
export interface LessonWithEnrichments {
  id: string;
  title: string;
  enrichments: LessonEnrichment[];
  enrichmentsSummary: EnrichmentSummary[];
}
```

### 5.3 BullMQ Job Data

```typescript
// packages/shared-types/src/bullmq-jobs.ts (addition)

export const EnrichmentJobDataSchema = BaseJobDataSchema.extend({
  enrichmentId: z.string().uuid(),
  lessonId: z.string().uuid(),
  courseId: z.string().uuid(),
  enrichmentType: enrichmentTypeSchema,

  // Lesson context for generation
  lessonTitle: z.string(),
  lessonContent: z.string(),
  lessonObjectives: z.array(z.string()).optional(),
  language: z.enum(['ru', 'en']),

  // Type-specific settings
  settings: z.object({
    voice_id: z.string().optional(),        // For audio
    avatar_id: z.string().optional(),       // For video (future)
    theme: z.string().optional(),           // For presentation
    question_count: z.number().optional(),  // For quiz
    difficulty_distribution: z.object({
      easy: z.number(),
      medium: z.number(),
      hard: z.number(),
    }).optional(),
  }).optional(),
});

export type EnrichmentJobData = z.infer<typeof EnrichmentJobDataSchema>;
```

---

## 6. Validation Rules

### 6.1 From Spec Requirements

| Field | Rule | Enforcement |
|-------|------|-------------|
| order_index | Must be > 0 | DB constraint |
| order_index | Unique per (lesson, type) | DB constraint |
| content | Valid JSON | DB type |
| enrichment_type | Must be valid enum | DB enum |
| status | Must be valid enum | DB enum |
| lesson_id | Must exist | FK constraint |
| course_id | Must exist | FK constraint |

### 6.2 State Transitions

#### Single-Stage Flow (Audio, Quiz)

```
pending ──┬──► generating ──┬──► completed
          │                 │
          │                 └──► failed ──► pending (regenerate)
          │
          └──► cancelled
```

#### Two-Stage Flow (Video, Presentation)

```
pending ──► draft_generating ──┬──► draft_ready ──┬──► generating ──┬──► completed
                               │                  │                 │
                               │                  │                 └──► failed
                               │                  │
                               │                  └──► pending (regenerate draft)
                               │
                               └──► failed ──► pending (retry)
```

**Two-Stage Flow Explained:**
1. **Phase 1 (Draft)**: `pending` → `draft_generating` → `draft_ready`
   - AI generates script/structure (cheap LLM call)
   - User reviews and optionally edits the draft
2. **Phase 2 (Final)**: `draft_ready` → `generating` → `completed`
   - User approves draft, triggers expensive generation (TTS, video API)
   - Final content is produced and stored

Valid transitions:
- `pending` → `generating` (single-stage start)
- `pending` → `draft_generating` (two-stage start)
- `draft_generating` → `draft_ready` (draft complete)
- `draft_generating` → `failed` (draft generation error)
- `draft_ready` → `generating` (user approved draft)
- `draft_ready` → `pending` (user wants new draft)
- `generating` → `completed` (success)
- `generating` → `failed` (error)
- `failed` → `pending` (regenerate action)
- `pending` → `cancelled` (user cancel)
- `draft_generating` → `cancelled` (user cancel)
- `generating` → `cancelled` (user cancel)

---

## 7. Query Patterns

### 7.1 Get Enrichments for Lesson

```sql
SELECT * FROM lesson_enrichments
WHERE lesson_id = $1
ORDER BY enrichment_type, order_index;
```

### 7.2 Get Summary for Course (React Flow nodes)

```sql
SELECT
  lesson_id,
  enrichment_type,
  status,
  CASE WHEN status = 'failed' THEN TRUE ELSE FALSE END as has_error
FROM lesson_enrichments
WHERE course_id = $1
ORDER BY lesson_id, enrichment_type;
```

### 7.3 Get Pending Jobs (for queue processing)

```sql
SELECT e.*, l.title as lesson_title, lc.content as lesson_content
FROM lesson_enrichments e
JOIN lessons l ON e.lesson_id = l.id
JOIN lesson_contents lc ON l.id = lc.lesson_id
WHERE e.status = 'pending'
ORDER BY e.created_at
LIMIT 100;
```

### 7.4 Reorder Enrichments

```sql
WITH updated AS (
  SELECT id, row_number() OVER () as new_order
  FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, ord)
  ORDER BY ord
)
UPDATE lesson_enrichments e
SET order_index = u.new_order
FROM updated u
WHERE e.id = u.id;
```

---

## 8. Migration File Reference

Complete migration file path:
```
packages/course-gen-platform/supabase/migrations/20241224_stage7_enrichments.sql
```

Migration includes:
1. Enum creation
2. Table creation with all columns
3. Indexes
4. RLS policies
5. Triggers
6. Realtime configuration

---

## 9. Type Registry Pattern (Extensibility)

The enrichment system is designed as a **Type Constructor** — a pluggable architecture where new enrichment types can be added with minimal code changes.

### 9.1 Type Definition Interface

```typescript
// packages/shared-types/src/enrichment-type-registry.ts

import { z } from 'zod';

/**
 * Each enrichment type must implement this interface.
 * This is the "contract" for adding new types.
 */
export interface EnrichmentTypeDefinition<
  TContent extends Record<string, unknown> = Record<string, unknown>,
  TSettings extends Record<string, unknown> = Record<string, unknown>
> {
  // Identity
  type: string;                          // Unique type key (e.g., 'video', 'flashcards')
  version: number;                       // Schema version for migrations

  // Display
  icon: string;                          // Lucide icon name (e.g., 'Video', 'FileQuestion')
  label: { en: string; ru: string };     // Localized display name
  description: { en: string; ru: string }; // Localized description

  // Behavior
  generationFlow: 'single-stage' | 'two-stage';
  estimatedDuration: (lessonWordCount: number) => number; // seconds
  estimatedCost: (lessonWordCount: number) => number;     // USD

  // Schemas
  contentSchema: z.ZodType<TContent>;    // Zod schema for content JSONB
  settingsSchema: z.ZodType<TSettings>;  // Zod schema for generation settings

  // UI Components (lazy-loaded)
  components: {
    CreateForm: () => Promise<React.ComponentType<CreateFormProps<TSettings>>>;
    DetailView: () => Promise<React.ComponentType<DetailViewProps<TContent>>>;
    DraftEditor?: () => Promise<React.ComponentType<DraftEditorProps<TContent>>>; // For two-stage
  };

  // Feature flags
  features: {
    canEdit: boolean;           // Can user edit after generation?
    canRegenerate: boolean;     // Can regenerate from scratch?
    canExport: boolean;         // Has export/download capability?
    requiresAsset: boolean;     // Needs file storage (audio/video)?
    supportsPreview: boolean;   // Has in-app preview?
  };
}
```

### 9.2 Type Registry

```typescript
// packages/shared-types/src/enrichment-type-registry.ts

class EnrichmentTypeRegistry {
  private types = new Map<string, EnrichmentTypeDefinition>();

  register<T extends EnrichmentTypeDefinition>(definition: T): void {
    if (this.types.has(definition.type)) {
      throw new Error(`Enrichment type "${definition.type}" already registered`);
    }
    this.types.set(definition.type, definition);
  }

  get(type: string): EnrichmentTypeDefinition | undefined {
    return this.types.get(type);
  }

  getAll(): EnrichmentTypeDefinition[] {
    return Array.from(this.types.values());
  }

  getEnabled(): EnrichmentTypeDefinition[] {
    // Filter by feature flags, user permissions, etc.
    return this.getAll().filter(t => !t.type.startsWith('_'));
  }
}

export const enrichmentRegistry = new EnrichmentTypeRegistry();
```

### 9.3 Example: Registering Video Type

```typescript
// packages/web/lib/enrichments/types/video.ts

import { enrichmentRegistry } from '@megacampus/shared-types';
import { videoContentSchema, videoSettingsSchema } from './video-schemas';

enrichmentRegistry.register({
  type: 'video',
  version: 1,

  icon: 'Video',
  label: { en: 'Video', ru: 'Видео' },
  description: {
    en: 'AI-generated video presentation of lesson content',
    ru: 'Видеопрезентация контента урока, сгенерированная ИИ'
  },

  generationFlow: 'two-stage',
  estimatedDuration: (words) => Math.ceil(words / 150) * 60, // ~150 words/min
  estimatedCost: (words) => (words / 1000) * 0.50,           // $0.50/1K words

  contentSchema: videoContentSchema,
  settingsSchema: videoSettingsSchema,

  components: {
    CreateForm: () => import('./VideoCreateForm').then(m => m.VideoCreateForm),
    DetailView: () => import('./VideoDetailView').then(m => m.VideoDetailView),
    DraftEditor: () => import('./VideoDraftEditor').then(m => m.VideoDraftEditor),
  },

  features: {
    canEdit: false,        // Can't edit generated video
    canRegenerate: true,
    canExport: true,       // Download MP4
    requiresAsset: true,   // Stores in Supabase Storage
    supportsPreview: true,
  },
});
```

### 9.4 Adding a New Type (Checklist)

To add a new enrichment type (e.g., `flashcards`):

1. **Database**: Add to enum (migration):
   ```sql
   ALTER TYPE enrichment_type ADD VALUE 'flashcards';
   ```

2. **Shared Types**: Define content/settings schemas in `packages/shared-types/src/enrichments/flashcards.ts`

3. **Register Type**: Create `packages/web/lib/enrichments/types/flashcards.ts` with `enrichmentRegistry.register(...)`

4. **UI Components**: Create in `packages/web/components/enrichments/flashcards/`:
   - `FlashcardsCreateForm.tsx`
   - `FlashcardsDetailView.tsx`
   - `FlashcardsDraftEditor.tsx` (if two-stage)

5. **Worker Handler**: Add `packages/course-gen-platform/src/workers/enrichments/flashcards-handler.ts`

6. **Tests**: Add test cases for new type

**No changes needed to**:
- Inspector Panel logic (uses registry)
- Asset Dock (uses registry icons)
- BullMQ router (dispatches by type)
- Database schema (JSONB is flexible)

### 9.5 Type Configuration Matrix

| Type | Flow | Asset | Preview | Edit | Export |
|------|------|-------|---------|------|--------|
| `video` | two-stage | ✅ MP4 | ✅ | ❌ | ✅ |
| `audio` | single | ✅ MP3 | ✅ | ❌ | ✅ |
| `presentation` | two-stage | ❌ | ✅ | ✅ | ✅ HTML |
| `quiz` | single | ❌ | ✅ | ✅ | ✅ QTI |
| `document` | — | ✅ | ✅ | ❌ | ✅ |
| `flashcards` | single | ❌ | ✅ | ✅ | ✅ Anki |
| `summary` | single | ❌ | ✅ | ✅ | ✅ MD |
| `mindmap` | single | ❌ | ✅ | ❌ | ✅ SVG |

*Types below the line are future examples showing extensibility.*

---

*Data model complete. Ready for Phase 1 implementation.*
