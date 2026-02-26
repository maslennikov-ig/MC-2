# NotebookLM Integration Sync Fix: Design Document

## 1. Problem Statement

The Stage 7 (Enrichments) integration with Google NotebookLM sometimes suffers from a synchronization issue: the generated audio or video artifact appears as "completed" and is downloadable within the NotebookLM Web UI, but our internal system remains indefinitely stuck in the `in_progress` state. This results in severe delays or timeouts for the end user, despite the AI generation actually succeeding.

## 2. Observed Evidence

**Code Analysis (`packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`):**

- The NotebookLM Python bridge polls task completion via `client.artifacts.poll_status(notebook_id, task_id)`.
- It loops based on `notebooklm_poll_interval_seconds` with exponential backoff until `notebooklm_generation_timeout_seconds` is reached (which defaults to 3600 seconds, or 1 hour, in `app/config.py`).
- A recovery mechanism (`_recover_completed_artifact`) successfully bypasses stuck tasks by searching for recently completed artifacts via `client.artifacts.list_audio` / `list_video`. However, this recovery is **only** triggered when the 1-hour timeout is breached (`MediaGenerationTimeoutError`) or when sequential HTTP errors exceed `notebooklm_poll_error_retry_limit` (`MediaGenerationPollError`).

**Logs Analysis (`logs/dev/worker-stage7-*.log`):**

- Log traces reveal the Stage 7 worker (`worker-stage7`) continuously requeuing and polling the background task state via the bridge's `/status` endpoint for nearly 30 minutes (`pollAttempt` reaching 28 with `60000ms` delay intervals).
- The bridge reports `status="in_progress"` the entire time because its internal `_wait_for_completion_with_progress` loop hasn't hit the 3600s timeout yet.

**NotebookLM-Py Documentation (Context7):**

- The `notebooklm-py` documentation explicitly details workaround scenarios for generation failures (e.g., polling returning `None` or failing due to rate limits/load). This implies that the internal task state tracking within Google's backend can be eventually consistent, buggy, or silently dropped.

## 3. Root Cause Hypotheses

1. **Buggy Upstream State Tracking (Most Likely):** Google's NotebookLM backend successfully finishes generating the artifact and attaches it to the notebook, but the background worker fails to transition the specific `task_id` status to `completed` via the polling API. Our bridge blindly trusts `poll_status` and waits a full hour before attempting the reliable recovery list check.
2. **Silent Task Death:** The upstream generation task crashes silently without updating its status to `failed`. Our bridge waits 3600s.
3. **Aggressive API Rate Limiting:** While we handle transient 5xx errors via `transient_poll_errors`, a stale cache response on the `poll_status` endpoint might continuously serve a 200 OK `in_progress` state.

## 4. Recommended Solution

**Proactive Recovery Polling (Hybrid Approach)**
Instead of waiting for an exception or a 1-hour timeout to trigger `_recover_completed_artifact`, we should weave the recovery check directly into the `_wait_for_completion_with_progress` polling loop.

**Scope Clarification:** The core fix is inside the Python bridge. However, we must ensure that the proactive recovery flow remains fully compatible with the Stage 7 `NotebookLMBridgeClient` (TypeScript) response format. The TypeScript handler relies on the final payload structure (media, extensions, `responseMetadata`), which we need to preserve precisely.

**Protection Against False Completion:**
Merely identifying an artifact with `is_completed=True` in the list API is not enough. Before declaring proactive recovery successful and aborting the main polling loop, we **must** verify the media's downloadability. The proactive recovery routine should attempt the actual download; if it succeeds, the task is marked completed. If it fails, the loop ignores the candidate and continues standard polling.

**Candidate Selection Strategy (Decision-Complete):**
The recovery candidate selection will strictly follow this priority order:

1.  **Task ID Match:** If an artifact in the list explicitly matches the exact `task_id` we are polling for.
2.  **Time Window Match:** Artifacts created within the temporal window near `request_started_at` (using existing time skew constants).
3.  **Latest Same-Type Fallback:** The most recently created artifact of the same media type.
    Every selection will produce a clear `selection_reason` logged for debugging.

**Anti-Rate-Limit Rules:**

