# Technical Specification: Course Generation Monitoring Page

---

## 🤖 Prompt for Implementation Agent

**Context:** You are implementing a sophisticated admin monitoring interface for a course generation platform. This document contains the complete technical specification approved by the product owner.

**Your Role:** Senior Full-Stack Developer implementing this feature incrementally following the 6-week roadmap (Section 5).

**Project Context:**
- **Product:** MegaCampus AI - Course generation platform using LLMs
- **Architecture:** Monorepo with Next.js 15+ frontend, tRPC API, Supabase PostgreSQL, BullMQ job queues
- **Tech Stack:** TypeScript (strict), React Server Components, TailwindCSS, shadcn/ui
- **Current State:** 6-stage course generation pipeline exists, needs monitoring interface

**Your Mission:**
Implement an admin monitoring page that provides deep visibility into the course generation pipeline (Stages 1-6) with real-time updates, detailed trace logging, and manual Stage 6 control for debugging and development.

**Key Features to Implement:**
1. Real-time generation monitoring dashboard (Supabase Realtime)
2. Input→Process→Output trace viewer for every LLM call
3. Stage 5 pause mechanism with manual Stage 6 triggering
4. Per-lesson generation control (generate, regenerate, refine)
5. Historical data browser with search/filter
6. Modern UI with Deep Blue & Violet color scheme

**How to Use This Document:**

1. **Read Sections in Order:**
   - Section 1: Executive Summary (understand goals)
   - Section 2: System Architecture (understand tech decisions)
   - Section 3: Feature Specifications (detailed requirements)
   - Section 4: UI/UX Design Principles (design guidelines)
   - Section 5: Implementation Roadmap (YOUR WORK BREAKDOWN)
   - Section 6: Technical Decisions (best practices, patterns)

2. **Implementation Workflow:**
   - **Week 1:** Phase 1 - Backend infrastructure (Section 5.1)
     - Create `generation_trace` table + migrations
     - Implement trace logging helper
     - Create tRPC admin routes
   - **Week 2:** Phase 2 - Monitoring dashboard (Section 5.2)
     - Build overview panel, stage timeline, real-time updates
   - **Week 3:** Phase 3 - Trace viewer + Manual Stage 6 (Section 5.3-5.4)
     - Nested accordion trace viewer
     - Course structure UI with lesson cards
   - **Week 4:** Phase 4-5 - User refinement + History (Section 5.5-5.6)
     - Refinement modal, history browser
   - **Week 5-6:** Phase 6-7 - Polish + Testing (Section 5.7)
     - Animations, error states, E2E tests

3. **Key Sections for Quick Reference:**
   - **Database Schema:** Section 2.2 (copy SQL migrations)
   - **Course Structure Format:** Section 2.2.4 (JSON example)
   - **Cost Calculation:** Section 6.3.1 (pricing table)
   - **Trace Logging:** Section 6.3 (helper function)
   - **API Endpoints:** Section 10.2 (tRPC routes)
   - **Component Tree:** Section 10.3 (UI structure)

4. **Critical Rules:**
   - ✅ **Type-check must pass** before committing any code
   - ✅ **Follow existing patterns** in the codebase (see CLAUDE.md project conventions)
   - ✅ **Use Supabase MCP** for database operations (available in .mcp.json)
   - ✅ **One feature at a time** - complete, test, commit before moving on
   - ✅ **Real-time updates** - always use Supabase Realtime (Section 6.2)
   - ✅ **Access control** - admin/superadmin only (Section 3.4)
   - ⚠️ **Never hardcode secrets** - use environment variables
   - ⚠️ **Don't skip trace logging** - every LLM call must be logged (Section 6.3)

5. **When You're Stuck:**
   - Check Section 6: Technical Decisions & Best Practices
   - Check Section 8: Risks & Mitigation
   - Search for similar patterns in existing codebase
   - Ask specific questions with context

6. **Success Criteria (Section 9):**
   - Trace coverage: 100% of generation steps logged
   - UI responsiveness: <100ms interaction latency
   - Real-time delay: <500ms from DB event to UI update
   - Page load: <2s desktop, <3s mobile

**Important Implementation Notes:**

- **Database Types:** Use `@megacampus/shared-types` - NEVER duplicate types (see CLAUDE.md)
- **Cost Calculation:** Section 6.3.1 has complete pricing table
- **Hybrid Finalization:** Section 3.2.1 - auto in prod, manual in dev
- **Failed Lessons UI:** Section 3.2.2 has all 5 states (pending/generating/completed/failed/review_required)
- **Data Retention:** Section 6.5 - 90 days, Supabase Edge Function
- **Supabase Admin Client:** Two separate implementations by design (see CLAUDE.md) - don't unify

**Before You Start:**
1. Read Section 5 (Implementation Roadmap) completely
2. Understand Section 2.2 (Database Schema Changes)
3. Review Section 3.2.1 (Pause Mechanism) - critical for Stage 6 control
4. Check Section 6.3 (Trace Logging) - you'll use this everywhere

**Start Here:**
→ Go to **Section 5.1: Phase 1: Core Infrastructure (Week 1)**
→ Follow the checklist items sequentially
→ Each checkbox is a discrete task

**Questions?** All answers are in this document. Use Ctrl+F to search.

**Ready?** Let's build an amazing monitoring interface! 🚀

---

## Document Metadata

- **Version**: 1.1.0
- **Created**: 2025-11-25
- **Last Updated**: 2025-11-25
- **Author**: AI Development Team
- **Status**: Ready for Implementation
- **Related Branch**: TBD
- **Changelog**:
  - v1.0.0: Initial draft
  - v1.1.0: Integrated ADDENDUM solutions (hybrid finalization, course structure format, cost calculation, failed lessons UI, data retention)

---

## 1. Executive Summary

### 1.1 Purpose

Create a sophisticated monitoring interface for the course generation pipeline that provides deep visibility into the entire 6-stage generation process. This page will serve as both a development debugging tool and the foundation for future super-admin capabilities.

### 1.2 Scope

- **Phase 1** (Current): Development-focused monitoring page showing detailed generation traces
- **Phase 2** (Future): Super-admin dashboard with user management and system analytics
- **Phase 3** (Future): Semi-automatic generation mode with human-in-the-loop approval

### 1.3 Key Features

1. **Real-time Generation Monitoring**: Live updates via Supabase Realtime
2. **Input → Process → Output Tracing**: Detailed visibility into each generation step
3. **Stage 5 Pause Mechanism**: Stop after structure generation, manual Stage 6 triggering
4. **Per-Lesson Generation Control**: Generate, regenerate, or refine individual lessons
5. **Historical Data Browser**: Search and view past generation attempts
6. **Modern UI/UX**: World-class design leveraging best practices and Deep Blue & Violet color scheme

---

## 2. System Architecture

### 2.1 Technology Stack

**Frontend:**
- Next.js 15+ (App Router)
- React Server Components + Client Components
- TypeScript (strict mode)
- TailwindCSS + shadcn/ui components
- Supabase Realtime client

**Backend:**
- tRPC API endpoints (existing architecture)
- Supabase PostgreSQL database
- BullMQ job queues (existing)
- PostgreSQL FSM for state management (existing)

**Data Flow:**
```
User Action → Next.js Page → tRPC Router → BullMQ Queue → Worker
                ↓                                           ↓
           Supabase Realtime ← PostgreSQL Tables ← Job Updates
                ↓
           UI Updates (Real-time)
```

### 2.2 Database Schema Changes

#### 2.2.1 New Table: `generation_trace`

**Purpose**: Store detailed logs for each generation step (LLM calls, transformations, validations)

