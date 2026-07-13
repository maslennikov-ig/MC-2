---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.7-docs-review
stage_id: mc2-jz6y0
agent_type: docs_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: the reviewed packet controls database credentials, rollback evidence, production-data restore isolation, and the pre-migration NO-GO boundary
repo: mc2
branch: codex/q12-supabase-docs-review
base_branch: origin/codex/self-hosted-qdrant-platform
base_commit: 1782858f09e02f0ec079b8d49f5fd5682ed64f5a
reviewed_commit: 1782858f09e02f0ec079b8d49f5fd5682ed64f5a
reviewed_range: 321199d26b6477c28f8c6289dc1ce22ce4dbf534..1782858f09e02f0ec079b8d49f5fd5682ed64f5a
worktree: /home/me/code/mc2/.worktrees/q12-supabase-docs-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-docs-review.md
success_criteria:
  - reconcile browser login, current server inventory, durable runbooks, replacement execution packet, and accepted PG17 client/image corrections
  - reject stale executable instructions or incoherent acceptance and cleanup metadata
  - return findings-first P0-P3 counts and accept only with every count zero
selected_docs:
  - .codex/handoff.md
  - .codex/stages/mc2-jz6y0/summary.md
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - deploy/postgres/backup-supabase.sh
  - all mc2-jz6y0.13.7* and mc2-jz6y0.27* stage artifacts at the reviewed commit
selected_skills:
  - code-review
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - docs_reviewer
  - correctness_reviewer perspective
catalog_candidates:
  - none - installed review assets and accepted first-party evidence cover the bounded review
parallel_decision: sequential - this is one joined independent review of the integrated operations packet
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: The immutable P1/P2 finding artifact is accepted as review evidence; correction 7b446d7d and zero-finding rereview 0b7ffe67 close it. The dedicated worktree was removed, while its pushed evidence branch remains because normal closeout does not force-delete cherry-picked history.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: the immutable findings remain in the body; correction 7b446d7d makes one PG17 packet solely executable, updates both durable runbooks, and reconciles accepted-stream metadata before zero-finding rereview 0b7ffe67
graph_reviewed: no-change-needed
graph_review_notes: the ignored GRAPH_REPORT is absent from this dedicated worktree; this read-only review changes no durable architecture, and graph refresh remains integration-owned after correction acceptance
verification:
  - operator and public CA SHA-256 values were recomputed and matched the replacement packet
  - all reviewed .13.7* and .27* artifacts plus this review artifact were validated with validate_artifact.py
  - durable runbooks and this review artifact passed Prettier
  - repository process verification and git diff/show whitespace checks passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-docs-review.md
explicit_defers:
  - the permanent verify-full Session pooler DSN remains external; password rotation requires separate explicit confirmation
  - every SSH, Supabase, credential, database, dump, restore, Docker, server, service, cron, migration, Qdrant, staging, production, and deploy action remains deferred
---

# Q12 Supabase Backup/Restore Documentation Review

# Summary

## Findings-first verdict

**NO-GO; P0: 0, P1: 1, P2: 1, P3: 0.** The current handoff, stage
summary, two durable runbooks, operator, PG17 image pin, and replacement packet
agree on the intended safe path. Acceptance is blocked because two accepted
historical artifacts still present the rejected `/usr/bin` PG18 wrapper as an
executable restore instruction, while the replacement packet supersedes only
the server-preflight command section. Several accepted correction/rereview
artifacts also retain mutually exclusive pending acceptance or cleanup state.

| ID      | Severity | Finding                                                                                                     |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| Q12-SD1 | P1       | Accepted artifacts retain executable `/usr/bin/pg_restore` instructions that are not explicitly superseded. |
| Q12-SD2 | P2       | Accepted correction/rereview metadata still says review, integration, documentation, or cleanup is pending. |

## Q12-SD1 — P1 — stale PG18-wrapper restore commands remain executable

- **Files:**
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.md:125`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.md:132`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-supabase-cli-login-role.md:113`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-supabase-cli-login-role.md:156`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-supabase-cli-login-role.md:178`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-server-execution-packet-pg17.md:49`.
- **Evidence:** the accepted implementation artifact says “For an actual
  isolated restore drill, use” and invokes `/usr/bin/pg_restore`. The accepted
  CLI artifact calls the same shape the “accepted path” and repeats the
  executable command. Current server evidence proves `/usr/bin/pg_restore`
  resolves to PostgreSQL `18.1`; the immutable compatibility review classifies
  that pair as unaccepted for a PostgreSQL 17 rollback target. The replacement
  packet correctly requires `/usr/lib/postgresql/17/bin/pg_restore`, but lines
  49-53 explicitly supersede only the proposed command section of
  `mc2-jz6y0.13.7-server-preflight-20260713.md`, not either accepted artifact
  above. The `.27` review itself identified both stale examples for correction.
- **Impact:** a future operator following either accepted artifact can run the
  rejected PG18 wrapper and treat a cross-major restore attempt as rollback
  evidence, directly weakening the only pre-migration recovery gate.
