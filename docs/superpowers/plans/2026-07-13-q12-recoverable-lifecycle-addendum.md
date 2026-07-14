# Q12 Recoverable Lifecycle Addendum Implementation Plan

> Execute with `orchestrator-stage`, `task-router`, subagent-driven development,
> TDD, independent review, verification-before-completion, and canonical stage
> closeout. This plan is local-only until the existing Q12 remote gate is
> separately presented and authorized.

**Goal:** Implement the owner-approved Supabase trust boundary and recoverable
`prepare-recovery` / `resume-writers-only` lifecycle without weakening the
accepted Q12 barrier, recovery, writer isolation, or rollback contracts.

**Normative design:**
`docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md`

## Constraints

- Preserve the base design SHA-256
  `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`.
- No remote/live/server/Supabase/GHCR/Qdrant mutation during this plan.
- No external S3 or Qdrant Cloud work.
- Never expose or copy database credentials; use only existing owner-only local
  secret files in separately authorized read-only probes.
- Preserve unrelated `.claude/settings.json` changes.
- W owns its existing dirty worktree until commit, push, and independent
  acceptance. Downstream streams consume only its accepted commit.

## Parallel Decomposition Matrix

| Stream | Goal                                                    | Agent                                  | Write zone                                          | Dependencies                       | Verification                                             | Decision                           | Reason                                                |
| ------ | ------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- | ---------------------------------- | -------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| D      | Record owner decisions and normative addendum           | root orchestrator                      | two addendum docs, `.13.14/.13.15` artifacts, Beads | approved decisions                 | hashes, artifact validation, diff review                 | local sequential                   | Freezes the interface before code changes             |
| W      | Implement readiness and writer-only resume              | existing visible W worker              | W-owned barrier/wrapper/adapters/tests/artifact     | D                                  | focused unit/integration, PG17, type-check, shell syntax | delegated sequential critical path | Shared receipt and command interfaces must land first |
| WR     | Independently review W delta                            | correctness reviewer                   | read-only plus review artifact                      | W                                  | diff, adversarial lifecycle review, focused rerun        | delegated after W                  | Required independent acceptance                       |
| G7     | Consume accepted shared SQL/lifecycle in backup/restore | existing G7 stream                     | G7-owned executor/tests/artifact                    | W accepted                         | restore/backup drill and fault matrix                    | delegated later                    | Must bind the final shared interface                  |
| M/H    | Update migration and handoff consumers                  | visible M and H workers                | disjoint M/H zones                                  | W and G7 as specified by base plan | focused migration/handoff/isolation tests                | parallel after dependency          | Independent disjoint consumers                        |
| Root   | Implement sole supervisor/journal recovery              | root-owned supervisor files/tests/docs | root zone                                           | W, G7, M, H accepted               | exact command order, crash recovery, aggregate gates     | local integration                  | Owns the terminal cross-stream state machine          |

Until W is accepted, the implementation is intentionally sequential: W
defines the shared receipt/command surface consumed by every remaining stream.

## Task 1: Record the approved decisions

1. Mark `.13.14` accepted with the exact managed-provider residual boundary.
2. Mark `.13.15` accepted with the exact two-part lifecycle.
3. Record this addendum's SHA-256 in both artifacts and close both decision
   Beads with no remote mutation implication.
4. Validate both artifacts, inspect the diff, commit, and push the integration
   branch.

## Task 2: W TDD — readiness and quiesced recovery completion

1. Add RED tests for `prepare-recovery`, exact allowed prior state, receipt
   schema/state, no mutations, session recycle, default/guard/cron/pg_net
   verification, drift rejection, idempotence, and crash before receipt.
2. Add RED adapter/runtime tests proving source recovery and reindex accept only
   the exact `recovery_ready_guarded` receipt and retain the read-only default.
3. Add RED tests that successful standalone recovery publishes
   `recovery_complete_writers_quiesced`, leaves ten exact writers stopped with
   restart `no`, and never lets a child rewrite a controller receipt.
4. Implement the minimum database-barrier, adapter, and wrapper changes to make
   those tests pass without broadening any command capability.
5. Run the focused unit aggregate, exact PostgreSQL 17 integration, and
   version-aligned PostgREST rollback fixture. Record totals and cleanup.

## Task 3: W TDD — `resume-writers-only`

1. Add RED tests for its deliberately narrow argv/environment surface, exact
   run root, original plus immutable final-writer manifests, cleanup receipt,
   journal/checkpoint, and inherited lease.
