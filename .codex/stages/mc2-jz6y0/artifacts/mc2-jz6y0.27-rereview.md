---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.27-rereview
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The rereview closes a fail-closed PostgreSQL client validation finding before any credential or database operation.
repo: mc2
branch: codex/q12-backup-pg17-rereview
base_branch: codex/q12-backup-pg17-pin
base_commit: a25f01a0463a9e1f74ef1a3bfabd549f5eaa1550
reviewed_commit: a25f01a0463a9e1f74ef1a3bfabd549f5eaa1550
reviewed_range: f85c0e209cf8efb82f6a81b67d8317d06a4a6ddf..a25f01a0463a9e1f74ef1a3bfabd549f5eaa1550
resolves_review: 4e32dcf9d40a471cce3027c811a7f11a33bf08f3
worktree: /home/me/code/mc2/.worktrees/q12-backup-pg17-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-rereview.md
success_criteria:
  - independently inspect the exact correction delta and full resulting operator and focused test
  - prove CR/LF version output fails before URL, CA, or dump access while canonical PostgreSQL 17 output and a same-line packaging suffix pass
  - preserve explicit production PostgreSQL 17 paths, major pairing, credential ordering, protected overrides, and prior archive invariants
  - run the assigned focused, shell, type, process, artifact, formatting, and diff gates
selected_docs:
  - PostgreSQL 17 pg_dump - https://www.postgresql.org/docs/17/app-pgdump.html
  - PostgreSQL 17 pg_restore - https://www.postgresql.org/docs/17/app-pgrestore.html
  - immutable review 4e32dcf9 - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-review.md
selected_skills:
  - code-review
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
  - deploy_specialist perspective
catalog_candidates:
  - none - installed assets and the immutable finding cover the bounded rereview
parallel_group: q12-backup-pg17-rereview
depends_on_streams:
  - mc2-jz6y0.27-correction
parallel_decision: sequential - the rereview depends on the completed correction commit
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: The zero-finding rereview is accepted; temporary dependency symlinks and the rereview worktree were removed, while the non-protected evidence branch is retained because force deletion of cherry-picked history is forbidden.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: This immutable rereview does not rewrite historical artifacts; exact durable runbook and replacement server-packet corrections are listed below.
graph_reviewed: used
graph_review_notes: Read the existing local graph report; a review-only artifact does not require graph refresh.
verification:
  - independent parser probes accepted canonical 17.7 and an Ubuntu same-line suffix, while LF and CRLF outputs failed with status 1
  - focused unit configuration passed 1 file and 24 of 24 tests with zero skips
  - bash syntax and the course-gen-platform package type-check passed
  - process verification and validation of all four .27 worker/review/correction/rereview artifacts passed
  - affected-file Prettier and final git diff checks passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-rereview.md
explicit_defers:
  - current verify-full Session pooler DSN, remote client/operator installation, directory and cron changes, fresh dump, isolated PostgreSQL 17 restore, and every live operation remain deferred
  - no Supabase, SSH, server, credential, database, package installation, service, container, Qdrant, staging, or production mutation was performed
---

# Summary

## Findings-first verdict

**PASS for corrected commit `a25f01a0`; P0: 0, P1: 0, P2: 0, P3: 0.**

The exact correction closes immutable P2 review `4e32dcf9` without weakening
the accepted backup boundary. No new correctness, secret-handling, archive,
atomicity, retention, or protected-test defect was identified. This is local
code acceptance only and grants no authority for installation or live database
work.

## Closed finding and preserved boundaries

1. **Malformed output is fail-closed.**
   `deploy/postgres/backup-supabase.sh:101-116` now rejects CR or LF in the
   complete captured output before prefix or major parsing. Line 114 uses
   `[[:blank:]]` for an optional same-line packaging suffix instead of the
   newline-admitting `[[:space:]]`. Independent in-memory probes returned
   status 1 for both `17.7\nunexpected second line` and
   `17.7\r\nunexpected second line`, while canonical `17.7` and
   `17.7 (Ubuntu 17.7-1.pgdg24.04+1)` returned major 17 and status 0.
2. **Regression coverage is complete.**
   `supabase-backup-operator.test.ts:296-341` independently exercises malformed
   `pg_dump`, malformed `pg_restore`, and the same-line Ubuntu suffix. Both
   negative tests delete URL and CA inputs and prove no dump/restore argument
   log exists, so failure precedes credential handling and dump execution.
3. **Production remains pinned.**
   `backup-supabase.sh:12,18-19,155-166` still selects
   `/usr/lib/postgresql/17/bin/pg_dump` and
   `/usr/lib/postgresql/17/bin/pg_restore`, requires both executables, requires
   equal reported majors, and requires major 17.
