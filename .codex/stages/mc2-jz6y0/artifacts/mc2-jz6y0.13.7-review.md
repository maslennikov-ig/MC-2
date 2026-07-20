---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.7-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Backup publication, secret residue, path identity, and archive traversal are high-risk correctness and recovery boundaries.
repo: mc2
branch: codex/q12-supabase-backup-gate-review
base_branch: codex/q12-supabase-backup-gate
base_commit: 23f2406892322ea2dc234fa46c8128d07eb248b4
reviewed_range: dd3e6c76..23f24068
worktree: /home/me/code/mc2/.worktrees/q12-supabase-backup-gate-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-review.md
success_criteria:
  - Review the implementation and tests without accessing a network, server, database, or real configuration.
  - Classify every supported file-handling defect with exact file and line evidence.
  - Reproduce each defect using only disposable synthetic local files.
  - Run the focused 9/9 unit test, shell syntax, artifact validation, and process verification.
selected_docs:
  - PostgreSQL 18 pg_dump - https://www.postgresql.org/docs/18/app-pgdump.html
  - PostgreSQL 18 pg_restore - https://www.postgresql.org/docs/18/app-pgrestore.html
  - PostgreSQL 18 libpq connection and TLS parameters - https://www.postgresql.org/docs/18/libpq-connect.html
selected_skills:
  - code-review
  - senior-devops
  - test-pass
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review and DevOps skills plus the cited first-party PostgreSQL documentation cover this bounded review
parallel_group: Q12-backup-gate-review
depends_on_streams:
  - mc2-jz6y0.13.7
parallel_decision: sequential
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: The immutable NO-GO finding artifact is accepted as review evidence and linked to correction ba207282 plus zero-finding rereview 0276607b; disposable synthetic directories, dependency symlinks, and its dedicated worktree were removed without network, server, database, real secret, live backup, cron, or remote mutation.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: This immutable review artifact records the required corrections; parent-owned operator and runbook documentation must be updated with the corrected implementation.
graph_reviewed: used
graph_review_notes: Existing stage and Graphify-derived repository truth were sufficient for this read-only three-file review; no graph refresh is appropriate before implementation correction.
verification:
  - Focused unit test passed 9/9 with synthetic Supabase placeholders and the no-global-setup unit configuration.
  - bash syntax validation passed.
  - Implementation artifact validation passed.
  - Process verification passed.
  - Four disposable local synthetic probes reproduced secret-bearing crash residue, replacement by plain mv, path inode substitution, and list-only publication despite failed full traversal.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-review.md
explicit_defers:
  - Commit 23f24068 must not be installed or used as the remote migration backup gate until all four findings are corrected and independently re-reviewed.
  - A current verify-full Session pooler URL and approved isolated restore drill remain separate remote activation gates; this review did not access either.
---

# Summary

## Findings-first verdict

**NEEDS_WORK.** Findings: P0: 0, P1: 4, P2: 0, P3: 0.

The positive baseline is real: the operator uses `set -Eeuo pipefail`, captures
the direct `pg_dump` exit status, keeps the lock across publication and
retention, requires `verify-full`, and does not put the URL in command
arguments. The four findings below nevertheless prevent this commit from being
a truthful fail-closed backup gate. All evidence used synthetic local values;
no network, server, database, real configuration, or live backup was touched.

## P1 findings

### 1. Abrupt termination can retain a child diagnostic containing the full connection URL

- **File:** `deploy/postgres/backup-supabase.sh:193`,
  `deploy/postgres/backup-supabase.sh:196-197`, and
  `deploy/postgres/backup-supabase.sh:44-47`.
- **Problem:** `TEMP_STDERR` is a named persistent file. `pg_dump` receives the
  complete URL through `PGDATABASE`, and its stderr is redirected to that file.
  The EXIT/HUP/INT/TERM traps cannot run after `SIGKILL`, host loss, or a power
  failure. Therefore the claimed quarantine is not crash-safe and can preserve
  a connection string derived from the child environment.
- **Synthetic evidence:** a protected local test `pg_dump` wrote its synthetic
  `PGDATABASE` to stderr and killed the parent with `SIGKILL`. The operator left
  three dot-temporaries; the mode-0600 stderr file contained the complete
  synthetic connection string (`containsFullConnectionString: true`).
- **Impact:** a durable password-bearing file can remain in the backup
  directory after precisely the failure class for which cleanup is needed.
- **Fix:** do not place unredacted child diagnostics on persistent storage.
  Capture through a bounded in-memory/anonymous channel or guaranteed-redacted
  diagnostic path, and add startup scavenging that can remove only
  operator-owned stale temporaries without following links. Prove abrupt-death
  behavior with a regression test.

### 2. URL and CA validation is not bound to the inode later consumed

- **File:** `deploy/postgres/backup-supabase.sh:69-89`,
  `deploy/postgres/backup-supabase.sh:128-132`, and
  `deploy/postgres/backup-supabase.sh:184-197`.
- **Problem:** ownership, mode, regular-file, and non-symlink checks operate on
  pathnames. The URL is later reopened by `mapfile`; the CA is later reopened
  by libpq through its pathname. No stable descriptor/inode identity is held or
  rechecked, and the operator does not require an owner-controlled,
  non-symlink, non-group/world-writable parent directory chain.
