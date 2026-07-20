---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.7
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: the review decides whether the only retained database rollback path is safe across PostgreSQL client and server major versions before any migration or activation
repo: mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 71a4b14d433e19729fdb1af646fecd88a80e7827
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-browser-server-preflight-review.md
success_criteria:
  - reconcile the browser-login and server-preflight artifacts against the reviewed backup operator and current host truth
  - decide whether PostgreSQL 18.1 pg_dump and pg_restore are rollback-safe for a PostgreSQL 17.6 source and restore target
  - return an exact fail-closed client rule and the next safe action without server, database, credential, or runtime mutation
selected_docs:
  - PostgreSQL 18 pg_dump - https://www.postgresql.org/docs/18/app-pgdump.html
  - PostgreSQL 18 pg_restore - https://www.postgresql.org/docs/18/app-pgrestore.html
  - PostgreSQL 17 pg_dump - https://www.postgresql.org/docs/17/app-pgdump.html
  - PostgreSQL 17 pg_restore - https://www.postgresql.org/docs/17/app-pgrestore.html
  - PostgreSQL versioning policy - https://www.postgresql.org/support/versioning/
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-supabase-cli-login-role.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-server-preflight-20260713.md
selected_skills:
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
  - db_migration perspective
catalog_candidates:
  - none - installed review assets, repo truth, and first-party PostgreSQL documentation resolve the bounded compatibility question
parallel_decision: sequential - this review reconciles two already completed artifacts and returns one shared activation boundary
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: accepted finding evidence changed only this artifact; no runtime residue was created, and immutable correction/rereview artifacts mc2-jz6y0.27-correction.md and mc2-jz6y0.27-rereview.md close the PostgreSQL-major finding without rewriting this verdict
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: immutable correction mc2-jz6y0.27-correction.md, zero-finding rereview mc2-jz6y0.27-rereview.md, both durable runbooks, and the sole PG17 execution packet now close this finding without rewriting the historical NO-GO verdict
verification:
  - PostgreSQL 17 and 18 pg_dump compatibility notes and the PostgreSQL versioning policy were re-read from postgresql.org on 2026-07-13
  - both completed artifacts, the reviewed operator, its exact command-path unit contract, accepted backup evidence, and both runbook call sites were inspected
  - no SSH, Supabase API, database, credential, server, Docker, package, service, cron, Qdrant, or application operation was performed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-browser-server-preflight-review.md
explicit_defers:
  - Q12 remains NO-GO until the operator and restore command use an explicitly verified PostgreSQL 17 client pair and a fresh archive passes an isolated PostgreSQL 17 restore
  - browser login still does not provide the accepted current Session pooler DSN; a JIT login role remains a separately authorized remote mutation
  - the current DSN, CA/operator installation, safe directory modes, legacy-cron suspension, capacity proof, pinned restore target, fresh dump, and isolated restore remain live gates
---

# Summary

## Findings-first verdict

**NO-GO; P0: 0, P1: 1, P2: 1, P3: 0.** The browser-login artifact's
credential conclusion is correct, and the server artifact's inventory and
overall NO-GO verdict are correct. The two artifacts expose one additional hard
boundary: the reviewed operator fixes `PG_DUMP` and `PG_RESTORE` to `/usr/bin`,
while current host truth proves both wrappers select PostgreSQL `18.1`.

A PostgreSQL 18 `pg_dump` is allowed to read the PostgreSQL 17.6 source, so the
server artifact's narrow “dump direction” statement is true. It is not enough
for rollback. PostgreSQL 18 explicitly does **not** guarantee that its dump can
load into an older major server, even when the dump came from that older server.
Therefore a `pg_dump 18.1` / `pg_restore 18.1` pair targeting PostgreSQL 17.6 is
not an accepted rollback-safe pair. `pg_restore --list` and the current offline
`--file=/dev/null` traversal prove archive readability, not PostgreSQL 17 SQL
compatibility.

The installed explicit PostgreSQL `17.7` clients remove the major-version
blocker if the operator is first corrected and independently verified to use
those major-17 binaries for dump, TOC validation, full traversal, and the
isolated restore. PostgreSQL's versioning policy treats 17.6 and 17.7 as minor
releases of the same major and says minor upgrades do not require dump/restore.
The same-major `17.7` client pair is therefore the bounded compatible choice for
a 17.6 source and 17.x restore target. It must not be reached through the
currently ambiguous `/usr/bin` wrappers.

## Findings

### Q12-PG1 — P1 — the proposed operator would create rollback evidence with an unaccepted major-version pair

- **Evidence:** `deploy/postgres/backup-supabase.sh:17-18` hard-codes
  `/usr/bin/pg_dump` and `/usr/bin/pg_restore`; the unit contract at
  `supabase-backup-operator.test.ts:220-231` requires those paths. The server
  preflight proves both wrappers currently select `18.1` while the source and
  intended restore target are PostgreSQL `17.6`.
- **Primary rule:** PostgreSQL 17 and 18 document that a newer `pg_dump` may
  dump an older server, but its output is not guaranteed to load into an older
  **major** server, even if that server produced the source data. Custom archives
  remain portable across architectures; that is not a cross-major SQL guarantee.
- **Impact:** an archive may pass the current size, TOC, and offline traversal
  checks and still fail the mandatory restore into PostgreSQL 17.6. That cannot
  serve as the only rollback evidence before migrations.
