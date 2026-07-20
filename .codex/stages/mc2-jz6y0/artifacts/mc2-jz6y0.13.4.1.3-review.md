---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1.3-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: source recovery controls writable production uploads, database dispositions, Docker daemon selection, secrets, and writer-service suspension
repo: mc2
branch: codex/q12-source-recovery-runtime-review
base_branch: codex/self-hosted-qdrant-platform
base_commit: f4a1d0ae
reviewed_commit: d4b1d667
reviewed_range: f4a1d0ae..d4b1d667
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-runtime-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.3-review.md
success_criteria:
  - independently review the immutable runtime implementation without editing it
  - verify three-service least privilege, secret and argument isolation, local-Docker selection, full-window writer restoration, fresh/resume behavior, and rollback reachability
  - run focused runtime, Compose, shell, CI, type-check, artifact, and process gates
  - report exact P0-P3 findings and PASS only when all counts are zero
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - graphify-out/GRAPH_REPORT.md
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md Task 5
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-authoritative-docs.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.3.md
selected_skills:
  - code-review
  - senior-devops
  - test-pass
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - deploy_specialist
  - correctness_reviewer
catalog_candidates:
  - none - installed review and DevOps skills cover this bounded review
parallel_group: q12-source-recovery-runtime-gate
depends_on_streams:
  - mc2-jz6y0.13.4.1.3
parallel_decision: sequential - independent review follows immutable implementation d4b1d667
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: temporary dependency symlinks are removed before delivery; review branch/worktree await orchestrator integration and cleanup
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: review-only artifact; corrections must be reflected in the later Task 6 operator/runbook documentation
graph_reviewed: used
graph_review_notes: read the shared GRAPH_REPORT.md and ran a focused read-only source-recovery/operator/Compose query; no graph refresh is appropriate for a review-only branch
verification:
  - exact range f4a1d0ae..d4b1d667 reviewed across 7 files, 1139 insertions and 13 deletions
  - focused runtime/operator/Compose Vitest passed 28/28 across 3 files with synthetic local Supabase placeholders
  - Compose JSON isolation rendering passed inside the focused runtime test, including exact mounts, digest image, no executor env_file/secrets, and network_mode none
  - bash syntax passed for the entrypoint and host wrapper
  - package type-check passed after temporary read-only dependency symlinks were supplied
  - CI/CD workflow deploy-gate test passed
  - process verification passed
  - git diff whitespace validation passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.3-review.md
explicit_defers:
  - no finding is accepted or deferred; implementation corrections and an independent re-review are required before integration
---

# Summary

## Findings-first verdict

**NEEDS_WORK; P0: 0, P1: 2, P2: 2, P3: 0.** The three Compose services have
the intended upload-root split, the executor is non-root and networkless without
an env file or secret mounts, the image is digest-addressed, and writer state is
restored after the tested success, failure, contention, and SIGTERM cases.
Acceptance is blocked because the local-Docker gate checks a different context
from the one Compose actually uses, and the only protected host workflow has no
rollback path.

| ID      | Severity | Confidence | Finding                                                                   |
| ------- | -------- | ---------- | ------------------------------------------------------------------------- |
| Q12-RR1 | P1       | high       | The local-Docker guard inspects `default`, not the active Docker context. |
| Q12-RR2 | P1       | high       | Guarded rollback is unreachable through the host lock/writer wrapper.     |
| Q12-RR3 | P2       | high       | Source-recovery processes can inherit the read-only Qdrant API key vars.  |
| Q12-RR4 | P2       | high       | Resume unnecessarily depends on planner-only input and capability state.  |

## Q12-RR1 — P1 — remote active Docker context bypasses the local-only gate

- **Repository evidence:** `deploy/qdrant/source-recovery-run.sh:72-75` rejects
  only `DOCKER_HOST`/`DOCKER_CONTEXT` environment overrides and then runs
  `docker context inspect default`. The actual command at
  `deploy/qdrant/operator-compose.sh:46` is plain `/usr/bin/docker compose`, so
  Docker selects `currentContext` from `~/.docker/config.json`, not necessarily
  the named `default` context that was inspected.
- **Reproduction:** configure a remote context as Docker's current context
  without exporting `DOCKER_CONTEXT`. `docker context inspect default` still
  reports `unix:///var/run/docker.sock`, while `docker context show` reports the
  remote context and plain `docker compose` uses it. The existing test double at
  `qdrant-source-recovery-runtime.test.ts:244-252` models only the former command
  and therefore cannot detect the mismatch.
- **Impact:** the wrapper can pass its stated local-only check and execute
  planner/executor/disposition containers against a remote Docker daemon. Host
  bind paths, writer state, and the flock then describe the local host while the
  mutation process runs elsewhere. That is an unauthorized remote-mutation and
  isolation failure.
- **Required fix:** resolve the active context first (`docker context show`),
  require the approved local context, inspect that exact context endpoint, and
  make the Compose invocation explicitly use the same verified context. Add a
  negative test where `default` is local but `currentContext` is remote.

## Q12-RR2 — P1 — the safe host workflow cannot run an approved rollback

- **Repository evidence:** the entrypoint exposes `rollback` and the executor
  service has the correct networkless writable mount, but
  `deploy/qdrant/source-recovery-run.sh:123-125` rejects `rollback` as a resume
  target. Its command chain at lines 275-293 can only plan/execute/verify/apply/
  verify; it always advances toward dispositions and never invokes
  `source-recovery rollback`.