- **Synthetic evidence:** after a successful `stat` of a mode-0600 trusted
  file, a rename replaced its pathname from a mode-0777 parent. A later read
  observed a different inode, replacement content, and mode 0644.
- **Impact:** a pathname swap can make the dump consume credentials or trust
  roots that did not pass the checks. A CA swap can also invalidate the
  intended `verify-full` trust boundary.
- **Fix:** validate the complete parent-directory policy, open inputs without
  following links, bind consumption to the opened descriptors where the child
  interface permits it, and otherwise revalidate device/inode/owner/mode
  immediately around child startup with a fail-closed design. Add deterministic
  substitution tests for both URL and CA.

### 3. `pg_restore --list` does not traverse all archive payload data

- **File:** `deploy/postgres/backup-supabase.sh:209-215`.
- **Problem:** PostgreSQL 18 documents `--list` as listing an archive's table of
  contents. That operation is useful but does not require restoration output
  to traverse every data block. The operator publishes immediately after a
  non-empty TOC, so a custom archive whose TOC is readable but whose later data
  is truncated can be accepted. The cited `pg_dump` documentation establishes
  that custom format is intended for `pg_restore`; the `pg_restore`
  documentation separately supports generating restore output to a file.
- **Synthetic evidence:** the local protected harness produced a greater-than-
  1024-byte archive whose list-mode validator returned a real-looking TOC but
  whose full-output mode failed with status 42. The current operator returned
  zero and published the archive because it invoked only `--list`.
- **Impact:** the gate can call a non-restorable backup validated and run
  retention afterward, defeating the recovery precondition for the remote
  migration.
- **Fix:** after TOC inspection, perform an offline full output traversal to a
  private disposable sink/file using `pg_restore --file=...` without database
  credentials, require exit zero, then fsync and publish. Keep the later
  approved isolated database restore drill as a distinct activation gate.

### 4. Existence check followed by plain `mv` can replace a newly created final path

- **File:** `deploy/postgres/backup-supabase.sh:222-223`.
- **Problem:** the absence check and rename are separate operations. GNU
  `mv source destination` replaces an existing destination by default. A final
  path created after line 222 but before line 223 is therefore overwritten,
  contrary to the explicit refusal contract.
- **Synthetic evidence:** a disposable local probe observed destination
  absence, created a synthetic racer destination, then ran the same plain
  `/usr/bin/mv -- source destination`; `mv` returned zero and the racer content
  was replaced by the source content.
- **Impact:** the operator can overwrite a same-name file created in the race
  window rather than failing closed. The lock excludes cooperating operator
  runs but not another process using the owner-controlled directory.
- **Fix:** use a no-replace publication primitive on the same filesystem, with
  an atomic hard-link or `renameat2(RENAME_NOREPLACE)`-equivalent helper, then
  fsync the directory. Add a deterministic race regression test.

# Verification

## Bounded matrix

| Tier              | Risk / surface                                         | Result                       |
| ----------------- | ------------------------------------------------------ | ---------------------------- |
| inner             | existing backup operator contract                      | PASS, 1 file / 9 tests       |
| delta             | shell parse and artifact schema                        | PASS                         |
| adversarial local | crash residue, rename race, inode swap, full traversal | reproduced all four findings |
| process           | orchestration contract and diff checks                 | PASS                         |
| live/remote       | server, database, secrets, backup, cron                | not run by instruction       |

Commands and results:

1. `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-review-key pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/ops/supabase-backup-operator.test.ts` - 1 file, 9/9 passed.
2. `bash -n deploy/postgres/backup-supabase.sh` - passed.
3. `python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.md` - passed.
4. `scripts/orchestration/run_process_verification.sh` - passed.
5. Disposable Node/shell probes using only `/tmp/mc2-*` synthetic roots - all
   four defects reproduced; every root was removed after its probe.

The first attempted focused command omitted the package's unit configuration
and was rejected by global setup because Qdrant variables were absent. A second
attempt selected the unit configuration but correctly rejected missing
synthetic Supabase placeholders. The fresh command recorded above supplied only
synthetic placeholders, performed no connection, and passed 9/9.

`docs-reviewed: no-change-needed` - the three cited first-party PostgreSQL 18
pages support the format, TOC-listing, output, and TLS/path contract used in the
review. The parent must update operator/runbook claims after correction.

`graph-reviewed: used` - repository/stage truth was already available; this
read-only review does not justify a graph refresh.

# Delivery / Cleanup

Only this immutable review artifact is changed. Commit `23f24068` is not
approved for integration or installation. All disposable synthetic roots were
removed. Worktree dependency links are removed before delivery. No
implementation file, test, Beads record, server, database, certificate, secret,
backup, cron entry, or remote state was changed.

# Risks / Follow-ups / Explicit Defers

- Correct all three P1 findings and the P2 publication race, add regression
  coverage, and request an independent rereview before accepting the operator.
- Even after local correction, remote activation still requires the current
  owner-provided verify-full Session pooler URL and a fresh approved isolated
  restore drill. This review grants no remote mutation authority.
