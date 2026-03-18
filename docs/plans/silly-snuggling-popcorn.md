# Fix: NotebookLM Bridge rejects `lesson_id` (422 Extra inputs not permitted)

## Context

All NLM enrichment handlers (video, audio, study-guide, flashcards, mind-map, infographic) pass `lessonId` to the NotebookLM bridge client. The TS client converts it to `lesson_id` in the HTTP request body (`client.ts:55`). However, the Python bridge's Pydantic model `MediaGenerationRequest` has `extra="forbid"` and does NOT define a `lesson_id` field — only `course_id` exists.

This causes a **422 Unprocessable Entity** error for ALL NLM enrichment types, not just video.

## Fix

Add `lesson_id` field to the Python `MediaGenerationRequest` model, mirroring the existing `course_id` field.

### File: `packages/course-gen-platform/docker/notebooklm-bridge/app/models.py`

**Line 34**, after `course_id`:

```python
lesson_id: str | None = Field(default=None, max_length=200)
```

Also add `"lesson_id"` to the `field_validator` list on line 55 (alongside `course_id`).

That's it — one file, two line changes.

## Why add to Python rather than remove from TypeScript

- `lesson_id` is useful metadata for the bridge service (tracking, logging, debugging)
- It mirrors `course_id` which is already accepted
- All 6 NLM handlers intentionally pass it
- Removing from TS would require changes to 6 handler files + client + types

## Verification

1. After editing `models.py`, rebuild and redeploy the NotebookLM bridge Docker container
2. Test: create any NLM enrichment (e.g., nlm_video) from the course viewer UI
3. Confirm no 422 error in browser console
4. Confirm the enrichment generation starts and progresses normally
