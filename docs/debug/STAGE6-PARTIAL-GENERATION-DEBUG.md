# Stage 6 Partial Generation Debug Guide

## Overview

This document describes the debugging process for Stage 6 partial lesson generation.
Stage 6 generates lesson content from LessonSpecificationV2 objects using a LangGraph pipeline.

## Architecture

```
[API/Frontend]
    → /api/coursegen/partial-generate (Next.js proxy)
    → tRPC lessonContent.partialGenerate
    → BullMQ queue (course-generation)
    → Worker picks up job
    → processStage6Job (handler.ts)
    → executeStage6 (orchestrator.ts)
    → LangGraph pipeline: Planner → Expander → Assembler → Smoother → Judge
    → saveLessonContent (resolves "1.1" → UUID, saves to lesson_contents)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/stages/stage6-lesson-content/handler.ts` | BullMQ job handler, model fallback, DB save |
| `src/stages/stage6-lesson-content/orchestrator.ts` | LangGraph graph definition |
| `src/stages/stage6-lesson-content/nodes/*.ts` | Individual graph nodes |
| `src/server/routers/lesson-content.ts` | tRPC router with partialGenerate |
| `src/orchestrator/worker.ts` | Main BullMQ worker |
| `src/shared/trace-logger.ts` | Generation trace logging |

## Test Data (from logs)

```typescript
const TEST_COURSE_ID = '9762b2f3-1420-4a67-a662-81b882dc7b5a';
const TEST_ORGANIZATION_ID = '9b98a7d5-27ea-4441-81dc-de79d488e5db';
const TEST_USER_ID = 'ca704da8-5522-4a39-9691-23f36b85d0ce';

const TEST_LESSON_SPEC = {
  lesson_id: '1.1',
  title: 'Как устроен рынок продажи билетов на образовательные мероприятия',
  sections: [
    {
      title: 'Main Content',
      key_points: ['...'],
      objectives: ['...'],
    }
  ],
  // ... other fields from LessonSpecificationV2
};
```

## Common Issues

### 1. UUID Format Error
**Error:** `invalid input syntax for type uuid: "1.1"`

**Cause:** Human-readable lessonId ("1.1") passed to DB expecting UUID.

**Fix:** Use `resolveLessonUuid()` to convert "1.1" → actual UUID before DB operations.

### 2. Lock Conflict (FIXED)
**Error:** `Failed to acquire generation lock: already held by another worker`

**Cause:** Course-level lock blocking parallel lesson generation.

**Fix:** Removed lock from Stage 6 handler - lessons are independent.

### 3. TypeError: terminated
**Error:** `Section "Main Content" expansion failed: TypeError: terminated`

**Cause:** LLM request timeout or connection dropped.

**Fix:** Retry logic in model fallback strategy.

### 4. Heuristic Failures
**Error:** `Flesch-Kincaid grade level below target minimum`

**Cause:** Generated content quality issues.

**Fix:** Content quality is validated by Judge node, needs better prompts or RAG context.

## Debug Script

Run the debug script to test generation directly:

```bash
cd packages/course-gen-platform
pnpm tsx scripts/debug-stage6-generation.ts
```

## Logs Location

- Backend: `logs/dev/backend-latest.log`
- Worker: `logs/dev/worker-latest.log`
- Combined: `logs/dev/combined-latest.log`

## Cleanup Commands

```bash
# Clear BullMQ queue
redis-cli KEYS "bull:course-generation:*" | xargs redis-cli DEL

# Clear test lesson_contents
# (Run in Supabase SQL editor)
DELETE FROM lesson_contents WHERE course_id = '9762b2f3-1420-4a67-a662-81b882dc7b5a';
DELETE FROM lessons WHERE section_id IN (SELECT id FROM sections WHERE course_id = '9762b2f3-1420-4a67-a662-81b882dc7b5a' AND title LIKE 'Test Section%');
DELETE FROM sections WHERE course_id = '9762b2f3-1420-4a67-a662-81b882dc7b5a' AND title LIKE 'Test Section%';
```

## Successful Test Results (2024-12-08)

**Debug script completed successfully:**
- LessonSpecificationV2 built from course_structure ✅
- Test section/lesson created automatically ✅
- Stage 6 LangGraph pipeline executed ✅
- Content saved to lesson_contents table ✅

**Metrics:**
- Duration: ~270s (4.5 minutes)
- Content size: 7,887 bytes
- Sections generated: 6
- Model: openai/gpt-oss-120b

**Quality warnings (expected for test):**
- Flesch-Kincaid grade level below target
- No examples/exercises (minimal spec)

## Fixes Applied

1. **UUID format in trace-logger** - Added `isValidUuid()` validation
2. **UUID resolution in saveLessonContent** - Added `resolveLessonUuid()` to convert "1.1" → UUID
3. **Lock conflict removed** - Removed course-level lock for Stage 6 (lessons are independent)
4. **LessonSpecificationV2 schema** - Fixed to include metadata, learning_objectives, intro_blueprint, rag_context