- **Required forward-only correction:** preserve the historical artifacts, but
  make the replacement packet explicitly supersede these exact executable
  snippets as well as the server-preflight proposed commands. State that every
  dump, archive traversal, and restore command uses only
  `/usr/lib/postgresql/17/bin/{pg_dump,pg_restore}`. Obtain a fresh independent
  rereview before accepting the packet.

## Q12-SD2 — P2 — accepted artifact state contradicts its pending metadata

- **Files:**
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-rereview.md:42`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27.md:37`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27.md:57`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-correction.md:40`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-correction.md:60`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-rereview.md:42`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-rereview.md:166`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-correction.md:25`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-correction.md:43`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-rereview.md:42`,
  `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.1-rereview.md:155`.
- **Evidence:** the original `.13.7-rereview` body is a zero-finding PASS and
  the implementation/handoff say it was accepted, yet its current frontmatter
  remains `status: returned` and `accepted_by_orchestrator: no`. The accepted
  `.27` worker/correction frontmatters still defer independent review,
  integration acceptance, and durable docs that are now recorded complete;
  the accepted `.27-rereview` body still says worktree/branch cleanup is
  pending despite `cleanup_status: cleaned`. The accepted PG17 image correction
  still says its zero-finding rereview is required, and its accepted rereview
  still says cleanup remains pending. This finding excludes the immutable
  NO-GO review bodies: their findings correctly remain visible and their
  cleanup notes link the accepted corrections and zero-finding rereviews.
- **Impact:** the canonical evidence presents incompatible readiness states,
  so a continuation or closeout agent can repeat completed reviews, report
  false cleanup residue, or refuse the already accepted local PG17 contracts
  for the wrong reason.
- **Required correction:** reconcile only current acceptance/cleanup metadata
  and accepted-stream tails with the integrated truth. Preserve every immutable
  NO-GO finding and its forward-only correction/rereview links. Leave only real
  defers: integration-owned Graphify refresh and all live actions.

# Verified Consistency

- Browser CLI `2.106.0` linked the active `MegaCampusAI` project and read its
  PostgreSQL `17.6` inventory; current-state evidence records 249 MB, 108 user
  tables, no migration applied, and only automatically expiring
  `cli_login_postgres` role side effects. Browser authentication exposes no
  durable password or Session pooler DSN.
- Current server evidence is consistent: 12/12 retained files are 20-byte
  fail-open streams, usable backups are zero, the old substantive file aged
  out, both backup paths are `0775`, `/usr/bin` wrappers select PG18.1, the
  explicit PG17.7 client pair is installed, and the CA, reviewed operator, and
  isolated restore runtime are not installed.
- The operator SHA-256 is
  `4e89ac6e6e93b16885f449ae8f1ff05eee8082e96b722da159b108f3940d9526`;
  the public CA SHA-256 is
  `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
  Both were recomputed locally and match the replacement packet.
- Both durable runbooks and the replacement packet require the explicit PG17
  pair, exact PostgreSQL `17.10` `linux/amd64` manifest
  `sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`,
  `/var/lib/postgresql/data`, a mode-0600 read-only password bind, loopback-only
  publication, pre-restore mount inspection, and blocking zero-residue cleanup.
- The replacement packet has the exact external gate: obtain the permanent
  Session pooler URI from Dashboard **Connect -> Session pooler**; stop if the
  password is unknown; rotate only with separate explicit confirmation. It
  forbids partial preparation, records effects/observation/downtime/rollback,
  contains no secret, and keeps production off-host S3 deferred to `.13.6`.
- Immutable PG17-client and PG17-image NO-GO reviews remain visible and link to
  the accepted forward-only corrections and zero-finding rereviews. Q12 remains
  NO-GO on the permanent DSN and every observed live gate.

# Documentation / Index / Graph Decision

`docs_impact: ops-deploy`. The project index needs no change: it already lists
both durable runbooks and the backup operator, while task history and blockers
belong in the handoff/stage artifacts. This read-only review does not refresh
Graphify; the dedicated worktree lacks the ignored report and the integration
owner remains responsible after accepted corrections.

# Verification

- All reviewed `.13.7*` and `.27*` artifacts plus this review artifact passed
  `scripts/orchestration/validate_artifact.py`.
- `docs/operations/qdrant-self-hosted.md`,
  `docs/operations/document-evidence.md`, and this review artifact passed
  Prettier.
- `scripts/orchestration/run_process_verification.sh` passed.
- `git diff --check` and `git show --check` passed.
- No Docker, SSH, Supabase, credential, database, service, package, Qdrant,
  staging, production, or deploy operation was performed.

# Risks / Follow-ups / Explicit Defers

Only this review artifact changes. The permanent verify-full Session pooler DSN
remains an external owner input; password rotation remains a separately approved
impact decision. Every live action remains deferred. Production off-host S3
remains the bounded `.13.6` defer and is not a staging prerequisite.
