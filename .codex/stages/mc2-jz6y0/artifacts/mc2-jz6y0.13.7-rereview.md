---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.7-rereview
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The correction controls durable backups, database credentials, TLS trust, atomic publication, and retention.
repo: mc2
branch: codex/q12-supabase-backup-gate-rereview
base_branch: codex/q12-supabase-backup-gate
base_commit: ba207282694defc7206e6fc604d3fb762280dbb0
reviewed_range: 23f2406892322ea2dc234fa46c8128d07eb248b4..ba207282694defc7206e6fc604d3fb762280dbb0
resolves_review: cfc818d3
worktree: /home/me/code/mc2/.worktrees/q12-supabase-backup-gate-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-rereview.md
success_criteria:
  - Recheck all four prior P1 findings against the exact corrected delta.
  - Verify safe input and backup-directory identity, archive traversal, no-replace publication, locale portability, and retention.
  - Run focused, shell, CI, type, artifact, and process gates without network, server, database, or real configuration access.
selected_docs:
  - PostgreSQL 18 pg_dump - https://www.postgresql.org/docs/18/app-pgdump.html
  - PostgreSQL 18 pg_restore - https://www.postgresql.org/docs/18/app-pgrestore.html
  - PostgreSQL 18 libpq connection and TLS parameters - https://www.postgresql.org/docs/18/libpq-connect.html
selected_skills:
  - code-review
  - superpowers:receiving-code-review
  - senior-devops
  - test-pass
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review assets and the existing first-party PostgreSQL documentation cover the bounded rereview
parallel_group: Q12-backup-gate-rereview
depends_on_streams:
  - mc2-jz6y0.13.7
  - mc2-jz6y0.13.7-review
parallel_decision: sequential
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: Synthetic test roots and temporary dependency symlinks were removed; no network, server, database, real configuration, backup, cron, certificate, or remote state was accessed or changed.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: The implementation artifact accurately records the corrected local operator contract and the unresolved server-parent preparation gate; parent owns installation/runbook integration.
graph_reviewed: used
graph_review_notes: Existing stage and repository graph truth was sufficient for this read-only three-file delta rereview; no graph refresh is appropriate.
verification:
  - Exact delta 23f24068..ba207282 was inspected line by line with no P0-P3 findings.
  - Focused backup operator unit suite passed 18/18 with synthetic placeholders.
  - Bash syntax and all three assigned CI shell/workflow gates passed.
  - Course generation platform type-check passed.
  - Implementation and rereview artifact validation plus process verification passed.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-rereview.md
explicit_defers:
  - The observed server /opt/megacampus/backups parent mode 0775 remains a fail-closed remote-preparation blocker and must be corrected before installation.
  - Current verify-full Session pooler credentials and a fresh approved isolated restore drill remain separate remote activation gates.
---

# Summary

## Findings-first verdict

**PASS for corrected commit `ba207282`; P0: 0, P1: 0, P2: 0, P3: 0.**

The exact correction range `23f24068..ba207282` resolves all four immutable P1
findings from `cfc818d3`. No new correctness, portability, retention, or secret
handling defect was identified in the bounded delta. This is local code
acceptance only; it does not authorize operator installation or any live
database operation.

## Closed findings and boundary evidence

1. **Diagnostic residue:** `backup-supabase.sh:24-25,38-50,266-282,370-380`
   removes the persistent stderr temporary and sends child diagnostics to
   `/dev/null`. Exact startup cleanup is restricted to six-character
   archive/list/legacy-stderr names that are current-owner, current-group,
   mode-0600 regular non-symlinks. Tests at
   `supabase-backup-operator.test.ts:412-451` prove an abrupt child diagnostic
   leaves no secret-bearing stderr file and that recovery removes only the
   owned exact residue.
2. **Stable URL/CA inputs:** `backup-supabase.sh:141-221,284-318,350-380`
   validates the canonical root/current-owned non-writable parent chain, opens
   the URL and CA, binds device/inode/owner/group/mode/type, rechecks path and
   descriptor identity, reads the URL from its FD, and gives libpq the inherited
   CA descriptor through both `PGSSLROOTCERT` and the effective URL. Tests at
   `supabase-backup-operator.test.ts:280-301,324-410` prove CA-FD consumption,
   unsafe-parent rejection, URL/CA substitution rejection, and backup-directory
   pathname substitution rejection.
