---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.13
stage_id: mc2-jz6y0
agent_type: worker
subagent_model: claude-fable-5
reasoning_effort: high
model_reasoning_rationale: Security-critical joined live-cutover controller; frozen-contract byte fidelity and D6 activation-truth handshake correctness required.
repo: /home/me/code/mc2
branch: codex/q12-root-join
base_branch: codex/self-hosted-qdrant-platform
base_commit: 8717f7ac7daba6cc9132788f2ab82af05f55f58c
worktree: /home/me/code/mc2/.worktrees/q12-root-join
write_zone:
  - deploy/qdrant/q12-live-smoke.sh
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-smoke.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-root-join.test.ts
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-q12-root.md
selected_docs:
  - docs/superpowers/plans/2026-07-14-q12-retained-barrier-capability-provenance-addendum.md (D5 plan Task 9)
  - docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md (frozen contract tail -c 47092 SHA-256 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5)
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md (§13 activation observation gate)
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-q12-d6.md (Named convention + defers)
selected_skills:
  - superpowers:executing-plans
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - backend/deploy worker (this stream)
parallel_group: Root-join mc2-jz6y0.13.13
depends_on_streams:
  - accepted W/M/H/D5J and D6 integration at 8717f7ac
parallel_decision: sequential
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Step 3 complete — independent correctness review PASS 0/0/0/5 (mc2-jz6y0.13.13-join-review.md) and docs review PASS 0/0/0/1 (mc2-jz6y0.13.13-docs-review.md); integrated at merge fcd05e27 with two orchestrator integration deltas (runbook genesis-null clause per docs F1; probe raw-NUL sort-separator escaped to \u0000 for text-tooling health, suites re-green). The five correctness P3s are accepted informational notes recorded in the join review artifact. Worktrees q12-root-join/q12-d6-probe/q12-d6-root and local branches removed after integration.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: Added the joined-controller subsection (smoke/observation gate and activation-truth handshake, local synthetic only, no live claims) to docs/operations/qdrant-self-hosted.md and a cross-reference in docs/operations/document-evidence.md. Independent docs review PASS 0/0/0/1; its sole P3 (genesis-null clause) fixed at integration.
graph_reviewed: no-change-needed
graph_review_notes: Graphify refresh is deferred to the stage-closeout boundary per the accepted plan; this isolated worktree performs read/query only and the write zone forbids graph changes.
verification:
  - 'Baseline before edits: 3-suite (q12-live-cutover + q12-command-manifest + q12-d6-root) 287/287 green under synthetic env SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key.'
  - 'RED smoke (5f34150a): q12-live-smoke.test.ts 20 failed / 4 passed (no wrapper, no smoke mode).'
  - 'GREEN smoke (08fe5256): q12-live-smoke.test.ts 24/24 passed.'
  - 'RED D6 frame join (0f372189, core stashed): q12-root-join.test.ts 15/15 failed (missing core functions).'
  - 'GREEN D6 frame join (312a6674): q12-root-join.test.ts 15/15 passed.'
  - 'Exact Root gate 3-suite (q12-live-cutover + q12-command-manifest + q12-live-smoke): 283/283 passed in 74.48s.'
  - 'bash -n deploy/qdrant/q12-live-cutover.sh deploy/qdrant/q12-capability-run.sh deploy/qdrant/q12-live-smoke.sh: exit 0.'
  - 'python3 -m py_compile deploy/qdrant/q12-lifecycle-core.py: exit 0.'
  - 'jq -e . deploy/qdrant/q12-command-manifest.json: exit 0.'
  - 'git diff --check: exit 0.'
  - 'Focused reruns of touched/adjacent suites (q12-d6-root, q12-root-join, q12-live-smoke, retained-barrier quiesce + w-composition seams): 117/117 passed.'
  - 'pnpm type-check: exit 0.'
  - 'Frozen bytes unchanged: sha256(deploy/qdrant/q12-command-manifest.json) = aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841; deploy/qdrant/q12-database-barrier.sh sha256 134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68 (not touched).'
changed_files:
  - deploy/qdrant/q12-live-smoke.sh
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-smoke.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-root-join.test.ts
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.13-q12-root.md
explicit_defers:
  - 'Live smoke subcommands (activation/stage2/stage4/stage5/stage6/notification-cycle/cleanup/contain) that touch the running system stay behind the separately authorized remote gate; only the synthetic observation-gate evaluator is implemented locally.'
  - 'q12-live-cutover.sh and q12-capability-run.sh production wrappers were left byte-unchanged; no joined edit to the retained D5 producer or the frozen manifest was required for the Task 9 smoke + D6 frame-join scope.'
  - 'Step 3 (independent correctness + docs review, integration, cleanup, artifact cleanup fields) is the orchestrator responsibility; this stream did not push, merge, or write Beads.'