```sql
CREATE TABLE generation_trace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,

  -- Generation context
  stage TEXT NOT NULL CHECK (stage IN ('stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6')),
  phase TEXT NOT NULL, -- e.g., 'classification', 'planner', 'expander', etc.
  step_name TEXT NOT NULL, -- e.g., 'llm_call', 'validation', 'transformation'

  -- Trace data
  input_data JSONB NOT NULL DEFAULT '{}', -- What was passed to this step
  output_data JSONB, -- What this step produced
  error_data JSONB, -- Error details if step failed

  -- LLM specific (if applicable)
  model_used TEXT, -- e.g., 'openai/gpt-4-turbo'
  prompt_text TEXT, -- Full prompt sent to LLM
  completion_text TEXT, -- Raw LLM response
  tokens_used INTEGER, -- Total tokens (prompt + completion)
  cost_usd NUMERIC(10, 6), -- Cost in USD
  temperature NUMERIC(3, 2), -- Temperature parameter

  -- Metadata
  duration_ms INTEGER, -- Execution time
  retry_attempt INTEGER DEFAULT 0, -- 0 = first attempt, 1+ = retry
  was_cached BOOLEAN DEFAULT FALSE, -- Was result from cache?
  quality_score NUMERIC(3, 2), -- Quality metric (0.0-1.0) if applicable

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexing
  CONSTRAINT valid_quality_score CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1))
);

-- Indexes for efficient querying
CREATE INDEX idx_generation_trace_course_id ON generation_trace(course_id);
CREATE INDEX idx_generation_trace_lesson_id ON generation_trace(lesson_id) WHERE lesson_id IS NOT NULL;
CREATE INDEX idx_generation_trace_stage ON generation_trace(stage);
CREATE INDEX idx_generation_trace_created_at ON generation_trace(created_at DESC);

-- RLS policies
ALTER TABLE generation_trace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view all traces"
  ON generation_trace FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

CREATE POLICY "Admins can view traces in their organization"
  ON generation_trace FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN courses c ON c.organization_id = u.organization_id
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND c.id = generation_trace.course_id
    )
  );
```

#### 2.2.2 Modify Table: `courses`

Add columns for Stage 5 pause mechanism and finalization control:

```sql
ALTER TABLE courses
ADD COLUMN pause_at_stage_5 BOOLEAN DEFAULT FALSE,
ADD COLUMN auto_finalize_after_stage6 BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN courses.pause_at_stage_5 IS
  'When TRUE, generation stops after stage_5_complete. Stage 6 (lesson content) must be triggered manually per lesson.';

COMMENT ON COLUMN courses.auto_finalize_after_stage6 IS
  'When TRUE and pause_at_stage_5 is TRUE, automatically transition to finalizing after all Stage 6 lessons complete. When FALSE, require manual "Complete Course" button. Enables hybrid mode: auto in production, manual in development.';
```

#### 2.2.3 Modify Table: `lesson_contents`

Add columns for user refinement tracking:

```sql
ALTER TABLE lesson_contents
ADD COLUMN generation_attempt INTEGER DEFAULT 1,
ADD COLUMN user_refinement_prompt TEXT,
ADD COLUMN parent_content_id UUID REFERENCES lesson_contents(id);

COMMENT ON COLUMN lesson_contents.generation_attempt IS
  'Increments with each regeneration. 1 = original, 2+ = regenerated.';

COMMENT ON COLUMN lesson_contents.user_refinement_prompt IS
  'User instructions for regeneration (e.g., "Add more examples", "Simplify language").';

COMMENT ON COLUMN lesson_contents.parent_content_id IS
  'References previous version if this is a regeneration. NULL for original generation.';
```

#### 2.2.4 Course Structure Format

The `courses.course_structure` JSONB field stores the complete course outline generated in Stage 5.

**Type Definition** (from `@megacampus/shared-types/course-structure`):

```typescript
export interface CourseStructure {
  title: string;
  description: string;
  language: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimated_duration_minutes: number;
  sections: Section[];
}

export interface Section {
  id: string; // UUID generated in Stage 5
  title: string;
  description: string;
  order: number;
  estimated_duration_minutes: number;
  lessons: Lesson[];
}

export interface Lesson {
  id: string; // UUID generated in Stage 5
  title: string;
  order: number;
  estimated_duration_minutes: number;
  learning_objectives: string[];
  specification: LessonSpecificationV2; // Full spec for Stage 6
}
```

**Example JSON**:

```json
{
  "title": "Introduction to Machine Learning",
  "description": "Learn the fundamentals of machine learning...",
  "language": "en",
  "difficulty": "beginner",
  "estimated_duration_minutes": 180,
  "sections": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Module 1: ML Basics",
      "description": "Introduction to core concepts",
      "order": 1,
      "estimated_duration_minutes": 45,
      "lessons": [
        {
          "id": "660e8400-e29b-41d4-a716-446655440001",
          "title": "What is Machine Learning?",
          "order": 1,
          "estimated_duration_minutes": 15,
          "learning_objectives": [
            "Define machine learning",
            "Distinguish ML from traditional programming",
            "Identify real-world ML applications"
          ],
          "specification": {
            "lesson_id": "660e8400-e29b-41d4-a716-446655440001",
            "title": "What is Machine Learning?",
            "archetype": "concept_introduction",
            "target_word_count": 1200,
            "bloom_levels": ["remember", "understand"],
            "pedagogy": {
              "intro_hook": "Start with a relatable example",
              "core_concepts": ["Definition", "Types", "Applications"],
              "examples_needed": 3,
              "exercises_needed": 2
            }
          }
        }
      ]
    }
  ]
}
```

---

## 3. Feature Specifications

### 3.1 Real-time Monitoring Dashboard

#### 3.1.1 Overview Panel

**Location**: Top of page

**Components**:
- Course title, ID, and creation timestamp
- Current generation status badge (with color coding)
- Progress indicator: X/6 stages complete
- Overall generation metrics:
  - Total duration (HH:MM:SS)
  - Total tokens used
  - Total cost (USD)
  - Average quality score
- Action buttons: "Pause", "Cancel", "Export Logs"

**Data Sources**:
- `courses` table: `title`, `id`, `generation_status`, `created_at`
- `generation_trace` table: aggregated metrics
- `generation_status_history` table: status transitions

#### 3.1.2 Stage Timeline

**Visual Design**: Horizontal stepper/timeline with 6 stages

**Each Stage Shows**:
- Stage number and name
- Status icon: ⏳ Pending | 🔄 In Progress | ✅ Complete | ❌ Failed
- Start and end timestamps
- Duration
- Expandable details panel

**Stage Details Panel** (when expanded):

```
┌─────────────────────────────────────────────────┐
│ Stage 2: Document Processing                    │
│ Status: Completed ✅                            │
│ Duration: 45.2s                                 │
│                                                 │
│ Documents Processed: 4/4                        │
│ ├─ machine-learning-guide.pdf (SUCCESS)        │
│ ├─ deep-learning-basics.docx (SUCCESS)         │
│ ├─ neural-networks.pdf (SUCCESS)               │
│ └─ transformers-explained.pdf (SUCCESS)        │
│                                                 │
│ Classification Results:                         │
│ ├─ HIGH Priority: 3 documents                  │
│ └─ LOW Priority: 1 document                    │
│                                                 │
│ Processing Order:                               │
│ 1. machine-learning-guide.pdf                  │
│ 2. neural-networks.pdf                         │
│ 3. transformers-explained.pdf                  │
│ 4. deep-learning-basics.docx                   │
└─────────────────────────────────────────────────┘
```

**Data Sources**:
- `generation_status_history`: timestamps, transitions
- `file_catalog`: uploaded files
- `document_priorities`: classification results
- `generation_trace`: detailed step logs

#### 3.1.3 Detailed Trace Viewer

**Purpose**: Drill down into individual steps to see Input → Process → Output

**UI Pattern**: Nested accordion with search/filter

