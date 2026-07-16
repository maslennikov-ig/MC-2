---
schema_version: orchestration-artifact/v1
artifact_type: orchestrator-implementation-stream
task_id: mc2-jz6y0.13.19
stage_id: mc2-jz6y0
agent_type: root orchestrator with two worktree workers, two independent correctness reviewers (initial + delta), and a field-11 ratification reviewer
subagent_model: claude-fable-5
reasoning_effort: high
model_reasoning_rationale: activation-truth classifier is security-critical live-cutover authority; frozen-contract byte fidelity required.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 72af414c
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs
  - deploy/qdrant/q12-activation-truth-projection.sql
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-activation-truth-runner.cjs
  - packages/course-gen-platform/tests/unit/ops/q12-activation-truth.test.ts
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-d6-root.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-d6-root-runner.py
  - deploy/qdrant/q12-managed-session-inventory.json
  - packages/course-gen-platform/tests/unit/ops/q12-managed-session-inventory.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-q12-d6.md
selected_docs:
  - docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md (normative bytes tail -c 47092 SHA-256 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5)
  - docs/superpowers/plans/2026-07-15-q12-d6-activation-truth.md (reviewed plan)
  - docs/superpowers/specs/2026-07-16-q12-full-completion-design.md
  - docs/superpowers/plans/2026-07-16-q12-full-completion.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md (W tuple, field 11 ratified)
selected_skills:
  - orchestrator-stage
  - prompt-authoring
  - superpowers:executing-plans
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - orchestration-bridge:worker (d6-probe-worker, d6-root-worker)
  - orchestration-bridge:correctness-reviewer (field11-reviewer, d6-probe-review, d6-root-review)
catalog_candidates:
  - none; installed plugin workers/reviewers were sufficient
parallel_group: D6-two-streams
depends_on_streams:
  - accepted W mc2-jz6y0.13.10 at 60910053 (FLIP) and D5W mc2-jz6y0.13.20
  - field-11 ratification (this stage, delivered at 72af414c)
parallel_decision: PDM ruled two disjoint worktree streams (write_isolation + parallel_latency) per the contract ownership table; integration and Root .13.13 join stay sequential in the accepted stream. Task-numbering conflict between the full-completion plan headers and the reviewed D6 plan resolved in favor of the contract ownership table (S1 = Tasks 1-14, S2 = Tasks 15-19, S3 = Task 20).
status: merged
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: pending
cleanup_notes: worktrees q12-d6-probe/q12-d6-root and local branches retained until stage closeout cleanup; nothing uncommitted in either.
risk_level: high
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: independent docs review (mc2-jz6y0.13.19-docs-review.md) FAIL on five staleness findings, all fixed exactly; re-verification PASS 0/0/0/1 (F6 accepted as history).
graph_reviewed: used
graph_review_notes: focused graphify queries (q12-lifecycle-core structure) informed routing; refresh deferred to the stage closeout boundary.
verification:
  - 'Task 0 gate: W .13.10 closed at 60910053, .13.20 closed; sha256(deploy/qdrant/q12-command-manifest.json) = aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841 (accepted successor); contract tail -c 47092 = 2a2251ac…'
  - 'Field 11 ratified: independent review PASS P0/P1 zero (mc2-jz6y0.13.19-field11-ratification-review.md); canonical hash c90edb78… reproduced; inventory at deploy/qdrant/q12-managed-session-inventory.json; pin test 5/5'
  - 'Stream 1 (probe, Tasks 1-14 + corrections F1/F2/F3/DF1): review PASS 0/0/2/4 + delta PASS (mc2-jz6y0.13.19-probe-stream-review.md); final focused suite 80/80 with MC2_Q12_REAL_PG17=1, 64/16-skipped without; CLI real (EXIT_REJECTED=3 defined rejection), 3-point snapshot discipline with mid-run-drift RED proof'
  - 'Stream 2 (root, Tasks 15-19 + corrections NFC/after-read+rewind/seal-binding-enforced): review PASS 0/0/1/4 + delta PASS (mc2-jz6y0.13.19-root-stream-review.md); focused 5-suite set 337/337; manifest byte-unchanged aaec6fc2…'
  - 'Cross-stream canonicalization byte parity PROVEN at integration head: identical sha256 764d1b37… from probe.cjs canonicalize() and q12-lifecycle-core.py canonical() on a non-ASCII composed/decomposed object; both no-trailing-LF'
  - 'Field 5-10 repro at integration head: node mc2-jz6y0.13.10-activation-tuple-repro.cjs reproduces all six byte-identically incl. field 7 recovery slice c41cf104… (closes Stream-1 finding F2 at integration level)'
  - 'Integration head 3d70eaf2 focused D6+W battery: 424/424 (8 files, MC2_Q12_REAL_PG17=1)'
  - 'Broad ops+scripts battery: 913 passed / 1 failed / 24 files — the 1 failure is the known pre-existing environment failure qdrant-observability-contract.test.ts:223 (QDRANT_METRICS_GID), fails identically on the pre-Q12 base'
  - 'pnpm type-check: exit 0'
  - 'pnpm build (synthetic web env): exit 0, 75/75 static pages'
  - 'scripts/orchestration/run_process_verification.sh: process verification OK'