3. **Full archive traversal:** `backup-supabase.sh:382-399` requires archive
   size, a non-empty `pg_restore --list` TOC, and a separate credential-free
   offline `pg_restore --file=/dev/null` pass before publication. The negative
   traversal test at `supabase-backup-operator.test.ts:267-278` fails closed
   with no published backup.
4. **Atomic no-replace:** `backup-supabase.sh:401-417` fsyncs the archive and
   uses a same-directory hard link with `--no-target-directory`, followed by
   directory fsync, temporary unlink, and another directory fsync. Tests at
   `supabase-backup-operator.test.ts:453-477` preserve existing collision
   content and reject a colliding symlink-to-directory without writing through
   it.

The backup directory itself is canonicalized and bound to the locked FD by
device/inode/owner/group/mode/type at `backup-supabase.sh:224-264`. Its identity
and safe parent chain are rechecked before temporary creation, publication, and
retention (`backup-supabase.sh:344-365,401,419`). Retention remains restricted
to exact final-name, current-owner/current-group, mode-0600, regular
non-symlink files and runs only after successful publication
(`backup-supabase.sh:324-338,419-421`).

`LC_ALL=C` at `backup-supabase.sh:3` makes GNU `stat %F` comparisons stable.
The implementation intentionally targets the existing Ubuntu/GNU operator
environment and uses absolute commands, `/proc/self/fd`, GNU `sync`, and GNU
`ln --no-target-directory`; no unsupported cross-platform claim is made.

The observed server `/opt/megacampus/backups` mode `0775` is not bypassed:
`.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.md:75-79` explicitly blocks
installation until that parent is root/current-owned and not group/world
writable. This rereview performed no server inspection or mutation.

# Verification

| Tier | Surface | Result |
| --- | --- | --- |
| inner | backup operator correction | PASS, 1 file / 18 tests |
| delta | shell, locale, collision, retention | PASS |
| CI | workflow/deploy fail-closed contracts | PASS, 3 commands |
| type | course generation platform | PASS |
| process | artifact/schema/orchestration | PASS |
| remote | server/database/real secrets | not run by instruction |

Commands:

1. `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-rereview-key pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/ops/supabase-backup-operator.test.ts` - 18/18 passed.
2. `bash -n deploy/postgres/backup-supabase.sh` - passed.
3. `node scripts/ci/test_ci_cd_workflow_gates.mjs` - passed.
4. `bash scripts/ci/test_detect_deploy_changes.sh` - passed.
5. `bash scripts/ci/test_blue_green_fail_closed.sh` - passed.
6. `pnpm --filter @megacampus/course-gen-platform type-check` - passed.
7. `git diff --check 23f24068..ba207282` - passed.
8. `python3 scripts/orchestration/validate_artifact.py` for the implementation
   and this rereview artifact - passed.
9. `scripts/orchestration/run_process_verification.sh` - passed.

The new worktree initially had no dependency links, so the first Vitest and
workflow-gate attempts stopped locally before running. After linking the
already-installed workspace dependencies, the fresh commands above passed; no
package installation, lockfile change, or external access occurred.

`docs-reviewed: no-change-needed` - the implementation artifact retains the
correct PostgreSQL 18 format, TOC, full-output, and verify-full boundaries plus
the explicit server-parent blocker.

`graph-reviewed: used` - this read-only delta rereview requires no refresh.

# Delivery / Cleanup

Only this rereview artifact is changed on the review branch. The corrected
implementation is approved for orchestrator integration, subject to the remote
preparation gates below. Disposable synthetic roots were test-owned and
removed; temporary dependency symlinks are removed before delivery.

# Risks / Follow-ups / Explicit Defers

- Before installation, change the observed `0775` backup parent to the approved
  non-group/world-writable ownership/mode and rerun the operator preflight.
- Before remote migration, obtain the current verify-full Session pooler URL,
  install the accepted operator, produce a fresh validated backup, and complete
  the separately approved isolated restore drill.