**Example for Stage 4 Phase 1 (Classification)**:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Stage 4: Analysis                                        │
│ ├─ 📊 Phase 1: Classification                               │
│ │   ├─ Step 1: LLM Call - Course Category                  │
│ │   │   ├─ 📥 INPUT                                         │
│ │   │   │   ├─ Model: openai/gpt-4-turbo                  │
│ │   │   │   ├─ Temperature: 0.3                           │
│ │   │   │   ├─ Prompt: [View Full Prompt ▼]              │
│ │   │   │   │   "You are an expert course curator..."     │
│ │   │   │   │   [RAG Context: 3 chunks, 2,450 tokens]     │
│ │   │   │   └─ Token Budget: 8,000 tokens                 │
│ │   │   │                                                  │
│ │   │   ├─ ⚙️ PROCESS                                      │
│ │   │   │   ├─ Duration: 3.2s                             │
│ │   │   │   ├─ Tokens Used: 3,847                         │
│ │   │   │   ├─ Cost: $0.0154                              │
│ │   │   │   └─ Retry Attempts: 0                          │
│ │   │   │                                                  │
│ │   │   └─ 📤 OUTPUT                                       │
│ │   │       ├─ Category: "Machine Learning"               │
│ │   │       ├─ Confidence: 0.95                           │
│ │   │       ├─ Reasoning: "Course focuses on..."          │
│ │   │       └─ [View Raw JSON ▼]                          │
│ │   │                                                      │
│ │   ├─ Step 2: Validation                                 │
│ │   │   ├─ 📥 INPUT: Category object                      │
│ │   │   ├─ ⚙️ PROCESS: Zod schema validation              │
│ │   │   └─ 📤 OUTPUT: ✅ Valid                            │
│ │   │                                                      │
│ │   └─ Step 3: Database Update                            │
│ │       ├─ 📥 INPUT: Validated category                   │
│ │       ├─ ⚙️ PROCESS: Supabase UPDATE                    │
│ │       └─ 📤 OUTPUT: ✅ analysis_result updated           │
│ │                                                          │
│ ├─ 📊 Phase 2: Scope Analysis                              │
│ │   └─ [Similar nested structure...]                      │
│ │                                                          │
│ └─ [Phase 3, 4, 5...]                                      │
└─────────────────────────────────────────────────────────────┘
```

**Interaction**:
- Click any step to expand/collapse
- Copy buttons for prompt/completion text
- Download buttons for raw JSON
- Filter by: stage, phase, success/failure, model used

**Data Source**: `generation_trace` table

---

### 3.2 Stage 5 Pause & Manual Stage 6 Control

#### 3.2.1 Pause Mechanism

**Implementation**:

1. **Trigger**: Set `courses.pause_at_stage_5 = TRUE` when course is created
   - In development mode: Always TRUE
   - In production: Configurable per course

2. **FSM Behavior**:
   - After Stage 5 completes (`generation_status = 'stage_5_complete'`), do NOT auto-transition to `finalizing`
   - Do NOT create Stage 6 BullMQ jobs in `job_outbox`
   - Keep status at `stage_5_complete` until manual trigger

3. **Backend Code Changes**:

```typescript
// packages/course-gen-platform/src/stages/stage5-generation/handler.ts

async handleStage5Complete(courseId: string) {
  const { data: course } = await supabase
    .from('courses')
    .select('pause_at_stage_5, course_structure')
    .eq('id', courseId)
    .single();

  if (!course) throw new Error('Course not found');

  if (course.pause_at_stage_5) {
    logger.info({ courseId }, 'Stage 5 paused - awaiting manual Stage 6 trigger');

    // Create lessons in database but don't trigger generation
    await this.createLessonsFromStructure(courseId, course.course_structure);

    // Status remains stage_5_complete - no transition to finalizing
    return;
  }

  // Normal flow: create Stage 6 jobs
  await this.triggerStage6Generation(courseId);
}

async createLessonsFromStructure(courseId: string, structure: CourseStructure) {
  const lessonsToInsert = [];

  for (const section of structure.sections) {
    // Create section
    const { data: sectionRecord } = await supabase
      .from('sections')
      .insert({
        course_id: courseId,
        title: section.title,
        description: section.description,
        order_index: section.order,
      })
      .select()
      .single();

    // Create lessons for this section
    for (const lesson of section.lessons) {
      lessonsToInsert.push({
        section_id: sectionRecord.id,
        title: lesson.title,
        order_index: lesson.order,
        lesson_type: 'text', // Default
        status: 'draft',
        metadata: {
          learning_objectives: lesson.learning_objectives,
          estimated_duration_minutes: lesson.estimated_duration_minutes,
        },
      });
    }
  }

  await supabase.from('lessons').insert(lessonsToInsert);
}
```

4. **Hybrid Finalization Logic** (after all Stage 6 lessons complete):

```typescript
// packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts

async handleLessonComplete(lessonId: string, courseId: string) {
  const { data: course } = await supabase
    .from('courses')
    .select('pause_at_stage_5, auto_finalize_after_stage6')
    .eq('id', courseId)
    .single();

  // If paused at Stage 5, check if all lessons are done
  if (course.pause_at_stage_5) {
    const allLessonsComplete = await this.checkAllLessonsComplete(courseId);

    if (allLessonsComplete && course.auto_finalize_after_stage6) {
      // Auto-transition to finalizing (production mode)
      logger.info({ courseId }, 'All lessons complete - auto-finalizing course');
      await this.finalizeCourse(courseId);
    } else if (allLessonsComplete) {
      // Show "Complete Course" button in UI (development mode)
      logger.info({ courseId }, 'All lessons complete - awaiting manual finalization');
    }
  }
}

async checkAllLessonsComplete(courseId: string): Promise<boolean> {
  // Get all lessons for this course
  const { data: sections } = await supabase
    .from('sections')
    .select('id')
    .eq('course_id', courseId);

  const sectionIds = sections.map(s => s.id);

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id')
    .in('section_id', sectionIds);

  const { data: contents } = await supabase
    .from('lesson_contents')
    .select('status')
    .eq('course_id', courseId);

  // Check: every lesson has a completed content
  const completedCount = contents.filter(c => c.status === 'completed').length;
  return lessons.length === completedCount && lessons.length > 0;
}