- **Required correction:** production mode must resolve both utilities through
  an explicit PostgreSQL 17 path, verify each `--version` reports major 17, and
  use that same major for archive inspection and the isolated database restore.
  On the observed host the installed bounded candidates are
  `/usr/lib/postgresql/17/bin/pg_dump` and
  `/usr/lib/postgresql/17/bin/pg_restore`; their exact existence, ownership,
  executable type, package provenance, and reported version must be re-proved
  in the authorized window.

### Q12-PG2 — P2 — installed 17.7 is compatible but no longer the current PostgreSQL 17 minor

The first-party versioning page consulted on 2026-07-13 lists PostgreSQL
`17.10` as the current supported minor and recommends running the current minor.
Installed `17.7` is the correct major and is materially safer than using 18.1
for a 17.6 rollback target, but it is a superseded patch level. Do not silently
claim it is the current supported pin. Either use 17.7 for this bounded backup
proof with the version explicitly recorded, or separately approve installation
and pinning of the current 17.x client package before the window. Changing
server packages is a remote mutation and was not performed here.

## Artifact dispositions

1. **`mc2-jz6y0.13.7-supabase-cli-login-role.md`: accept conclusions with one
   current-host command correction.** Its main result is correct: browser login
   authenticates the Management API but does not supply the durable Session
   pooler DSN required by the accepted operator; CLI JIT role creation is a
   separate `database:write` mutation. Its compatibility section correctly
   requires major 17. Its sample isolated-restore command must not retain
   `/usr/bin/pg_restore` now that host truth proves that path selects 18.1; use
   the verified explicit major-17 binary instead.
2. **`mc2-jz6y0.13.7-server-preflight-20260713.md`: inventory accepted; proposed
   execution packet needs correction before acceptance.** Its zero-backup,
   modes, cron, missing CA/operator/restore-target, capacity, and overall NO-GO
   facts remain valid. Lines 56-57 must not call the “required dump client”
   available, lines 101-106 must distinguish “can connect and dump” from
   “rollback-safe”, and lines 166-222 must not install/run the current operator
   until the major-17 command-path correction has passed TDD and independent
   review.

## Exact PostgreSQL client and restore rule

For this gate, require all of the following:

1. Source server reports PostgreSQL major `17`; the recorded observed minor is
   `17.6`.
2. `pg_dump`, both archive validation passes, and the database restore use an
   explicitly selected client pair whose `--version` reports major `17`.
3. The dump and restore utilities are the same verified client release for the
   run. Installed `17.7` is same-major compatible; current `18.1` wrappers are
   not rollback-safe for a 17.6 target.
4. The disposable restore server is pinned to PostgreSQL major `17`, starts from
   `template0`, receives the exact fresh archive with `--exit-on-error` and
   `--single-transaction`, and is deleted only after recorded semantic checks.
5. A successful `pg_restore --list` or `--file=/dev/null` is necessary archive
   validation but never substitutes for the real isolated PostgreSQL 17 restore.

## Current inputs and blockers

- Supabase CLI browser authentication is available, but it is not a database
  credential and does not close `.13.7`.
- A current owner-only Session pooler URL with `sslmode=verify-full` and the
  approved CA path is still absent from accepted evidence.
- The CA and reviewed operator are not installed on the server.
- Backup parent and target remain `0775`; the accepted target must be `0700`
  beneath a non-group/world-writable parent.
- The legacy fail-open cron remains active, and the server retains zero usable
  backups.
- The reviewed operator currently selects PostgreSQL 18.1 through `/usr/bin`.
- No approved pinned PostgreSQL 17 restore server/image exists, and live
  database size has not yet proved local disk headroom.

## Safe next action

Keep Q12 and every migration/reindex/activation action stopped. The next safe
local action is a narrow TDD correction stream that replaces the production
wrapper paths with explicit PostgreSQL-major-17 binaries, adds fail-closed
runtime major checks, updates the restore example and server packet, and obtains
independent correctness review. After that local correction, the authorized
server window may verify the exact installed 17.x patch, install the operator
and CA, safely suspend cron, normalize modes, provide the current DSN, produce a
fresh custom archive, and restore that exact archive into an approved isolated
PostgreSQL 17 target. Only the successful isolated restore closes the database
rollback gate.

# Verification

- Re-read the PostgreSQL 18 `pg_dump` compatibility note at lines 474-475 and
  the equivalent PostgreSQL 17 note at lines 451-452 on 2026-07-13.
- Re-read the PostgreSQL versioning policy: 17 is the major, 17.x values are
  minor releases, minor upgrades require no dump/restore, and 17.10 is the
  current supported minor on the consulted page.
- Inspected both completed artifacts, `backup-supabase.sh:1-425`, its unit
  command-path contract, the accepted `.13.7` artifact, and the two operation
  runbook call sites.
- Confirmed the review introduced no credential value, DSN, private key, token,
  SSH action, database action, server mutation, or runtime mutation.

# Risks / Follow-ups

Do not execute the current proposed server packet: it would install an operator
that the observed host resolves to PostgreSQL 18.1. Do not treat a successful
18.1 archive parse as rollback evidence for PostgreSQL 17.6. Do not use browser
login as an implicit authorization to create a JIT login role. The exact safe
boundary is: explicit verified major-17 client pair, current accepted database
credential, fresh archive, and successful isolated major-17 restore before any
migration, source recovery, Qdrant reindex, or evidence activation.