changed_files:
  - packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs
  - deploy/qdrant/q12-activation-truth-projection.sql
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-activation-truth-runner.cjs
  - packages/course-gen-platform/tests/unit/ops/q12-activation-truth.test.ts
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-command-manifest.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-d6-root.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-d6-root-runner.py
explicit_defers:
  - 'Pinned-server capability gates (POSIX_SPAWN_CLOSEFROM atomicity, pidfd_getfd under real PTRACE_MODE_ATTACH_REALCREDS/Yama, production CA-hash acceptance, production PATH/HOME spawn env): behind the separately authorized remote observation gate; never faked green locally.'
  - 'Fields 5/6/8/9 production re-freeze (Task C7): SQL/catalog remain the W Layer-1 test-reference set (69/79 placeholders) until the production expected-post-migration-catalog exists.'
  - 'Root-side real frame envelope emission/chain validation across the R handshake: .13.13 join scope per the contract ownership table.'
---

# Summary

D6 `.13.19` activation-truth classifier implemented exactly per the frozen
contract (byte-identity `2a2251ac…`) and the reviewed plan: the read-only
PG17 probe (`inspect`, Node CJS, FD-11 SQL allowlist, pinned Supavisor TLS
identity) and the Root coordinator authority (posix_spawn FD boundary,
pidfd/proc/OFD gates, predecision → optional durable `R` → terminal seal,
post-`R` D5 narrowing, restart authority) — two disjoint worktree streams,
each RED→GREEN per task, each independently reviewed with a delta review
after corrections, integrated at `3d70eaf2` with the full local matrix green.

## Orchestrator rulings (recorded decisions)

1. **Stream split**: contract ownership table governs over the
   full-completion plan's A2/A3 header task lists (S1 = 1–14, S2 = 15–19).
2. **Task 15 second file waived**: `q12-live-cutover.test.ts` sits at the
   eslint `max-lines` error cap; the retained-command immutability proof is
   complete in `q12-command-manifest.test.ts`; the file is byte-identical to
   base and eslint.config.mjs untouched.
3. **Stream-2 write-zone extension**: `q12-d6-root.test.ts` +
   `fixtures/q12-d6-root-runner.py` (create-only) authorized for the
   contract-required Tasks 16–19 RED gates; disjointness preserved;
   `q12-retained-barrier-runner.py` pattern is precedent.
4. **`projection_sql_sha256` binding**: binds the authored FD-11 file's own
   hash (final `36d280347650689de1d6c613f164c2eaa622f0eb567b134dd5b3b2cdad5332af`
   after the legitimate `pg_catalog.coalesce`→`COALESCE` fix), not W field 5
   — the plan's "bound from field 5" sentence is imprecision; contract :365
   separates the request keys. Confirmed by the independent reviewer.
5. **DF1 upgraded to must-fix**: the literal 3-point snapshot-clear +
   fresh-read discipline (contract :287) is drift-detection-critical
   (pg_stat_activity is not MVCC-bound); implemented with a deterministic
   mid-run-drift RED proof.
6. **Field-11 F1 carried note**: `transaction_free_required=false` on
   `supabase_admin` managed clients follows the accepted `.13.14`
   trusted-provider residual boundary; drift trips only when the predicate is
   required true and observed false.

## Named convention (binding for .13.13 join)

All D6 hashes (frame `frame_sha256`, journal `entry_hash`,
`predecision_sha256`, seal binding) are computed over the in-memory
canonical form: UTF-8 NFC, compact separators, recursively key-sorted, NO
trailing LF. Durable files store canonical+LF (storage-only). Validation at
load must parse → canonical() → hash and never hash raw file/JSONL bytes;
transcript-head hashing hashes canonical frames. Cross-language byte parity
proven (`764d1b37…` from both implementations).

# Verification

See the frontmatter `verification` list: Task 0 gate, field-11 ratification,
both stream reviews + deltas, cross-stream canonical byte parity, field 5-10
repro, 424/424 focused, 913/914 broad (1 known env failure), type-check 0,
build 0 (75/75), process verification OK — all at integration head `3d70eaf2`
(merges `7f511691` Stream 1, `3d70eaf2` Stream 2, both --no-ff).

# Risks / Follow-ups

- Pinned-server capability gates stay remote-gated (never faked green).
- Fields 5/6/8/9 production re-freeze at Task C7; the delivered SQL embeds the
  W Layer-1 test-reference catalog by construction.
- Root-side real frame emission/chain validation and validation-at-load
  binding are .13.13 join scope; the Named convention section is binding.
- Field-11 F1 semantics note carried (`.13.14` residual boundary).

## Review lineage

- Field 11: PASS P0/P1 zero (`mc2-jz6y0.13.19-field11-ratification-review.md`).
- Stream 1: PASS 0/0/2/4 → corrections (real CLI runtime assembly with a
  single injectable runtime-I/O seam preserving all production pins;
  session_activity sentinel COALESCE with real-background-row PG17 proof;
  capability→normalizeLockRow corollary) → delta PASS → DF1 3-point
  discipline (orchestrator-upgraded) → 80/80.
- Stream 2: PASS 0/0/1/4 → corrections (NFC canonical, after-read secret
  revalidation) → delta PASS with two new findings → final micro-round
  (descriptor rewind before child mapping; seal-predecision binding enforced
  in restart authority with honest docstring) → 337/337.