async finalizeCourse(courseId: string) {
  // Transition: stage_5_complete → finalizing → completed
  await supabase
    .from('courses')
    .update({
      generation_status: 'finalizing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);

  // Perform any final processing (e.g., generate PDF, create exports)
  // ...

  await supabase
    .from('courses')
    .update({
      generation_status: 'completed',
      generation_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);

  logger.info({ courseId }, 'Course generation finalized successfully');
}
```

**Configuration:**
- **Development mode**: Set `auto_finalize_after_stage6 = FALSE` - requires manual "Complete Course" button
- **Production mode**: Set `auto_finalize_after_stage6 = TRUE` - automatic finalization after all lessons

#### 3.2.2 Manual Stage 6 UI

**Location**: Displayed when `generation_status = 'stage_5_complete'`

**Layout**: Hierarchical course structure view

```
┌─────────────────────────────────────────────────────────────────┐
│ Course Structure Ready for Content Generation                   │
│                                                                  │
│ 📚 Module 1: Introduction to Machine Learning                  │
│ ├─ 📄 Lesson 1.1: What is Machine Learning?                    │
│ │   ├─ Status: ⏳ Pending                                      │
│ │   ├─ Estimated: 15 min                                       │
│ │   └─ [Generate Content] [View Spec]                         │
│ │                                                              │
│ ├─ 📄 Lesson 1.2: Types of Machine Learning                   │
│ │   ├─ Status: ⏳ Pending                                      │
│ │   ├─ Estimated: 20 min                                       │
│ │   └─ [Generate Content] [View Spec]                         │
│ │                                                              │
│ └─ 📄 Lesson 1.3: Key Terminology                             │
│     ├─ Status: ⏳ Pending                                      │
│     ├─ Estimated: 10 min                                       │
│     └─ [Generate Content] [View Spec]                         │
│                                                                  │
│ 📚 Module 2: Supervised Learning                               │
│ ├─ 📄 Lesson 2.1: Linear Regression                           │
│ │   ├─ Status: ✅ Generated                                    │
│ │   ├─ Generated: 2024-11-25 14:32                            │
│ │   ├─ Quality: 0.87 | Tokens: 3,245 | Cost: $0.013          │
│ │   └─ [View Content] [Regenerate] [Refine]                  │
│ │                                                              │
│ └─ [... more lessons ...]                                      │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ Batch Actions:                                              ││
│ │ [✓] Select All | [Generate All Pending] [Export Structure] ││
│ └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Actions**:

1. **"Generate Content"**: Trigger Stage 6 for single lesson
2. **"View Spec"**: Show lesson specification (from Stage 5)
3. **"View Content"**: Navigate to lesson content viewer
4. **"Regenerate"**: Re-run Stage 6 with same spec (fresh attempt)
5. **"Refine"**: Re-run Stage 6 with user instructions (see 3.2.3)
6. **"Generate All Pending"**: Batch trigger for all non-generated lessons

**Lesson States UI** (comprehensive):

```tsx
// Status-specific rendering in LessonCard component

{lesson.status === 'pending' && (
  <>
    <Badge variant="secondary" className="bg-amber-500/20 text-amber-500">
      ⏳ Pending
    </Badge>
    <div className="mt-3 flex gap-2">
      <Button onClick={() => generateLesson(lesson.id)}>
        Generate Content
      </Button>
      <Button variant="outline" onClick={() => viewSpec(lesson.id)}>
        View Spec
      </Button>
    </div>
  </>
)}

{lesson.status === 'generating' && (
  <>
    <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-500">
      <Loader2 className="animate-spin" />
      Generating...
    </Badge>
    <Progress value={lesson.progress} className="mt-3" />
    <p className="text-sm text-slate-400 mt-2">
      Phase: {lesson.currentPhase} • {lesson.progress}%
    </p>
  </>
)}

{lesson.status === 'completed' && (
  <>
    <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-500">
      ✅ Generated
    </Badge>
    <div className="mt-2 flex gap-3 text-xs text-slate-400">
      <span>Quality: {lesson.qualityScore}</span>
      <span>Tokens: {lesson.tokensUsed.toLocaleString()}</span>
      <span>Cost: ${lesson.costUsd.toFixed(3)}</span>
    </div>
    <div className="mt-3 flex gap-2">
      <Button variant="outline" onClick={() => viewContent(lesson.id)}>
        View Content
      </Button>
      <Button variant="ghost" onClick={() => regenerate(lesson.id)}>
        🔄 Regenerate
      </Button>
      <Button variant="ghost" onClick={() => refine(lesson.id)}>
        ✏️ Refine
      </Button>
    </div>
  </>
)}

{lesson.status === 'failed' && (
  <>
    <Badge variant="destructive" className="bg-red-500/20 text-red-500">
      ❌ Failed
    </Badge>
    <div className="mt-2 p-3 rounded bg-red-500/10 border border-red-500/30">
      <p className="text-sm text-red-400">
        {lesson.errorMessage || 'Generation failed - see logs for details'}
      </p>
      {lesson.errorData?.retryable && (
        <p className="text-xs text-slate-400 mt-1">
          Attempt {lesson.attempts}/{lesson.maxAttempts}
        </p>
      )}
    </div>
    <div className="mt-3 flex gap-2">
      <Button onClick={() => retryLesson(lesson.id)}>
        🔄 Retry
      </Button>
      <Button variant="outline" onClick={() => viewLogs(lesson.id)}>
        View Error Logs
      </Button>
      <Button variant="ghost" onClick={() => regenerateWithFallback(lesson.id)}>
        Try Different Model
      </Button>
    </div>
  </>
)}

{lesson.status === 'review_required' && (
  <>
    <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-500">
      ⚠️ Review Required
    </Badge>
    <div className="mt-2 p-3 rounded bg-yellow-500/10 border border-yellow-500/30">
      <p className="text-sm text-yellow-400">
        Quality score below threshold ({lesson.qualityScore} < 0.7)
      </p>
    </div>
    <div className="mt-3 flex gap-2">
      <Button onClick={() => viewContent(lesson.id)}>
        Review Content
      </Button>
      <Button variant="outline" onClick={() => approveAnyway(lesson.id)}>
        Approve Anyway
      </Button>
      <Button variant="ghost" onClick={() => regenerate(lesson.id)}>
        Regenerate
      </Button>
    </div>
  </>
)}
```

**"Complete Course" Button** (when all lessons done):

```tsx
{allLessonsComplete && !course.auto_finalize_after_stage6 && (
  <div className="mt-8 p-6 border-2 border-emerald-500 rounded-lg bg-emerald-500/10">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-xl font-bold text-emerald-500">
          ✅ All Lessons Generated
        </h3>
        <p className="text-slate-300 mt-2">
          All {totalLessons} lessons have been successfully generated.
          Review the content and complete course generation.
        </p>
      </div>
      <Button
        size="lg"
        variant="default"
        onClick={handleFinalizeCourse}
        className="bg-emerald-500 hover:bg-emerald-600"
      >
        Complete Course Generation
      </Button>
    </div>
  </div>
)}
```

#### 3.2.3 User Refinement Feature

**Purpose**: Allow users to provide feedback/instructions for regeneration

**UI Flow**:

1. User clicks **"Refine"** button on generated lesson
2. Modal opens with:
   - Current content preview
   - Text area for user instructions
   - Refinement type selector:
     - 🔧 **Fix/Improve**: Correct errors, improve clarity
     - ➕ **Add Content**: Add missing examples, exercises, details
     - ✂️ **Simplify**: Reduce complexity, shorten length
     - 🔄 **Restructure**: Change organization, flow
     - 💬 **Custom**: Free-form instructions

3. User enters instructions (e.g., "Add 2 more code examples with comments")
4. User clicks **"Regenerate with Instructions"**
5. Backend:
   - Creates new `lesson_contents` record with `parent_content_id` pointing to original
   - Stores `user_refinement_prompt`
   - Triggers Stage 6 job with modified prompt

**Backend Implementation**:

```typescript
// packages/course-gen-platform/src/server/routers/lessons.ts

export const lessonsRouter = router({
  // ... existing routes

  regenerateWithRefinement: protectedProcedure
    .input(
      z.object({
        lessonId: z.string().uuid(),
        refinementType: z.enum(['fix', 'add', 'simplify', 'restructure', 'custom']),
        userInstructions: z.string().min(10).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Authorization check
      const lesson = await ctx.supabase
        .from('lessons')
        .select('*, section:sections(course_id)')
        .eq('id', input.lessonId)
        .single();

      if (!lesson.data) throw new TRPCError({ code: 'NOT_FOUND' });

      // Get current content
      const { data: currentContent } = await ctx.supabase
        .from('lesson_contents')
        .select('*')
        .eq('lesson_id', input.lessonId)
        .order('generation_attempt', { ascending: false })
        .limit(1)
        .single();

      if (!currentContent) throw new TRPCError({ code: 'NOT_FOUND' });

      // Get lesson spec from course_structure
      const { data: course } = await ctx.supabase
        .from('courses')
        .select('course_structure')
        .eq('id', lesson.data.section.course_id)
        .single();

      const lessonSpec = findLessonSpecInStructure(
        course.course_structure,
        input.lessonId
      );

      // Create new content record
      const { data: newContent } = await ctx.supabase
        .from('lesson_contents')
        .insert({
          lesson_id: input.lessonId,
          course_id: lesson.data.section.course_id,
          status: 'generating',
          generation_attempt: currentContent.generation_attempt + 1,
          user_refinement_prompt: input.userInstructions,
          parent_content_id: currentContent.id,
        })
        .select()
        .single();

      // Trigger Stage 6 job with refinement
      const jobData: Stage6JobInput = {
        lessonSpec: {
          ...lessonSpec,
          refinement: {
            type: input.refinementType,
            instructions: input.userInstructions,
            previousContent: currentContent.content,
          },
        },
        courseId: lesson.data.section.course_id,
        ragChunks: [], // Will be fetched by worker
        ragContextId: null,
      };

      await stage6Queue.add(`stage6-lesson-${input.lessonId}`, jobData, {
        jobId: `stage6-${input.lessonId}-attempt-${newContent.generation_attempt}`,
      });

      return { contentId: newContent.id };
    }),
});
```

**Stage 6 Orchestrator Modification**:

```typescript
// packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts

export async function executeStage6(input: Stage6Input): Promise<Stage6Output> {
  const { lessonSpec, courseId, ragChunks, ragContextId } = input;

  // Check for refinement request
  if (lessonSpec.refinement) {
    const { type, instructions, previousContent } = lessonSpec.refinement;

    // Modify system prompt to include refinement context
    const refinementPrompt = buildRefinementPrompt(type, instructions, previousContent);

    // Execute graph with modified prompt
    return await executeStage6Graph({
      ...input,
      systemPromptSuffix: refinementPrompt,
    });
  }

  // Normal execution
  return await executeStage6Graph(input);
}

function buildRefinementPrompt(
  type: RefinementType,
  instructions: string,
  previousContent: any
): string {
  const typeContext = {
    fix: "You are improving an existing lesson. Focus on correcting errors, improving clarity, and enhancing quality.",
    add: "You are expanding an existing lesson. Focus on adding the requested content while maintaining coherence with existing material.",
    simplify: "You are simplifying an existing lesson. Focus on making content more accessible while preserving key concepts.",
    restructure: "You are restructuring an existing lesson. Focus on improving organization and flow.",
    custom: "You are modifying an existing lesson based on user feedback.",
  };

  return `
${typeContext[type]}

PREVIOUS LESSON CONTENT:
${JSON.stringify(previousContent, null, 2)}

USER INSTRUCTIONS:
${instructions}

IMPORTANT:
- Incorporate the user's feedback while maintaining educational quality
- Preserve good elements from the previous version
- Ensure the revised lesson still meets the original learning objectives
- Do NOT introduce placeholders or incomplete sections
`;
}
```

---

### 3.3 Historical Data Browser

#### 3.3.1 Overview Page

**URL**: `/admin/generation-history`

**Features**:
- Paginated table of all course generations
- Filters:
  - Date range picker
  - Generation status (completed, failed, cancelled)
  - User (course creator)
  - Organization
  - Stage reached (stage_2_complete, stage_5_complete, etc.)
- Search by course title or ID
- Columns:
  - Course Title
  - Creator
  - Status
  - Created At
  - Completed At
  - Duration
  - Total Cost
  - Actions: [View Details] [Export]

#### 3.3.2 Detail View

**URL**: `/admin/generation-history/[courseId]`

**Content**: Same as real-time monitoring dashboard (Section 3.1), but read-only

**Additional Features**:
- Compare button (if multiple generations exist for same course)
- Export as JSON/CSV
- Share link (with expiry)

---

### 3.4 Access Control

#### 3.4.1 Role-Based Access

**Superadmin**:
- Full access to all courses across all organizations
- Can view all generation traces
- Can trigger/cancel any generation
- Can modify any course settings

**Admin**:
- Access to courses within their organization only
- Can view generation traces for their organization's courses
- Can trigger/cancel generations for their courses
- Can modify settings for their courses

**Instructor/Student**:
- NO access to admin monitoring page
- Use regular course viewing interface

#### 3.4.2 Authentication Check

```typescript
// packages/web/app/admin/generation/[courseId]/page.tsx

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export default async function AdminGenerationMonitoringPage({
  params,
}: {
  params: { courseId: string };
}) {
  const supabase = await createServerClient();

  // Check auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Check role
  const { data: userData } = await supabase
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();

  if (!userData || !['admin', 'superadmin'].includes(userData.role)) {
    redirect('/unauthorized');
  }

  // Check course access (if admin, must be same organization)
  if (userData.role === 'admin') {
    const { data: course } = await supabase
      .from('courses')
      .select('organization_id')
      .eq('id', params.courseId)
      .single();

    if (!course || course.organization_id !== userData.organization_id) {
      redirect('/unauthorized');
    }
  }

  // Render page
  return <GenerationMonitoringDashboard courseId={params.courseId} />;
}
```

---

## 4. UI/UX Design Principles

### 4.1 Design Philosophy

**Goals**:
1. **Information Density**: Show maximum relevant data without overwhelming
2. **Progressive Disclosure**: Details on-demand via accordions, modals
3. **Visual Hierarchy**: Clear importance signaling through size, color, position
4. **Real-time Feedback**: Instant updates via Supabase Realtime
5. **Delight**: Smooth animations, satisfying interactions

### 4.2 Color Scheme

**Base**: Deep Blue & Violet (from image-generation-prompts.md)

```css
:root {
  --primary-blue: #1e3a8a; /* Deep Blue */
  --primary-violet: #5b21b6; /* Rich Violet */
  --accent-cyan: #06b6d4; /* Vibrant Cyan */
  --accent-pink: #ec4899; /* Energetic Pink */

  --success: #10b981; /* Emerald */
  --warning: #f59e0b; /* Amber */
  --error: #ef4444; /* Red */

  --bg-primary: #0f172a; /* Slate 900 */
  --bg-secondary: #1e293b; /* Slate 800 */
  --bg-tertiary: #334155; /* Slate 700 */

  --text-primary: #f1f5f9; /* Slate 100 */
  --text-secondary: #cbd5e1; /* Slate 300 */
  --text-muted: #94a3b8; /* Slate 400 */
}
```

**Status Colors**:
- Pending: `--warning` (Amber)
- In Progress: `--accent-cyan` (Cyan, animated pulse)
- Complete: `--success` (Emerald)
- Failed: `--error` (Red)
- Cancelled: `--text-muted` (Gray)

### 4.3 Component Patterns

**Use shadcn/ui Components**:
- `Card`, `CardHeader`, `CardContent`: Information panels
- `Accordion`, `AccordionItem`: Collapsible sections
- `Badge`: Status indicators
- `Button`: Actions
- `Progress`: Loading states
- `Tabs`: View switching
- `Dialog`, `Sheet`: Modals and side panels
- `Table`: Data grids
- `ScrollArea`: Scrollable content

**Custom Components**:
- `GenerationTimeline`: Horizontal stepper
- `TraceViewer`: Nested accordion with syntax highlighting
- `LessonCard`: Lesson generation control card
- `MetricsBadge`: Inline metric display (tokens, cost, quality)

### 4.4 Animations

**Principles**:
- **Functional**: Animations guide attention, not just decorative
- **Fast**: 150-300ms durations
- **Smooth**: Ease-in-out timing functions

**Examples**:
- Stage transition: Fade + slide (200ms)
- Accordion expand: Height animation (250ms)
- Real-time update: Highlight flash (300ms)
- Loading state: Pulse animation (continuous)
- Success action: Check mark + scale (150ms)

**Implementation** (using Framer Motion):

```tsx
import { motion, AnimatePresence } from 'framer-motion';

export function StageCard({ stage, isActive, isComplete }: StageCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'border rounded-lg p-4',
        isActive && 'border-cyan-500 shadow-lg shadow-cyan-500/20',
        isComplete && 'border-emerald-500'
      )}
    >
      <div className="flex items-center gap-3">
        <AnimatePresence mode="wait">
          {isComplete ? (
            <motion.div
              key="complete"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <CheckCircle2 className="text-emerald-500" />
            </motion.div>
          ) : isActive ? (
            <motion.div
              key="active"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="text-cyan-500" />
            </motion.div>
          ) : (
            <Clock className="text-slate-400" />
          )}
        </AnimatePresence>

        <h3 className="text-lg font-semibold">{stage.name}</h3>
      </div>
    </motion.div>
  );
}
```

### 4.5 Responsive Design

**Breakpoints**:
- Mobile: < 640px (Stack vertically, simplified view)
- Tablet: 640px - 1024px (Two-column layout)
- Desktop: > 1024px (Three-column layout with sidebar)

**Mobile Considerations**:
- Collapsible sidebar
- Bottom sheet for actions
- Simplified trace viewer (toggle full view)
- Touch-friendly button sizes (min 44x44px)

---

## 5. Implementation Roadmap

### 5.1 Phase 1: Core Infrastructure (Week 1)

**Backend**:
- [ ] Create `generation_trace` table + RLS policies
- [ ] Add `pause_at_stage_5` column to `courses`
- [ ] Add refinement columns to `lesson_contents`
- [ ] Implement trace logging in all stage handlers
  - [ ] Stage 2: Document processing
  - [ ] Stage 3: Summarization
  - [ ] Stage 4: Analysis (all 5 phases)
  - [ ] Stage 5: Structure generation
  - [ ] Stage 6: Lesson content generation
- [ ] Create tRPC routes for admin monitoring
  - [ ] `admin.getGenerationTrace`
  - [ ] `admin.getCourseGenerationDetails`
  - [ ] `admin.triggerStage6ForLesson`
  - [ ] `admin.regenerateLesson`
  - [ ] `admin.regenerateLessonWithRefinement`

**Frontend**:
- [ ] Set up admin route structure (`/admin/generation/[courseId]`)
- [ ] Implement auth middleware + role checks
- [ ] Create base layout with sidebar
- [ ] Set up Supabase Realtime client

### 5.2 Phase 2: Monitoring Dashboard (Week 2)

**Components**:
- [ ] Overview panel (course metadata, progress, metrics)
- [ ] Stage timeline (horizontal stepper)
- [ ] Stage details panel (expandable)
- [ ] Real-time status updates (Supabase Realtime)
- [ ] Metrics visualization (charts/graphs)

**Data Integration**:
- [ ] Connect to `generation_status_history` for timeline
- [ ] Connect to `generation_trace` for detailed logs
- [ ] Implement Supabase Realtime subscriptions
- [ ] Add loading states + error boundaries

### 5.3 Phase 3: Trace Viewer (Week 2-3)

**Components**:
- [ ] Nested accordion trace viewer
- [ ] Input/Process/Output sections
- [ ] Syntax highlighting for JSON/prompts
- [ ] Copy buttons, download buttons
- [ ] Filter/search functionality

**Features**:
- [ ] Drill down into any step
- [ ] View full prompts/completions
- [ ] See token usage, costs, durations
- [ ] Highlight errors/retries

### 5.4 Phase 4: Manual Stage 6 Control (Week 3)

**Backend**:
- [ ] Modify Stage 5 handler to respect `pause_at_stage_5`
- [ ] Create lessons from structure without triggering Stage 6
- [ ] Implement per-lesson Stage 6 triggering

**Frontend**:
- [ ] Course structure viewer (hierarchical)
- [ ] Lesson cards with status + actions
- [ ] "Generate Content" button + handler
- [ ] "Generate All Pending" batch action
- [ ] Loading states for generation progress

### 5.5 Phase 5: User Refinement (Week 4)

**Backend**:
- [ ] Implement refinement storage in `lesson_contents`
- [ ] Modify Stage 6 orchestrator to handle refinement
- [ ] Build refinement prompt templates

**Frontend**:
- [ ] Refinement modal UI
- [ ] Refinement type selector
- [ ] Instructions text area
- [ ] Content preview (before/after)
- [ ] Generation attempt history

### 5.6 Phase 6: Historical Browser (Week 4-5)

**Backend**:
- [ ] Pagination queries for generation history
- [ ] Filter/search implementation
- [ ] Export functionality (JSON/CSV)

**Frontend**:
- [ ] History table with pagination
- [ ] Filters + search bar
- [ ] Detail view (read-only monitoring dashboard)
- [ ] Export button + download handling

### 5.7 Phase 7: Polish & Testing (Week 5-6)

**Polish**:
- [ ] Animations + transitions
- [ ] Error states + empty states
- [ ] Loading skeletons
- [ ] Responsive breakpoints
- [ ] Dark mode refinement

**Testing**:
- [ ] E2E tests for admin flows
- [ ] Integration tests for tRPC routes
- [ ] Unit tests for utility functions
- [ ] Manual QA across devices/browsers

**Documentation**:
- [ ] Admin user guide
- [ ] Developer documentation
- [ ] API reference

---

## 6. Technical Decisions & Best Practices

### 6.1 Data Storage: Supabase vs Local

**Decision**: Use Supabase PostgreSQL

**Rationale**:
- **Persistence**: Production-ready, ACID transactions
- **Querying**: Powerful SQL for filtering, aggregation, joins
- **Real-time**: Supabase Realtime for live updates
- **Scalability**: Handles high-volume trace data
- **Multi-tenancy**: RLS for organization isolation
- **Backup**: Automated backups via Supabase

**Trade-offs**:
- Increased database size (mitigated by retention policies)
- Network latency for queries (mitigated by indexing)

**Mitigation**:
- Implement data retention policy (delete traces > 90 days)
- Use indexes on `course_id`, `lesson_id`, `stage`, `created_at`
- Consider partitioning for very large tables (future)

### 6.2 Real-time Updates: Polling vs WebSocket

**Decision**: Supabase Realtime (WebSocket-based)

**Rationale**:
- **Efficiency**: No repeated HTTP requests, lower latency
- **Battery**: Better for mobile devices
- **Scalability**: Server-initiated updates, no polling overhead
- **Developer Experience**: Simple API via Supabase client

**Implementation**:

```typescript
// packages/web/components/generation-monitoring/realtime-provider.tsx

'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

export function useGenerationRealtime(courseId: string) {
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [traces, setTraces] = useState<GenerationTrace[]>([]);

  useEffect(() => {
    const supabase = createClient();

    // Subscribe to course status changes
    const courseChannel = supabase
      .channel(`course:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courses',
          filter: `id=eq.${courseId}`,
        },
        (payload) => {
          setStatus(payload.new.generation_status);
        }
      )
      .subscribe();

    // Subscribe to new traces
    const traceChannel = supabase
      .channel(`traces:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'generation_trace',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          setTraces((prev) => [...prev, payload.new as GenerationTrace]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(courseChannel);
      supabase.removeChannel(traceChannel);
    };
  }, [courseId]);

  return { status, traces };
}
```

### 6.3 Trace Logging: When & What

**When to Log**:
- **Every LLM call**: Input prompt, output completion, tokens, cost
- **Every validation step**: Input, validation result, errors
- **Every transformation**: Input data, output data, duration
- **Every database operation**: Query, result, duration (if > 100ms)
- **Every error**: Full error object, stack trace, context

**What NOT to Log**:
- User authentication tokens
- API keys or secrets
- PII unless necessary (redact if possible)
- Redundant data (don't duplicate entire objects)

**Logging Helper**:

```typescript
// packages/course-gen-platform/src/shared/trace-logger.ts

import { getSupabaseAdmin } from './supabase/admin';
import { logger } from './logger';

interface TraceLogParams {
  courseId: string;
  lessonId?: string;
  stage: string;
  phase: string;
  stepName: string;
  inputData: any;
  outputData?: any;
  errorData?: any;
  modelUsed?: string;
  promptText?: string;
  completionText?: string;
  tokensUsed?: number;
  costUsd?: number;
  temperature?: number;
  durationMs: number;
  retryAttempt?: number;
  wasCached?: boolean;
  qualityScore?: number;
}

export async function logTrace(params: TraceLogParams): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from('generation_trace').insert({
      course_id: params.courseId,
      lesson_id: params.lessonId || null,
      stage: params.stage,
      phase: params.phase,
      step_name: params.stepName,
      input_data: params.inputData,
      output_data: params.outputData || null,
      error_data: params.errorData || null,
      model_used: params.modelUsed || null,
      prompt_text: params.promptText || null,
      completion_text: params.completionText || null,
      tokens_used: params.tokensUsed || null,
      cost_usd: params.costUsd || null,
      temperature: params.temperature || null,
      duration_ms: params.durationMs,
      retry_attempt: params.retryAttempt || 0,
      was_cached: params.wasCached || false,
      quality_score: params.qualityScore || null,
    });

    if (error) {
      logger.error({ error, params }, 'Failed to log generation trace');
    }
  } catch (err) {
    // Don't throw - logging should never crash the app
    logger.error({ err, params }, 'Exception in trace logging');
  }
}

// Usage example in Stage 4 Phase 1:
export async function executePhase1(courseId: string, context: any) {
  const startTime = Date.now();

  try {
    const prompt = buildCategoryPrompt(context);
    const completion = await callLLM(prompt, { model: 'gpt-4-turbo', temperature: 0.3 });

    const durationMs = Date.now() - startTime;

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'phase_1_classification',
      stepName: 'llm_call_category',
      inputData: { prompt_length: prompt.length, rag_chunks: context.ragChunks.length },
      outputData: { category: completion.category, confidence: completion.confidence },
      modelUsed: 'openai/gpt-4-turbo',
      promptText: prompt,
      completionText: JSON.stringify(completion),
      tokensUsed: completion.usage.total_tokens,
      costUsd: calculateCost(completion.usage.total_tokens, 'gpt-4-turbo'),
      temperature: 0.3,
      durationMs,
    });

    return completion;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'phase_1_classification',
      stepName: 'llm_call_category',
      inputData: { prompt_length: prompt.length },
      errorData: { message: error.message, stack: error.stack },
      durationMs,
    });

    throw error;
  }
}
```

#### 6.3.1 Cost Calculation Implementation

**Model Pricing Configuration**:

```typescript
// packages/course-gen-platform/src/shared/llm/model-pricing.ts

/**
 * Model pricing per 1M tokens (USD)
 * Source: OpenRouter pricing page
 * Last updated: 2025-11-25
 */
export const MODEL_PRICING = {
  // GPT-4 family
  'openai/gpt-4-turbo': {
    prompt: 10.0,      // $10 per 1M prompt tokens
    completion: 30.0   // $30 per 1M completion tokens
  },
  'openai/gpt-4o': {
    prompt: 5.0,
    completion: 15.0
  },
  'openai/gpt-4o-mini': {
    prompt: 0.15,
    completion: 0.60
  },

  // Claude family
  'anthropic/claude-3.5-sonnet': {
    prompt: 3.0,
    completion: 15.0
  },
  'anthropic/claude-3-haiku': {
    prompt: 0.25,
    completion: 1.25
  },

  // Open source models
  'meta-llama/llama-3.1-70b-instruct': {
    prompt: 0.35,
    completion: 0.40
  },
  'meta-llama/llama-3.1-8b-instruct': {
    prompt: 0.05,
    completion: 0.08
  },

  // Fallback for unknown models
  'unknown': {
    prompt: 1.0,
    completion: 3.0
  }
} as const;

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Calculate cost for LLM API call
 * @param usage Token usage from LLM response
 * @param modelId OpenRouter model identifier
 * @returns Cost in USD (6 decimal places)
 */
export function calculateCost(usage: TokenUsage, modelId: string): number {
  const pricing = MODEL_PRICING[modelId] || MODEL_PRICING.unknown;

  const promptCost = (usage.prompt_tokens / 1_000_000) * pricing.prompt;
  const completionCost = (usage.completion_tokens / 1_000_000) * pricing.completion;

  return parseFloat((promptCost + completionCost).toFixed(6));
}

/**
 * Format cost for display
 * @param costUsd Cost in USD
 * @returns Formatted string (e.g., "$0.0154")
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.001) return '<$0.001';
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}
```

**Usage in Trace Logging**:

```typescript
import { calculateCost } from '@/shared/llm/model-pricing';

const completion = await callLLM(prompt, { model: 'openai/gpt-4-turbo' });

const cost = calculateCost(
  {
    prompt_tokens: completion.usage.prompt_tokens,
    completion_tokens: completion.usage.completion_tokens,
    total_tokens: completion.usage.total_tokens,
  },
  'openai/gpt-4-turbo'
);

await logTrace({
  // ... other params
  tokensUsed: completion.usage.total_tokens,
  costUsd: cost,
});
```

### 6.4 User Refinement: Prompt Strategy

**Options Evaluated**:

1. **Option A: Append instructions to original prompt**
   - Pros: Simple, preserves original context
   - Cons: May confuse LLM, prompt becomes very long

2. **Option B: Separate refinement prompt with previous content**
   - Pros: Clear task definition, better quality
   - Cons: Slightly more complex prompt engineering

3. **Option C: Two-step approach (critique + rewrite)**
   - Pros: Highest quality, structured feedback
   - Cons: 2x API calls, 2x cost, slower

**Decision**: Option B with structured template

**Rationale**:
- Clear task separation
- LLM understands it's refining, not creating from scratch
- Single API call (cost-effective)
- Good balance of quality and speed

### 6.5 Data Retention Policy

**Problem**: `generation_trace` table grows indefinitely, increasing storage costs and slowing queries.

**Solution**: 90-day retention policy with automated cleanup.

**Implementation**:

#### Option A: PostgreSQL Function + pg_cron

```sql
-- packages/course-gen-platform/supabase/migrations/20251126000000_generation_trace_retention.sql

-- Retention cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_generation_traces()
RETURNS void AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete traces older than 90 days
  DELETE FROM generation_trace
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Log cleanup action to system_metrics
  INSERT INTO system_metrics (
    event_type,
    severity,
    message,
    metadata
  ) VALUES (
    'retention_cleanup',
    'info',
    'Cleaned up old generation traces',
    jsonb_build_object(
      'deleted_count', v_deleted_count,
      'retention_days', 90,
      'cleanup_timestamp', NOW()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule via pg_cron (if available)
-- SELECT cron.schedule('cleanup-traces', '0 2 * * *', 'SELECT cleanup_old_generation_traces()');
```

#### Option B: Supabase Edge Function (Recommended)

```typescript
// packages/course-gen-platform/supabase/functions/cleanup-generation-traces/index.ts

import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Call cleanup function
    const { data, error } = await supabase.rpc('cleanup_old_generation_traces');

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cleanup complete',
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Cleanup failed:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

**Schedule in Supabase Dashboard**:
- Navigate to: Edge Functions → cleanup-generation-traces → Cron Triggers
- Schedule: `0 2 * * *` (daily at 2:00 AM UTC)
- Set environment variable: `CRON_SECRET` (random secret for authentication)

**Alternative: Archive Before Delete**

For compliance or analytics, archive old traces to cold storage before deletion:

```typescript
async function archiveAndCleanup() {
  const supabase = getSupabaseAdmin();

  // 1. Export old traces to JSON
  const { data: oldTraces } = await supabase
    .from('generation_trace')
    .select('*')
    .lt('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

  // 2. Upload to S3 or Supabase Storage
  const archiveFile = `trace-archive-${new Date().toISOString()}.json.gz`;
  await uploadToStorage(archiveFile, gzipCompress(oldTraces));

  // 3. Delete from database
  await supabase.rpc('cleanup_old_generation_traces');

  logger.info({ archiveFile, count: oldTraces.length }, 'Archived and cleaned up old traces');
}
```

**Monitoring**: Add alert in system_metrics when cleanup deletes >10,000 records (indicates unusual volume).

---

## 7. Future Enhancements

### 7.1 Phase 2: Super-Admin Dashboard

**Features**:
- User management (create, edit, delete users)
- Organization management
- System health monitoring
- Usage analytics (courses generated, tokens used, costs)
- Rate limiting configuration
- Model configuration (which models to use per stage)

### 7.2 Phase 3: Semi-Automatic Generation

**Human-in-the-Loop Workflow**:

1. **After Each Stage**: Show results, wait for approval
2. **Approval Options**:
   - ✅ Approve: Continue to next stage
   - 🔄 Regenerate: Try again with different parameters
   - ✏️ Edit: Manually modify results
   - ❌ Cancel: Stop generation

**UI Pattern**:
```
┌─────────────────────────────────────────────────┐
│ Stage 2: Document Processing Complete          │
│                                                 │
│ Results:                                        │
│ - 4 documents classified                       │
│ - 3 HIGH priority, 1 LOW priority              │
│                                                 │
│ Processing Order:                               │
│ 1. machine-learning-guide.pdf (HIGH)           │
│ 2. neural-networks.pdf (HIGH)                  │
│ 3. transformers-explained.pdf (HIGH)           │
│ 4. deep-learning-basics.docx (LOW)             │
│                                                 │
│ Do you want to proceed to Stage 3?             │
│                                                 │
│ [✓ Approve & Continue]  [🔄 Regenerate]        │
│ [✏️ Edit Order]  [❌ Cancel]                    │
└─────────────────────────────────────────────────┘
```

### 7.3 Phase 4: Advanced Analytics

**Metrics**:
- Cost per stage, per lesson, per course
- Token usage trends over time
- Quality score distributions
- Model performance comparison (GPT-4 vs Claude vs others)
- Retry rate by stage/phase
- Generation time optimization opportunities

**Visualizations**:
- Line charts: Cost over time, tokens over time
- Bar charts: Cost by stage, tokens by model
- Heatmaps: Quality scores across lessons
- Funnel charts: Stage completion rates

### 7.4 Phase 5: Export & Sharing

**Export Formats**:
- **JSON**: Full trace data for external analysis
- **CSV**: Tabular data for Excel/Google Sheets
- **PDF**: Human-readable report with visualizations
- **Markdown**: Documentation-friendly format

**Sharing**:
- Generate shareable link with expiry
- Embed code for external dashboards
- Webhook integration (send trace data to external systems)

---

## 8. Risks & Mitigation

### 8.1 Performance Risks

**Risk**: Large trace tables (millions of rows) slow down queries

**Mitigation**:
- Implement data retention policy (90 days)
- Use database partitioning (by month)
- Create optimized indexes
- Use materialized views for aggregations
- Consider archiving to cold storage (S3)

### 8.2 Security Risks

**Risk**: Exposing sensitive data (prompts, user data) in traces

**Mitigation**:
- Implement RLS policies strictly
- Redact PII from traces
- Audit log access to admin pages
- Use HTTPS only
- Regular security reviews

### 8.3 UX Risks

**Risk**: Information overload - too much data confuses users

**Mitigation**:
- Progressive disclosure (collapsed by default)
- Filter/search functionality
- Clear visual hierarchy
- Help tooltips and documentation
- User testing and iteration

### 8.4 Cost Risks

**Risk**: Excessive database storage costs from traces

**Mitigation**:
- Retention policy (auto-delete old traces)
- Compress large text fields (prompts/completions)
- Monitor storage usage in Supabase dashboard
- Alert on unusual growth

---

## 9. Success Metrics

### 9.1 Development Phase

- **Trace Coverage**: 100% of generation steps logged
- **Trace Completeness**: All required fields populated
- **UI Responsiveness**: < 100ms interaction latency
- **Real-time Delay**: < 500ms from database event to UI update
- **Page Load Time**: < 2s on desktop, < 3s on mobile

### 9.2 Production Phase

- **Adoption**: % of generations monitored via admin page
- **Debugging Efficiency**: Time to diagnose issues (target: -50%)
- **User Satisfaction**: Survey feedback from admins/developers
- **System Uptime**: 99.9% availability for monitoring page
- **Data Accuracy**: 0 discrepancies between traces and actual behavior

---

## 10. Appendices

### 10.1 Database Schema Reference

See Section 2.2 for detailed `generation_trace` table schema.

### 10.2 API Endpoints Reference

**tRPC Routes** (under `admin` namespace):

```typescript
// packages/course-gen-platform/src/server/routers/admin.ts

export const adminRouter = router({
  // Get full generation details for a course
  getGenerationDetails: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      // Returns: course, status_history, traces, lessons, lesson_contents
    }),

  // Get paginated trace logs
  getGenerationTrace: protectedProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        lessonId: z.string().uuid().optional(),
        stage: z.string().optional(),
        phase: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      // Returns: traces array, total count
    }),

  // Trigger Stage 6 for specific lesson
  triggerStage6ForLesson: protectedProcedure
    .input(z.object({ lessonId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Creates Stage 6 BullMQ job, returns job_id
    }),

  // Regenerate lesson (fresh attempt)
  regenerateLesson: protectedProcedure
    .input(z.object({ lessonId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Creates new lesson_contents record, triggers Stage 6
    }),

  // Regenerate lesson with user refinement
  regenerateLessonWithRefinement: protectedProcedure
    .input(
      z.object({
        lessonId: z.string().uuid(),
        refinementType: z.enum(['fix', 'add', 'simplify', 'restructure', 'custom']),
        userInstructions: z.string().min(10).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Creates refinement record, triggers Stage 6 with modified prompt
    }),

  // Get generation history (paginated)
  getGenerationHistory: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid().optional(), // superadmin can omit
        status: z.enum(['completed', 'failed', 'cancelled']).optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      // Returns: courses array with aggregated metrics, total count
    }),

  // Export trace data
  exportTraceData: protectedProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        format: z.enum(['json', 'csv']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Returns: download URL (pre-signed S3 URL or data URL)
    }),
});
```

### 10.3 Component Tree

```
AdminGenerationMonitoringPage
├── GenerationOverviewPanel
│   ├── CourseMetadata
│   ├── StatusBadge
│   ├── ProgressIndicator
│   ├── MetricsSummary
│   └── ActionButtons
├── GenerationTimeline
│   └── StageCard[]
│       ├── StageHeader
│       ├── StageProgress
│       └── StageDetailsPanel (collapsible)
│           ├── DocumentList (Stage 2)
│           ├── SummaryList (Stage 3)
│           ├── AnalysisResult (Stage 4)
│           ├── CourseStructure (Stage 5)
│           └── LessonList (Stage 6)
├── TraceViewer
│   ├── FilterBar
│   ├── SearchInput
│   └── TraceAccordion[]
│       └── TraceStep
│           ├── InputSection
│           ├── ProcessSection
│           └── OutputSection
└── ManualStage6Panel (if pause_at_stage_5)
    ├── CourseStructureTree
    │   └── LessonCard[]
    │       ├── LessonMetadata
    │       ├── StatusBadge
    │       └── ActionButtons
    ├── RefinementModal
    │   ├── ContentPreview
    │   ├── RefinementTypeSelector
    │   ├── InstructionsTextarea
    │   └── SubmitButton
    └── BatchActionsToolbar
