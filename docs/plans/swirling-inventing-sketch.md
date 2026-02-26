# Plan: Fix NLM Bridge Returning Identical Audio for Different Lessons + Stop Metadata Bloat

## Context

Two bugs discovered during enrichment card fix work:

1. **Identical audio** (Beads `mc2-qhne2`, P2): NLM audio generation returns the same MP3 file for different lessons in the same course. DB evidence confirms lesson 2's enrichment has `"status": "recovered_from_completed_artifact"` — the bridge's proactive recovery grabbed lesson 1's artifact instead of waiting for lesson 2's own generation.

2. **Metadata bloat** (Beads `mc2-wmify`, P1): Each NLM enrichment stores ~28MB in `metadata.additional_info.bridge_response` (full bridge HTTP response including base64 audio in `artifact` field). 5 enrichments = 73MB of metadata in PostgreSQL.

### DB Evidence (course `840b6319`)

| Enrichment | Lesson                | Task ID     | Status                                | File Size                     |
| ---------- | --------------------- | ----------- | ------------------------------------- | ----------------------------- |
| `dc0512a7` | lesson 1 (`21dbaab8`) | `988763...` | completed                             | 21,150,364 bytes              |
| `aae6315e` | lesson 2 (`fecbf78b`) | `067f6d...` | **recovered_from_completed_artifact** | 21,150,364 bytes (identical!) |

Both MP3 files: same MD5 `45b6e7b1f0e705fc5eddc71e7928d6b5`. Different scripts, different task IDs, but identical output.

## Root Cause Analysis

### Bug 1: Recovery grabs wrong artifact

**File:** `docker/notebooklm-bridge/app/generator.py`

The bridge reuses one NotebookLM notebook per course (keyed by `course_id`). When generation times out or polls fail, `_select_recovery_artifact()` (line ~1311) has a 3-tier fallback:

1. `matches_task_id` — artifact_id matches the task_id from `generate_audio()` call
2. `near_request_start` — artifact created within `request_started_at ± 45s`
3. **`latest_same_type`** — grabs `sorted_candidates[0]` (newest completed artifact from the ENTIRE notebook)

Tier 3 is the bug: it picks ANY completed audio artifact from the shared course notebook, including artifacts from previous lessons. Additionally, old sources are never cleaned up — the notebook accumulates sources from every lesson ever generated.

### Bug 2: Metadata bloat

**File:** `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts` (lines 304, 368, 419)

`bridge_response: start.responseMetadata` saves the full bridge HTTP response including `artifact.audio_base64` (the entire MP3 as base64). This is ~28MB per enrichment. The frontend never reads `metadata` column (confirmed — excluded from all queries via `ENRICHMENT_DISPLAY_COLUMNS`).

Same pattern in `nlm-video-handler.ts` (lines ~300, 365, 414).

## Fix Strategy

### Fix 1: Prevent recovery from grabbing wrong artifact (CRITICAL)

**File:** `docker/notebooklm-bridge/app/generator.py`

**Change A**: In `_select_recovery_artifact()` — remove the `latest_same_type` fallback. If neither `matches_task_id` nor `near_request_start` succeeds, return `None` (let the error propagate, triggering a retry at the mc2 level).

```python
# BEFORE (line ~1391):
else:
    selected = sorted_candidates[0]
    strategy = "latest_same_type"

# AFTER:
else:
    # No safe match found — refuse to return a potentially wrong artifact
    logger.warning(
        "Recovery: no artifact matched task_id or time window, refusing fallback",
        extra={"task_id": task_id, "notebook_id": notebook_id,
               "candidate_count": len(sorted_candidates)},
    )
    return None
```

**Change B**: Tighten the time-window check — only accept artifacts created AFTER `request_started_at` (remove backwards skew for safety):

```python
# BEFORE:
selection_threshold_ts = request_start_ts - self._RECOVERY_START_TIME_SKEW_SECONDS  # -45s

# AFTER: only forward — artifact must have been created after we started
selection_threshold_ts = request_start_ts
```

### Fix 2: Source accumulation — known limitation, mitigated

**File:** `docker/notebooklm-bridge/app/generator.py`

`notebooklm-py` does NOT expose `sources.list()` or `sources.delete()` (confirmed: `FakeSourcesAPI` in tests only has `add_text` + `wait_for_sources`). Sources accumulate in the shared notebook across lessons.

**Mitigation**: The `generate_audio()` call already passes `source_ids=source_ids` (line 441) with only the current lesson's source IDs. NotebookLM should scope generation to those sources. Combined with Fix 1 (no wrong artifact recovery), this is acceptable.

**Future improvement** (when `notebooklm-py` adds source management): Clean old sources before adding new ones, or periodically delete and recreate the notebook.

### Fix 3: Stop saving full bridge_response in metadata

**File:** `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts`

Replace `bridge_response: start.responseMetadata` with a minimal summary (no base64 audio, no full transcript):