- **Initial Wait:** Start proactive recovery checks only after `min_recovery_elapsed_seconds` (e.g., 180 seconds).
- **Interval:** Perform checks every `recovery_check_interval_seconds` (e.g., 60-90 seconds).
- **Error Isolation:** Errors during the proactive `list_audio`/`list_video` check will be caught and tracked independently. They will **not** interrupt the main `poll_status` loop.

## 5. File-by-File Change Plan

### `packages/course-gen-platform/docker/notebooklm-bridge/app/config.py`

- Add `notebooklm_proactive_recovery_start_seconds` (default 180.0)
- Add `notebooklm_proactive_recovery_interval_seconds` (default 60.0)

### `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`

**Update Candidate Selection (`_select_recovery_artifact`):**

- Implement the 3-tier priority list (Task ID -> Time Window -> Latest).
- Return a clear `strategy` (e.g., `matched_task_id`, `created_near_request_start`, `latest_same_type`).

**Modify `_wait_for_completion_with_progress`:**

- Track `last_recovery_check_at = 0`.
- Inside the loop, if `elapsed_seconds >= proactive_recovery_start_seconds` and `elapsed_seconds - last_recovery_check_at >= proactive_recovery_interval_seconds`:
  - Call `_recover_completed_artifact(...)` wrapped in `try/except`.
  - Update `last_recovery_check_at`.
  - If a `RecoverySelection` is found, **raise** a new `MediaGenerationProactiveRecovery` control-flow exception.

**Modify `_generate_with_notebooklm`:**

- Catch `MediaGenerationProactiveRecovery`.
- Inside the `download_started_at` block, if the download fails for a proactive recovery, we should ideally resume polling, but since we are out of the loop, the safest approach without massive refactoring is to simply let the download exception bubble up, or structurally, we move the download attempt _into_ the recovery logic.
- _Refined approach:_ To avoid fake completions, `_recover_completed_artifact` will just return the selection. `_generate_with_notebooklm` will attempt the download. If download fails during proactive recovery, log and raise.

## 6. Test Strategy

1. **Unit Testing (Bridge):**
   - Update/create `test_generator.py` or equivalent.
   - Mock `client.artifacts.poll_status` to continually return `in_progress`.
   - Mock `client.artifacts.list_audio` to return a completed artifact.
   - Assert that the loop exits after `min_recovery_elapsed_seconds` + interval, and verify the correct selection strategy logic (Task ID priority vs Time Window priority).
   - **Artifact Concurrency Test:** Provide a mock list with multiple recent audio artifacts. Assert that the one with the matching `task_id` (or closest time window) is selected.

2. **Integration Testing (Local):**
   - Run the bridge locally (`docker-compose.app.yml`).
   - Trigger a video generation via `worker-stage7`.
   - Verify the new `NotebookLM proactive recovery check` log lines.

3. **Manual Validation:**
   - Run `pnpm run test` (focusing on the "Bridge smoke test (video)" or equivalent).
   - Ensure the final asset is downloadable and the enrichment properly completes.

## 7. Operational Considerations

- **Idempotency:** The proactive recovery check is safe and read-only.
- **Monitoring:** Add detailed logging: `task_id`, `notebook_id`, `poll_attempt`, `elapsed_s`, `recovery_check_attempt`, `candidate_count`, `selected_artifact_id`, `selection_reason`.
- **Timeouts:** Ensure the proactive `list_audio` call does not stall the main polling loop.

## 8. Risks and Open Questions

- **Risk:** NotebookLM rate-limits the list endpoints if called too frequently.
  - _Mitigation:_ Strict 180s initial delay and 60s+ interval per task.
- **Risk:** Proactive recovery picks the wrong artifact if a user manually generated another one simultaneously in the same notebook.
  - _Mitigation:_ The explicit 3-tier strategy strongly prioritizes matching `task_id`. If `task_id` matching fails (due to upstream bugs removing it), the tight time window (`_RECOVERY_START_TIME_SKEW_SECONDS`) is the best heuristic.

## 9. Source Links

- [notebooklm-py Documentation (API)](https://github.com/teng-lin/notebooklm-py/blob/main/docs/python-api.md)
- [notebooklm-py Troubleshooting](https://github.com/teng-lin/notebooklm-py/blob/main/docs/troubleshooting.md)
