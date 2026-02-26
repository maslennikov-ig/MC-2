# NotebookLM Sync Fix Implementation Report

## 1. Root Cause

**Issue:** Generated NotebookLM audio/video artifacts appeared in the Google UI but remained stuck in the `in_progress` state within our pipeline (Stage 7).
**Evidence:**

- The Python bridge polling logic (`client.artifacts.poll_status`) was faithfully reporting Google's returned status.
- In many cases, Google's internal state tracking fails to update the task to `completed`, leaving the task indefinitely pending.
- The bridge's recovery mechanism (`_recover_completed_artifact`) was only being invoked after a hard 1-hour timeout (`MediaGenerationTimeoutError`) or upon successive network failures (`MediaGenerationPollError`).

## 2. Design Updates Applied

Per the design review, the following critical changes were integrated into the `Proactive Recovery` polling mechanism:

1. **Scope Clarification:** The fix was entirely localized within the Python Bridge (`generator.py`). However, the final output structure was strictly preserved to ensure seamless compatibility with the existing TypeScript (`NotebookLMBridgeClient`) payload expectations.
2. **Downloadability Verification (Protection Against False Completion):** A candidate artifact found via `list_audio`/`list_video` is no longer blindly accepted. The proactive recovery check explicitly attempts to download the artifact first. If the download succeeds, the task short-circuits to completion. If it fails, the error is swallowed and the standard polling loop continues.
3. **Decision-Complete Candidate Selection:** Added a rigorous 3-tier prioritization model for artifact recovery:
   - **Tier 1:** Exact `task_id` match.
   - **Tier 2:** Time-window match (created near `request_started_at`).
   - **Tier 3:** Latest same-type fallback.
     _Every selection explicitly logs a `strategy` string to trace why an artifact was chosen._
4. **Anti-Rate-Limit Rules:**
   - Proactive checking begins only after `notebooklm_proactive_recovery_start_seconds` (set to conservative **180s** by default to prevent early API exhaustion).
   - Subsequent checks occur every `notebooklm_proactive_recovery_interval_seconds` (set to **60s** by default).
   - Any list/download exceptions during the proactive check are isolated (`try/except`) and do not abort the main status polling loop.
5. **Concurrency Tests:** Added comprehensive tests for candidate selection, explicitly validating that a correct `task_id` match overrides a closer time-window match.

## 3. Code Changes by File

- `packages/course-gen-platform/docker/notebooklm-bridge/app/config.py`:
  - Added `notebooklm_proactive_recovery_start_seconds` (default: 180s) and `notebooklm_proactive_recovery_interval_seconds` (default: 60s) to control polling thresholds.
- `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`:
  - Created `MediaGenerationProactiveRecovery` exception to handle control flow.
  - Injected non-blocking periodic recovery checks into the `while True` loop of `_wait_for_completion_with_progress`.
  - Upgraded `_select_recovery_artifact` with a 3-tier matching priority system.
  - Moved media downloading directly into the proactive verification block before accepting a candidate.
- `packages/course-gen-platform/docker/notebooklm-bridge/tests/test_queue.py`:
  - Appended `test_proactive_recovery_triggers_and_succeeds` to verify time-based triggering.
  - Appended `test_recovery_prefers_matched_task_id` to verify artifact selection prioritization against noise.

## 4. Verification commands + outputs

### Unit Tests

```bash
cd packages/course-gen-platform/docker/notebooklm-bridge && PYTHONPATH=. .venv/bin/pytest tests/
```

```text
========================= test session starts ==========================
platform linux -- Python 3.12.3, pytest-8.4.2, pluggy-1.6.0
rootdir: /home/me/code/mc2/packages/course-gen-platform/docker/notebooklm-bridge
plugins: anyio-4.12.1
collected 33 items

tests/test_api.py ...........                                    [ 33%]
tests/test_queue.py ......................                       [100%]

========================== 33 passed in 0.84s ==========================
```

### Manual Validation Evidence (AUDIO)

```bash
bash scripts/nlm-stage7-preflight.sh --type nlm_audio --timeout-seconds 420
```

```text
[stage7-smoke] Final status: completed
[stage7-smoke] Playback URL: http://localhost:3000/storage/enrichments/8baaa75e-bb85-496e-81df-807e770fd73d/3d39c52e-929e-432c-b6e3-b3ae741edee5/d707e3aa-ce1c-4565-a65a-fcb68e119563.mp3
[stage7-smoke] Local file: /home/me/code/mc2/data/enrichments/8baaa75e-bb85-496e-81df-807e770fd73d/3d39c52e-929e-432c-b6e3-b3ae741edee5/d707e3aa-ce1c-4565-a65a-fcb68e119563.mp3
```

### Manual Validation Evidence (VIDEO)

```bash
bash scripts/nlm-stage7-preflight.sh --type nlm_video --timeout-seconds 900
```

**Artifact Chain:**

- **Stage 7 Job ID:** `enrich-ondemand-30f93d2b-822c-4e3c-b1cf-46c177594985`
- **Enrichment ID:** `30f93d2b-822c-4e3c-b1cf-46c177594985`
- **Bridge Task ID:** `5eaf015d84be4707bc7998d667026b4a`
- **NotebookLM internal task_id:** `7be427ac-1a84-4544-b812-0f120f4ae852`
- **Notebook ID:** `e7ed8725`
- **Recovered Artifact ID:** `17ec13ad-bffb-4863-85f3-c1b5f805cffb`
- **Result:** Successfully recovered (triggered at `elapsed_s=183.58` via `proactive_poll_1`), verified downloadability (size `12823236` bytes), and downloaded to the local file system at `/home/me/code/mc2/data/enrichments/8baaa75e-bb85-496e-81df-807e770fd73d/3d39c52e-929e-432c-b6e3-b3ae741edee5/30f93d2b-822c-4e3c-b1cf-46c177594985.mp4` with a `completed` status in the system.

## 5. Known gaps / residual risks

- **List Rate-Limiting:** Although we use conservative defaults (waiting 180s, then checking every 60s), highly concurrent generation jobs across multiple course processing instances might still hit an undocumented NotebookLM rate limit for the `list` endpoints.
- **Time Skew Heuristics:** In the rare case where NotebookLM silently strips the `task_id` and the temporal window heuristics misidentify an artifact generated by another concurrently running background job.

## 6. Rollback Plan

If proactive polling aggressively burns NotebookLM API quotas resulting in mass 429s:

1. Revert `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py` to the previous commit.
2. (Or hotfix) Set `NOTEBOOKLM_PROACTIVE_RECOVERY_START_SECONDS=7200` via `.env` to effectively push proactive polling out of the operational window without a code redeploy.
