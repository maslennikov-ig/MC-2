---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.18
stage_id: mc2-jz6y0
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: xhigh
model_reasoning_rationale: Security-critical durable crash-recovery producer and delegated claim boundary.
repo: /home/me/code/mc2
branch: codex/q12-d5-root-producer
base_branch: codex/self-hosted-qdrant-platform
base_commit: 8156b6adba50056210bbfa6dee913f92ecb045d0
worktree: /home/me/code/mc2/.worktrees/q12-d5-root-producer
write_zone:
  - deploy/qdrant/q12-live-cutover.sh
  - deploy/qdrant/q12-capability-run.sh
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-command-manifest.json
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.18-q12-root-d5.md
success_criteria:
  - One production serializer emits exact D5 selector/copy/capability/journal/checkpoint/result state.
  - The generic claim boundary validates FD 9 and inherited open-journal identity before execution.
  - Shared positives traverse production run_supervisor and run_claim through a no-I/O executor.
  - Mandatory initial recovery install rollback and activation matrices pass without external effects.
selected_docs:
  - docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md
  - docs/superpowers/plans/2026-07-14-q12-retained-barrier-capability-provenance-addendum.md
selected_skills:
  - superpowers:test-driven-development
  - senior-architect
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - backend/deploy worker
catalog_candidates:
  - none; frozen authority and installed skills were sufficient
parallel_group: Root-D5 mc2-jz6y0.13.18
depends_on_streams:
  - accepted D5 plan mc2-jz6y0.13.13
parallel_decision: sequential
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Worker worktree remains for independent review and orchestrator-owned integration cleanup.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: Frozen D5 design and plan already define the durable contract; worker scope forbids project-doc edits and implementation introduces no new contract beyond them.
verification:
  - focused RED 91 tests: failed as expected with 17 passed and 74 missing-production failures
  - independent-review repair RED 171 tests: 164 passed and 7 failed at process/crash boundaries
  - checkpoint repair CAS RED 205 selected tests: 201 skipped and 4 failed
  - normal checkpoint publication CAS RED: 1 selected test failed
  - durable zero-dimension recovery scan RED: 3 of 6 selected crash rows failed
  - exact-result binding RED: all 6 selected mutation rows failed
  - self-consistent journal grammar RED: all 6 selected mutation rows failed
  - R2 true-lock-loss and terminal-grammar RED: 224 collected; 4 selected and 4 failed
  - R2 canonical-FD9 RED: 229 collected; 5 selected and 5 failed
  - R2 stable-binding RED: 233 collected; 4 selected with 2 failed and 2 passed
  - R2 fixed-R checkpoint RED: 233 collected; 1 selected and 1 failed
  - R2 reissue/orphan structural RED: 236 collected; 3 selected and 3 failed
  - R2 real-process recovery GREEN: 241 collected; 5 selected and 5 passed after one injected-boundary repair
  - R2 lease hardening RED: 245 lifecycle tests collected; 2 selected and 2 failed
  - R2 lease hardening GREEN: 2/2 narrow and 8/8 adjacent FD9/session tests passed
  - R2 full focused Root D5 GREEN 248 tests: passed with zero failed and zero pending
  - controller rerun focused Root D5 GREEN 248 tests: passed in 78.73 seconds
  - bash -n deployed wrappers: passed
  - python3 -m py_compile core and runner: passed
  - jq -e command manifest: passed
  - Prettier check three TypeScript files: passed
  - ESLint three TypeScript files: passed
  - git diff --check: passed
  - artifact validation: passed
  - external effect and residue scan: passed
changed_files:
  - deploy/qdrant/q12-live-cutover.sh
  - deploy/qdrant/q12-capability-run.sh
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-command-manifest.json
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-cutover.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.18-q12-root-d5.md
explicit_defers:
  - Full plan/live/recover controller, joined rollback/DB proof, and activation truth classifier are Task 9 join responsibilities; D6 blocks that join, not this Root producer checkpoint.
---

# Summary

