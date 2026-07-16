---
schema_version: orchestration-artifact/v1
artifact_type: independent-docs-review
task_id: mc2-jz6y0.13.13
stage_id: mc2-jz6y0
review_target: Root `.13.13` join docs delta (runbook + document-evidence + stage artifact)
reviewer: claude fable-5 (independent docs reviewer, read-only)
review_date: 2026-07-16
repo: /home/me/code/mc2
reviewed_worktree: /home/me/code/mc2/.worktrees/q12-root-join
range: 8717f7ac..dc6c2093
reviewed_files:
  - docs/operations/qdrant-self-hosted.md (joined-controller subsection, +39 lines)
  - docs/operations/document-evidence.md (cross-reference paragraph, +7 lines)
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-q12-root.md (new stage artifact)
verdict: PASS
scores_p0_p1_p2_p3: '0/0/0/1'
branch: codex/q12-root-join
base_branch: codex/self-hosted-qdrant-platform
base_commit: 8717f7ac
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
risk_level: high
cleanup_status: not_applicable
cleanup_notes: read-only review; single artifact write; no workspace to clean
verification:
  - 'docs review PASS 0/0/0/1; q12-live-smoke.sh observe driven live on accept/breach fixtures; runbook thresholds match code'
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-docs-review.md
explicit_defers:
  - 'none beyond the findings recorded in the review body'
---

# Summary

**PASS** — 0 P0, 0 P1, 0 P2, 1 P3 (informational completeness note).

