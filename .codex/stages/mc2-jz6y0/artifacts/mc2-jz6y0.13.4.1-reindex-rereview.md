---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: recovery-bound reindex durability, Redis-loss resume, accepted coverage provenance, and aggregate-only operator output are high-risk production correctness boundaries
repo: mc2
branch: codex/q12-source-recovery-reindex-rereview
base_branch: codex/q12-source-recovery-reindex
base_commit: 767554c8
reviewed_commit: 2e92d55b
reviewed_range: 767554c8..2e92d55b
resolves_review: b82a09f8
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-reindex-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-reindex-rereview.md
success_criteria:
  - Re-review all five P1 and three P2 findings from b82a09f8 against the exact correction range.
  - Require crash-durable owner-only ledger publication/replacement, independent journal reload, exact Redis-loss resume, aggregate-only CLI, accepted coverage provenance, strict UUIDv4, terminal completion, and consistent course-scope behavior.
  - Report exact residual P0-P3 findings without implementation edits or live mutations.
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-reindex.md
  - immutable original review b82a09f8
selected_skills:
  - code-review
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review and verification assets cover this bounded correction review
parallel_group: q12-source-recovery-reindex-correction-gate
depends_on_streams:
  - mc2-jz6y0.13.4.1-reindex-correction
parallel_decision: sequential - correction re-review depends on the complete corrected reindex tree
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: temporary dependency symlinks were removed before commit; review worktree and branch remain for orchestrator integration and cleanup
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: review-only artifact; approved source-recovery design and plan remain the correction authority
graph_reviewed: blocked
graph_review_notes: graphify-out is absent from this isolated review worktree; no implementation change or graph refresh is owned by this artifact-only stream
verification:
  - Exact correction range 767554c8..2e92d55b and all five changed files reviewed against immutable review b82a09f8.
  - Focused core plus reindex regression passed 93/93 across four files.
  - Course-gen-platform package type-check passed with the normal root pnpm command; no EACCES occurred after the correct isolated dependency view was supplied.
  - Git diff, artifact schema, formatting, and orchestration process checks passed before delivery.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-reindex-rereview.md
explicit_defers:
  - No P1 is deferred; the three residual P1 findings require correction and independent re-review before integration.
---

# Summary

## Findings-first verdict

**NEEDS_WORK / NOT ACCEPTED. P0: 0, P1: 3, P2: 1, P3: 0.** The correction
closes independent journal reload, most artifact durability/coherence checks,
strict lower-case UUIDv4, terminal `complete`, and course-scoped CLI removal.
However, a normal Redis-retention resume persists source-count fields that the
next verify/resume rejects, the CLI still emits raw non-aggregate schema text,
and the reindex contract cannot prove that the supplied evidence ledger is
actually accepted. These three P1 findings block integration. A P2 owner-only
reload gap also remains.

| ID      | Priority | Confidence | Finding                                                                                |
| ------- | -------- | ---------- | -------------------------------------------------------------------------------------- |
| Q12-RR1 | P1       | high       | Redis-retention resume rewrites canonical source counts and makes verify/resume stale. |
| Q12-RR2 | P1       | high       | CLI success/failure reports still expose raw schema strings and target identities.     |
| Q12-RR3 | P1       | high       | Coverage binding has no runtime proof that the evidence ledger status is `accepted`.   |
| Q12-RR4 | P2       | high       | Existing artifacts are loaded without owner/mode/non-symlink validation.               |

# Findings

## Q12-RR1 — P1 — Redis-loss reconciliation persists noncanonical source counts

- **Evidence:** when a retained completed job or durable completed ledger entry
  is found, execute adds its file to `skipFileIds`
  (`reindex-course-embeddings.ts:690-710`). It then rebuilds the plan with those
  files marked `alreadyEnqueued` and writes `counts.recoverable` and
  `counts.alreadyEnqueued` from that transient plan (`:713-743`). The checkpoint
  durably persists those values (`:757-778`). On the next invocation, source DB
  mapping still initializes every row with `alreadyEnqueued: false`; artifact
  validation compares the persisted counts with the fresh base plan and rejects
  any difference (`:479-488`). Verify invokes that validation before parity.
