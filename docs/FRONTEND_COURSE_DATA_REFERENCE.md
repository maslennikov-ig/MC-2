# Frontend Course Data Reference

> **Last Updated**: 2025-11-05
> **Status**: ✅ Active

---

## Course Initiation (`generation.initiate`)

**Endpoint**: `instructorProcedure.mutation`
**Rate Limit**: 10 req/60s

### Input
```typescript
{
  courseId: string;           // UUID, required
  webhookUrl?: string | null; // URL, optional
}
```

### Validation
- Course must belong to user's organization
- User must own the course

---

## File Upload (`generation.uploadFile`)

**Endpoint**: `instructorProcedure.mutation`
**Rate Limit**: 5 req/60s

### Input
```typescript
{
  courseId: string;    // UUID, required
  filename: string;    // 1-255 chars, required
  fileSize: number;    // Max 100MB (104857600 bytes), required
  mimeType: string;    // Required
  fileContent: string; // Base64 encoded, required
}
```

### Validation
- Tier-based file type and count limits
- Storage quota enforcement
- Path traversal protection

---

## Analysis Start (`analysis.start`)

**Endpoint**: `protectedProcedure.mutation`
**Rate Limit**: 10 req/60s

### Input
```typescript
{
  courseId: string;          // UUID, required
  forceRestart: boolean;     // Default: false
}
```

### Validation
- Course status must be `processing_documents` or `generating_content`
- Document summaries must exist in `file_catalog`

---

## Course Fields

### Required Fields

```typescript
id: string;                 // UUID
title: string;              // Course title - REQUIRED, ONLY MANDATORY FIELD
user_id: string;            // Owner UUID
organization_id: string;    // Organization UUID
```

### Optional Core Fields

```typescript
language: string;           // ISO 639-1 (default: 'en')
style: string;              // Content style (default: 'conversational') - see Style Types
target_audience: string;    // Audience description (DIFFERENT from difficulty)
```

### Optional Settings (JSONB)

```typescript
settings: {
  topic?: string;                     // Course topic (fallback: title)
  answers?: string;                   // User requirements/description
  lesson_duration_minutes?: number;   // 3-45 (default: 30)
  desired_lessons_count?: number;     // User preference (not guaranteed)
  desired_modules_count?: number;     // User preference (not guaranteed)
  learning_outcomes?: string;         // Expected learning outcomes
}
```

**Important**: `desired_lessons_count` and `desired_modules_count` are user preferences - actual count is determined by LLM analysis.

### Status & Progress

```typescript
generation_status: string;  // Workflow status
generation_progress: number; // 0-100
```

### Generated Results

```typescript
course_structure: object;   // JSONB - Course outline
analysis_result: object;    // JSONB - Stage 4 analysis
```

---

## Style Types

**Available Styles** (21 types):

- `academic` - Scholarly rigor, theoretical depth
- `conversational` - Friendly dialogue
- `storytelling` - Narrative-driven
- `practical` - Action-focused
- `motivational` - Empowering, success stories
- `visual` - Mental images, metaphors
- `gamified` - Game mechanics, quests
- `minimalist` - Essential concepts only
- `research` - Inquiry-based
- `engaging` - Hooks, curiosity gaps
- `professional` - Business/corporate tone
- `socratic` - Question-driven
- `problem_based` - Real-world problems
- `collaborative` - Group learning
- `technical` - Precision, specifications
- `microlearning` - Bite-sized lessons
- `inspirational` - Transformation stories
- `interactive` - Active participation
- `analytical` - Data-driven, logical

**Default Fallback**: `conversational`
**Source**: `workflows n8n/style.js`

---

## Stage 4 Analysis Job Payload

### Created by `analysis.start`

```typescript
{
  jobType: 'STRUCTURE_ANALYSIS',
  course_id: string,
  organization_id: string,
  user_id: string,

  input: {
    topic: string,                    // From settings.topic || title
    language: string,                 // From course.language
    style: string,                    // From course.style
    answers?: string,                 // From settings.answers
    target_audience: string,          // From course.target_audience
    lesson_duration_minutes: number,  // From settings (default: 30)
    document_summaries?: Array<{...}> // From file_catalog
  },

  priority: number,      // Tier-based (1-10)
  attempt_count: number,
  created_at: string
}
```

---

## File Catalog

```typescript
{
  id: string,
  course_id: string,
  filename: string,
  file_size: number,
  mime_type: string,
  storage_path: string,           // Relative path
  vector_status: string,          // 'pending' | 'completed' | 'failed'
  processed_content?: string,     // Stage 3 summary
  processing_method?: string,     // 'bypass' | 'detailed' | 'balanced' | 'aggressive'
  summary_metadata?: object       // Token counts, quality score
}
```

---

## Data Flow

### Stage 2: File Upload & Processing
1. `generation.uploadFile` → Save file → Create `file_catalog` entry
2. `generation.initiate` → Create DocumentProcessingJob per file

### Stage 3: Summarization
- Updates `file_catalog.processed_content`
- Sets `generation_status = 'generating_content'`

### Stage 4: Analysis
1. `analysis.start` → Fetch document summaries
2. Extract course settings (`topic`, `language`, `style`, `answers`, etc.)
3. Create StructureAnalysisJob
4. 6-phase analysis → Store result in `courses.analysis_result`

---

## Key References

- **Router**: `packages/course-gen-platform/src/server/routers/analysis.ts`
- **Job Types**: `packages/shared-types/src/analysis-job.ts`
- **Migrations**: `packages/course-gen-platform/supabase/migrations/`
- **Style Prompts**: `workflows n8n/style.js`

---
