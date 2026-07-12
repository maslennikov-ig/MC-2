---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.5-transport-correction-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: A recovery integration test can silently target an unrelated Qdrant listener unless its server-side transport origin and disposable Docker ownership are explicit and fail closed.
repo: mc2
branch: codex/q12-local-snapshot-review
base_branch: codex/q12-local-snapshots
base_commit: c355d895d8913a83c42956417fd34125485d1389
reviewed_range: 52aa83d02528fddd6c544467190f43023ea506b4..c355d895d8913a83c42956417fd34125485d1389
immutable_finding_commit: 6326769d71bfeeae76afff00c6a75e4a8022b31a
persistence_correction_review_commit: 0a77c961
worktree: /home/me/code/mc2/.worktrees/q12-local-snapshot-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-transport-correction-review.md
success_criteria:
  - Every managed recovery location uses one validated credential-free owned transport origin instead of host port 6333.
  - Managed mode requires host.docker.internal, rejects port 6333, and recreates containers with host-gateway routing.
  - RED and GREEN evidence proves the exact recovery location while unrelated helixa-qdrant-1 remains untouched.
  - Disposable containers, volumes, listeners, files, and links are absent afterward.
  - No CI, deployment environment, runtime Compose, or operator contract regresses in this test-only delta.
selected_docs:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5.md at c355d895
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-review.md at 6326769d
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-correction-review.md at 0a77c961
selected_skills:
  - code-review
  - test-pass
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review skills cover this bounded test-harness delta
parallel_group: Q12-owner-input-recovery
depends_on_streams:
  - mc2-jz6y0.13.5-correction-review
parallel_decision: sequential
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: Read-only inspection found no mc2-q12 managed container, mc2_q12 named volume, or listener on RED/GREEN ports 41352/40776; no local resource was created by this bounded static review.
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: The implementation artifact accurately records the transport correction, exact RED/GREEN ports, helixa isolation, and cleanup; durable operator/runbook behavior did not change.
graph_reviewed: used
graph_review_notes: The stage Graphify report was already read; a test-only read-only delta does not require graph refresh.
verification:
  - git diff --check 52aa83d0..c355d895 passed.
  - Static call-site scan found zero hardcoded 127.0.0.1 port 6333 uses and exactly five recovery locations bound to snapshotTransportUrl.
  - Managed origin validation, host-gateway recreation, exact recoverSnapshot location assertion, and non-6333 guard were inspected line by line.
  - No-change diff gate passed for .github, Compose, env examples, deploy files, and durable docs.
  - Updated implementation artifact validation passed.
  - Read-only cleanup inspection found zero owned container, volume, or RED/GREEN listener leftovers; helixa-qdrant-1 remained running on host 6333/6334 since its prior start time.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-transport-correction-review.md
explicit_defers:
  - mc2-jz6y0.13.6 remains the mandatory production off-host S3 lifecycle, restore, alert, and rollback gate.
---

# Summary

## Findings-first verdict

**PASS for test-harness correction `c355d895`.** Findings: P0: 0, P1: 0,
P2: 0, P3: 0. No findings were identified in the bounded delta
`52aa83d0..c355d895`.

The correction closes the orchestrator's transport-isolation finding without
changing runtime, CI, deployment, or environment contracts. The managed suite
now has separate meanings for the host-side client URL and the URL that Qdrant
uses server-side to retrieve the snapshot. All five recovery locations consume
the validated server-side origin; none retains the ambiguous host
`127.0.0.1:6333` value.

## Transport and ownership evidence

- `qdrant-snapshot-restore.test.ts:188-207` requires
  `QDRANT_SNAPSHOT_TRANSPORT_URL`, parses it as an HTTP URL, rejects credentials,
  path, query, and fragment, then normalizes it to `origin`. In managed mode it
  requires hostname `host.docker.internal` and rejects port `6333`.
- `qdrant-snapshot-restore.test.ts:136-164` recreates only the regex-bounded
  owned container/volume and adds
  `host.docker.internal:host-gateway`, allowing the Qdrant container to fetch
  its own snapshot through the Docker-selected owned host port.
- The four `runRestoreDrill` calls and the direct corrupt-checksum/wrong-key
  recovery location all use `snapshotTransportUrl`
  (`qdrant-snapshot-restore.test.ts:384,450,483,523,561`). A repository scan
  found no remaining `127.0.0.1:6333` in this test.
- The successful drill spies on `recoverSnapshot` and requires the exact target
  collection plus the exact normalized owned-origin snapshot location
  (`qdrant-snapshot-restore.test.ts:375-414`). This makes a regression to port
  6333 observable even if another Qdrant happens to answer there.
- The implementation artifact links the immutable Q12-LR1 review at
  `6326769d`, its persistent-volume correction, and this later transport
  correction. It records an expected RED 6/7 on Docker-selected `41352`, where
  the only failure exposed the stale 6333 location, followed by GREEN 7/7 on
  Docker-selected `40776` with the exact owned location.
- Read-only post-run inspection found no managed `mc2-q12-*` container,
  `mc2_q12_*` volume, or listener on `41352`/`40776`. The unrelated
  `helixa-qdrant-1` remained running with its unchanged prior start time and
  host mappings 6333/6334.

# Verification

## Bounded matrix

| Surface                         | Evidence                                                   | Result                 |
| ------------------------------- | ---------------------------------------------------------- | ---------------------- |
| five recovery locations         | static call-site scan and line review                      | PASS, 5/5 owned origin |
| origin validation               | protocol/credentials/path/query/hash/host/port guards      | PASS                   |
| exact transport assertion       | `recoverSnapshot.location` spy                             | PASS                   |
| unrelated host Qdrant isolation | RED/GREEN artifact plus read-only container inspection     | PASS                   |
| cleanup                         | container, volume, and listener absence                    | PASS                   |
| CI/runtime/env regression       | path-scoped no-change diff                                 | PASS                   |
| broad release matrix            | intentionally not repeated for this test-only bounded delta | not required           |

Commands and results:

1. `git diff --check 52aa83d0..c355d895` — passed.
2. `rg` call-site checks — zero hardcoded `127.0.0.1:6333`; exactly five
   recovery location assignments consume `snapshotTransportUrl`; validation and
   host-gateway guards are present.
3. `git diff --quiet 52aa83d0..c355d895 -- .github docker-compose.infra.yml .env.production.example packages/course-gen-platform/.env.example deploy docs` — passed; the delta is limited to the integration test and its tracked artifact.
4. `python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5.md` — passed.
5. Docker/port read-only cleanup checks — no `mc2-q12-*`, `mc2_q12_*`, `41352`,
   or `40776` leftovers; `helixa-qdrant-1` is still running on 6333/6334.

The implementer's exact managed RED/GREEN suite was not repeated by instruction:
the immutable artifact contains RED 6/7 and GREEN 7/7 evidence, while this
review independently inspected the complete delta and cleanup state.

`docs-reviewed: no-change-needed` — only the tracked implementation artifact
changed, and its correction record is accurate.

`graph-reviewed: used` — no refresh is needed for this read-only test-only
delta.

# Delivery / Cleanup

Only this final correction-review artifact is changed on the review branch.
Commit `c355d895` is approved for orchestrator integration. This review did not
edit implementation, Beads, staging, CI, runtime configuration, or external
state.

# Risks / Follow-ups / Explicit Defers

- The managed integration harness now fails closed away from the known unrelated
  host port 6333 and asserts the exact owned origin. Synthetic test credentials
  remain bounded to disposable resources.
- `mc2-jz6y0.13.6` remains mandatory before production for off-host S3 and is
  unaffected by this test-only correction.