- **Deterministic failure:** with `N` current candidate rows and one completed
  job removed by BullMQ retention, the incoming coherent ledger has canonical
  `recoverable=N`. Resume safely skips the completed job but persists
  `recoverable=N-1, alreadyEnqueued=1`. Immediate verify or a second resume
  rebuilds `recoverable=N, alreadyEnqueued=0` and throws stale-count binding.
  The retention regression checks only the returned report and never feeds the
  persisted ledger into verify or another resume.
- **Impact:** the exact Redis-loss path that should be recoverable can finish
  queue work yet cannot pass verify or a subsequent restart. Schema-v3 resume
  remains non-idempotent and the guarded Q12 reindex cannot reach `complete`.
- **Required fix:** keep immutable source-truth counts and verification
  fingerprint from the base recovery-bound plan in every ledger checkpoint.
  Track accepted/completed/pending queue progress only in the job-ledger fields;
  do not rewrite source classification counts from `skipFileIds`. Add
  execute-resume-persist -> verify and execute-resume-persist -> second-resume
  tests for both retained Redis jobs and Redis-loss completed checkpoints.

## Q12-RR2 — P1 — CLI redaction still returns non-aggregate schema content

- **Evidence:** execute and verify human summaries print the physical target
  name (`reindex-course-embeddings.ts:1663-1668`). JSON redaction also returns
  `targetCollection` and the complete `schemaMismatches` string arrays for
  execute and verify (`:1724-1735`, `:1737-1750`). The production missing-
  collection mismatch embeds the physical collection name; the fixture schema
  accepts arbitrary mismatch strings, including paths and full identities.
  Current successful-output tests exclude run/job/file/path/hash values but do
  not inject a sensitive schema mismatch or assert target omission.
- **Impact:** a non-throwing schema failure is an operator failure path, yet it
  bypasses bounded error codes and can disclose collection identities or
  arbitrary adapter/fixture detail. The promised aggregate-only CLI boundary is
  therefore not closed even though thrown exceptions are now safely mapped.
- **Required fix:** emit only schema mismatch counts or a bounded allow-listed
  category map; omit physical target names from human/JSON output or replace
  them with a non-reversible bounded handle if operationally required. Add
  execute and verify adversarial tests whose mismatch includes a path, run ID,
  file ID, hash, and target name.

## Q12-RR3 — P1 — accepted evidence status is asserted by type name, not proved

- **Evidence:** `AcceptedFailedCoverageBinding` contains ledger ID, recovery run,
  manifest SHA, fingerprint, and entries, but no evidence-run status
  (`reindex-plan.ts:90-96`). Validation correctly proves canonical run/SHA,
  fingerprint, exact IDs, tenant/course identity, failed reason, metadata-only
  shape, and zero claims/terms/constraints/tokens (`:208-244`), but it has no
  value to require `status='accepted'`. The default dependency fails closed,
  while the concrete evidence-repository adapter is explicitly deferred.
- **Impact:** an adapter can supply an otherwise exact processing, failed, or
  rejected evidence run and it is indistinguishable from an accepted ledger at
  the reindex boundary. Reindex could durably exclude six documents before the
  Stage 4 coverage run reaches its canonical accepted state.
- **Required fix:** make accepted status part of the runtime binding and its
  canonical fingerprint, or provide a concrete tenant-scoped adapter whose
  accepted-run query result is validated in this stream. Add negative tests for
  processing, failed, rejected, stale-version, and accepted-run substitutions.

## Q12-RR4 — P2 — owner-only ledger security is enforced only while writing

- **Evidence:** artifact publication correctly requires a current-UID-owned real
  mode-0700 directory and writes a synced mode-0600 random temp with initial
  no-replace or replacement rename (`reindex-course-embeddings.ts:1239-1281`).
  `loadExecutionArtifact()` then uses plain `readFile` and schema parse only
  (`:1284-1293`); it does not `lstat` the parent/file, reject symlinks, or require
  directory 0700, file 0600, and current UID.