The Root `.13.13` join docs delta accurately describes the integrated behavior
and makes no live/false claim. I verified the runbook and document-evidence
edits line-by-line against the actual controller code in the same worktree, and
additionally **drove the documented `q12-live-smoke.sh observe` command
end-to-end** with synthetic accept/breach fixtures — its output matches the
runbook exactly. Every named commit, frozen hash, and byte-identity claim in the
artifact verifies. The only finding is a P3 completeness note (the runbook is
silent on the genesis frame's `null` predecessor), which is not an inaccuracy.

## What verified clean (evidence)

- **Runbook thresholds ↔ code (exact):** every value in the runbook's
  observation-gate paragraph matches the controller constants —
  coverage/baseline `100%` (`SMOKE_REQUIRED_COVERAGE_PERCENT`/`_BASELINE_PERCENT`),
  isolation/incidents `0`, REST error `≤2%` (`0.02`), hybrid fallback `≤5%`
  (`0.05`), memory `≤85%` (`0.85`), point drop `≤10%` (`0.10`), exactly
  `12,114` initial-cutover points (`SMOKE_INITIAL_CUTOVER_POINTS=12114`, gated on
  `is_initial_cutover`), `<3` degraded decisions (`>=3` breach), firing+resolved
  notification, activation rows exactly `enabled=true`/`status=active`/
  `rollout_percentage=100`, ≥60 minutes (`SMOKE_MIN_OBSERVATION_MINUTES=60`), one
  complete course cycle. Breach → `selected_path=phase_aware_rollback_incident`,
  `q12_open=true`; elapsed time never converts a failed metric (accept requires
  empty `breaches`).
- **Command argv ↔ wrapper (exact):** `q12-live-smoke.sh` is a 4-line thin
  wrapper `exec python3 q12-lifecycle-core.py smoke "$@"`; the `smoke` subparser
  takes positional `action` (choices `("observe",)`), `--run-id`,
  `--observation-fixture`. The runbook's documented
  `q12-live-smoke.sh observe --run-id <run-id> --observation-fixture <path>`
  therefore maps to `… smoke observe --run-id … --observation-fixture …` and is
  correct. **Live-driven proof:** accept fixture →
  `{"accepted":true,"q12_open":false,"rotation_required":true,"selected_path":"accept"}`;
  breach fixture (45 min / 11000 points / 0.9 memory) →
  `{"accepted":false,"breaches":["initial_cutover_point_count","observation_window_too_short","qdrant_memory"],"q12_open":true,"rotation_required":true,"selected_path":"phase_aware_rollback_incident"}`.
- **Frame/handshake description ↔ code:** frame key envelope
  (`schema_version, sequence, kind, run_id, payload, previous_frame_sha256,
frame_sha256`) = `D6_FRAME_KEYS`; the completed kind order
  `db_locked → host_projection → host_bound → predecision → sealed → release →
closed` and drift `… → abort_incident` = `D6_HANDSHAKE_KINDS`; `frame_sha256`
  hashes the canonical body excluding itself (`d6_frame_sha256`); sequence from 1
  chaining the prior tip; validation-at-load re-derives from `canonical()` and
  never hashes raw bytes (`d6_load_transcript`). The seal-authority routing
  matches: `precommit_rollback_sealed → task9_retirement_rollback_preparation`,
  `committed_finish_forward_sealed → finish_forward`, drift = incident-only.
- **Named-convention consistency (Check 4):** `canonical()` is UTF-8 NFC,
  `separators=(",",":")`, `sort_keys=True`, no trailing LF — matching the D6
  artifact's binding "hash in-memory canonical NFC no-LF; validation-at-load
  parses then hashes." No contradiction with the D6 Named convention.
- **Artifact factual claims:** commits `5f34150a`/`08fe5256`/`0f372189`/
  `312a6674`/`dc6c2093` all exist with matching RED/GREEN/docs roles;
  `sha256(q12-command-manifest.json)` = `aaec6fc2…a841`;
  `sha256(q12-database-barrier.sh)` = `134255ce…ed68`. Both files, plus
  `q12-live-cutover.sh` and `q12-capability-run.sh`, are byte-unchanged vs base
  `8717f7ac` (empty diff) — no manifest command, systemd unit, or cron unit was
  invented.
- **rotation_required (Check 5):** the code only _records_ `rotation_required:
true` in the verdict JSON; it executes no rotation. The runbook ("Every
  terminal verdict records `rotation_required=true`") and document-evidence
  ("records `rotation_required=true` on every terminal verdict") are precise and
  consistent with `.13.8` remaining owner-deferred (a flag, not an action).
- **No live claim:** both surfaces are labeled "local, synthetic-only …
  Neither opens a database, container, socket, or service" / "take no
  remote/live action"; document-evidence keeps its NO-GO list intact and adds
  only an additive cross-reference.

# Findings

| id  | severity | confidence | file:line                                                                    | description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------- | ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | P3       | low        | `docs/operations/qdrant-self-hosted.md` (handshake paragraph, runbook ~L565) | The runbook states "the sequence starts at 1, and every frame chains the prior tip" but does not state what the genesis frame's `previous_frame_sha256` is (the code uses `null`). This is a completeness nuance, not an inaccuracy — the worker itself flagged the genesis-sentinel choice (`null` vs `0*64`) as an open modeling question in the artifact's Risks/Follow-ups. Optional: add one clause ("the genesis frame chains from `null`") once the sentinel is finalized. No action required for correctness. |

# Verification (per requested check)

- **Check 1 — runbook truth (joined local controller + smoke/observation only,
  no live claim, no invented command, manifest byte-unchanged): PASS.** All
  thresholds/kinds match code; manifest + barrier + both production wrappers
  byte-identical to base; no systemd/cron unit added; both surfaces labeled
  synthetic-only.
- **Check 2 — `q12-live-smoke.sh` usage matches actual argv/behavior: PASS.**
  Wrapper + subparser confirm the documented invocation; live-driven accept and
  breach runs match the documented verdict shape.
- **Check 3 — artifact factual claims verify: PASS (with one documentary-only
  limitation).** All five commits exist; both frozen hashes reproduce
  (`aaec6fc2`, `134255ce`). The test counts **283/283** (Root 3-suite gate) and
  **117/117** (focused reruns) could NOT be re-executed here: the vitest
  `global-setup` requires the pinned Qdrant `1.18.2` + PG17 disposable stack
  (`QDRANT_URL`/`QDRANT_API_KEY`), absent in this review sandbox. They are
  internally consistent and the underlying evaluator behavior they cover was
  verified directly by driving the CLI; treated as a limitation, not a finding.
- **Check 4 — consistency with the D6 Named convention and handoff
  "next recommended": PASS.** Canonical NFC/no-LF hashing and validation-at-load
  match the D6 artifact; the join honors the Named convention and consumes the
  D6 coordinator objects unchanged. (The handoff itself was not reviewed, per
  instruction — it updates at integration.)
- **Check 5 — `rotation_required=true` wording vs owner-deferred `.13.8`:
  PASS.** Documented as a recorded flag, never an executed rotation.

# Risks / Follow-ups

- No factual or safety correction required; the docs slice is accurate and clear
  to integrate.
- Optional F1 clause on the genesis `null` sentinel can be added when the worker's
  flagged sentinel choice is finalized during integration review.
- Re-run the 283/283 Root gate and 117/117 focused reruns on the full pinned
  Qdrant + PG17 stack during integration to close the environment-gated
  documentary limitation noted in Check 3.

# Verification

See the frontmatter `verification` list and the evidence recorded in the review body.
