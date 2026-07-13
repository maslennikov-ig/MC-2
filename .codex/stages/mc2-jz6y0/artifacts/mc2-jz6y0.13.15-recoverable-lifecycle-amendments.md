---
schema_version: orchestration-artifact/v1
artifact_type: decision-evidence
task_id: mc2-jz6y0.13.15
stage_id: mc2-jz6y0
agent_type: docs_researcher
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The decision changes the frozen recovery lifecycle and controls when database and container writers may become writable again.
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: f6bacc4c2c1045dbe971cf3ebce50c956b30fa5a
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.15-recoverable-lifecycle-amendments.md
success_criteria:
  - Reconcile the approved same-invocation standalone resume promise with the actual database-barrier and secret lifecycle.
  - Preserve the read-only default, exact row/TRUNCATE/DDL guards, disabled cron, and empty pg_net boundary until final activation.
  - Present one narrow owner decision without authorizing live mutation.
selected_docs:
  - docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md
  - docs/superpowers/plans/2026-07-13-q12-live-cutover-corrections.md
  - https://www.postgresql.org/docs/17/runtime-config-client.html
  - https://www.postgresql.org/docs/17/sql-start-transaction.html
  - https://www.postgresql.org/docs/17/manage-ag-config.html
  - https://docs.postgrest.org/en/v14/references/transactions.html
  - https://docs.postgrest.org/en/v14/references/api/preferences.html#transaction-end-preference
selected_skills:
  - senior-devops
  - senior-architect
selected_agents:
  - docs_researcher
catalog_candidates:
  - none - installed skills, repository truth, and primary PostgreSQL/PostgREST documentation cover the decision
parallel_group: W-lifecycle-source-truth
depends_on_streams:
  - mc2-jz6y0.13.10 safe local candidate excluding the public lifecycle amendment
parallel_decision: sequential
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: Read-only lifecycle research produced no worktree, runtime, database, registry, or server mutation.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: The approved base specification remains byte-for-byte unchanged; the owner-approved safety correction is normative in the recoverable-lifecycle addendum.
graph_reviewed: used
graph_review_notes: The configured graph report and a focused query were consulted, but the graph predates the new Q12 shell lifecycle and added no current-code evidence.
verification:
  - approved design SHA-256 5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15 rechecked unchanged
  - current W wrapper and database-barrier command/receipt lifecycles inspected read-only
  - PostgreSQL 17 transaction-default and explicit READ WRITE behavior reviewed
  - PostgREST 14 transaction modes and transaction-end preference reviewed; equivalent 12.2 access-mode behavior was checked during the earlier decision research
  - exact source-recovery REST CAS path and capability-header adapter inspected read-only
  - independent architecture reviewer confirmed the unsafe early-resume and early-activation effects
  - owner accepted the recommended two-part lifecycle in the current task on 2026-07-13
  - recoverable-lifecycle addendum SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27
  - exact cross-language canonical journal preimage, number, Unicode, escape, and LF rules independently rereviewed with P0=P1=P2=P3=0
  - independent lifecycle docs rereview passed with P0=P1=P2=P3=0 after exact command, receipt, checkpoint, journal, CAS, epoch, and forward/rollback DAG corrections
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.15-recoverable-lifecycle-amendments.md
  - docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md
  - docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md
explicit_defers:
  - GHCR, server, Supabase, Qdrant, service, secret, schema, writer, scheduler, and deployment mutations remain governed by the existing Q12 remote gate; this decision authorizes none of them by itself.
---

# Summary

The approved Q12 correction design remains unchanged at SHA-256
`5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15`.
Implementation and independent lifecycle review found two contradictions that
cannot be silently reinterpreted.

First, the design promises that standalone source recovery restores the exact
previously running containers in the same invocation. A real recovery child
cannot make that safe transition: it has no database URL, CA, expected catalog,
or authority to run barrier activation/cleanup; cleanup requires prior
activation; and successful cleanup removes the persistent database capability
that the current wrapper requires at startup. The existing test hid this by
letting a fake Compose child rewrite the controller-owned barrier receipt.

Starting workers while the receipt is only `maintenance_guarded` is not an
acceptable substitute. SQL row writes remain guarded, but running Web, API, and
Redis workers can still mutate Redis, Qdrant, Auth/Storage, Docling/NotebookLM,
or other external services and can create retries or partial effects. Restoring
restart policies also makes a daemon or host restart capable of reintroducing
writers before the cutover reaches its terminal cleanup state.