2. Add RED tests for workers→API→Web ordering, per-class readiness, exact prior
   or intended restart-policy restore, forward final10+held5, rollback
   final10+held0..5, unrecorded target rejection, idempotent terminal retry, and
   rejection of every non-authoritative state.
3. Add RED fault/signal tests at each class start, readiness check, policy
   restore, and terminal receipt boundary. Add SIGKILL/reboot recovery tests for
   durable `resume_committing`, exact-terminal receipt recovery, compensation,
   ambiguity refusal, and supervisor lock reacquisition. Every nonterminal
   failure must compensate the final ten to stopped/restart `no`, preserve the
   exact mode-bound held set stopped/no, and never start a later class.
4. Implement the minimum dedicated mode. It must not read or accept DB URL, CA,
   DB capability, recovery plan, or upload-root authority.
5. Run W focused and ordinary regression aggregates, `bash -n`, package
   type-check, leak scan, real PostgreSQL 17 tests, and runtime cleanup checks.
6. Update and validate the W artifact; commit and push its branch.

## Task 4: Independent W acceptance

1. Give the reviewer the normative addendum, accepted decision artifacts, W
   commit, pre-existing accepted W evidence, and exact delta verification.
2. Require an evidence-backed PASS or actionable findings for receipt
   authority, forward/rollback promotion, original/final manifest identity,
   complete or partial target inventories, file/FD identity,
   lease/reacquisition proof, crash recovery, class ordering, compensation,
   capability minimization, and test realism.
3. Return findings to W through TDD, rerun focused and affected aggregates, and
   repeat review until PASS.
4. Inspect the accepted diff and evidence, integrate the exact W commit, rerun
   integration-focused gates, push, clean the W worktree only after safe
   integration, and close `.13.10` only when all acceptance criteria hold.

## Task 5: Resume the base Q12 dependency graph

1. Finish and accept G7 in its independent backup/restore write zone.
2. After W acceptance, run M and H in parallel in their disjoint worktrees. H
   must supersede base pre-activation/finalize starts: create target containers
   stopped/no, fsync the forward or rollback final-writer manifest before
   activation, promote the same hash after activation without discovery/start,
   and keep the nonselected production set held stopped/no. Early rollback must
   capture every created target incrementally and support an exact held set of
   zero through five without inventing missing identities.
3. Integrate each exact accepted commit only after independent review and
   focused verification.
4. Implement Root's frozen supervisor with the addendum order and durable
   COMMIT-to-receipt recovery, `resume_committing`, recoverable lease epochs,
   mode-specific `rollback_ready_writers_quiesced`, `writers_resumed`, and full
   observation only after forward `handoff_complete`. No child process may
   manufacture supervisor state.

## Task 6: Local release-confidence gates

Run the full base-plan gates plus:

- focused Stage 2/4/5/6, shared contract/migration, web conflict,
  recovery/isolation tests;
- W lifecycle, PostgreSQL 17, PostgREST rollback, source recovery/reindex, and
  supervisor crash matrices;
- pinned Qdrant `1.18.2` integration and Compose validation;
- local-disk snapshot/restore drill, with external S3 explicitly deferred;
- `pnpm type-check`;
- `pnpm build`;
- `scripts/orchestration/run_process_verification.sh`;
- documentation review and safe local Graphify refresh without external
  model/API modes or Git hooks; and
- `scripts/orchestration/run_stage_closeout.py --stage mc2-jz6y0` only when all
  non-remote work and evidence are actually complete.

## Task 7: Preserve the remote gate

Before any GHCR publication, server or secret change, deploy, hosted Supabase
mutation, live reindex, Qdrant alias cutover, or service activation, present the
exact actions, external effects, secret needs, observation, rollback, expected
downtime, and data effects and obtain explicit current-task authorization. If
that authorization is absent, `.13` stays open/blocked with no partial
activation.

## Plan self-review

- No placeholder or silent lifecycle reinterpretation remains.
- The managed-provider residual boundary is explicit and cannot be reported as
  tenant-controlled.
- Recovery readiness is guarded and verification-only.
- Writer restart occurs only after cleanup, under the same supervisor lease or
  explicitly journaled recovery-reacquired lease epoch.
- Resume consumes an immutable final-writer manifest, starts the selected final
  ten only, and keeps the exact nonselected old/new production held set
  stopped/no; rollback supports safely captured partial target sets.
- Full 60-minute/live-cycle observation starts only after `writers_resumed` and
  `handoff_complete`.
- The deleted DB capability is neither required nor accepted by resume-only.
- Every failure path is fail-closed and independently reviewable.
- The plan does not authorize remote mutation or reintroduce external S3.