Implemented and R2-hardened the Root-owned D5 retained-barrier producer, fixed five-command manifest, production-only shell entrypoints, separate delegated claim transaction, symlink-safe canonical FD9 identity checks, post-validation lease-session anchoring, durable true-lease-loss recovery inference, complete terminal-evidence validation, fixed-R rollback projection, distinct reissue/orphan ancestry, no-I/O shared fixture runner, branded TypeScript fixture contract, and table-driven Root matrix. Production CLI inputs remain fixed typed fields and cannot select a manifest, executor, command, environment, path, fixture mode, or fault injection.

# Scope / Routing

The worker used only the exact Root-D5 write zone. The approved design SHA-256 `b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8`, plan SHA-256 `8278bce9f335bbef1204e60ff7c22383d15abc13237b80abfc53a6d2d285a0ed`, all six inherited design/plan hashes, base HEAD, branch, and clean starting state were verified before RED. The pushed review baseline is `e6a8440a2c6f6814329496633c06bfab6f37a502` with upstream divergence `0/0`; R2 corrections are intentionally uncommitted pending the controller rerun. Work stayed sequential because Root-D5 is the explicit producer dependency for W.

# Verification

The initial focused RED collected successfully and failed for missing production files/runner: 91 total, 17 passed, 74 failed. Independent repair then witnessed separate REDs for the process boundary/same-root crash matrix, checkpoint repair and normal-publication CAS, production-shaped zero-dimension durable recovery, exact-result binding, and self-consistent journal grammar. R2 added genuine RED/GREEN coverage for independent-process lease loss, canonical FD9 identity, complete terminal evidence, fixed-R rollback ancestry, separate recovery reissues/publication-window orphans, and stable install/rotation bindings. The final narrow lease hardening RED collected 245 lifecycle tests with exactly two selected failures: a symlinked canonical-lock ancestor was accepted, and a failed wrong-FD call poisoned the same executor's session. The corresponding GREEN passed 2/2 narrow and 8/8 adjacent rows. Fresh implementer and controller focused evidence is 248/248 with zero failed/pending (245 lifecycle plus 3 manifest); the controller rerun took 78.73 seconds. Static gates cover both wrappers, both Python files, JSON syntax, all three TypeScript files, artifact format, whitespace, process residue, and temporary run roots.

The last independent rereview of pushed HEAD `e6a8440a` is the blocking FAIL report `.superpowers/sdd/d5-root-implementation-rereview-report.md`, SHA-256 `5e1e5e9c1cae9122bd5ec4c86c5bf8d8034a9e57f7d54fca3ea019c9f468f18e` (P0/P1/P2/P3 `2/4/1/0`). The current uncommitted R2 correction has not yet received the required controller-owned rereview, so this artifact does not claim acceptance.

FD/open-file-description implementation checks used Python `3.14.4` / Linux `6.6.114.1-microsoft-standard-WSL2` and the first-party Python `os` reference (`https://docs.python.org/3/library/os.html#os.dup`) plus Linux man-pages `flock(2)` and `rename(2)` references (`https://man7.org/linux/man-pages/man2/flock.2.html`, `https://man7.org/linux/man-pages/man2/rename.2.html`).

# Delivery / Cleanup

The R1 implementation/repair commits `c93d766d94d36b57fbb95a4b2bea61e1f31e2169` and `e6a8440a2c6f6814329496633c06bfab6f37a502` are pushed. R2 corrections are intentionally uncommitted and unpushed pending the controller rerun. Integration acceptance and safe removal of this worktree/local branch remain orchestrator-owned; cleanup is correctly `pending` here.

# Risks / Follow-ups / Explicit Defers

This is a locally verified R2 producer correction, not an accepted review result or full-spec completion claim. Task 9 owns the joined `plan|live|recover` controller and consumes W/M/H; D6 must supply the read-only activation truth classifier before that join can select activation rollback versus finish-forward. No Docker, database, network, SSH, service, Qdrant, Supabase, writer, scheduler, staging, or production action occurred. Root-D5 still awaits the controller rerun before acceptance.

docs-reviewed: no-change-needed — frozen design/plan already specify the implemented durable behavior and this worker was prohibited from editing durable docs.

graph-reviewed: no-change-needed — Graphify output was unavailable in this isolated worktree and the assigned write zone forbids graph changes; the accepted plan defers refresh to integration closeout.