- **Impact:** plan/verify can trust an artifact supplied through an insecure or
  symbolic path that the command itself would refuse to create. This weakens
  owner-only provenance and can expose the identity-bearing ledger, although
  execute still checkpoints before enqueue and verify still performs exact
  parity, limiting the immediate mutation impact.
- **Required fix:** apply the same real-path, owner, and exact-mode checks on
  every load before reading bytes. Add symlink, foreign-UID seam, mode-0644 file,
  insecure parent, and valid mode-0600 round-trip tests.

# Original Finding Disposition

| Original finding                      | Disposition                  | Evidence                                                                                                                                               |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 crash-durable/no-replace artifact  | Partially fixed; residual P2 | Random temp, inode/parent fsync, initial hard-link no-replace, replacement rename, and secure write directory are correct; secure reload is missing.   |
| P1 journal adapter echo               | Fixed                        | `persistAndReloadRecoveryJournal()` independently reloads, compares the exact canonical journal, and rebuilds the verified fingerprint before enqueue. |
| P1 inconsistent job ledger/Redis loss | Partially fixed; residual P1 | Strict arrays/subsets/counts and accepted-only retry are correct; retained/completed resume corrupts immutable source counts as Q12-RR1.               |
| P1 aggregate-only CLI                 | Partially fixed; residual P1 | Thrown errors and common success output omit run/job/file/path/hash values; raw schema arrays and target identities remain as Q12-RR2.                 |
| P1 accepted failed coverage           | Partially fixed; residual P1 | Canonical run/SHA/fingerprint/set/tenant/course/zero-evidence validation is strong, but accepted run status is absent as Q12-RR3.                      |
| P2 strict lower-case UUIDv4           | Fixed                        | CLI/fixture/artifact/reindex run bindings use an anchored lower-case UUIDv4 schema; negative coverage includes v1, NIL, uppercase, malformed.          |
| P2 verify -> complete/idempotency     | Fixed                        | Successful verify reload-confirms `complete`; complete plan/verify are read-only idempotent and execute is forbidden.                                  |
| P2 course-scoped CLI inconsistency    | Fixed                        | `--course-id` is absent from parser/help/runtime; the only match is the explicit unknown-option regression.                                            |

# Positive Evidence

- Exact source truth and verified dispositions remain
  `240 = 234 recoverable + 6 audited_failed`, with zero unresolved gaps and raw
  diagnostics preserved.
- Initial ledger publication and replacement ordering include file and parent
  fsync and initial no-replace semantics.
- Journal persistence is independently reloaded before first enqueue and before
  terminal completion.
- Planned, accepted, completed, and failure arrays are unique/sorted, have
  subset/disjointness rules, and match their mutable queue-progress counts.
- Accepted-only Redis-loss jobs are retried with deterministic job/point IDs;
  completed ledger jobs are the only jobs eligible for retention skip.
- Generic failed coverage, stale run/SHA/fingerprint, tenant/course mismatch,
  non-zero evidence, unresolved gaps, and non-v4 run IDs fail closed.
- No live database, Redis, Qdrant, queue, source filesystem, deploy, service, or
  alias operation was performed by this review.

# Verification

1. Exact correction range `767554c8..2e92d55b` and its single correction commit
   were reviewed across both implementation files, both test files, and the
   stream artifact.
2. Focused core plus reindex command passed four files and 93/93 tests:
   manifest 13, filesystem 5, reindex plan 19, reindex command 56.
3. `pnpm --filter @megacampus/course-gen-platform type-check` passed through the
   normal repository pnpm command after temporary worktree dependency symlinks
   supplied the existing root install. No unexplained EACCES occurred.
4. Artifact validation, process verification, Prettier, and `git diff --check`
   passed before commit.

# Delivery / Cleanup

Only this independent review artifact changes on the review branch. Temporary
dependency symlinks were removed. The implementation commit remains unaccepted;
the review worktree and branch remain for orchestrator integration and cleanup.

# Risks / Follow-ups / Explicit Defers

Correct Q12-RR1 through Q12-RR3 and repeat independent review before merging the
reindex stream. Q12-RR4 should be fixed in the same bounded correction because
the ledger contains sensitive identities and controls resume provenance. No
finding is waived by the green 93-test suite.