Second, the design says to restore the baseline database transaction default
before HTTP source recovery and reindex, but the frozen command manifest has no
such intermediate command. Calling final `barrier.activate` early is unsafe:
it removes every application row/TRUNCATE guard, restores all eight cron jobs,
restores the baseline database default, and crosses the atomic activation
boundary before recovery, handoff, smoke, and observation.

Primary PostgreSQL and PostgREST behavior provides a safer correction.
`default_transaction_read_only=on` is a default, not an unoverrideable fence.
PostgREST explicitly starts POST/PATCH/PUT/DELETE requests as `READ WRITE` on a
primary. The capability-bound service-role REST transaction can therefore reach
the row guard, while uncapped requests are rejected by that guard. The already
approved hosted PostgREST capability plus `Prefer: tx=rollback` probe remains a
mandatory empirical hard gate; documentation alone is not accepted as the live
proof.

## Owner decision

On 2026-07-13 the owner explicitly accepted the recommended two-part narrow
addendum in the current task as one lifecycle correction:

1. Standalone recovery publishes
   `recovery_complete_writers_quiesced`, proves the original ten exact
   containers remain stopped with restart policy `no`, and exits without
   starting a writer. Before activation, handoff creates but does not start the
   target five and fsync-publishes a mode-bound final-writer manifest: forward
   selects new production plus development as final ten and holds old
   production five; rollback selects original production plus development and
   holds the captured target zero through five. After the supervisor proves
   the matching handoff/rollback authority and exact zero-residue cleanup, an
   explicit lease-bound `resume-writers-only` consumes the immutable original
   and final manifests, exact journal/checkpoint, cleanup receipt, and
   mode-specific authority. It receives no database capability, starts only
   the selected final identities in workers, API, Web order, keeps the held set
   stopped/no, and publishes `writers_resumed`. Crash/reboot recovery is
   journal/CAS-bound and any ambiguous inventory fails closed.
2. Add one fixed `barrier.prepare-recovery` command and receipt state
   `recovery_ready_guarded` after the final migration verification. It does not
   alter the database default, guards, cron, pg_net, or data. It verifies the
   terminal catalog and every row/TRUNCATE/DDL guard, proves the database default
   is still read-only, cron remains inactive and pg_net empty, terminates stale
   opt-out client sessions, reconnects without the startup opt-out, and proves
   the fresh session inherited read-only. Q12 source recovery and reindex accept
   only this run/catalog/probe-bound receipt. Final `barrier.activate` remains
   the sole later transaction that restores the baseline default/cron and
   removes application guards.

The normative record is
`docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md`
at SHA-256
`7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`.

# Verification contract

- Remove the impossible fixture behavior in which a source-recovery child
  rewrites the database barrier receipt.
- Fault or signal at every stop/recovery/resume boundary leaves all exact
  writers stopped with restart=`no`; a resume failure runs compensating
  re-quiesce and never starts a later class after an earlier-class failure.
- Resume-only requires the exact mode-bound final manifest and authority,
  `guard_cleanup_complete/zero_guard_residue=true`, the inherited or explicitly
  recovery-reacquired supervisor lease epoch, and the exact 12-key checkpoint;
  it rejects any DB URL, CA, DB capability, or unrecorded container identity.
- `prepare-recovery` rejects every phase except the final verified migration,
  any run/catalog/probe mismatch, missing/extra guard, active cron, nonempty
  pg_net, activated run, or database-default drift.
- PostgreSQL 17 integration proves a fresh ordinary session inherits read-only
  while an explicit READ WRITE transaction is possible on the primary.
- Version-aligned PostgREST integration proves GET/HEAD stay read-only;
  PATCH without or with the wrong capability commits zero rows; and the exact
  service-role capability plus rollback preference succeeds with zero residue.
- Source-recovery CAS integration under the retained read-only default proves
  only the exact capability-bound expected-row update succeeds.
- The supervisor command/phase order is final-verify, prepare-recovery,
  source-recovery, reindex, no-start handoff/static smoke, activate,
  finalize-quiesced, cleanup, mode-bound authority, resume, handoff-complete,
  then forward-only full observation. No source/reindex capability may be
  issued before readiness or after activation; no writer starts before cleanup.

# Risks / Follow-ups

The live PostgREST build/version has not yet been observed. The local contract
must use a version-aligned disposable fixture, while the approved hosted
rollback probe remains the non-negotiable staging proof. W and the root
supervisor may now implement the approved local contract. Remote activation
remains separately gated; no partial writer resume, early activation, or silent
default restoration is permitted.