---

# Summary

Implemented the Task 9 join deliverables that were explicitly deferred to
`.13.13`: the synthetic smoke/observation-gate evaluator and the Root-side D6
real frame envelope + R-handshake chain validation with validation-at-load.
Both are local, synthetic-only surfaces that take no remote/live action.

1. **Smoke/observation gate** — new `deploy/qdrant/q12-live-smoke.sh` thin
   wrapper (`exec python3 q12-lifecycle-core.py smoke "$@"`) plus a `smoke
observe` evaluator in the core. It fail-closed evaluates the §13 activation
   observation gate over an observation projection: 60-minute-plus window, one
   complete course cycle, and every metric threshold (coverage/baseline `100%`,
   isolation/incidents `0`, REST error `≤2%`, hybrid fallback `≤5%`, memory
   `≤85%`, point drop `≤10%`, exactly `12,114` initial-cutover points, `<3`
   degraded decisions, firing+resolved notification, and every activation row
   exactly `enabled=true`/`status=active`/`rollout_percentage=100`). Any breach
   keeps Q12 open on the phase-aware rollback/incident path; every terminal
   verdict records `rotation_required=true`.

2. **D6 frame envelope + R-handshake join** — new core frame surface
   (`d6_build_frame`, `d6_emit_frame_chain`, `d6_validate_frame`,
   `d6_validate_frame_chain`, `d6_load_transcript`, `d6_bind_handshake_authority`
   plus `D6_HANDSHAKE_KINDS`/`D6_CLASSIFICATION_FRAME_KIND`). Frames carry the
   exact `schema_version, sequence, kind, run_id, payload, previous_frame_sha256,
frame_sha256` envelope; `frame_sha256` hashes the canonical body excluding
   itself; the chain starts at sequence 1 from a null predecessor and chains the
   prior tip. Validation-at-load parses each stored frame, re-derives
   `frame_sha256` from `canonical()`, and re-verifies the chain — never hashing
   raw file/JSONL bytes. The binding consumes the accepted D6 coordinator objects
   (`d6_build_predecision`, `d6_build_terminal_seal`, `d6_verify_seal_binding`,
   `d6_terminal_seal_authority`, `d6_authority_without_seal`) unchanged, requires
   the predecision to bind the transcript head before its frame and the seal to
   bind both its predecision and the final transcript head, and hands the post-R
   frontier to Task 9 retirement for a `precommit_rollback_sealed` seal,
   finish-forward for a `committed_finish_forward_sealed` seal, and incident-only
   for a drift abort.

The five retained commands, W barrier bytes, the 20-command manifest, and all
frozen hashes are byte-unchanged. `q12-live-cutover.sh` and
`q12-capability-run.sh` were left byte-identical (no joined producer edit was
required for this scope), and `q12-live-cutover.test.ts` was not modified.

# Verification

See the frontmatter `verification` list. RED→GREEN per case-group: smoke
(RED `5f34150a` → GREEN `08fe5256`, 24/24) and D6 frame join (RED `0f372189`,
core stashed → GREEN `312a6674`, 15/15). The exact Root 3-suite gate is 283/283;
`bash -n` on the three shells, `py_compile`, `jq -e`, and `git diff --check` all
exit 0; the focused touched/adjacent reruns are 117/117; `pnpm type-check` exits 0. The frozen manifest and W barrier hashes are unchanged.

# Risks / Follow-ups

- The genesis frame's `previous_frame_sha256` is modeled as `null` (no prior
  frame). The frozen contract fixes the seven envelope keys and the chaining rule
  but does not pin a genesis sentinel literal; `null` is the natural
  no-predecessor marker and is validated as such at load. Flag for the reviewer
  if a `0*64` genesis sentinel is preferred for cross-object consistency with the
  journal `previous_hash`.
- The smoke evaluator is intentionally the synthetic observation-gate proof only;
  the live smoke subcommands remain remote-gated (see `explicit_defers`).
- Step 3 review/integration/cleanup and the artifact's cleanup-evidence fields
  are the orchestrator's; this stream is `returned`, not integrated.