```

### 10.4 Glossary

- **FSM**: Finite State Machine - PostgreSQL-based state management for generation status
- **RAG**: Retrieval-Augmented Generation - fetching relevant chunks from vector DB for LLM context
- **RLS**: Row-Level Security - PostgreSQL security feature for multi-tenant data isolation
- **Supabase Realtime**: WebSocket-based real-time database change subscriptions
- **BullMQ**: Redis-based job queue for background processing
- **Trace**: Detailed log entry for a single step in the generation pipeline
- **Stage**: High-level phase (Stage 2-6) in the course generation pipeline
- **Phase**: Sub-step within a stage (e.g., Phase 1-5 in Stage 4)
- **Refinement**: User-provided instructions to regenerate a lesson with modifications

---

## Document Sign-off

**Prepared by**: AI Development Team
**Review Status**: ✅ Approved by User
**Version**: 1.1.0 (ADDENDUM integrated)
**Date**: 2025-11-25

**Next Steps**:
1. ✅ User review and feedback - COMPLETED
2. ✅ Integrate ADDENDUM solutions - COMPLETED
3. → Implementation kickoff - READY

**Approved Solutions**:
1. ✅ Data storage approach (Supabase) - Approved
2. ✅ Real-time updates (Supabase Realtime) - Approved
3. ✅ Stage 5 pause mechanism - Approved
4. ✅ User refinement feature - Approved
5. ✅ Hybrid finalization (auto in prod, manual in dev) - Approved
6. ✅ Course structure format with examples - Added
7. ✅ Cost calculation with pricing table - Added
8. ✅ Failed lessons comprehensive UI - Added
9. ✅ Data retention (90 days, Supabase Edge Function) - Added

**Status**: Ready for implementation. All critical requirements covered.

---

**END OF SPECIFICATION**
