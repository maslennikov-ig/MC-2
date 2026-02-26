# NLM Recovery Auto-Download + Course Lock (2026-02-22)

## Scope

Implemented resilience for `notebooklm-bridge` so `audio/video` enrichment generation can recover when polling times out/fails, by auto-discovering and downloading completed artifacts from the same course notebook.

## Why

Observed production-like behavior:

- NotebookLM UI already had generated media,
- bridge task still ended as failed due poll timeout,
- Stage7 enrichment remained failed with no saved asset.

## Implementation

### 1) Per-course serialization (anti-mixup)

- File: `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`
- Added course-scoped async lock (`_course_generation_slot`) keyed by normalized `course_id`.
- Keeps global queue behavior but prevents simultaneous audio/video generation for one course notebook.

### 2) Timeout/poll-failure recovery

- File: `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`
- Added `MediaGenerationPollError` for repeated poll errors.
- On `MediaGenerationTimeoutError` or `MediaGenerationPollError`, bridge now:
  - lists completed artifacts for same `media_type` in same notebook,
  - selects candidate by `created_at >= request_started_at - skew` (45s),
  - falls back to latest completed same-type artifact if needed,
  - downloads with selected `artifact_id`,
  - returns successful artifact bytes when recovery succeeds.

### 3) Recovery metadata + logs

- File: `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`
- Metadata now includes recovery flags/fields (when applicable):
  - `recovered_from_artifact`
  - `recovery_reason`
  - `recovery_strategy`
  - `recovery_selected_artifact_id`
  - candidate counters and timestamps
- Added explicit logs for recovery start, candidates, selection, success/failure.

## Tests

### Ran

```bash
cd packages/course-gen-platform/docker/notebooklm-bridge
PYTHONPATH=. .venv/bin/pytest -q tests/test_api.py tests/test_queue.py
```

Result: `31 passed`

### Added/covered scenarios

- timeout recovery for video with successful download
- timeout recovery for audio with successful download
- no completed candidates -> original timeout failure preserved
- media-type isolation in fallback list path (audio must not pick video)
- per-course serialization behavior remains enforced

## Beads tracking

- Epic: `mc2-a00q5`
- Tasks:
  - `mc2-a00q5.1` implementation
  - `mc2-a00q5.3` tests
  - `mc2-a00q5.2` verification/reporting

## References used (up-to-date docs)

- Context7 library: `/teng-lin/notebooklm-py`
- Python API docs (`generate`, `wait_for_completion`, download flows)
- `_artifacts.py` behavior (`poll_status`, `list_*`, `download_audio`, `download_video`)

## Residual risks

- Recovery depends on artifact timestamp/ordering quality from NotebookLM API.
- Very long queue backlogs may increase chance of selecting older same-type fallback if no near-start candidate exists.
- If NotebookLM marks completed but download URL is still unavailable, recovery still fails (current behavior: fail transparently).

## Follow-ups (optional)

1. Add configurable recovery skew window via env (currently constant 45s).
2. Add retry loop for download URL readiness in recovery path.
3. Persist recovery diagnostics to Stage7 enrichment metadata for easier UI/debug surfacing.