- **Failure path:** after a partially completed execute or a post-copy
  verification stop, an operator can resume forward, but cannot choose the
  approved pre-reindex rollback while retaining this wrapper's local-Docker
  check, host flock, six-writer stop, signal handling, and exact restoration.
  The remaining option is an ad-hoc raw Compose invocation that bypasses those
  safety controls.
- **Impact:** the implementation exposes a rollback primitive but not a safe
  operational path to it. This breaks the recoverable local workflow precisely
  at a failure boundary and invites an unprotected production-upload mutation.
- **Required fix:** add an explicit rollback operation that validates the same
  reviewed manifest/journal and run ID, acquires the same host lock, stops and
  restores the exact writer set, invokes only the networkless executor rollback,
  and exits without forward verification/disposition commands. Cover success,
  command failure, signal restoration, phase rejection, and no-disposition
  ordering.

## Q12-RR3 — P2 — Qdrant credential isolation clears only the admin pair

- **Repository evidence:** all three Compose services blank only
  `QDRANT_API_KEY` and `QDRANT_API_KEY_FILE`
  (`docker-compose.infra.yml:241-242`, `:280-281`, `:312-313`). Planner and
  disposition import the broad production env file. The entrypoint similarly
  unsets only those two names at
  `packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh:343`.
  `QDRANT_READ_ONLY_API_KEY` and `QDRANT_READ_ONLY_API_KEY_FILE` are neither
  overridden nor unset.
- **Impact:** if either read-only key form exists in the production env file,
  the source-recovery planner/disposition process inherits an unrelated Qdrant
  credential despite the approved no-inherited-Qdrant-key contract. The key is
  not needed for source recovery and unnecessarily broadens process-secret
  exposure.
- **Required fix:** blank and unset both admin and read-only Qdrant key forms
  before every source-recovery execution, including the help path. Add rendered
  Compose and entrypoint tests with sentinel values proving none reaches the
  child environment or output.

## Q12-RR4 — P2 — durable resume still requires planner-only disposable inputs

- **Repository evidence:** `deploy/qdrant/source-recovery-run.sh:135-141` always
  requires the protected plan input and capability directory, lines 178-180
  always enforce their owner/mode/emptiness, and lines 189-195 always require the
  capability directory to share both upload-root devices. These checks run even
  with `--resume-from`, although the resume path skips plan and treats the
  immutable manifest plus bound journal as canonical state.
- **Impact:** losing, rotating, or cleaning either planner-only object after a
  durable plan can make execute/verify/disposition crash recovery impossible
  even when the reviewed manifest and journal remain intact. The extra files do
  not strengthen resume because their content is never compared with the loaded
  manifest.
- **Required fix:** make planner input/capability requirements fresh-plan-only.
  If Compose interpolation or the shared planner/verifier service requires
  placeholders for verify, split the service/mount contract or supply narrowly
  validated non-authoritative placeholders that are not recovery prerequisites.
  Add resume tests with the plan input and capability directory absent.

# Correctly Implemented Controls

- The executor has `network_mode: none`, no env file or secret mounts, UID/GID
  `1001:1001`, read-only development uploads and manifest, and writable access
  only to production uploads plus progress state.
- Planner upload roots are read-only; its only additional writable capability
  is a separate mode-0700, same-device, outside-root directory whose residue is
  rejected before and after planning.
- Disposition has database connectivity but no upload mount. All services use
  the digest-addressed operator image, read-only rootfs, all-capability drop,
  `no-new-privileges`, and bounded tmpfs mounts.
- Entrypoint mode and path validation is fail-closed, mutating modes require a
  lowercase UUIDv4 confirmation, and source-recovery does not call the Qdrant
  key staging helpers.
- One flock descriptor remains open across the tested forward command chain and
  exact active/inactive state restoration is attempted for all six writer
  services on normal exit, command failure, SIGINT, and SIGTERM.

# Verification

1. The immutable diff was inspected line by line against the approved Task 5
   design/plan and first-party Docker/systemd findings.
2. Focused Vitest passed 28/28: source-recovery runtime 11, operator runtime 9,
   and existing runtime/Compose contract 8. The first attempt stopped in unit
   setup because synthetic Supabase variables were absent; the same command
   passed after supplying non-secret local placeholders.
3. `bash -n` passed for both shell entrypoints. The Compose JSON render is part
   of the 11-test runtime file and proved exact image, network, mount, secret,
   UID, capability, read-only-root, cap-drop, and tmpfs shapes.
4. Course-gen-platform type-check passed after temporary dependency symlinks
   were provided. CI deploy-gate and orchestration process verification passed.
5. No container, service, database, Qdrant, upload source, remote host, staging,
   or production state was started or mutated.

# Delivery / Cleanup

Only this review artifact changes. Temporary dependency symlinks are removed
before commit. The review is returned for correction, not accepted; worktree and
branch cleanup remains orchestrator-owned after the artifact is integrated.

# Risks / Follow-ups / Explicit Defers

No finding is silently deferred. Q12-RR1 and Q12-RR2 block integration. The
corrected immutable runtime must receive a fresh independent review with a
negative remote-current-context test, safe rollback matrix, credential sentinel
test, and resume-without-planner-input test before Task 5 can be accepted.