```typescript
// Helper function to extract only essential metadata from bridge response
function extractBridgeMetadataSummary(responseMetadata: Record<string, unknown> | undefined) {
  if (!responseMetadata) return undefined;
  const artifact = responseMetadata.artifact as Record<string, unknown> | undefined;
  const meta = artifact?.metadata as Record<string, unknown> | undefined;
  return {
    task_id: responseMetadata.task_id,
    status: responseMetadata.status,
    error: responseMetadata.error,
    artifact_duration_seconds: artifact?.duration_seconds,
    artifact_mime_type: artifact?.mime_type,
    artifact_extension: artifact?.extension,
    notebook_id: meta?.notebook_id,
    artifact_id: meta?.artifact_id,
    recovery_status: meta?.status, // e.g. "recovered_from_completed_artifact"
    source_count: meta?.source_count,
  };
}
```

Apply in all 3 places where `bridge_response` is saved (lines ~304, ~368, ~419):

```typescript
// BEFORE:
bridge_response: start.responseMetadata,

// AFTER:
bridge_response: extractBridgeMetadataSummary(start.responseMetadata),
```

**Same change for `nlm-video-handler.ts`** (lines ~300, ~365, ~414).

### Fix 4: Migration to clean existing bloated metadata

**File:** New migration in `packages/course-gen-platform/supabase/migrations/`

```sql
-- Clean up bloated bridge_response from existing enrichments
-- Removes artifact.audio_base64, artifact.segments, artifact.transcript etc.
-- Keeps only essential tracking fields
UPDATE lesson_enrichments
SET metadata = jsonb_set(
  metadata,
  '{additional_info,bridge_response}',
  jsonb_build_object(
    'task_id', metadata->'additional_info'->'bridge_response'->>'task_id',
    'status', metadata->'additional_info'->'bridge_response'->>'status',
    'artifact_duration_seconds', metadata->'additional_info'->'bridge_response'->'artifact'->>'duration_seconds',
    'notebook_id', metadata->'additional_info'->'bridge_response'->'artifact'->'metadata'->>'notebook_id',
    'artifact_id', metadata->'additional_info'->'bridge_response'->'artifact'->'metadata'->>'artifact_id',
    'recovery_status', metadata->'additional_info'->'bridge_response'->'artifact'->'metadata'->>'status'
  )
)
WHERE enrichment_type IN ('nlm_audio', 'nlm_video')
  AND metadata->'additional_info'->'bridge_response' IS NOT NULL
  AND pg_column_size(metadata) > 100000;  -- only rows with bloated metadata (>100KB)
```

Expected savings: ~73MB freed for existing data. Future enrichments save ~28MB per NLM enrichment.

## Files to Modify

| File                                                                                       | Change                                                                                       | Priority      |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------- |
| `docker/notebooklm-bridge/app/generator.py` (~line 1390)                                   | Remove `latest_same_type` fallback in `_select_recovery_artifact()`; change to `return None` | P0 (critical) |
| `docker/notebooklm-bridge/app/generator.py` (~line 1322)                                   | Tighten time window: remove backward skew (`- _RECOVERY_START_TIME_SKEW_SECONDS`)            | P0            |
| `docker/notebooklm-bridge/tests/test_queue.py` (~line 786)                                 | Update test expecting `latest_same_type` → expect `None` return                              | P0            |
| `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts` | Add `extractBridgeMetadataSummary()`, use in all 3 `bridge_response` saves                   | P1            |
| `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-video-handler.ts` | Same `extractBridgeMetadataSummary()` treatment                                              | P1            |
| `packages/course-gen-platform/supabase/migrations/`                                        | SQL migration to shrink existing bloated rows                                                | P1            |

## Edge Cases

| Case                                                | Handling                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Recovery finds no matching artifact                 | Returns `None` → error propagates → mc2 retries the enrichment generation                                                     |
| Source accumulation in shared notebook              | Mitigated: `source_ids` passed to `generate_audio()` scopes generation; `notebooklm-py` lacks source deletion API             |
| Notebook deleted externally                         | `_resolve_notebook()` already handles this — creates new one                                                                  |
| First lesson in course (no prior artifacts)         | Recovery has no candidates → returns `None` → same as before, triggers retry                                                  |
| Concurrent generation (different courses)           | Per-course mutex (`_course_generation_slot`) prevents concurrent same-course — no issue                                       |
| Happy path (no recovery needed)                     | Artifact downloaded by `status.task_id` — always correct, no change needed                                                    |
| Migration on production data                        | Safe — only modifies `metadata` JSON, doesn't touch audio files. `pg_column_size > 100KB` guard prevents touching normal rows |
| Test `test_queue.py:786` expects `latest_same_type` | Update test: recovery should return `None` when no task_id/time-window match                                                  |

## Verification

1. **Bridge fix**: Generate NLM audio for lesson 1, then lesson 2 in same course → verify different MP3 files (different `md5sum`)
2. **Bridge tests**: `cd docker/notebooklm-bridge && pytest tests/test_queue.py` — all pass
3. **Metadata fix**: Generate new NLM audio → check `pg_column_size(metadata)` is < 10KB (not 28MB)
4. **Migration**: Run on staging → `SELECT id, pg_column_size(metadata) FROM lesson_enrichments WHERE enrichment_type = 'nlm_audio'` → all < 100KB
5. **Type-check & build**: `pnpm type-check && pnpm build` passes for `course-gen-platform`
6. **Recovery still works**: If actual generation times out, recovery correctly finds the right artifact (created after request start) or fails gracefully