4. **Credential ordering remains fail-closed.**
   `backup-supabase.sh:368-381` calls `configure_commands` before either
   `open_validated_input` call. Missing, PostgreSQL 18, and cross-major cases at
   `supabase-backup-operator.test.ts:253-294` remain before URL handling and
   before dump execution.
5. **Synthetic overrides remain confined.**
   `backup-supabase.sh:118-153` still requires the exact test token, protected
   current-user-owned mode-0700 root, in-root credentials, and current-user-owned
   mode-0700 regular non-symlink commands. Production paths cannot be overridden
   without that boundary.
6. **Prior backup invariants remain covered.**
   `supabase-backup-operator.test.ts:343-612` preserves all accepted tests for
   direct dump status, secret suppression, TOC plus full offline traversal,
   owner-only publication, whole-window locking, stable URL/CA and directory
   identity, crash residue, no-replace publication, and post-success retention.

PostgreSQL 17 documents `--version` for both utilities and warns that newer-major
`pg_dump` output is not guaranteed to load into an older-major server. The
explicit matching-major PostgreSQL 17 rule remains the correct bounded rollback
choice.

# Verification

- `/usr/bin/bash -n deploy/postgres/backup-supabase.sh` - PASS, exit 0.
- Parser matrix - canonical 17.7 PASS; Ubuntu same-line suffix PASS; embedded LF
  and CRLF rejected with the expected invalid-version diagnostics, exit 1.
- The first focused invocation stopped before tests because unit setup requires
  local Supabase placeholders. The fresh network-free rerun supplied only
  synthetic `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` values and passed 1 file,
  24/24 tests, zero skips.
- `pnpm --filter @megacampus/course-gen-platform type-check` - PASS, exit 0,
  using only temporary links to the existing workspace dependency runtime.
- `scripts/orchestration/run_process_verification.sh` - PASS, including the
  orchestration contract and diff check.
- `scripts/orchestration/validate_artifact.py` - PASS for `.27.md`, immutable
  `.27-review.md`, `.27-correction.md`, and this `.27-rereview.md`.
- `pnpm exec prettier --check --ignore-unknown` on the operator, focused test,
  and all four `.27` artifacts - PASS. Bash syntax separately validates the
  operator because the repository has no installed shell Prettier parser.
- `git diff --check` and `git show --check --oneline HEAD` - PASS after temporary
  runtime symlinks were removed; only this rereview artifact changed.

# Documentation impact

`docs_impact: ops-deploy`. Do not rewrite `.27`, `.27-review`, `.27-correction`,
the prior `.13.7` artifacts, or other historical evidence. After integration,
make these exact forward-only durable corrections:

1. In `docs/operations/qdrant-self-hosted.md:370-376,390-397`, require the
   installed operator to preflight
   `/usr/lib/postgresql/17/bin/{pg_dump,pg_restore}` and require the isolated
   restore command to use `/usr/lib/postgresql/17/bin/pg_restore`.
2. In `docs/operations/document-evidence.md:320-331`, add the same explicit
   PostgreSQL 17 pair and restore-path requirement before the migration chain.
3. Supersede, rather than edit,
   `mc2-jz6y0.13.7-server-preflight-20260713.md` with a new execution packet
   that retains the observed `/usr/bin` 18.1 fact, verifies both explicit 17.x
   binaries before credential access, uses corrected operator SHA-256
   `4e89ac6e6e93b16885f449ae8f1ff05eee8082e96b722da159b108f3940d9526`,
   and invokes the explicit PostgreSQL 17 restore binary.

`docs-reviewed: no-change-needed` in this immutable review write zone; the
forward-only durable corrections are fully enumerated above.

`graph-reviewed: used` - the existing local report was read; no graph refresh is
appropriate for a rereview artifact.

# Delivery / Cleanup

Only this rereview artifact changed on the review branch. It is integrated and
accepted; temporary dependency symlinks and the dedicated rereview worktree
were removed. The remote evidence branch remains because normal closeout does
not force-delete cherry-picked history.

# Risks / Follow-ups / Explicit Defers

- A current verify-full Session pooler DSN remains unavailable in accepted
  evidence.
- Remote PostgreSQL client/operator installation, credential placement,
  directory/cron/service changes, a fresh dump, and an isolated PostgreSQL 17
  restore remain separate authorized live gates.
- No remote, package-installation, credential, database, dump, restore, service,
  container, Qdrant, staging, or production operation occurred.
