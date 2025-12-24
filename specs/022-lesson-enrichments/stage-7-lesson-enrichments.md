# Stage 7: Lesson Enrichments

> Technical Specification for AI-Generated Lesson Supplements

**Version:** 1.0
**Created:** 2025-12-24
**Status:** Draft
**Author:** Claude Code (based on Deep Research + DeepThink analysis)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Terminology](#2-terminology)
3. [Architecture](#3-architecture)
4. [UI/UX Specification](#4-uiux-specification)
5. [Stage 7 Pipeline](#5-stage-7-pipeline)
6. [Agent System Prompts](#6-agent-system-prompts)
7. [Integration Points](#7-integration-points)
8. [Accessibility](#8-accessibility)
9. [Error Handling & Loading States](#9-error-handling--loading-states)
10. [Storage Architecture](#10-storage-architecture)
11. [i18n Requirements](#11-i18n-requirements)
12. [Theme Support](#12-theme-support)
13. [Implementation Plan](#13-implementation-plan)
14. [Acceptance Criteria](#14-acceptance-criteria)

---

## 1. Overview

### 1.1 Purpose

Stage 7 extends the course generation pipeline by enabling AI-generated supplementary content for individual lessons. After Stage 6 generates lesson text content, Stage 7 allows users to enrich lessons with:

- **Video Presentations** (AI-generated webinar-style content)
- **Audio Narrations** (TTS from lesson text)
- **Slide Presentations** (auto-generated from lesson content)
- **Quizzes/Tests** (comprehension checks)
- **Documents** (supplementary materials - future upload capability)

### 1.2 Key Design Decisions

Based on Deep Research and DeepThink analysis:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visualization | **Badge Indicators on Nodes** | Avoids "Graph Explosion" (50 lessons × 3 attachments = 150+ nodes) |
| Add UX | **Plus Button + Floating Menu** | Highest discoverability for non-technical users |
| Management | **Inspector Side Panel** | Scalable for unlimited enrichments per lesson |
| Separate Nodes? | **NO** | Fixed node geometry keeps ELK layout stable |
| New Stage? | **YES - Stage 7** | Clean separation from lesson content generation |

### 1.3 Core Insight

> **"Taxonomy vs Topology"** - The graph visualizes curriculum FLOW (topology), while enrichments are INVENTORY within each lesson node. LessonNode acts as a "Smart Card" / "Dashboard" for its content.

---

## 2. Terminology

| Term | Definition |
|------|------------|
| **Enrichment** | Any AI-generated supplement attached to a lesson (video, audio, quiz, etc.) |
| **Enrichment Type** | Category of enrichment: `video`, `audio`, `presentation`, `quiz`, `document` |
| **Asset Dock** | Visual area at bottom of LessonNode showing enrichment status icons |
| **Inspector Panel** | Right-side drawer for detailed enrichment management |
| **Enrichment Job** | BullMQ job for generating a specific enrichment |
| **Generation Context** | Lesson content used as prompt context for AI generation |

---

## 3. Architecture

### 3.1 Database Schema

```sql
-- Migration: 20241224_stage7_enrichments.sql

-- Enrichment types enum
CREATE TYPE enrichment_type AS ENUM (
    'video',
    'audio',
    'presentation',
    'quiz',
    'document'
);

-- Enrichment generation status
CREATE TYPE enrichment_status AS ENUM (
    'pending',      -- Queued for generation
    'generating',   -- AI processing in progress
    'completed',    -- Successfully generated
    'failed',       -- Generation failed
    'cancelled'     -- User cancelled
);

-- Main enrichments table
CREATE TABLE lesson_enrichments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

    -- Type and order
    enrichment_type enrichment_type NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 1,

    -- Content (type-specific)
    title TEXT,
    content JSONB DEFAULT '{}',  -- Type-specific content structure

    -- File reference (for video/audio/presentation)
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,

    -- Generation tracking
    status enrichment_status NOT NULL DEFAULT 'pending',
    generation_attempt INTEGER DEFAULT 0,
    error_message TEXT,
    error_details JSONB,

    -- Metadata
    metadata JSONB DEFAULT '{}',  -- Duration, quality score, tokens used, cost

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    generated_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT enrichments_order_positive CHECK (order_index > 0),
    CONSTRAINT enrichments_unique_order UNIQUE (lesson_id, enrichment_type, order_index)
);

-- Indexes for common queries
CREATE INDEX idx_enrichments_lesson_id ON lesson_enrichments(lesson_id);
CREATE INDEX idx_enrichments_course_id ON lesson_enrichments(course_id);
CREATE INDEX idx_enrichments_status ON lesson_enrichments(status);
CREATE INDEX idx_enrichments_type ON lesson_enrichments(enrichment_type);

-- Enable RLS
ALTER TABLE lesson_enrichments ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as lessons table)
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

CREATE POLICY "instructor_enrichments_own" ON lesson_enrichments
    FOR ALL TO authenticated
    USING (
        course_id IN (
            SELECT id FROM courses WHERE user_id = auth.uid()
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
    );

-- Updated_at trigger
CREATE TRIGGER update_lesson_enrichments_updated_at
    BEFORE UPDATE ON lesson_enrichments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE lesson_enrichments IS 'Stage 7: AI-generated lesson supplements (video, audio, quiz, etc.)';
COMMENT ON COLUMN lesson_enrichments.content IS 'Type-specific JSONB: quiz questions, presentation slides, document metadata';
COMMENT ON COLUMN lesson_enrichments.metadata IS 'Generation metrics: duration_seconds, tokens_used, cost_usd, quality_score';

-- IMPORTANT: Enable REPLICA IDENTITY FULL for Supabase Realtime
-- Required for real-time subscriptions to include all columns in old/new records
ALTER TABLE lesson_enrichments REPLICA IDENTITY FULL;
```

### 3.2 Content JSONB Structures

```typescript
// packages/shared-types/src/enrichment-content.ts

/** Video enrichment content */
interface VideoEnrichmentContent {
  type: 'video';
  script: string;           // AI-generated narration script
  slides?: SlideData[];     // Optional slide sync points
  duration_seconds: number;
  resolution: '720p' | '1080p';
  voice_id?: string;        // TTS voice identifier
  avatar_id?: string;       // AI presenter identifier
  // Asset reference stored in asset_id column
}

/** Audio enrichment content */
interface AudioEnrichmentContent {
  type: 'audio';
  transcript: string;       // Text that was converted to speech
  voice_id: string;
  duration_seconds: number;
  format: 'mp3' | 'wav';
}

/** Presentation enrichment content */
interface PresentationEnrichmentContent {
  type: 'presentation';
  slides: Array<{
    index: number;
    title: string;
    content: string;        // Markdown
    speaker_notes?: string;
    layout: 'title' | 'content' | 'two-column' | 'image';
    image_url?: string;
  }>;
  theme: string;
  total_slides: number;
}

/** Quiz enrichment content */
interface QuizEnrichmentContent {
  type: 'quiz';
  questions: Array<{
    id: string;
    question: string;
    type: 'multiple_choice' | 'true_false' | 'short_answer';
    options?: string[];     // For multiple choice
    correct_answer: string | number;
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
    bloom_level: 'remember' | 'understand' | 'apply' | 'analyze';
  }>;
  passing_score: number;    // Percentage 0-100
  time_limit_minutes?: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
}

/** Document enrichment (placeholder for future upload) */
interface DocumentEnrichmentContent {
  type: 'document';
  description: string;
  // Future: file_url, file_size, mime_type
}

type EnrichmentContent =
  | VideoEnrichmentContent
  | AudioEnrichmentContent
  | PresentationEnrichmentContent
  | QuizEnrichmentContent
  | DocumentEnrichmentContent;
```

### 3.3 TypeScript Types

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
  'generating',
  'completed',
  'failed',
  'cancelled'
]);

export type EnrichmentStatus = z.infer<typeof enrichmentStatusSchema>;

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

export interface EnrichmentMetadata {
  duration_seconds?: number;
  tokens_used?: number;
  cost_usd?: number;
  quality_score?: number;   // 0-1
  model_used?: string;
  generation_duration_ms?: number;
}

/** Lightweight summary for React Flow node data */
export interface EnrichmentSummary {
  type: EnrichmentType;
  status: EnrichmentStatus;
  hasError: boolean;
}

/** Extended lesson type with enrichments */
export interface LessonWithEnrichments {
  id: string;
  title: string;
  // ... other lesson fields
  enrichments: LessonEnrichment[];
  enrichmentsSummary: EnrichmentSummary[];  // For Asset Dock
}
```

### 3.4 React Flow State

```typescript
// packages/web/components/generation-graph/types.ts (additions)

/** Extended LessonNode data with enrichments */
export interface LessonNodeData {
  // Existing fields...
  lessonId: string;
  title: string;
  status: NodeStatus;

  // NEW: Enrichment summary for Asset Dock
  enrichmentsSummary: EnrichmentSummary[];

  // NEW: Aggregated status
  hasEnrichmentErrors: boolean;
  enrichmentsGenerating: number;
  enrichmentsCompleted: number;
  enrichmentsTotal: number;
}
```

---

## 4. UI/UX Specification

### 4.1 Three-Layer System

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1: Badge Indicators (Always Visible on LessonNode)          │
│  ─────────────────────────────────────────────────────────────────  │
│  - Compact icons in "Asset Dock" (bottom 24px of node)             │
│  - Status colors: gray=pending, blue=generating, green=done, red=error │
│  - Semantic zoom: dot → icons → labels                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ click "+"
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2: Plus Button + NodeToolbar (On Selection)                  │
│  ─────────────────────────────────────────────────────────────────  │
│  - React Flow <NodeToolbar> appears ABOVE selected node            │
│  - Buttons: [+Video] [+Audio] [+Slides] [+Quiz] [+Doc*]            │
│  - *Doc button disabled with "Coming Soon" tooltip                 │
│  - Optimistic UI: ghost icon appears immediately                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ click badge/icon
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 3: Inspector Panel (Right Sidebar)                          │
│  ─────────────────────────────────────────────────────────────────  │
│  - Lesson title + metadata header                                  │
│  - Scrollable enrichment list with drag-reorder                    │
│  - Per-enrichment: icon, title, status, [Edit] [Regenerate] [Delete] │
│  - [+ Add Enrichment] button at bottom                             │
│  - Mobile: converts to bottom sheet                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 LessonNode Redesign

**Current:** 50px height
**New:** 64px height (14px increase for Asset Dock)

```
┌─────────────────────────────────────────────────────────────────┐
│  Top Zone (40px)                                                │
│  ┌────┬───────────────────────────────────────┬─────┐          │
│  │ 01 │  Introduction to Variables            │ [▶] │          │
│  │    │  12s • 1.2k tok                       │     │          │
│  └────┴───────────────────────────────────────┴─────┘          │
├─────────────────────────────────────────────────────────────────┤
│  Asset Dock (24px) - "The Enrichment Bar"                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  📹  🎙️  📊  ❓     │  Visible at zoom ≥ 0.5               ││
│  │  ●   ●   ○   +N    │  ● = has enrichment, ○ = empty slot   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

Legend:
📹 = Video    🎙️ = Audio    📊 = Presentation    ❓ = Quiz    📎 = Document

Icon States:
- Gray outline: No enrichment of this type
- Solid color: Enrichment exists
- Pulsing border: Currently generating
- Red dot overlay: Failed/error
```

### 4.3 Semantic Zoom Behaviors

| Zoom Level | Range | Asset Dock Display |
|------------|-------|-------------------|
| Minimal | < 0.3 | Single status dot (aggregate) |
| Medium | 0.3 - 0.5 | Count badge: "📎 3" |
| Detail | ≥ 0.5 | Individual type icons |

**Aggregate Status Dot Logic:**
- 🔴 Red: Any enrichment has error
- 🔵 Blue (pulsing): Any enrichment generating
- 🟢 Green: All enrichments completed
- ⚪ Gray: No enrichments

### 4.4 NodeToolbar (Add Enrichment)

```tsx
// Appears on node selection
<NodeToolbar isVisible={selected} position={Position.Top}>
  <div className="flex gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg">
    <ToolbarButton
      icon={<Video />}
      label={t('enrichments.addVideo')}
      onClick={() => addEnrichment('video')}
    />
    <ToolbarButton
      icon={<Mic />}
      label={t('enrichments.addAudio')}
      onClick={() => addEnrichment('audio')}
    />
    <ToolbarButton
      icon={<Presentation />}
      label={t('enrichments.addSlides')}
      onClick={() => addEnrichment('presentation')}
    />
    <ToolbarButton
      icon={<HelpCircle />}
      label={t('enrichments.addQuiz')}
      onClick={() => addEnrichment('quiz')}
    />
    <ToolbarButton
      icon={<FileText />}
      label={t('enrichments.addDocument')}
      disabled
      tooltip={t('enrichments.comingSoon')}
    />
  </div>
</NodeToolbar>
```

### 4.5 Inspector Panel

```
┌─────────────────────────────────────┐
│  📖 Introduction to Variables       │  ← Lesson title
│  Module 1 • 15 min                  │
├─────────────────────────────────────┤
│  ENRICHMENTS (3)                    │
│  ─────────────────────────────────  │
│                                     │
│  ⠿ 📹 Welcome Video         ✓      │  ← Completed
│      Duration: 2:34                 │
│      [Preview] [Regenerate] [🗑]    │
│                                     │
│  ⠿ 🎙️ Audio Narration      ●      │  ← Generating
│      Progress: 45%                  │
│      [Cancel]                       │
│                                     │
│  ⠿ ❓ Comprehension Quiz    ✗      │  ← Failed
│      Error: Rate limit exceeded     │
│      [Retry] [🗑]                   │
│                                     │
├─────────────────────────────────────┤
│  [+ Add Enrichment]                 │
└─────────────────────────────────────┘

Legend:
⠿ = drag handle for reordering
✓ = completed (green)
● = in progress (blue, animated)
✗ = failed (red)
```

### 4.6 Batch Operations

**Module-Level Actions:**
1. Select ModuleGroup header
2. Click "Batch Actions" in toolbar
3. Choose enrichment type: "Generate Audio for all 12 lessons"
4. All child lessons show pulsing audio icons

**Multi-Select Mode:**
1. Enter selection mode (checkbox icon in toolbar)
2. Check desired lessons (or "Select All in Module")
3. Click batch action button
4. Choose enrichment type to generate for all selected

---

## 5. Stage 7 Pipeline

### 5.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 7: Lesson Enrichments Pipeline                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User Action (UI)                                                   │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────┐                                               │
│  │ tRPC Mutation   │  createEnrichment / createBatchEnrichments    │
│  └────────┬────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────┐                                               │
│  │ Insert to DB    │  lesson_enrichments (status: pending)         │
│  └────────┬────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────┐                                               │
│  │ Job Outbox      │  Transactional job queuing                    │
│  └────────┬────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────┐                                               │
│  │ BullMQ Queue    │  enrichment-generation queue                  │
│  │ (30 concurrent) │                                               │
│  └────────┬────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────────┐                   │
│  │           Enrichment Router                  │                   │
│  │  ┌─────────────────────────────────────────┐│                   │
│  │  │ Switch on enrichment_type:              ││                   │
│  │  │                                         ││                   │
│  │  │  video → VideoEnrichmentHandler         ││                   │
│  │  │  audio → AudioEnrichmentHandler         ││                   │
│  │  │  presentation → SlidesEnrichmentHandler ││                   │
│  │  │  quiz → QuizEnrichmentHandler           ││                   │
│  │  │  document → DocumentEnrichmentHandler   ││                   │
│  │  └─────────────────────────────────────────┘│                   │
│  └────────┬────────────────────────────────────┘                   │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────┐                                               │
│  │ Type Handler    │  Fetch lesson content → Build prompt →        │
│  │                 │  Call AI service → Store result               │
│  └────────┬────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────┐                                               │
│  │ Update DB       │  lesson_enrichments (status: completed)       │
│  │ + Upload Asset  │  assets table (for video/audio/slides)        │
│  └────────┬────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────┐                                               │
│  │ Supabase        │  Real-time update to UI                       │
│  │ Realtime        │                                               │
│  └─────────────────┘                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 BullMQ Job Schema

```typescript
// packages/shared-types/src/bullmq-jobs.ts (additions)

export const EnrichmentJobDataSchema = BaseJobDataSchema.extend({
  enrichmentId: z.string().uuid(),
  lessonId: z.string().uuid(),
  courseId: z.string().uuid(),
  enrichmentType: enrichmentTypeSchema,

  // Context for AI generation
  lessonTitle: z.string(),
  lessonContent: z.string(),      // Markdown content
  lessonObjectives: z.array(z.string()).optional(),

  // Generation settings
  settings: z.object({
    voice_id: z.string().optional(),      // For audio
    avatar_id: z.string().optional(),     // For video
    theme: z.string().optional(),         // For presentation
    question_count: z.number().optional(), // For quiz
  }).optional(),
});

export type EnrichmentJobData = z.infer<typeof EnrichmentJobDataSchema>;
```

### 5.3 Queue Configuration

```typescript
// packages/course-gen-platform/src/queues/enrichment-queue.ts

export const ENRICHMENT_QUEUE_NAME = 'enrichment-generation';

export const enrichmentQueueOptions: QueueOptions = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { age: 24 * 3600 },  // Keep 24h
    removeOnFail: { age: 7 * 24 * 3600 },  // Keep 7 days
  },
};

export const enrichmentWorkerOptions: WorkerOptions = {
  concurrency: 30,  // Same as Stage 6
  limiter: {
    max: 100,
    duration: 60000,  // 100 jobs per minute
  },
};
```

### 5.4 QueueEvents for Global Monitoring

```typescript
// packages/course-gen-platform/src/queues/enrichment-events.ts

import { QueueEvents } from 'bullmq';
import { redis } from '@/shared/redis';

export const enrichmentQueueEvents = new QueueEvents(ENRICHMENT_QUEUE_NAME, {
  connection: redis,
});

// Global event listeners for monitoring and logging
enrichmentQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.info(`Enrichment job ${jobId} completed`, { result: returnvalue });
});

enrichmentQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Enrichment job ${jobId} failed`, { reason: failedReason });
  // Optionally: Send to error tracking (Sentry, etc.)
});

enrichmentQueueEvents.on('progress', ({ jobId, data }) => {
  // Progress updates from job.updateProgress()
  logger.debug(`Enrichment job ${jobId} progress`, { progress: data });
});

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  await enrichmentQueueEvents.close();
});
```

### 5.5 Worker Progress Tracking

```typescript
// Inside enrichment handler

async function processEnrichment(job: Job<EnrichmentJobData>) {
  const { enrichmentId, enrichmentType, lessonContent } = job.data;

  // Progress updates via job.updateProgress()
  await job.updateProgress({ stage: 'fetching_context', percent: 10 });

  // Fetch additional context if needed
  const context = await fetchLessonContext(job.data.lessonId);
  await job.updateProgress({ stage: 'building_prompt', percent: 25 });

  // Build prompt for LLM
  const prompt = buildPromptForType(enrichmentType, lessonContent, context);
  await job.updateProgress({ stage: 'calling_llm', percent: 40 });

  // Call LLM service
  const result = await llmService.generate(prompt);
  await job.updateProgress({ stage: 'processing_response', percent: 75 });

  // Store result
  await storeEnrichmentContent(enrichmentId, result);
  await job.updateProgress({ stage: 'completed', percent: 100 });

  return { enrichmentId, status: 'completed' };
}
```

### 5.6 Retry Strategy with Model Fallback

```typescript
// packages/course-gen-platform/src/stages/stage7-enrichments/retry-strategy.ts

export const enrichmentRetryStrategy = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,  // 5s, 10s, 20s
  },
};

// Handler logic for model fallback
async function processWithFallback(job: Job<EnrichmentJobData>) {
  const attempt = job.attemptsMade + 1;

  // Model cascade based on attempt number
  const model = getModelForAttempt(attempt);
  // Attempt 1: claude-sonnet-4-20250514
  // Attempt 2: claude-sonnet-4-20250514 (retry same)
  // Attempt 3: claude-opus-4-5-20251101 (fallback to stronger model)

  try {
    return await generateWithModel(job.data, model);
  } catch (error) {
    if (attempt >= 3) {
      // Mark enrichment as failed in DB
      await updateEnrichmentStatus(job.data.enrichmentId, 'failed', {
        error_message: error.message,
        error_details: { attempts: attempt, lastModel: model },
      });
    }
    throw error;  // Re-throw for BullMQ retry
  }
}
```

---

## 6. Agent System Prompts

### 6.1 Video Enrichment Agent Prompt

```markdown
# Video Enrichment Generation Agent

## Role
You are a Video Script Generator for educational content. Your task is to create engaging video presentation scripts based on lesson content.

## Input
You will receive:
1. **Lesson Title**: The name of the lesson
2. **Lesson Content**: Full markdown text of the lesson
3. **Learning Objectives**: What students should learn
4. **Target Audience**: Who the lesson is for
5. **Language**: Content language (ru/en)
6. **Duration Target**: Approximate video length (default: 3-5 minutes)

## Output Format
Return a JSON object with the following structure:

```json
{
  "script": {
    "intro": {
      "text": "Welcome text for video opening",
      "duration_seconds": 15
    },
    "sections": [
      {
        "title": "Section title",
        "narration": "Full narration text for this section",
        "key_points": ["Point 1", "Point 2"],
        "visual_suggestions": "Description of what should appear on screen",
        "duration_seconds": 60
      }
    ],
    "conclusion": {
      "text": "Summary and call-to-action",
      "duration_seconds": 20
    }
  },
  "metadata": {
    "total_duration_seconds": 240,
    "tone": "professional" | "conversational" | "energetic",
    "pacing": "slow" | "moderate" | "fast"
  }
}
```

## Guidelines
1. Match the tone and complexity to the target audience
2. Break content into digestible 30-90 second segments
3. Include natural transitions between sections
4. Add engagement hooks every 60-90 seconds
5. End with clear summary of key takeaways
6. For Russian content, use formal "вы" address
7. For English content, use inclusive "we/you" language

## Constraints
- Maximum script length: 2000 words
- Minimum 3 sections, maximum 8 sections
- Each section must have at least 2 key points
- Total duration must be within ±20% of target
```

### 6.2 Audio Enrichment Agent Prompt

```markdown
# Audio Narration Generation Agent

## Role
You are an Audio Script Optimizer. Your task is to adapt lesson content for text-to-speech narration.

## Input
1. **Lesson Content**: Full markdown text
2. **Voice Style**: formal | conversational | enthusiastic
3. **Language**: ru | en
4. **Speed**: slow | normal | fast

## Output Format
```json
{
  "transcript": "Full optimized text for TTS",
  "ssml_hints": [
    {
      "position": 0,
      "type": "pause",
      "value": "500ms"
    },
    {
      "position": 150,
      "type": "emphasis",
      "value": "strong"
    }
  ],
  "estimated_duration_seconds": 180,
  "word_count": 450
}
```

## Guidelines
1. Remove markdown formatting (headers, lists, links)
2. Expand abbreviations for natural speech
3. Add natural pause markers at paragraph breaks
4. Simplify complex sentences for listening comprehension
5. Convert bullet points to flowing prose
6. Add transition phrases between topics
7. For Russian: handle stress marks for ambiguous words

## Constraints
- Maximum 3000 words per narration
- Aim for 150-180 words per minute speaking rate
- No code blocks or technical syntax in output
```

### 6.3 Presentation Enrichment Agent Prompt

```markdown
# Presentation Slides Generation Agent

## Role
You are a Presentation Designer. Create slide decks from lesson content.

## Input
1. **Lesson Title**: Main presentation title
2. **Lesson Content**: Full lesson markdown
3. **Slide Count Target**: Suggested number of slides (default: 8-12)
4. **Theme**: modern | academic | corporate | minimal
5. **Language**: ru | en

## Output Format
```json
{
  "title_slide": {
    "title": "Presentation title",
    "subtitle": "Optional subtitle",
    "layout": "title"
  },
  "content_slides": [
    {
      "index": 1,
      "title": "Slide title",
      "layout": "bullets" | "two-column" | "image-left" | "quote" | "diagram",
      "content": {
        "main": ["Bullet point 1", "Bullet point 2"],
        "secondary": "Optional secondary content",
        "notes": "Speaker notes for this slide"
      },
      "visual_suggestion": "Description of recommended visual"
    }
  ],
  "summary_slide": {
    "title": "Key Takeaways",
    "points": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
    "layout": "bullets"
  },
  "metadata": {
    "total_slides": 10,
    "estimated_presentation_minutes": 15
  }
}
```

## Guidelines
1. Follow 6x6 rule: max 6 bullets, max 6 words per bullet
2. One main idea per slide
3. Include visual suggestions for each content slide
4. Add speaker notes with talking points
5. Vary layouts for visual interest
6. Start with agenda, end with summary
7. Use action verbs in titles

## Constraints
- Minimum 5 slides, maximum 20 slides
- Title maximum 8 words
- Bullet maximum 12 words
- Speaker notes maximum 100 words per slide
```

### 6.4 Quiz Enrichment Agent Prompt

```markdown
# Quiz Generation Agent

## Role
You are an Educational Assessment Designer. Create comprehension quizzes from lesson content.

## Input
1. **Lesson Content**: Full lesson markdown
2. **Learning Objectives**: Specific learning goals
3. **Question Count**: Number of questions (default: 5)
4. **Difficulty Distribution**: easy/medium/hard percentages
5. **Language**: ru | en
6. **Bloom Levels**: Target cognitive levels

## Output Format
```json
{
  "quiz_title": "Quiz title",
  "instructions": "Instructions for students",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "bloom_level": "understand",
      "difficulty": "medium",
      "question": "Question text?",
      "options": [
        {"id": "a", "text": "Option A"},
        {"id": "b", "text": "Option B"},
        {"id": "c", "text": "Option C"},
        {"id": "d", "text": "Option D"}
      ],
      "correct_answer": "b",
      "explanation": "Why B is correct and others are wrong",
      "points": 1
    },
    {
      "id": "q2",
      "type": "true_false",
      "bloom_level": "remember",
      "difficulty": "easy",
      "statement": "Statement to evaluate",
      "correct_answer": true,
      "explanation": "Why this is true/false",
      "points": 1
    }
  ],
  "metadata": {
    "total_points": 10,
    "passing_score": 70,
    "estimated_minutes": 10,
    "bloom_coverage": {
      "remember": 2,
      "understand": 2,
      "apply": 1
    }
  }
}
```

## Guidelines
1. Base all questions on lesson content (no external knowledge)
2. Distribute difficulty: 30% easy, 50% medium, 20% hard
3. Cover multiple Bloom's taxonomy levels
4. Write clear, unambiguous questions
5. Make distractors plausible but clearly wrong
6. Provide educational explanations for all answers
7. Avoid "all of the above" and "none of the above"
8. For Russian: use formal language

## Constraints
- Minimum 3 questions, maximum 20 questions
- Each question must have explanation
- Multiple choice: exactly 4 options
- True/false: include statement rationale
- No duplicate concepts across questions
```

### 6.5 Adding New Enrichment Type (Agent Creation Guide)

```markdown
# Guide: Adding New Enrichment Type to Stage 7

## For AI Agents Creating New Enrichment Types

When you need to add a new enrichment type (e.g., "flashcards", "summary", "mindmap"):

### Step 1: Database Schema
Add the new type to the `enrichment_type` enum:
```sql
ALTER TYPE enrichment_type ADD VALUE 'flashcards';
```

### Step 2: TypeScript Types
Update `packages/shared-types/src/enrichment-content.ts`:
```typescript
interface FlashcardsEnrichmentContent {
  type: 'flashcards';
  cards: Array<{
    front: string;
    back: string;
    hint?: string;
  }>;
  deck_name: string;
}
```

Add to union type:
```typescript
type EnrichmentContent =
  | VideoEnrichmentContent
  | ...
  | FlashcardsEnrichmentContent;
```

### Step 3: Handler Implementation
Create `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/flashcards-handler.ts`:
```typescript
export class FlashcardsEnrichmentHandler implements EnrichmentHandler {
  async generate(job: EnrichmentJobData): Promise<FlashcardsEnrichmentContent> {
    // 1. Fetch lesson content
    // 2. Build prompt using FLASHCARDS_AGENT_PROMPT
    // 3. Call LLM
    // 4. Validate and return content
  }
}
```

### Step 4: Register Handler
Add to `enrichment-router.ts`:
```typescript
const handlers: Record<EnrichmentType, EnrichmentHandler> = {
  // ...existing
  flashcards: new FlashcardsEnrichmentHandler(),
};
```

### Step 5: UI Components
1. Add icon to `enrichmentTypeIcons` map
2. Add translations to i18n files
3. Add preview component for Inspector Panel

### Step 6: Agent Prompt
Create prompt following the pattern in this specification.
```

---

## 7. Integration Points

### 7.1 tRPC Router

```typescript
// packages/web/server/routers/enrichment.ts

export const enrichmentRouter = router({
  // Get enrichments for a lesson
  getByLesson: protectedProcedure
    .input(z.object({ lessonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .from('lesson_enrichments')
        .select('*')
        .eq('lesson_id', input.lessonId)
        .order('order_index');
    }),

  // Get enrichment summary for graph nodes
  getSummaryByCourse: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Returns: { lessonId: EnrichmentSummary[] }
    }),

  // Create single enrichment
  create: protectedProcedure
    .input(CreateEnrichmentSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Insert to DB with status: pending
      // 2. Insert to job_outbox
      // 3. Return enrichment with optimistic status
    }),

  // Create batch enrichments
  createBatch: protectedProcedure
    .input(CreateBatchEnrichmentSchema)
    .mutation(async ({ ctx, input }) => {
      // For each lessonId + enrichmentType combination
    }),

  // Cancel generating enrichment
  cancel: protectedProcedure
    .input(z.object({ enrichmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Update status to cancelled, signal worker
    }),

  // Delete enrichment
  delete: protectedProcedure
    .input(z.object({ enrichmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Cascade delete asset if exists
    }),

  // Regenerate failed enrichment
  regenerate: protectedProcedure
    .input(z.object({ enrichmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Increment generation_attempt, reset status to pending
    }),

  // Reorder enrichments
  reorder: protectedProcedure
    .input(z.object({
      lessonId: z.string().uuid(),
      orderedIds: z.array(z.string().uuid()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Update order_index for all enrichments
    }),
});
```

### 7.2 Supabase Realtime

```typescript
// Subscribe to enrichment status changes
const channel = supabase
  .channel('enrichment-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'lesson_enrichments',
      filter: `course_id=eq.${courseId}`,
    },
    (payload) => {
      // Update React Flow node data
      updateEnrichmentSummary(payload.new.lesson_id, {
        type: payload.new.enrichment_type,
        status: payload.new.status,
        hasError: payload.new.status === 'failed',
      });
    }
  )
  .subscribe();
```

### 7.3 React Flow Integration

```typescript
// packages/web/components/generation-graph/hooks/useEnrichmentData.ts

export function useEnrichmentData(courseId: string) {
  const { data: summaries } = trpc.enrichment.getSummaryByCourse.useQuery(
    { courseId },
    { refetchInterval: false } // Use realtime instead
  );

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = subscribeToEnrichmentUpdates(courseId, (lessonId, summary) => {
      // Update node data via setNodes
    });
    return () => channel.unsubscribe();
  }, [courseId]);

  return summaries;
}
```

### 7.4 Selection Sync with useOnSelectionChange

```typescript
// packages/web/components/generation-graph/hooks/useEnrichmentSelection.ts

import { useOnSelectionChange, Node } from '@xyflow/react';

export function useEnrichmentSelection(
  onLessonSelected: (lessonId: string | null) => void
) {
  useOnSelectionChange({
    onChange: ({ nodes }: { nodes: Node[] }) => {
      // Find selected lesson node
      const selectedLesson = nodes.find(
        (node) => node.type === 'lessonNode' && node.selected
      );

      if (selectedLesson) {
        // Open Inspector Panel for this lesson
        onLessonSelected(selectedLesson.data.lessonId);
      } else {
        // Close Inspector Panel
        onLessonSelected(null);
      }
    },
  });
}

// Usage in GenerationGraph component
function GenerationGraph() {
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  useEnrichmentSelection(setSelectedLessonId);

  return (
    <>
      <ReactFlow nodes={nodes} edges={edges} ... />
      {selectedLessonId && (
        <EnrichmentInspectorPanel lessonId={selectedLessonId} />
      )}
    </>
  );
}
```

---

## 8. Accessibility

### 8.1 React Flow Accessibility Configuration

```typescript
// packages/web/components/generation-graph/GenerationGraph.tsx

<ReactFlow
  nodes={nodes}
  edges={edges}
  // Enable keyboard navigation for nodes
  nodesFocusable={true}
  edgesFocusable={false}  // Edges don't need focus for this use case
  // ARIA labels for screen readers
  ariaLabelConfig={{
    node: (node) => {
      const data = node.data as LessonNodeData;
      const enrichmentCount = data.enrichmentsTotal || 0;
      const status = getNodeStatusLabel(data.status);
      return `${data.title}. Status: ${status}. ${enrichmentCount} enrichments.`;
    },
    edge: () => '',  // Edges don't need labels
  }}
  // Other accessibility settings
  disableKeyboardA11y={false}
  ...
/>
```

### 8.2 Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Navigate between focusable nodes |
| `Enter` / `Space` | Select node (shows NodeToolbar) |
| `Escape` | Deselect node, close Inspector Panel |
| `Arrow Keys` | Pan graph (when no node selected) |

### 8.3 Asset Dock Icon Accessibility

```tsx
// Each icon in Asset Dock must have proper ARIA attributes
<button
  className="enrichment-icon"
  aria-label={t('enrichments.types.video')}
  aria-describedby={`status-${enrichmentId}`}
  onClick={() => openInspector(lessonId, 'video')}
>
  <Video className="w-4 h-4" />
  <span id={`status-${enrichmentId}`} className="sr-only">
    {t(`enrichments.status.${status}`)}
  </span>
</button>
```

### 8.4 Inspector Panel Accessibility

- Focus trap when open (focus stays within panel)
- `Escape` key closes panel
- Drag handles have `aria-label="Reorder enrichment"`
- Delete buttons have confirmation dialogs
- Status updates announced via `aria-live="polite"` region

```tsx
<aside
  role="complementary"
  aria-label={t('enrichments.inspector.title')}
  className="inspector-panel"
>
  <div aria-live="polite" className="sr-only">
    {/* Status announcements for screen readers */}
    {announcement}
  </div>
  {/* Panel content */}
</aside>
```

---

## 9. Error Handling & Loading States

### 9.1 Loading States

```tsx
// Optimistic UI pattern for enrichment creation
function useAddEnrichment() {
  const utils = trpc.useUtils();

  return trpc.enrichment.create.useMutation({
    onMutate: async ({ lessonId, enrichmentType }) => {
      // Cancel any outgoing refetches
      await utils.enrichment.getByLesson.cancel({ lessonId });

      // Snapshot current data
      const previousData = utils.enrichment.getByLesson.getData({ lessonId });

      // Optimistically add the enrichment
      utils.enrichment.getByLesson.setData({ lessonId }, (old) => [
        ...(old || []),
        {
          id: `temp-${Date.now()}`,  // Temporary ID
          enrichment_type: enrichmentType,
          status: 'pending',
          // Ghost state for Asset Dock
        },
      ]);

      return { previousData };
    },
    onError: (err, { lessonId }, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.enrichment.getByLesson.setData(
          { lessonId },
          context.previousData
        );
      }
      toast.error(t('enrichments.errors.generateFailed'));
    },
    onSettled: ({ lessonId }) => {
      // Refetch to sync with server
      utils.enrichment.getByLesson.invalidate({ lessonId });
    },
  });
}
```

### 9.2 Error Display Patterns

**Asset Dock Error Indicator:**
```
┌────────────────────────────────┐
│  📹   🎙️   📊⚠️  ❓            │  ← Red warning dot on failed icon
└────────────────────────────────┘
```

**Inspector Panel Error State:**
```tsx
{enrichment.status === 'failed' && (
  <div className="error-state bg-red-50 dark:bg-red-900/20 p-3 rounded">
    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
      <AlertCircle className="w-4 h-4" />
      <span className="font-medium">{t('enrichments.status.failed')}</span>
    </div>
    <p className="mt-1 text-sm text-red-700 dark:text-red-300">
      {enrichment.error_message}
    </p>
    <div className="mt-3 flex gap-2">
      <Button variant="outline" size="sm" onClick={() => retry(enrichment.id)}>
        {t('enrichments.actions.regenerate')}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => remove(enrichment.id)}>
        {t('enrichments.actions.delete')}
      </Button>
    </div>
  </div>
)}
```

### 9.3 Error Grouping (Preventing "Christmas Tree" Effect)

When multiple enrichments fail, group them into a single indicator:

```tsx
// In Asset Dock, when hasEnrichmentErrors && failedCount > 1
{failedCount > 1 ? (
  <button
    className="flex items-center gap-1 text-red-600"
    onClick={() => openInspectorWithErrorFilter(lessonId)}
    aria-label={t('enrichments.errors.multipleFailures', { count: failedCount })}
  >
    <AlertCircle className="w-4 h-4" />
    <span className="text-xs">{failedCount}</span>
  </button>
) : (
  // Individual error icons for single failure
)}
```

### 9.4 Generation Progress Display

```tsx
// Progress bar in Inspector Panel for generating enrichment
{enrichment.status === 'generating' && (
  <div className="progress-container">
    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
      <span>{t(`enrichments.progress.${progressStage}`)}</span>
      <span>{progressPercent}%</span>
    </div>
    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-1">
      <div
        className="h-full bg-blue-500 rounded-full transition-all duration-300"
        style={{ width: `${progressPercent}%` }}
      />
    </div>
  </div>
)}
```

---

## 10. Storage Architecture

### 10.1 File Storage for Generated Assets

Generated files (video, audio, presentations) are stored in Supabase Storage:

```sql
-- Storage bucket structure (configured in Supabase Dashboard)
-- Bucket: course-enrichments

-- Path pattern: {course_id}/{lesson_id}/{enrichment_id}.{ext}
-- Examples:
--   course-enrichments/abc123/lesson456/enrich789.mp4  (video)
--   course-enrichments/abc123/lesson456/enrich012.mp3  (audio)
--   course-enrichments/abc123/lesson456/enrich345.pptx (presentation)
```

### 10.2 Storage Policies

```sql
-- RLS for course-enrichments bucket
CREATE POLICY "Instructors can access own course enrichments"
ON storage.objects FOR ALL
USING (
  bucket_id = 'course-enrichments'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM courses WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can access org course enrichments"
ON storage.objects FOR ALL
USING (
  bucket_id = 'course-enrichments'
  AND EXISTS (
    SELECT 1 FROM courses c
    JOIN users u ON u.organization_id = c.organization_id
    WHERE c.id = (storage.foldername(name))[1]::uuid
    AND u.id = auth.uid()
    AND u.role = 'admin'
  )
);
```

### 10.3 Asset Upload Flow

```typescript
// packages/course-gen-platform/src/stages/stage7-enrichments/storage.ts

export async function uploadEnrichmentAsset(
  enrichmentId: string,
  courseId: string,
  lessonId: string,
  content: Buffer,
  mimeType: string
): Promise<string> {
  const extension = getExtensionForMimeType(mimeType);
  const path = `${courseId}/${lessonId}/${enrichmentId}.${extension}`;

  const { data, error } = await supabaseAdmin.storage
    .from('course-enrichments')
    .upload(path, content, {
      contentType: mimeType,
      upsert: true,  // Replace if regenerating
    });

  if (error) throw new StorageUploadError(error.message);

  // Create asset record
  const { data: asset } = await supabaseAdmin
    .from('assets')
    .insert({
      course_id: courseId,
      storage_path: path,
      mime_type: mimeType,
      size_bytes: content.length,
    })
    .select('id')
    .single();

  // Link asset to enrichment
  await supabaseAdmin
    .from('lesson_enrichments')
    .update({ asset_id: asset.id })
    .eq('id', enrichmentId);

  return asset.id;
}
```

### 10.4 Signed URLs for Playback

```typescript
// packages/web/server/routers/enrichment.ts

getPlaybackUrl: protectedProcedure
  .input(z.object({ enrichmentId: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const enrichment = await ctx.db
      .from('lesson_enrichments')
      .select('asset_id, assets(storage_path)')
      .eq('id', input.enrichmentId)
      .single();

    if (!enrichment.asset_id) return null;

    // Generate signed URL (1 hour expiry)
    const { data } = await supabaseAdmin.storage
      .from('course-enrichments')
      .createSignedUrl(enrichment.assets.storage_path, 3600);

    return data?.signedUrl;
  }),
```

---

## 11. i18n Requirements

### 11.1 New Namespace: `enrichments`

Create translation files:
- `packages/web/messages/ru/enrichments.json`
- `packages/web/messages/en/enrichments.json`

```json
// messages/ru/enrichments.json
{
  "title": "Дополнительные материалы",
  "types": {
    "video": "Видео",
    "audio": "Аудио",
    "presentation": "Презентация",
    "quiz": "Тест",
    "document": "Документ"
  },
  "actions": {
    "add": "Добавить",
    "addVideo": "Добавить видео",
    "addAudio": "Добавить аудио",
    "addSlides": "Добавить презентацию",
    "addQuiz": "Добавить тест",
    "addDocument": "Добавить документ",
    "regenerate": "Перегенерировать",
    "delete": "Удалить",
    "cancel": "Отменить",
    "preview": "Просмотр",
    "download": "Скачать"
  },
  "status": {
    "pending": "В очереди",
    "generating": "Генерация...",
    "completed": "Готово",
    "failed": "Ошибка",
    "cancelled": "Отменено"
  },
  "batch": {
    "title": "Массовая генерация",
    "selectLessons": "Выберите уроки",
    "selectType": "Выберите тип материала",
    "generate": "Сгенерировать для {count, plural, one {# урока} few {# уроков} many {# уроков} other {# уроков}}"
  },
  "inspector": {
    "title": "Материалы урока",
    "empty": "Нет дополнительных материалов",
    "addFirst": "Добавьте первый материал"
  },
  "errors": {
    "generateFailed": "Не удалось сгенерировать {type}",
    "deleteFailed": "Не удалось удалить материал",
    "notFound": "Материал не найден",
    "multipleFailures": "{count, plural, one {# ошибка} few {# ошибки} many {# ошибок} other {# ошибок}}"
  },
  "progress": {
    "fetching_context": "Загрузка контекста",
    "building_prompt": "Подготовка запроса",
    "calling_llm": "Генерация ИИ",
    "processing_response": "Обработка ответа",
    "completed": "Завершено"
  },
  "comingSoon": "Скоро"
}
```

```json
// messages/en/enrichments.json
{
  "title": "Enrichments",
  "types": {
    "video": "Video",
    "audio": "Audio",
    "presentation": "Presentation",
    "quiz": "Quiz",
    "document": "Document"
  },
  "actions": {
    "add": "Add",
    "addVideo": "Add Video",
    "addAudio": "Add Audio",
    "addSlides": "Add Presentation",
    "addQuiz": "Add Quiz",
    "addDocument": "Add Document",
    "regenerate": "Regenerate",
    "delete": "Delete",
    "cancel": "Cancel",
    "preview": "Preview",
    "download": "Download"
  },
  "status": {
    "pending": "Pending",
    "generating": "Generating...",
    "completed": "Completed",
    "failed": "Failed",
    "cancelled": "Cancelled"
  },
  "batch": {
    "title": "Batch Generation",
    "selectLessons": "Select lessons",
    "selectType": "Select enrichment type",
    "generate": "Generate for {count, plural, one {# lesson} other {# lessons}}"
  },
  "inspector": {
    "title": "Lesson Enrichments",
    "empty": "No enrichments yet",
    "addFirst": "Add your first enrichment"
  },
  "errors": {
    "generateFailed": "Failed to generate {type}",
    "deleteFailed": "Failed to delete enrichment",
    "notFound": "Enrichment not found",
    "multipleFailures": "{count, plural, one {# error} other {# errors}}"
  },
  "progress": {
    "fetching_context": "Fetching context",
    "building_prompt": "Building prompt",
    "calling_llm": "AI generating",
    "processing_response": "Processing response",
    "completed": "Completed"
  },
  "comingSoon": "Coming Soon"
}
```

### 11.2 Backend i18n

Add to `packages/course-gen-platform/src/shared/i18n/messages.ts`:

```typescript
export const BACKEND_TRANSLATIONS = {
  // ... existing
  stage7: {
    init: { ru: 'Инициализация Stage 7...', en: 'Initializing Stage 7...' },
    generating_video: { ru: 'Генерация видео...', en: 'Generating video...' },
    generating_audio: { ru: 'Генерация аудио...', en: 'Generating audio...' },
    generating_presentation: { ru: 'Генерация презентации...', en: 'Generating presentation...' },
    generating_quiz: { ru: 'Генерация теста...', en: 'Generating quiz...' },
    completed: { ru: 'Материал готов', en: 'Enrichment completed' },
    failed: { ru: 'Ошибка генерации', en: 'Generation failed' },
  },
} as const;
```

---

## 12. Theme Support

### 12.1 Design Tokens

All enrichment UI components must support both themes:

```tsx
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

### 12.2 Asset Dock Styling

```tsx
// Light theme
<div className="border-t border-slate-200 bg-slate-50/50">

// Dark theme
<div className="dark:border-slate-700 dark:bg-slate-900/30">
```

### 12.3 Inspector Panel Styling

```tsx
// Panel container
<div className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700">

// Enrichment list item
<div className="bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800">
```

---

## 13. Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Database & Types:**
- [ ] Create migration `20241224_stage7_enrichments.sql`
- [ ] Add TypeScript types to `shared-types`
- [ ] Generate Supabase types

**tRPC Router:**
- [ ] Implement `enrichmentRouter` with all endpoints
- [ ] Add validation schemas

**i18n:**
- [ ] Create `enrichments` namespace
- [ ] Add backend translations

### Phase 2: UI - Inspector Panel (Week 2-3)

**Core Components:**
- [ ] `EnrichmentInspectorPanel` - main right sidebar
- [ ] `EnrichmentList` - scrollable list with drag-reorder
- [ ] `EnrichmentListItem` - individual enrichment row
- [ ] `EnrichmentStatusBadge` - status indicator

**State Management:**
- [ ] `useEnrichmentStore` - Zustand store
- [ ] Selection sync with React Flow

### Phase 3: UI - LessonNode Update (Week 3)

**Node Redesign:**
- [ ] Increase LessonNode height to 64px
- [ ] Add `AssetDock` component
- [ ] Implement semantic zoom for dock
- [ ] Update ELK layout config

**NodeToolbar:**
- [ ] Add enrichment action buttons
- [ ] Floating menu implementation

### Phase 4: BullMQ Pipeline (Week 4)

**Queue Setup:**
- [ ] Create `enrichment-generation` queue
- [ ] Implement `EnrichmentRouter`
- [ ] Create placeholder handlers for each type

**Realtime:**
- [ ] Supabase subscription for updates
- [ ] Optimistic UI updates

### Phase 5: First Enrichment Type (Week 5)

**Quiz Handler:**
- [ ] Implement `QuizEnrichmentHandler`
- [ ] Integrate with LLM service
- [ ] Add quiz preview in Inspector

### Phase 6: Polish & Mobile (Week 6)

**Mobile Adaptation:**
- [ ] Inspector as bottom sheet
- [ ] Touch-friendly targets (44x44px)

**Testing:**
- [ ] Integration tests
- [ ] E2E tests for enrichment flow

---

## 14. Acceptance Criteria

### Functional Requirements

- [ ] Users can add enrichments to lessons via Plus Button + Menu
- [ ] Users can view/manage enrichments in Inspector Panel
- [ ] Enrichments can be reordered via drag-and-drop
- [ ] Enrichment generation runs asynchronously with real-time status updates
- [ ] Failed enrichments can be retried
- [ ] Enrichments can be deleted
- [ ] Batch generation works for selected lessons
- [ ] Document type shows disabled state with "Coming Soon"

### Non-Functional Requirements

- [ ] LessonNode height change doesn't break existing graph layout
- [ ] ELK layout remains stable when enrichments are added/removed
- [ ] All UI works in both light and dark themes
- [ ] All text is localized (ru/en)
- [ ] Touch targets are ≥ 44x44px on mobile
- [ ] Inspector Panel adapts to bottom sheet on mobile
- [ ] Real-time updates work via Supabase subscriptions

### Accessibility Requirements

- [ ] Nodes are keyboard navigable (`nodesFocusable={true}`)
- [ ] ARIA labels describe node content and status
- [ ] Asset Dock icons have proper `aria-label` attributes
- [ ] Inspector Panel has focus trap when open
- [ ] Status updates announced via `aria-live` region
- [ ] Error grouping prevents visual clutter (single warning icon for multiple errors)

### Performance Requirements

- [ ] Adding enrichment shows optimistic UI immediately
- [ ] Graph with 50 lessons + enrichments renders smoothly
- [ ] No layout recalculation when enrichment status changes

---

## Appendix A: File Structure

```
packages/
├── shared-types/src/
│   ├── lesson-enrichment.ts          # Types, schemas
│   ├── enrichment-content.ts         # Content type structures
│   └── bullmq-jobs.ts                # Job data schema (updated)
│
├── course-gen-platform/
│   ├── supabase/migrations/
│   │   └── 20241224_stage7_enrichments.sql
│   ├── src/
│   │   ├── queues/
│   │   │   └── enrichment-queue.ts
│   │   ├── stages/stage7-enrichments/
│   │   │   ├── handler.ts            # BullMQ job handler
│   │   │   ├── enrichment-router.ts  # Routes to type handlers
│   │   │   ├── handlers/
│   │   │   │   ├── video-handler.ts
│   │   │   │   ├── audio-handler.ts
│   │   │   │   ├── presentation-handler.ts
│   │   │   │   ├── quiz-handler.ts
│   │   │   │   └── document-handler.ts
│   │   │   └── prompts/
│   │   │       ├── video-prompt.ts
│   │   │       ├── audio-prompt.ts
│   │   │       ├── presentation-prompt.ts
│   │   │       └── quiz-prompt.ts
│   │   └── shared/i18n/messages.ts   # Backend translations
│
└── web/
    ├── messages/
    │   ├── ru/enrichments.json
    │   └── en/enrichments.json
    ├── server/routers/
    │   └── enrichment.ts             # tRPC router
    └── components/
        ├── generation-graph/
        │   ├── nodes/
        │   │   ├── LessonNode.tsx    # Updated with AssetDock
        │   │   └── AssetDock.tsx     # New component
        │   ├── components/
        │   │   └── NodeToolbar.tsx   # Enrichment actions
        │   └── hooks/
        │       └── useEnrichmentData.ts
        └── enrichments/
            ├── EnrichmentInspectorPanel.tsx
            ├── EnrichmentList.tsx
            ├── EnrichmentListItem.tsx
            ├── EnrichmentStatusBadge.tsx
            ├── EnrichmentAddMenu.tsx
            └── previews/
                ├── QuizPreview.tsx
                ├── VideoPreview.tsx
                └── PresentationPreview.tsx
```

---

## Appendix B: Enrichment Type Icons

| Type | Icon | Lucide Component |
|------|------|------------------|
| Video | 📹 | `<Video />` |
| Audio | 🎙️ | `<Mic />` |
| Presentation | 📊 | `<Presentation />` |
| Quiz | ❓ | `<HelpCircle />` |
| Document | 📎 | `<Paperclip />` |

---

*End of Specification*
