# Supabase Database Reference
**MegaCampusAI Platform - Production Database Schema**

**Project:** diqooqbuchsliypgwksu.supabase.co
**Last Updated:** 2025-11-22
**Version:** Stage 8.1 + Stage 4 Analysis + Stage 5 Generation + Stage 6 Lesson Content + Test Infrastructure
**Last Audit:** 2025-11-04 (Overall Health: 82/100 - Good)

---

## Table of Contents
- [Overview](#overview)
- [Core Tables](#core-tables)
- [ENUM Types](#enum-types)
- [RLS Policies](#rls-policies)
- [Functions & RPCs](#functions--rpcs)
- [PostgreSQL Roles](#postgresql-roles)
- [Test Infrastructure](#test-infrastructure)
- [Quick Reference](#quick-reference)

---

## Overview

**Architecture:** Multi-tenant LMS with course generation capabilities
**Multi-tenancy:** Organization-based with RLS enforcement
**Authentication:** Supabase Auth + Custom JWT claims (role, organization_id)
**RLS Coverage:** 100% - all tables protected

**Key Features:**
- 6-stage course generation pipeline:
  - Stage 2: Document Processing (parsing, classification)
  - Stage 3: Summarization (hierarchical/full-text)
  - Stage 4: Multi-phase Analysis (LangChain + OpenRouter)
  - Stage 5: Structure Generation (sections, lessons)
  - Stage 6: Lesson Content Generation (LLM Judge System with multi-model voting)
- Document processing with deduplication & summarization
- Document priority classification (course_core, supplementary, reference, regulatory)
- BullMQ job tracking with progress updates
- Generation locks for concurrent stage execution
- RAG context caching for lesson content generation
- Generation status audit trail
- System metrics & monitoring (including LLM phase and JSON repair tracking)

**PostgreSQL Roles:**
- `student`, `instructor`, `admin` - Application roles (inherit from `authenticated`)
- `authenticator` - PostgREST role with permission to switch roles based on JWT
- **Important:** PostgREST automatically executes `SET ROLE <jwt.role>` on each request

---

## Core Tables

### 1. `organizations`
**Purpose:** Top-level tenant with tier-based quotas

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | PK |
| name | TEXT | - | Unique |
| subscription_tier | ENUM(subscription_tier) | 'free' | trial/free/basic/standard/premium |
| storage_quota_bytes | BIGINT | 10485760 | 10MB for free tier |
| storage_used_bytes | BIGINT | 0 | Current usage |

**Constraints:** `storage_used_bytes <= storage_quota_bytes`

---

### 2. `users`
**Purpose:** User accounts linked to Supabase Auth

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | auth.uid() | PK, links to auth.users |
| email | TEXT | - | Unique |
| organization_id | UUID | - | FK → organizations.id |
| role | ENUM(role) | 'student' | admin/instructor/student |

**Special:** Auto-created on signup via `handle_new_user()` trigger

---

### 3. `courses`
**Purpose:** Course entities with generation tracking

**Core Fields:**
- `id`, `title`, `slug`, `user_id`, `organization_id`
- `status` - ENUM(course_status): draft/published/archived
- `settings` - JSONB course configuration

**Generation Tracking:**
- `generation_status` - ENUM(generation_status), NULL = never started
- `generation_progress` - JSONB 5-step progress tracking
- `analysis_result` - **JSONB Stage 4 analysis output** - See dedicated section below for full schema
  - Phase 1: `course_category`, `contextual_language`
  - Phase 2: `topic_analysis` (main_topics, subtopics, difficulty_level, estimated_duration)
  - Phase 3: `recommended_structure` (sections, lessons, totals)
  - Phase 4: `pedagogical_strategy`, `scope_instructions`, `research_flags`
  - Metadata: `analysis_version`, `generated_at`, `model_used`, `quality_score`
- `generation_metadata` - **JSONB Stage 5 generation tracking** - Added 2025-11-08
  - `model_used`: {metadata: string, sections: string, validation?: string}
  - `total_tokens`: {metadata: number, sections: number, validation: number, total: number}
  - `cost_usd`: number (total generation cost)
  - `duration_ms`: {metadata: number, sections: number, validation: number, total: number}
  - `quality_scores`: {metadata_similarity: number, sections_similarity: number[], overall: number}
  - `batch_count`: number (= total_sections, SECTIONS_PER_BATCH = 1)
  - `retry_count`: {metadata: number, sections: number[]}
  - `created_at`: string (ISO 8601 timestamp)
- `generation_started_at`, `generation_completed_at`, `last_progress_update`
- `error_message`, `error_details`

**Content Metadata:**
- `course_description`, `course_structure`, `learning_outcomes`
- `prerequisites`, `target_audience`, `language`, `difficulty`, `style`
- `total_sections_count`, `total_lessons_count`
- `estimated_sections`, `estimated_lessons`, `estimated_completion_minutes`

---

### 4. `llm_model_config`
**Purpose:** Per-phase LLM model configuration for Stage 4 analysis
**Added:** Stage 4 (2025-11-01)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| config_type | TEXT | 'global' or 'course_override' |
| course_id | UUID | FK → courses.id (NULL for global) |
| phase_name | TEXT | 'phase_1_classification', 'phase_2_scope', 'phase_3_expert', 'phase_4_synthesis', 'emergency' |
| model_id | TEXT | OpenRouter model ID (e.g., 'openai/gpt-oss-20b') |
| fallback_model_id | TEXT | Fallback model for quality escalation |
| temperature | NUMERIC(3,2) | Default: 0.7, Range: 0-2 |
| max_tokens | INTEGER | Default: 4096, Range: 1-200000 |

**Global Defaults (5 rows):**
- phase_1_classification: 20B → 120B (fallback)
- phase_2_scope: 20B → 120B (fallback)
- phase_3_expert: 120B → Gemini 2.5 Flash (always 120B for quality)
- phase_4_synthesis: 20B → 120B (adaptive logic overrides)
- emergency: Gemini 2.5 Flash (no fallback)

---

### 5. `sections`
**Purpose:** Logical groupings within courses

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| course_id | UUID | FK → courses.id (CASCADE) |
| title | TEXT | Required |
| order_index | INTEGER | Unique per course |

---

### 6. `lessons`
**Purpose:** Individual learning units

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| section_id | UUID | FK → sections.id (CASCADE) |
| title | TEXT | Required |
| order_index | INTEGER | Unique per section |
| duration_minutes | INTEGER | NULL or > 0 |
| lesson_type | ENUM(lesson_type) | video/text/quiz/interactive/assignment |
| status | ENUM(lesson_status) | draft/published/archived |

---

### 7. `lesson_content`
**Purpose:** Heavy content separated for performance

| Column | Type | Notes |
|--------|------|-------|
| lesson_id | UUID | PK, FK → lessons.id (CASCADE) |
| text_content | TEXT | Main text |
| media_urls | TEXT[] | Media references |
| quiz_data | JSONB | Quiz configuration |
| interactive_elements | JSONB | Interactive components |

---

### 8. `file_catalog`
**Purpose:** Uploaded files with RAG vector status & Stage 3 summarization

**File Identity:**
- `id`, `organization_id`, `course_id`, `filename`, `file_type`, `file_size`
- `storage_path`, `hash` (SHA-256 for deduplication), `mime_type`

**Processing:**
- `vector_status` - ENUM: pending/indexing/indexed/failed
- `chunk_count` - Number of chunks (parent + child) generated
- `error_message` - Error from last processing attempt
- `parsed_content` - JSONB DoclingDocument
- `markdown_content` - TEXT converted Markdown

**Stage 3 Summarization:**
- `processed_content` - TEXT LLM-generated summary or full text
- `processing_method` - VARCHAR(50): 'full_text' or 'hierarchical'
- `summary_metadata` - JSONB: processing_timestamp, input_tokens, output_tokens, total_tokens, estimated_cost_usd, model_used, quality_score, quality_check_passed, retry_attempts, detected_language, etc.

**Deduplication:**
- `reference_count` - Default: 1
- `original_file_id` - FK → file_catalog.id (self-reference)

---

### 9. `course_enrollments`
**Purpose:** Student course access & progress

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users.id |
| course_id | UUID | FK → courses.id |
| status | ENUM(enrollment_status) | active/completed/dropped/expired |
| progress | JSONB | {lessons_completed: [], last_accessed: null} |

**Constraint:** `user_id + course_id` unique

---

### 10. `job_status`
**Purpose:** BullMQ job tracking

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| job_id | TEXT | Unique BullMQ ID |
| job_type | TEXT | e.g., 'course_generation' |
| organization_id | UUID | Required for multi-tenancy |
| course_id | UUID | Nullable for org-level jobs |
| user_id | UUID | Who initiated |
| status | ENUM(job_status_enum) | pending/waiting/active/completed/failed/delayed |
| progress | JSONB | {percentage, current_step, ...} |
| error_message | TEXT | Human-readable |
| attempts | INTEGER | Default: 0 |
| max_attempts | INTEGER | Default: 3 |

---

### 11. `system_metrics`
**Purpose:** Critical system events for monitoring

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| event_type | ENUM(metric_event_type) | 6 types: job_rollback, orphaned_job_recovery, concurrency_limit_hit, worker_timeout, rpc_retry_exhausted, duplicate_job_detected |
| severity | ENUM(metric_severity) | info/warn/error/fatal |
| user_id | UUID | FK → auth.users.id |
| course_id | UUID | FK → courses.id |
| metadata | JSONB | Event-specific data |

---

### 12. `generation_status_history`
**Purpose:** Audit trail for generation status transitions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| course_id | UUID | FK → courses.id |
| old_status | ENUM(generation_status) | Previous state |
| new_status | ENUM(generation_status) | New state |
| changed_at | TIMESTAMPTZ | When |
| changed_by | UUID | FK → auth.users.id |
| trigger_source | TEXT | 'rpc'/'worker'/'manual'/'system' |
| metadata | JSONB | Transition context |

---

### 13. `generation_locks`
**Purpose:** Distributed locks for stage-based generation to prevent concurrent execution
**Added:** Stage 6 (2025-11-22)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | PK |
| course_id | UUID | - | FK -> courses.id |
| stage | ENUM(generation_stage) | - | stage4/stage5/stage6 |
| worker_id | TEXT | - | Unique worker identifier |
| locked_at | TIMESTAMPTZ | NOW() | When lock was acquired |
| expires_at | TIMESTAMPTZ | - | Lock expiration time |

**Usage:**
- Prevents multiple workers from processing the same stage simultaneously
- Auto-cleanup via `cleanup_expired_generation_locks()` function
- TTL-based expiration for crash recovery

**Related Functions:**
- `acquire_generation_lock()` - Atomically acquire a lock
- `release_generation_lock()` - Release a lock
- `check_generation_lock()` - Check lock status
- `cleanup_expired_generation_locks()` - Remove expired locks

---

### 14. `lesson_contents`
**Purpose:** Generated lesson content from Stage 6 LLM Judge System
**Added:** Stage 6 (2025-11-22)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | PK |
| lesson_id | UUID | - | FK -> lessons.id (unique) |
| course_id | UUID | - | FK -> courses.id |
| content | JSONB | '{}' | Generated lesson content |
| status | ENUM(lesson_content_status) | 'pending' | pending/generating/completed/failed/review_required |
| metadata | JSONB | '{}' | Generation metadata (models, tokens, scores) |
| created_at | TIMESTAMPTZ | NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOW() | Last update timestamp |

**Content JSONB Structure:**
```json
{
  "title": "Lesson Title",
  "sections": [
    {
      "heading": "Section Heading",
      "content": "Markdown content...",
      "type": "theory|example|exercise"
    }
  ],
  "summary": "Brief lesson summary",
  "key_points": ["Point 1", "Point 2"],
  "estimated_duration_minutes": 15
}
```

**Metadata JSONB Structure:**
```json
{
  "generation_timestamp": "2025-11-22T12:00:00Z",
  "models_used": ["gpt-4o", "claude-3-sonnet", "gemini-2-flash"],
  "total_tokens": 5000,
  "quality_score": 0.92,
  "judge_votes": {
    "model_1": "approve",
    "model_2": "approve",
    "model_3": "refine"
  },
  "refinement_iterations": 1
}
```

---

### 15. `rag_context_cache`
**Purpose:** Cache RAG context chunks for lesson content generation
**Added:** Stage 6 (2025-11-22)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| context_id | UUID | gen_random_uuid() | PK |
| course_id | UUID | - | FK -> courses.id |
| lesson_id | UUID | - | FK -> lessons.id |
| query_params | JSONB | - | Query parameters used |
| chunks | JSONB | - | Cached context chunks |
| created_at | TIMESTAMPTZ | NOW() | Cache creation time |
| expires_at | TIMESTAMPTZ | - | Cache expiration time |

**Query Params JSONB Structure:**
```json
{
  "query": "lesson topic query",
  "top_k": 10,
  "similarity_threshold": 0.7,
  "document_filters": ["file_id_1", "file_id_2"]
}
```

**Chunks JSONB Structure:**
```json
[
  {
    "chunk_id": "uuid",
    "content": "Chunk text content...",
    "score": 0.85,
    "metadata": {
      "file_id": "uuid",
      "page": 5,
      "section": "Introduction"
    }
  }
]
```

---

### 16. `document_priorities`
**Purpose:** Document classification and priority ordering from Stage 2
**Added:** Stage 2 Classification Phase (2025-11-22)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | PK |
| file_id | UUID | - | FK -> file_catalog.id (unique) |
| course_id | UUID | - | FK -> courses.id |
| organization_id | UUID | - | FK -> organizations.id |
| category | ENUM(document_category) | - | course_core/supplementary/reference/regulatory |
| priority | TEXT | - | Priority level (high/medium/low) |
| importance_score | NUMERIC | - | 0-100 importance score |
| order | INTEGER | - | Processing order within course |
| classification_rationale | TEXT | - | LLM explanation for classification |
| classified_at | TIMESTAMPTZ | NOW() | Classification timestamp |
| created_at | TIMESTAMPTZ | NOW() | Record creation |
| updated_at | TIMESTAMPTZ | NOW() | Last update |

**Category Definitions:**
- `course_core` - Primary course materials (textbooks, main lectures)
- `supplementary` - Supporting materials (exercises, examples)
- `reference` - Reference documentation (APIs, specifications)
- `regulatory` - Compliance/legal documents (standards, policies)

---

### Transactional Outbox Tables

#### `job_outbox`
**Purpose:** Outbox pattern for atomic FSM + job creation

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| outbox_id | UUID | gen_random_uuid() | PK |
| entity_id | UUID | - | FK → courses.id (CASCADE) |
| queue_name | VARCHAR(100) | - | BullMQ queue name |
| job_data | JSONB | '{}' | Job payload |
| job_options | JSONB | '{}' | Priority, delay, etc. |
| created_at | TIMESTAMPTZ | NOW() | Creation time |
| processed_at | TIMESTAMPTZ | NULL | NULL = pending |
| attempts | INTEGER | 0 | Retry attempts |
| last_error | TEXT | NULL | Last failure reason |
| last_attempt_at | TIMESTAMPTZ | NULL | Last processing time |

**Indexes:**
- `idx_job_outbox_unprocessed` (created_at) WHERE processed_at IS NULL - Performance optimization
- `idx_job_outbox_entity` (entity_id) - FK index
- `idx_job_outbox_cleanup` (processed_at) WHERE processed_at IS NOT NULL - Cleanup queries

**RLS:** System-only access (no user queries) - job_outbox_system_only policy

**Lifecycle:**
1. Created atomically with FSM state via `initialize_fsm_with_outbox()` RPC
2. Background processor polls every 1-30 seconds (adaptive)
3. Creates BullMQ job and sets `processed_at`
4. Cleaned up by pg_cron (>30 days old)

---

#### `idempotency_keys`
**Purpose:** Request deduplication for FSM initialization

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| key | VARCHAR(255) | - | PK, unique request identifier |
| result | JSONB | '{}' | Cached RPC response |
| created_at | TIMESTAMPTZ | NOW() | Creation time |
| expires_at | TIMESTAMPTZ | NOW() + 24h | Expiration time |
| entity_id | UUID | NULL | FK → courses.id (CASCADE) |

**Indexes:**
- Primary key on `key`
- `idx_idempotency_expires` (expires_at) - Cleanup queries
- `idx_idempotency_entity` (entity_id) - FK index

**RLS:** System-only access - idempotency_keys_system_only policy

**Lifecycle:**
1. Created by `initialize_fsm_with_outbox()` on first request
2. Subsequent requests return cached result (48-hour TTL)
3. Cleaned up by pg_cron (after expires_at)
4. Also cached in Redis (24-hour TTL) for fast path

**Idempotency Strategy:**
- **Layer 1:** Redis cache (1-2ms lookup)
- **Layer 2:** Database lookup (10-20ms)
- **Layer 3:** Redis cache write (for future requests)

---

#### `fsm_events`
**Purpose:** FSM state transition audit trail

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| event_id | UUID | gen_random_uuid() | PK |
| entity_id | UUID | - | FK → courses.id (CASCADE) |
| event_type | VARCHAR(50) | - | Event classification |
| event_data | JSONB | '{}' | Event details |
| created_at | TIMESTAMPTZ | NOW() | Event timestamp |
| created_by | VARCHAR(20) | - | API/QUEUE/WORKER |
| user_id | UUID | NULL | FK → auth.users.id (SET NULL) |

**Indexes:**
- `idx_fsm_events_entity` (entity_id, created_at DESC) - Audit queries
- `idx_fsm_events_type` (event_type) - Event filtering

**RLS:**
- fsm_events_user_read: Users can read their own events
- fsm_events_system_write: Block direct INSERT (service_role only)

**Lifecycle:**
1. Created on every FSM state change
2. Provides complete audit trail
3. Never deleted (immutable log)

**Usage Example:**
```sql
-- Get FSM history for course
SELECT event_type, event_data, created_by, created_at
FROM fsm_events
WHERE entity_id = 'course-uuid'
ORDER BY created_at DESC;
```

---

## Analysis Result Field (courses.analysis_result)

### Overview

The `analysis_result` JSONB field in the `courses` table stores the comprehensive output from the Stage 4 multi-phase LangChain analysis workflow. This field contains AI-generated course planning metadata that drives the content generation process.

### Schema Version

**Current Version**: 4.0 (as of Stage 4 implementation, 2025-11-01)

### Field Structure

```typescript
interface AnalysisResult {
  // Phase 1: Classification Output
  course_category: string;           // e.g., "Programming", "Business", "Design", "Science"
  contextual_language: string;       // Primary language/framework (e.g., "Python", "JavaScript", "React")

  // Phase 2: Scope Analysis Output
  topic_analysis: {
    main_topics: string[];           // 3-7 primary topics covered in the course
    subtopics: string[];             // 10-20 detailed subtopic breakdown
    difficulty_level: "beginner" | "intermediate" | "advanced" | "expert";
    estimated_duration: string;      // Human-readable estimate (e.g., "4-6 hours", "2-3 weeks")
  };

  // Phase 3: Expert Synthesis Output
  recommended_structure: {
    sections: Array<{
      title: string;                 // Section heading
      lessons: Array<{
        title: string;               // Lesson title
        type: "video" | "text" | "quiz" | "interactive" | "assignment";
        duration_minutes: number;    // Estimated time to complete
      }>;
    }>;
    total_sections: number;          // Count of top-level sections
    total_lessons: number;           // Count of all lessons across sections
  };

  // Phase 4: Strategy & Scope Output
  pedagogical_strategy: {
    teaching_style: string;          // e.g., "hands-on", "theoretical", "project-based", "lecture-style"
    learning_outcomes: string[];     // 5-10 measurable learning objectives
    prerequisites: string[];         // Required prior knowledge/skills
    target_audience: string;         // e.g., "junior developers", "absolute beginners", "professionals"
  };

  scope_instructions: {
    content_depth: string;           // Guidance on how deep to explore topics
    practical_examples: boolean;     // Should include code/practical examples
    exercises_needed: boolean;       // Should include practice exercises
    real_world_projects: boolean;    // Should include real-world project work
  };

  research_flags: {
    needs_current_info: boolean;     // Requires up-to-date/current information
    reference_docs_needed: string[]; // Specific documentation to reference
    external_resources: string[];    // Recommended external learning materials
  };

  // System Metadata
  analysis_version: string;          // Schema version (e.g., "4.0")
  generated_at: string;              // ISO 8601 timestamp of generation
  model_used: {
    phase_1: string;                 // OpenRouter model ID for classification
    phase_2: string;                 // OpenRouter model ID for scope analysis
    phase_3: string;                 // OpenRouter model ID for expert synthesis
    phase_4: string;                 // OpenRouter model ID for strategy
  };
  quality_score: number;             // 0-100 quality assessment by final validation
}
```

### Example Value

```json
{
  "course_category": "Programming",
  "contextual_language": "TypeScript",
  "topic_analysis": {
    "main_topics": ["React Hooks", "State Management", "Component Lifecycle", "Performance Optimization"],
    "subtopics": [
      "useState Hook", "useEffect Hook", "useContext Hook", "useReducer Hook",
      "Custom Hooks", "Hook Rules", "Dependency Arrays", "Cleanup Functions",
      "Context API", "Redux Basics", "React Query", "useMemo", "useCallback"
    ],
    "difficulty_level": "intermediate",
    "estimated_duration": "6-8 hours"
  },
  "recommended_structure": {
    "sections": [
      {
        "title": "Introduction to React Hooks",
        "lessons": [
          { "title": "What are Hooks?", "type": "video", "duration_minutes": 15 },
          { "title": "Rules of Hooks", "type": "text", "duration_minutes": 10 },
          { "title": "Quiz: Hooks Basics", "type": "quiz", "duration_minutes": 5 }
        ]
      },
      {
        "title": "State Hooks: useState and useReducer",
        "lessons": [
          { "title": "useState Deep Dive", "type": "text", "duration_minutes": 30 },
          { "title": "useReducer for Complex State", "type": "video", "duration_minutes": 25 },
          { "title": "Exercise: Todo List with Hooks", "type": "assignment", "duration_minutes": 45 }
        ]
      },
      {
        "title": "Effect Hooks and Side Effects",
        "lessons": [
          { "title": "useEffect Fundamentals", "type": "text", "duration_minutes": 20 },
          { "title": "Cleanup Functions", "type": "video", "duration_minutes": 15 },
          { "title": "Dependency Arrays", "type": "text", "duration_minutes": 15 }
        ]
      }
    ],
    "total_sections": 5,
    "total_lessons": 23
  },
  "pedagogical_strategy": {
    "teaching_style": "hands-on",
    "learning_outcomes": [
      "Build custom React hooks for reusable logic",
      "Manage complex application state with useReducer",
      "Optimize component performance with useMemo and useCallback",
      "Implement proper effect cleanup to prevent memory leaks",
      "Choose appropriate hooks for different state management scenarios"
    ],
    "prerequisites": [
      "JavaScript ES6+ (arrow functions, destructuring, spread operator)",
      "Basic React knowledge (components, props, JSX)",
      "Understanding of asynchronous JavaScript (Promises, async/await)"
    ],
    "target_audience": "intermediate developers with React experience"
  },
  "scope_instructions": {
    "content_depth": "deep - include advanced patterns and edge cases",
    "practical_examples": true,
    "exercises_needed": true,
    "real_world_projects": true
  },
  "research_flags": {
    "needs_current_info": true,
    "reference_docs_needed": [
      "React Official Documentation",
      "React Hooks RFC",
      "React TypeScript Cheatsheet"
    ],
    "external_resources": [
      "useHooks.com - Collection of React Hooks",
      "React Patterns - Community Patterns",
      "Kent C. Dodds Blog - React Best Practices"
    ]
  },
  "analysis_version": "4.0",
  "generated_at": "2025-11-01T12:34:56Z",
  "model_used": {
    "phase_1": "openai/gpt-oss-20b",
    "phase_2": "openai/gpt-oss-20b",
    "phase_3": "openai/gpt-oss-120b",
    "phase_4": "openai/gpt-oss-20b"
  },
  "quality_score": 92
}
```

### Usage Examples

#### TypeScript Client Query

```typescript
import { Database } from './types/supabase';
type AnalysisResult = Database['public']['Tables']['courses']['Row']['analysis_result'];

// Query with type safety
const { data: course } = await supabase
  .from('courses')
  .select('id, title, analysis_result')
  .eq('id', courseId)
  .single();

if (course?.analysis_result) {
  const analysis = course.analysis_result as AnalysisResult;

  // Access nested fields with autocomplete
  console.log('Category:', analysis.course_category);
  console.log('Main Topics:', analysis.topic_analysis.main_topics);
  console.log('Total Lessons:', analysis.recommended_structure.total_lessons);
  console.log('Teaching Style:', analysis.pedagogical_strategy.teaching_style);
}
```

#### Filter by Category (JSONB Operator)

```typescript
// Find all programming courses
const { data: programmingCourses } = await supabase
  .from('courses')
  .select('id, title, analysis_result')
  .eq('analysis_result->course_category', 'Programming');

// Find courses requiring specific prerequisites
const { data: advancedCourses } = await supabase
  .from('courses')
  .select('*')
  .eq('analysis_result->topic_analysis->difficulty_level', 'advanced');
```

#### PostgreSQL JSON Query

```sql
-- Get all courses with their categories
SELECT
  id,
  title,
  analysis_result->>'course_category' AS category,
  analysis_result->'topic_analysis'->>'difficulty_level' AS difficulty
FROM courses
WHERE analysis_result IS NOT NULL;

-- Find courses with high quality scores
SELECT
  id,
  title,
  (analysis_result->>'quality_score')::numeric AS quality
FROM courses
WHERE (analysis_result->>'quality_score')::numeric >= 90;

-- Extract all main topics across all courses
SELECT
  id,
  title,
  jsonb_array_elements_text(
    analysis_result->'topic_analysis'->'main_topics'
  ) AS main_topic
FROM courses
WHERE analysis_result IS NOT NULL;
```

### Database Index

A GIN index exists for efficient JSONB queries:

```sql
CREATE INDEX idx_courses_analysis_result_gin
ON courses USING gin (analysis_result);
```

**Index Status** (as of 2025-11-04 audit):
- Status: Currently unused (0 scans)
- Reason: Limited query patterns in early stage
- Recommendation: Keep index for future query needs as data scales

### Integration with Course Generation

The `analysis_result` field drives the course generation process:

1. **Stage 4 (Analysis)**: Populates this field via 4-phase LangChain workflow
2. **Stage 5 (Structure)**: Reads `recommended_structure` to create sections and lessons
3. **Stage 6 (Content)**: Uses `pedagogical_strategy` and `scope_instructions` to guide content generation
4. **Stage 7 (Enrichment)**: References `research_flags` to determine if external research is needed

### Validation

The field is validated at the application layer before saving:

```typescript
// Zod schema for validation
const AnalysisResultSchema = z.object({
  course_category: z.string(),
  contextual_language: z.string(),
  topic_analysis: z.object({
    main_topics: z.array(z.string()),
    subtopics: z.array(z.string()),
    difficulty_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
    estimated_duration: z.string(),
  }),
  recommended_structure: z.object({
    sections: z.array(z.object({
      title: z.string(),
      lessons: z.array(z.object({
        title: z.string(),
        type: z.enum(['video', 'text', 'quiz', 'interactive', 'assignment']),
        duration_minutes: z.number(),
      })),
    })),
    total_sections: z.number(),
    total_lessons: z.number(),
  }),
  pedagogical_strategy: z.object({
    teaching_style: z.string(),
    learning_outcomes: z.array(z.string()),
    prerequisites: z.array(z.string()),
    target_audience: z.string(),
  }),
  scope_instructions: z.object({
    content_depth: z.string(),
    practical_examples: z.boolean(),
    exercises_needed: z.boolean(),
    real_world_projects: z.boolean(),
  }),
  research_flags: z.object({
    needs_current_info: z.boolean(),
    reference_docs_needed: z.array(z.string()),
    external_resources: z.array(z.string()),
  }),
  analysis_version: z.string(),
  generated_at: z.string(),
  model_used: z.object({
    phase_1: z.string(),
    phase_2: z.string(),
    phase_3: z.string(),
    phase_4: z.string(),
  }),
  quality_score: z.number().min(0).max(100),
});
```

### Migration History

- **2025-11-01**: Field added via `20251101082704_stage4_analysis_fields.sql`
- **2025-11-01**: GIN index created for efficient JSONB queries

---

## ENUM Types

### `subscription_tier` / `tier`
**Values:** `trial`, `free`, `basic`, `standard`, `premium`

### `role`
**Values:** `admin`, `superadmin`, `instructor`, `student`

### `course_status`
**Values:** `draft`, `published`, `archived`

### `generation_status`
**Values:** (Updated for 6-stage pipeline)
- `pending` - Queued, waiting to start
- `stage_2_init` - Stage 2: Document processing initialization
- `stage_2_processing` - Stage 2: Processing uploaded files
- `stage_2_complete` - Stage 2: Document processing complete
- `stage_3_init` - Stage 3: Summarization initialization
- `stage_3_summarizing` - Stage 3: Summarizing documents
- `stage_3_complete` - Stage 3: Summarization complete
- `stage_4_init` - Stage 4: Analysis initialization
- `stage_4_analyzing` - Stage 4: Analyzing with LLM
- `stage_4_complete` - Stage 4: Analysis complete
- `stage_5_init` - Stage 5: Structure generation initialization
- `stage_5_generating` - Stage 5: Generating course structure
- `stage_5_complete` - Stage 5: Structure generation complete
- `finalizing` - Final processing
- `completed` - Generation finished successfully
- `failed` - Generation failed with error
- `cancelled` - User cancelled generation

**State Machine Transitions:**

**Full Workflow (with documents):**
```
pending → stage_2_init → stage_2_processing → stage_2_complete →
stage_3_init → stage_3_summarizing → stage_3_complete →
stage_4_init → stage_4_analyzing → stage_4_complete →
stage_5_init → stage_5_generating → stage_5_complete →
finalizing → completed
```

**Stage 4 Only (Analysis):**
```
pending → stage_4_init → stage_4_analyzing → stage_4_complete
```

**Stage 5 Only (Generation - title-only scenario):**
```
pending → stage_5_init → stage_5_generating → stage_5_complete →
finalizing → completed
```

**Error Recovery:**
```
Any step → {failed | cancelled}
{completed | failed | cancelled} → pending (retry)
```

**Valid State Transitions Table:**

| From | To |
|------|-----|
| `pending` | `stage_2_init`, `stage_4_init`, `stage_5_init`, `cancelled` |
| `stage_2_init` | `stage_2_processing`, `failed`, `cancelled` |
| `stage_2_processing` | `stage_2_complete`, `failed`, `cancelled` |
| `stage_2_complete` | `stage_3_init`, `failed`, `cancelled` |
| `stage_3_init` | `stage_3_summarizing`, `failed`, `cancelled` |
| `stage_3_summarizing` | `stage_3_complete`, `failed`, `cancelled` |
| `stage_3_complete` | `stage_4_init`, `failed`, `cancelled` |
| `stage_4_init` | `stage_4_analyzing`, `failed`, `cancelled` |
| `stage_4_analyzing` | `stage_4_complete`, `failed`, `cancelled` |
| `stage_4_complete` | `stage_5_init`, `failed`, `cancelled` |
| `stage_5_init` | `stage_5_generating`, `failed`, `cancelled` |
| `stage_5_generating` | `stage_5_complete`, `failed`, `cancelled` |
| `stage_5_complete` | `finalizing`, `failed`, `cancelled` |
| `finalizing` | `completed`, `failed`, `cancelled` |
| `completed` | `pending` (retry) |
| `failed` | `pending` (retry) |
| `cancelled` | `pending` (retry) |

### `generation_stage`
**Values:** `stage4`, `stage5`, `stage6`
**Purpose:** Identifies which generation stage a lock or operation belongs to
**Added:** Stage 6 (2025-11-22)

### `lesson_content_status`
**Values:** `pending`, `generating`, `completed`, `failed`, `review_required`
**Purpose:** Tracks the generation status of individual lesson content
**Added:** Stage 6 (2025-11-22)

| Value | Description |
|-------|-------------|
| `pending` | Content not yet generated |
| `generating` | LLM generation in progress |
| `completed` | Content generated and approved by Judge System |
| `failed` | Generation failed after retries |
| `review_required` | Content needs human review (low quality score) |

### `document_category`
**Values:** `course_core`, `supplementary`, `reference`, `regulatory`
**Purpose:** Classification of uploaded documents for processing priority
**Added:** Stage 2 Classification Phase (2025-11-22)

| Value | Description | Priority |
|-------|-------------|----------|
| `course_core` | Primary course materials (textbooks, main lectures) | Highest |
| `supplementary` | Supporting materials (exercises, examples) | Medium |
| `reference` | Reference documentation (APIs, specifications) | Low |
| `regulatory` | Compliance/legal documents (standards, policies) | Variable |

### `job_status_enum`
**Values:** `pending`, `waiting`, `active`, `completed`, `failed`, `delayed`

### `lesson_type`
**Values:** `video`, `text`, `quiz`, `interactive`, `assignment`

### `lesson_status`
**Values:** `draft`, `published`, `archived`

### `enrollment_status`
**Values:** `active`, `completed`, `dropped`, `expired`

### `vector_status`
**Values:** `pending`, `indexing`, `indexed`, `failed`

### `metric_event_type`
**Values:** (Updated 2025-11-22)
- `job_rollback` - Job was rolled back
- `orphaned_job_recovery` - Recovered an orphaned job
- `concurrency_limit_hit` - Concurrency limit reached
- `worker_timeout` - Worker timed out
- `rpc_retry_exhausted` - RPC retries exhausted
- `duplicate_job_detected` - Duplicate job detected
- `llm_phase_execution` - **NEW** LLM phase execution metrics
- `json_repair_execution` - **NEW** JSON repair operation metrics

### `metric_severity`
**Values:** `info`, `warn`, `error`, `fatal`

---

## RLS Policies

**Pattern:** Role-based with JWT claims (`auth.jwt()`)
**Claim Keys:** `role`, `organization_id`, `sub` (auth.uid())

### RLS Recursion Fix (SECURITY DEFINER Pattern)

**Problem:** Circular dependencies between policies cause infinite recursion

**Example of the bug:**
```
1. RLS policy on `courses` table calls → is_superadmin(auth.uid())
2. Function is_superadmin() queries → users table
3. RLS policy on `users` table calls → is_superadmin(auth.uid())
4. Infinite loop → PostgreSQL error: "stack depth limit exceeded"
```

**Solution:** SECURITY DEFINER helper functions that bypass RLS
- Helper functions execute without RLS checks (run with definer's privileges)
- Policies call helpers instead of direct subqueries
- Breaks circular dependency chain
- **Migration Applied:** `fix_is_superadmin_security_definer` (2025-11-08)

**Key Functions Using This Pattern:**
- `is_superadmin(user_id)` - Most critical, used in nearly all RLS policies
- `is_enrolled_in_course(user_id, course_id)` - Prevents enrollment check recursion
- All other RLS helper functions listed below

### Unified RLS Pattern

Most tables use **single unified policy** with CASE expressions:

```sql
-- Example: courses_all (using SECURITY DEFINER helper)
POLICY "courses_all" ON courses
FOR ALL TO authenticated
USING (
  CASE (auth.jwt() ->> 'role')
    WHEN 'admin' THEN
      organization_id = (auth.jwt() ->> 'organization_id')::uuid
    WHEN 'instructor' THEN
      organization_id = (auth.jwt() ->> 'organization_id')::uuid
    WHEN 'student' THEN
      is_enrolled_in_course(auth.uid(), id)  -- SECURITY DEFINER helper
    ELSE false
  END
)
WITH CHECK (
  CASE (auth.jwt() ->> 'role')
    WHEN 'admin' THEN
      organization_id = (auth.jwt() ->> 'organization_id')::uuid
    WHEN 'instructor' THEN
      user_id = auth.uid() AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
    ELSE false
  END
);
```

**Tables with unified policy:**
- `organizations_all`, `courses_all`, `sections_all`, `lessons_all`
- `lesson_content_all`, `file_catalog_all`, `course_enrollments_all`, `job_status_all`

### llm_model_config RLS Policies (Stage 4)

**Purpose:** Control access to per-phase LLM model configurations

**Policies:**
1. **`superadmin_all`** - SuperAdmin can manage all configurations (global + course overrides)
2. **`read_global`** - All authenticated users can read global defaults
3. **`read_course_override`** - Users can read course overrides for their organization's courses

```sql
-- SuperAdmin full access
POLICY "superadmin_all" ON llm_model_config
FOR ALL TO authenticated
USING ((auth.jwt() ->> 'role') = 'superadmin')
WITH CHECK ((auth.jwt() ->> 'role') = 'superadmin');

-- Read global defaults (all authenticated users)
POLICY "read_global" ON llm_model_config
FOR SELECT TO authenticated
USING (config_type = 'global');

-- Read course overrides (organization isolation)
POLICY "read_course_override" ON llm_model_config
FOR SELECT TO authenticated
USING (
  config_type = 'course_override' AND
  course_belongs_to_org(course_id, (auth.jwt() ->> 'organization_id')::uuid)
);
```

**Access Matrix:**
| Role | Global Defaults | Course Overrides (Own Org) | Course Overrides (Other Org) |
|------|----------------|----------------------------|------------------------------|
| SuperAdmin | Read/Write | Read/Write | Read/Write |
| Admin | Read | Read | None |
| Instructor | Read | Read | None |
| Student | Read | None | None |

---

## Functions & RPCs

### Transactional Outbox

#### `initialize_fsm_with_outbox()`
**Purpose:** Atomic FSM initialization with transactional outbox

**Signature:**
```sql
initialize_fsm_with_outbox(
  p_entity_id UUID,
  p_user_id UUID,
  p_organization_id UUID,
  p_idempotency_key TEXT,
  p_initiated_by TEXT,
  p_initial_state TEXT,
  p_job_data JSONB,
  p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB
```

**Parameters:**
- `p_entity_id` - Course UUID (must exist in courses table)
- `p_user_id` - User initiating generation
- `p_organization_id` - Organization ID
- `p_idempotency_key` - Unique request identifier (e.g., `generation-{course-id}-{timestamp}`)
- `p_initiated_by` - Trigger source: API, TEST, WORKER, ADMIN, QUEUE (mapped to API/QUEUE/WORKER)
- `p_initial_state` - FSM state: stage_2_init, stage_4_init, or stage_5_init
- `p_job_data` - Array of job definitions: `[{queue, data, options}, ...]`
- `p_metadata` - Optional audit metadata

**Returns:**
```json
{
  "fsmState": {
    "entity_id": "uuid",
    "state": "stage_2_init",
    "version": 1,
    "created_by": "uuid",
    "created_at": "2025-11-18T..."
  },
  "outboxEntries": [{
    "outbox_id": "uuid",
    "queue_name": "document-processing",
    "entity_id": "uuid",
    "job_data": {...},
    "job_options": {...},
    "processed_at": null,
    "created_at": "2025-11-18T..."
  }]
}
```

**Atomic Transaction:**
1. Check idempotency key (return cached if exists)
2. Update `courses.generation_status` (row-level lock)
3. Insert N rows into `job_outbox`
4. Insert FSM event into `fsm_events`
5. Cache result in `idempotency_keys`
6. COMMIT (all-or-nothing)

**Security:** `SECURITY DEFINER` with `search_path = public, pg_temp`

**Performance:** ~50-100ms (database-only path), ~1-2ms (Redis cached path)

**Migration:** `20251118095804_create_initialize_fsm_with_outbox_rpc.sql`

---

### Custom JWT Claims

#### `custom_access_token_hook(event JSONB)`
**Type:** Hook (called by Supabase Auth)
**Purpose:** Inject custom claims into JWT
**Claims Added:** `user_id`, `role`, `organization_id`

---

### RLS Helper Functions (SECURITY DEFINER)

**Purpose:** Break circular dependencies in RLS policies

**IMPORTANT:** All helper functions use `SECURITY DEFINER` to bypass RLS and prevent infinite recursion.

#### `is_superadmin(user_id UUID) → BOOLEAN`
**Added:** 2025-11-08 (Migration: `fix_is_superadmin_security_definer`)
**Purpose:** Check if user has superadmin role
**Security:** Uses `SECURITY DEFINER` to prevent recursion when querying `users` table
**Used in:** All RLS policies for superadmin bypass
**Critical Fix:** Without `SECURITY DEFINER`, this function caused stack depth overflow because:
- Function queries `users` table
- `users` table RLS policy calls `is_superadmin()`
- Creates infinite recursion loop → stack overflow
**Solution:** `SECURITY DEFINER` makes function execute with definer privileges, bypassing RLS

#### `is_enrolled_in_course(p_user_id UUID, p_course_id UUID) → BOOLEAN`
Check if user has active enrollment in course (bypasses RLS)

#### `course_belongs_to_org(p_course_id UUID, p_org_id UUID) → BOOLEAN`
Check if course belongs to organization (bypasses RLS)

#### `course_belongs_to_user(p_course_id UUID, p_user_id UUID) → BOOLEAN`
Check if user is instructor of course (bypasses RLS)

#### `section_belongs_to_user_course(p_section_id UUID, p_user_id UUID) → BOOLEAN`
Check if section belongs to user's course (bypasses RLS)

#### `lesson_belongs_to_user_course(p_lesson_id UUID, p_user_id UUID) → BOOLEAN`
Check if lesson belongs to user's course (bypasses RLS)

#### `is_enrolled_via_section(p_user_id UUID, p_section_id UUID) → BOOLEAN`
Check if user is enrolled via section's course (bypasses RLS)

#### `is_enrolled_via_lesson(p_user_id UUID, p_lesson_id UUID) → BOOLEAN`
Check if user is enrolled via lesson's course (bypasses RLS)

---

### Course Generation

#### `update_course_progress()` (2 overloads)
**Type:** RPC (service_role only)
**Purpose:** Update 5-step generation progress

**Main Function:**
```sql
update_course_progress(
  p_course_id UUID,
  p_step_id TEXT,
  p_status TEXT,  -- pending/in_progress/completed/failed
  p_message TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS jsonb
```

**Compatibility Overload:**
```sql
update_course_progress(
  p_course_id UUID,
  p_step_id TEXT,
  p_status TEXT,
  p_message TEXT,
  p_percent_complete INTEGER,  -- Ignored for backward compatibility
  p_metadata JSONB
) RETURNS jsonb
```

**Updates:**
1. `generation_progress` JSONB (step status, timestamps, percentage)
2. `generation_status` ENUM (auto-mapped from step+status)
3. `last_progress_update` timestamp
4. Error fields if failed
5. Logs to `generation_status_history` via trigger

**State Mapping:**
- Step 1 + in_progress → `initializing`
- Step 2 + in_progress → `processing_documents` OR `analyzing_task` (based on `has_files`)
- Step 3 + in_progress → `generating_structure`
- Step 4 + in_progress → `generating_content`
- Step 5 + in_progress → `finalizing`
- Step 5 + completed → `completed`
- Any + failed → `failed`

---

#### `get_generation_summary(p_course_id UUID)`
**Purpose:** Get generation overview
**Returns:** current_status, current_step, percentage, started_at, last_updated, duration_seconds, is_stuck (>1 hour), transition_count

---

#### `validate_minimum_lessons(course_structure JSONB) → BOOLEAN`
**Type:** Validation function (IMMUTABLE)
**Purpose:** Validates FR-015 requirement (minimum 10 lessons)
**Added:** 2025-11-08 (Stage 5 Generation)

**Returns:**
- `TRUE` if course_structure has >= 10 lessons across all sections
- `FALSE` otherwise

**Usage:**
```sql
SELECT validate_minimum_lessons(course_structure) FROM courses WHERE id = '...';
```

**Example Structure:**
```json
{
  "sections": [
    {
      "title": "Introduction",
      "lessons": [
        {"title": "Lesson 1", "type": "video"},
        {"title": "Lesson 2", "type": "text"}
      ]
    },
    {
      "title": "Advanced Topics",
      "lessons": [
        {"title": "Lesson 3", "type": "quiz"},
        ...
      ]
    }
  ]
}
```

**Implementation:**
- Iterates through all sections in `course_structure.sections`
- Counts total lessons using `jsonb_array_length(section->'lessons')`
- Returns boolean based on total >= 10 threshold

---

### Generation Locks (Stage 6)

#### `acquire_generation_lock()`
**Type:** RPC (SECURITY DEFINER)
**Purpose:** Atomically acquire a distributed lock for a generation stage
**Added:** Stage 6 (2025-11-22)

**Signature:**
```sql
acquire_generation_lock(
  p_course_id UUID,
  p_stage generation_stage,     -- stage4/stage5/stage6
  p_worker_id TEXT,
  p_ttl_minutes INTEGER DEFAULT 30
) RETURNS BOOLEAN
```

**Parameters:**
- `p_course_id` - Course to lock
- `p_stage` - Which stage to lock (stage4, stage5, stage6)
- `p_worker_id` - Unique identifier for the worker acquiring the lock
- `p_ttl_minutes` - Lock time-to-live in minutes (default: 30)

**Returns:**
- `TRUE` if lock was successfully acquired
- `FALSE` if lock already exists and is not expired

**Behavior:**
- Uses `INSERT ... ON CONFLICT` for atomic operation
- Automatically cleans up expired locks before attempting acquisition
- Sets `expires_at = NOW() + p_ttl_minutes`

**Example:**
```sql
SELECT acquire_generation_lock(
  'course-uuid'::uuid,
  'stage6'::generation_stage,
  'worker-123',
  60  -- 60 minute TTL
);
```

---

#### `release_generation_lock()`
**Type:** RPC (SECURITY DEFINER)
**Purpose:** Release a previously acquired generation lock
**Added:** Stage 6 (2025-11-22)

**Signature:**
```sql
release_generation_lock(
  p_course_id UUID,
  p_stage generation_stage,
  p_worker_id TEXT DEFAULT NULL
) RETURNS BOOLEAN
```

**Parameters:**
- `p_course_id` - Course to unlock
- `p_stage` - Which stage to unlock
- `p_worker_id` - Optional: Only release if owned by this worker

**Returns:**
- `TRUE` if lock was released
- `FALSE` if no matching lock found

**Behavior:**
- If `p_worker_id` is provided, only releases lock if it matches
- If `p_worker_id` is NULL, releases lock regardless of owner (admin use)

---

#### `check_generation_lock()`
**Type:** RPC (SECURITY DEFINER)
**Purpose:** Check the status of a generation lock without modifying it
**Added:** Stage 6 (2025-11-22)

**Signature:**
```sql
check_generation_lock(
  p_course_id UUID,
  p_stage generation_stage
) RETURNS TABLE (
  is_locked BOOLEAN,
  worker_id TEXT,
  locked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN
)
```

**Returns:**
- `is_locked` - Whether a lock exists
- `worker_id` - ID of worker holding the lock
- `locked_at` - When the lock was acquired
- `expires_at` - When the lock expires
- `is_expired` - Whether the lock has expired (but not yet cleaned up)

**Example:**
```sql
SELECT * FROM check_generation_lock('course-uuid'::uuid, 'stage6'::generation_stage);
```

---

#### `cleanup_expired_generation_locks()`
**Type:** RPC (SECURITY DEFINER)
**Purpose:** Remove all expired generation locks
**Added:** Stage 6 (2025-11-22)

**Signature:**
```sql
cleanup_expired_generation_locks() RETURNS INTEGER
```

**Returns:** Number of expired locks that were removed

**Usage:**
- Called automatically by `acquire_generation_lock()` before attempting acquisition
- Can also be called manually or via pg_cron for periodic cleanup

---

#### `check_stage4_barrier()`
**Type:** RPC (SECURITY DEFINER)
**Purpose:** Check if all documents have been processed before Stage 4 can proceed
**Added:** Stage 4 Barrier (2025-11-22)

**Signature:**
```sql
check_stage4_barrier(
  p_course_id UUID
) RETURNS TABLE (
  can_proceed BOOLEAN,
  completed_count INTEGER,
  total_count INTEGER
)
```

**Parameters:**
- `p_course_id` - Course to check barrier for

**Returns:**
- `can_proceed` - TRUE if all documents are processed (or no documents exist)
- `completed_count` - Number of documents with vector_status = 'indexed'
- `total_count` - Total number of documents for this course

**Usage:**
```sql
SELECT * FROM check_stage4_barrier('course-uuid'::uuid);
-- Returns: can_proceed=true, completed_count=5, total_count=5
```

**Barrier Logic:**
- Returns `can_proceed = TRUE` if:
  - All documents have `vector_status = 'indexed'`
  - OR no documents exist for the course (title-only generation)
- Returns `can_proceed = FALSE` if:
  - Any documents have `vector_status IN ('pending', 'indexing')`
  - Any documents have `vector_status = 'failed'` (blocks until resolved)

---

### File Management

#### `find_duplicate_file(p_hash TEXT)`
**Purpose:** Check for existing indexed file with same hash
**Returns:** file_id, storage_path, vector_status, reference_count, parsed_content, markdown_content, file_size, mime_type

#### `increment_file_reference_count(p_file_id UUID)`
**Purpose:** Increment reference count (when creating duplicate reference)

#### `decrement_file_reference_count(p_file_id UUID)`
**Purpose:** Decrement reference count (when deleting reference)

#### `update_file_catalog_processing()`
**Purpose:** Update parsed_content and markdown_content after processing

---

### Storage Quota Management

#### `increment_storage_quota(org_id UUID, size_bytes BIGINT)`
**Purpose:** Add to organization's storage usage
**Constraint:** Enforces `storage_used_bytes <= storage_quota_bytes`

#### `decrement_storage_quota(org_id UUID, size_bytes BIGINT)`
**Purpose:** Subtract from organization's storage usage
**Safety:** Uses `GREATEST(0, ...)` to prevent negative values

#### `reset_storage_quota(org_id UUID)`
**Purpose:** Reset storage usage to 0

---

### Testing Utilities

#### `set_auth_context()`
**Purpose:** Set JWT claims for testing (simulates Auth Hook behavior)
**Parameters:** user_id, user_role (default: 'authenticated'), user_email (optional), organization_id (optional)

**Sets:**
- `request.jwt.claims` (full JWT with custom claims)
- `request.jwt.claim.sub` (for `auth.uid()`)

**Important:** Does NOT execute `SET ROLE` to avoid conflicts with PostgREST

---

#### `get_current_auth_context()`
**Purpose:** Debug current auth state
**Returns:** {current_role, jwt_claims, auth_uid}

---

#### `get_user_organization_id(user_id UUID)`
**Purpose:** Helper to get user's organization

---

## PostgreSQL Roles

**Problem:** PostgREST automatically executes `SET ROLE <jwt.role>` when it sees a `role` claim in the JWT. If the PostgreSQL role doesn't exist, requests fail.

**Solution:** Create PostgreSQL roles matching application role names:

```sql
-- Create application roles
CREATE ROLE student NOLOGIN;
CREATE ROLE instructor NOLOGIN;
CREATE ROLE admin NOLOGIN;

-- Grant authenticated privileges
GRANT authenticated TO student;
GRANT authenticated TO instructor;
GRANT authenticated TO admin;

-- Allow PostgREST to switch to these roles
GRANT student TO authenticator;
GRANT instructor TO authenticator;
GRANT admin TO authenticator;
```

### Role Hierarchy

```
authenticator (PostgREST connection role)
├── authenticated (Supabase base role for logged-in users)
│   ├── student (read-only, enrolled courses)
│   ├── instructor (manage own courses)
│   └── admin (full organization access)
├── anon (public/unauthenticated requests)
└── service_role (backend/admin API)
```

---

## Test Infrastructure

### Test Auth User Creation

**Purpose:** Enable contract and integration tests to create auth users with predefined UUIDs

#### `hash_password(password TEXT) → TEXT`
**Type:** Function (SECURITY DEFINER, IMMUTABLE)
**Purpose:** Hash password using Blowfish algorithm for test auth users
**Migration:** `20250115000002_create_hash_password_helper.sql`

```sql
CREATE OR REPLACE FUNCTION public.hash_password(password TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STRICT
IMMUTABLE
PARALLEL SAFE
SET search_path = extensions, public, pg_temp
AS $
  SELECT extensions.crypt(password, extensions.gen_salt('bf'));
$;
```

**Key Details:**
- Uses `pgcrypto` extension functions: `crypt()` and `gen_salt('bf')`
- Fully qualified schema: `extensions.crypt()` and `extensions.gen_salt()` (critical fix)
- Returns Blowfish-hashed password compatible with Supabase Auth

---

#### `create_test_auth_user()`
**Type:** RPC (SECURITY DEFINER)
**Purpose:** Create test auth user with predefined UUID
**Migration:** `20250115000001_create_test_auth_user_function.sql`

```sql
CREATE OR REPLACE FUNCTION public.create_test_auth_user(
  p_user_id UUID,
  p_email TEXT,
  p_encrypted_password TEXT,
  p_email_confirmed BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_temp
AS $
BEGIN
  -- Insert into auth.users with ON CONFLICT for idempotency
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, aud, role, confirmation_token,
    email_change_token_new, recovery_token
  )
  VALUES (
    p_user_id,
    '00000000-0000-0000-0000-000000000000'::UUID,
    p_email,
    p_encrypted_password,
    CASE WHEN p_email_confirmed THEN NOW() ELSE NULL END,
    NOW(), NOW(), 'authenticated', 'authenticated', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;

  -- Return success JSONB
  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', p_user_id,
    'email', p_email,
    'email_confirmed', p_email_confirmed
  );
END;
$;
```

**Key Features:**
- Directly inserts into `auth.users` table (bypasses Supabase Auth API limitations)
- Accepts predefined UUID (required for test fixtures)
- Idempotent with `ON CONFLICT (id) DO NOTHING`
- Sets email as confirmed by default
- Uses `SECURITY DEFINER` for elevated privileges

**Usage Example (Test Fixture):**
```typescript
async function createAuthUser(email: string, password: string, userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Step 1: Hash password
  const { data: hashedPassword, error: hashError } = await supabase.rpc('hash_password', {
    password: password,
  });

  if (hashError) {
    throw new Error(`Failed to hash password: ${hashError.message}`);
  }

  // Step 2: Create auth user with predefined ID
  const { data: result, error: createError } = await supabase.rpc('create_test_auth_user', {
    p_user_id: userId,
    p_email: email,
    p_encrypted_password: hashedPassword,
    p_email_confirmed: true,
  });

  if (createError) {
    throw new Error(`Failed to create auth user: ${createError.message}`);
  }

  console.log(`✅ Created auth user: ${email} (ID: ${result.user_id})`);
}
```

**Why This Approach:**
- Supabase Auth API `auth.admin.createUser()` doesn't support predefined UUIDs
- Tests require deterministic user IDs for foreign key relationships
- RPC approach provides full control over auth user creation

**Security:**
- Functions use `SECURITY DEFINER` to bypass RLS
- Only accessible via service_role connection (tests use admin client)
- Not exposed to public API (no RLS policies for public access)

---

## Quick Reference

### Common Authentication Patterns

#### Set Test Context
```sql
SELECT set_auth_context(
  user_id := 'uuid-here'::uuid,
  user_role := 'instructor',
  organization_id := 'org-uuid'::uuid
);
```

#### Get Current Auth State
```sql
SELECT get_current_auth_context();
```

---

### Common Query Patterns

#### Get Courses with RLS
```sql
-- RLS automatically filters by role + organization
SELECT * FROM courses WHERE status = 'published';
```

#### Update Generation Progress
```sql
SELECT update_course_progress(
  p_course_id := 'course-uuid',
  p_step_id := '3',
  p_status := 'in_progress',
  p_message := 'Generating course structure...'
);
```

#### Check for Duplicate File
```sql
SELECT * FROM find_duplicate_file('sha256_hash_here');
```

---

### Monitoring Queries

#### Active Generations
```sql
SELECT * FROM courses
WHERE generation_status NOT IN ('completed', 'failed', 'cancelled', 'pending')
ORDER BY last_progress_update DESC;
```

#### Stuck Courses (>1 hour)
```sql
SELECT * FROM courses
WHERE generation_status NOT IN ('completed', 'failed', 'cancelled', 'pending')
  AND last_progress_update < NOW() - INTERVAL '1 hour';
```

#### Summarization Status by Course
```sql
SELECT
  course_id,
  COUNT(*) AS total_files,
  COUNT(processed_content) AS summarized_files,
  COUNT(*) FILTER (WHERE processing_method = 'full_text') AS full_text_files,
  COUNT(*) FILTER (WHERE processing_method = 'hierarchical') AS hierarchical_files,
  ROUND(AVG((summary_metadata->>'quality_score')::numeric), 2) AS avg_quality_score,
  SUM((summary_metadata->>'estimated_cost_usd')::numeric) AS total_cost_usd
FROM file_catalog
WHERE course_id = :course_id
GROUP BY course_id;
```

---

### Troubleshooting

#### Error: `role "student" does not exist`
**Cause:** PostgreSQL role doesn't exist

**Solution:**
```sql
CREATE ROLE student NOLOGIN;
CREATE ROLE instructor NOLOGIN;
CREATE ROLE admin NOLOGIN;
GRANT authenticated TO student;
GRANT authenticated TO instructor;
GRANT authenticated TO admin;
```

---

#### Error: `permission denied to set role "student"`
**Cause:** `authenticator` doesn't have permission to switch

**Solution:**
```sql
GRANT student TO authenticator;
GRANT instructor TO authenticator;
GRANT admin TO authenticator;
```

---

#### Verify PostgreSQL Roles
```sql
SELECT rolname FROM pg_roles
WHERE rolname IN ('student', 'instructor', 'admin', 'authenticator');
```

#### Check Role Permissions
```sql
SELECT
    r.rolname as role,
    ARRAY_AGG(m.rolname) as member_of
FROM pg_roles r
LEFT JOIN pg_auth_members am ON r.oid = am.member
LEFT JOIN pg_roles m ON am.roleid = m.oid
WHERE r.rolname IN ('student', 'instructor', 'admin', 'authenticator')
GROUP BY r.rolname
ORDER BY r.rolname;
```

---

## Data Integrity Summary

✅ **All tables have RLS enabled**
✅ **All foreign keys have CASCADE/SET NULL**
✅ **All ENUMs are strictly typed**
✅ **Timestamps auto-managed via triggers**
✅ **State machine validated via triggers**
✅ **Audit trail for critical changes**
✅ **Constraint checks on business logic**

---

## Migration History

**Critical Migrations:**
1. `20251021073547_apply_stage8_schema.sql` - System metrics + course generation columns + RPC
2. `20251021080000_add_generation_status_field.sql` - generation_status ENUM + history table
3. `20251021080100_update_rpc_with_generation_status.sql` - Enhanced update_course_progress RPC
4. `20251022000000_fix_set_auth_context.sql` - **[CRITICAL]** Removed `SET LOCAL ROLE` conflict with PostgREST
5. `20251022000001_create_app_roles.sql` - **[CRITICAL]** Created PostgreSQL roles: student, instructor, admin
6. `20251022000002_grant_role_switch.sql` - **[CRITICAL]** Granted role switch permissions
7. `20251028000000_stage3_summary_metadata.sql` - Stage 3 summarization fields
8. `20251031100000_stage4_model_config.sql` - llm_model_config table for Stage 4
9. `20251031110000_stage4_analysis_fields.sql` - analysis_result JSONB column
10. `20250115000001_create_test_auth_user_function.sql` - **[TEST INFRA]** RPC for test auth user creation
11. `20250115000002_create_hash_password_helper.sql` - **[TEST INFRA]** Password hashing for tests
12. `20250115_add_update_course_progress_overload.sql` - **[COMPATIBILITY]** Function overload for backward compatibility
13. `20251118094238_create_transactional_outbox_tables.sql` - **[TRANSACTIONAL OUTBOX]** job_outbox, idempotency_keys, fsm_events tables
14. `20251118095804_create_initialize_fsm_with_outbox_rpc.sql` - **[TRANSACTIONAL OUTBOX]** Atomic FSM + outbox RPC function
15. `20251122_generation_locks.sql` - **[STAGE 6]** generation_locks table + lock management RPCs
16. `20251122_lesson_contents.sql` - **[STAGE 6]** lesson_contents table for Stage 6 content generation
17. `20251122_rag_context_cache.sql` - **[STAGE 6]** RAG context caching for lesson generation
18. `20251122_document_priorities.sql` - **[STAGE 2]** document_priorities table + document_category ENUM
19. `20251122_stage_enums.sql` - **[STAGE 6]** generation_stage, lesson_content_status ENUMs
20. `20251122_metric_event_types.sql` - **[METRICS]** Added llm_phase_execution, json_repair_execution event types

**IMPORTANT:** The system requires PostgreSQL roles (`student`, `instructor`, `admin`) to exist. These are non-login roles that inherit from `authenticated`. PostgREST automatically switches to the appropriate role based on the JWT `role` claim.

---

**End of Reference** | Last Updated: 2025-11-22 | Added Stage 6 Lesson Content tables, Generation Locks, RAG Context Cache, Document Priorities, new ENUMs and Functions
