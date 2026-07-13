# Orchestrator Handoff

Updated: 2026-07-13
Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion
Integration branch: `codex/self-hosted-qdrant-platform`
Resolve the current SHA of `origin/codex/self-hosted-qdrant-platform` before
continuation; the dedicated integration worktree remains authoritative for Q12.

## Product Truth

- Qdrant Cloud data was test-only and is lost. Do not recover or mutate it; rebuild the derived index from authoritative sources.
- Target remains private self-hosted Qdrant `1.18.2`, native multilingual BM25/IDF, server RRF/Formula priority, strict indexes, aliases, source reindex, Prometheus/Grafana/alerts, and secure loopback Web UI. Development staging uses persistent local-volume snapshots; off-host S3 is the production gate `mc2-jz6y0.13.6`.
- Documents are optional but important advisory evidence. A course without documents remains fully supported.
- Every uploaded document must receive a durable `assessed`, `degraded`, or `failed` coverage outcome; none may disappear through context truncation.
- Documents supplement the baseline structure. They may add facts, terminology, constraints, examples, and source-backed topics but cannot silently replace baseline curriculum requirements.
- Material document conflicts use a distinct required-question block. Manual mode pauses at the existing Phase 0.5 boundary. Automatic mode selects the recommendation and appends `resolved_by: system` / `answer_source: system` with rationale.
- Large corpora use deterministic bounded batches, hierarchical summaries, claim reduction, and targeted Qdrant verification.
- Stage 5 is two-pass: baseline first, bounded advisory enrichment second. Stage 6 consumes the same accepted decisions and evidence refs.

## Read First

- `AGENTS.md`
- `.codex/orchestrator.toml`
- `.codex/handoff.md`
- `.codex/project-index.md`
- `graphify-out/GRAPH_REPORT.md`
- `docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md`
- `docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md`
- `docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md`
- `docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md`
- `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md`

## Accepted and Open Work

- Accepted and pushed: Q1-Q9, strict Formula index fix `.15`, evidence E1-E7, and exact 100% local/development document-evidence activation. Final independent activation/docs review at `d3417610` reported no P0-P3 findings; integration merge `ea183d83` passed 24/24 focused tests, package type-check, process verification, and canonical closeout dry-run. Integration history and exact evidence are in `.codex/stages/mc2-jz6y0/summary.md`.
- Q7 `.8` is reviewed, integrated as `841812be`, verified at focused 85/85 plus pinned Qdrant `1.18.2` 19/19, and its dedicated local worktree/branch are cleaned. The remote evidence branch remains.
- Q6 `.7`, Q8 `.9`, Q9 `.10`, Q10 `.11` and Q11 `.12` are reviewed and integrated. Q10 reviewed head `42ed1322` merged as `3c9dd641`; 31 Markdown files passed final independent review with P0-P3 zero. The final local release matrix passed backend 1,893/1,893 with zero skips, shared 23/23, web 20/20, PostgreSQL 78/78 with zero skips, exact Qdrant 15/15, applicable local snapshot/restore 5/5, Compose/runtime 8/8, Prometheus 14 rules, Alertmanager config, `pnpm type-check`, and build 75/75. The stale activation-contract test was corrected under `.26`; implementation and independent review are integrated with P0-P3 zero.
- Q12 local remediation includes guarded migrations `.13.1`, immutable operator `.13.2`, release-bound rollback `.13.3`, and accepted staging-local snapshot mode `.13.5`. Local snapshots now live at `/qdrant/storage/snapshots` on the persistent named volume and pass the exact pinned `1.18.2` recreate/restore matrix; they do not protect against volume, disk, host, or datacenter loss. Off-host S3 is explicitly deferred to production gate `.13.6`. No staging mutation has occurred.
- Q12 source audit `.13.4` is independently accepted read-only: 261 catalog rows, 240 Qdrant-eligible and 21 `missing_course`; 42 exact no-replace copies can restore 125 eligible rows and raise recoverable coverage from 109 to 234. Exact originals for the final four missing plus two invalid eligible rows were not found anywhere on the host. Eighteen non-eligible Career Playbook originals are also absent. The owner-approved dispositions are six `source_file_unrecoverable` plus eighteen `retained-derived-only`. The complete `.13.4.1` operator is locally accepted, including core, workflow/CAS, audited reindex, Stage 4 failed-coverage integration, concrete multi-ledger adapters, isolated runtime, crash-residue/inode matrix, and exact-count Task 6. Final Task 6 rereview passed P0-P3 zero; fresh integration passed 3/3 focused and 456/456 recovery/reindex tests plus type-check/artifact/process gates. All Task 6 worktrees/local branches are cleaned. No staging copy or remote mutation has run.
- The downloaded Supabase Root 2021 CA is valid through 2031 and reaches the pooler with `verify-full`. Browser login for the repo-pinned Supabase CLI `2.106.0` succeeded and linked the active `MegaCampusAI` project; Management API inventory reports PostgreSQL `17.6`, a 249 MB database, 108 user tables, and no migration applied by this task. Linked inventory uses automatically expiring `cli_login_postgres` roles and does not expose a durable database password or Session pooler DSN. Exhaustive discovery still has zero working durable URLs: the only plausible server file, `/opt/megacampus/.env.backup`, is stale and the Actions secret is intentionally non-extractable. The server now retains 12/12 20-byte fail-open streams and zero usable backups; the previous substantive 2026-06-27 file has aged out. The tracked operator is pinned to `/usr/lib/postgresql/17/bin/{pg_dump,pg_restore}`, rejects missing/malformed/wrong/mismatched clients before credentials, and is accepted after TDD 24/24 plus independent P0-P3-zero rereview. The isolated restore target is also locally accepted: PostgreSQL `17.10` bookworm (a supported major/minor, not an LTS label), exact `linux/amd64` manifest `sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`, explicit `/var/lib/postgresql/data` named volume, read-only password bind, loopback isolation, and blocking zero-residue cleanup. `mc2-jz6y0.13.7` remains open until a current verify-full Session pooler URL exists, the observed `0775` backup paths are corrected, the validated CA/operator and pinned restore target are installed, and a fresh restore-validated backup succeeds. No migration, dump, service, cron, server-file, permission, Qdrant, or application change ran; only the short-lived CLI login roles were created by linked inspection.
- The sole executable `.13.7` packet is locally accepted after immutable P1/P2 review and independent P0-P3-zero rereview. It explicitly supersedes every older `/usr/bin` snippet, which remains historical evidence only. This acceptance does not close the live DSN, server preparation, fresh dump, isolated restore, or zero-residue gates.
- Decision `.14` is owner-approved and closed: Qdrant `1.18.2`, Prometheus `3.13.1` LTS, Grafana `12.4.5`, node_exporter `1.12.0`, Alertmanager `0.33.1`, approved image locks, authenticated main-listener scrape using `api-key` from a mounted file, no Qdrant `metrics_port`, fail-closed Qdrant secret wrapper, textfile-only unprivileged exporter, and single-node Alertmanager.
- Design `.17` is approved/closed. Grouping `.16` is closed as superseded by live-path tasks E5/E6.
- E1 `.18` is reviewed, integrated as `528fdfc2`, verified at shared 11/11, repository 11/11 and applied PostgreSQL 15.18 9/9, and its disposable DB/container plus dedicated local worktree/branch are cleaned.
- E2 `.19` is reviewed and integrated through `14277d8a`: focused Stage 4 117/117, shared 11/11, applied PostgreSQL 15.18 9/9, both type-checks and process verification pass. Exact full-ledger resume, per-card/cross-card hierarchy, claim-scoped verification and exact cl100k safety bounds are accepted. Its disposable DB/container and dedicated local worktree/branch are cleaned.
- E3 `.20` is reviewed and integrated through `89a7948e`: focused 136/136, shared 13/13, PostgreSQL 15.18 static/applied 36/36, both type-checks and process verification pass. Material conflicts, degraded/capacity decisions, manual/system atomicity, full snapshots, approval guards and plural retry recovery are accepted. Its disposable containers/symlinks and dedicated local worktree/branch are cleaned.
- E5 `.22` is reviewed and integrated through `cf438826`: focused 52/52, shared 20/20, full Stage5/Qdrant 532/532, workspace type-check/build and process verification pass. Baseline-first live enrichment, exact chunk grounding, fallback audit and CAS persistence are accepted. Its worktree/local branch are cleaned.
- E4 `.21` is reviewed and integrated through rebased equivalent `2538bb5c`: web 20/20, shared 2/2, real-panel Chromium/mobile/dark E2E 4 pass/2 expected skips, type-check/build/process pass. Distinct conflict UI, CAS edit semantics, localized system audit, fail-closed metadata and accessibility are accepted. Its worktree/local branch are cleaned.
- E6 `.23` is reviewed and integrated linearly through `5201a786` from final recovery commit `a6c39e7a`; the rebased tree is byte-identical to reviewed merge `1e681027`. Fresh integration evidence: shared 21/21, joined E5/E6 111/111, Stage4 267/267, migrations 14/14, PostgreSQL 15.18 E3 26/26 and side identity 8/8; independent merged-tree review additionally passed E4 20/20, E5 35/35, Qdrant 14/14, E6 76/76, Stage4 evidence 49/49 and type-check. Its disposable containers and dedicated worktree/local branch are cleaned.
- E7 `.24` is accepted locally. Owner decision `.24.2` closed on 2026-07-12 with exact local/development values `enabled=true`, `mode=active`, and Stage 5 cohort `100`; the final combined branch at `d3417610` passed independent review with no P0-P3 findings and merged as `ea183d83`. Parent acceptance passed 5/5 files and 24/24 tests, package type-check, process verification, and canonical closeout dry-run. Q12 remains the boundary for every staging/production or other remote mutation.
- Q6 `.7` final branch commits `bd6237b3` + `14322c8f` are independently approved and integrated as `f7930913`. Exact Qdrant index/amd64 child locks, fail-closed file secrets, loopback services, native S3 mapping, Stage 7 isolation and pre-recreate verification gates are accepted. Branch evidence: focused 8/8, Compose 8/8, pinned auth smoke `200/401/200/403/200/200`, type-check/build/process pass and disposable cleanup; integration focused 8/8 plus process verification pass. Its dedicated worktree/local branch are cleaned; the remote evidence branch remains.
- Q8 `.9` is independently approved and integrated as `da126a8a`: recovery relevance/isolation, checksum/manifest/retention, cleanup postconditions, shared metrics and systemd schedules pass unit 26/26 plus exact Qdrant restore 5/5. Q9 `.10` is independently approved and integrated as `5d4282ee`: approved LTS/extended-support monitoring pins, authenticated scrape, alerts, persistent notification path, dashboard and shared UID/GID textfile contract pass focused 33/33 and local service smokes. Combined Q6/Q8/Q9 integration passed 59/59, type-check, pinned promtool/amtool and process verification. Both worktrees/local branches are cleaned; remote evidence branches remain.
- Final `.13.7` execution documentation correction `7b446d7d` is integrated and independently rereviewed at `0b7ffe67` (integration `a0c12554`) with P0-P3 zero. The runbooks identify one sole executable PG17 packet, require the fresh custom-format backup and isolated restore before migrations, place source recovery before reindex, preserve guarded rollback, and reject the observed 20-byte empty backup artifacts. Both docs review worktrees are cleaned; pushed evidence branches remain, and no remote runtime was touched.

## Completed Recovery Gate

Q7 recovery is complete. Both pinned integration retrievals use `generatePointId(document_id, chunk_id)`; independent review passed; the integration rerun passed 19/19 and the dedicated worktree/local branch were safely cleaned after push.

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: obtain a current Supabase Session pooler DSN from an
authorized owner through Dashboard **Connect -> Session pooler**. Browser CLI
login is already complete but cannot reveal that password-bearing URI. Do not
rotate the database password without a separate explicit confirmation because
existing application connections may depend on it. Keep Q12 remote execution
NO-GO until the supplied URL passes `verify-full` and the reviewed `.13.7`
operator produces a fresh custom dump that successfully restores in isolated
PostgreSQL 17. Then execute the already authorized
exact-copy/disposition/reindex and cutover packet without `--allow-gaps` or
partial activation.

## Starter prompt for next orchestrator

Use $orchestrator-stage.

Use `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md` from the resolved SHA of `origin/codex/self-hosted-qdrant-platform`.

## Parallel Execution After Q7

- E1-E6 and Q7 are accepted and integrated.
- Q8/Q9 are accepted and integrated; their shared metrics-directory contract is reconciled and executable.
- E7, Q10, Q11 and Q12 local remediation are accepted. Q12 live execution and
  observation remain the only open boundary.

Use visible subagents, `.codex/subagent-spawn-template.md`, strict write zones, selected installed skills/personas, artifacts, exact verification, and independent review. Do not accept reports without inspecting diffs and evidence.

## Required Skills and Review

- Orchestration: `orchestrator-stage`, `task-router`, `subagent-driven-development`.
- Behavior changes: `brainstorming` where decisions remain, `test-driven-development`, `verification-before-completion`.
- Risk/closeout: `senior-architect`, `senior-devops`, `test-pass`, `orchestration-closeout`.
- E4 UI: mandatory Lazyweb quick search/report with synthetic content, then frontend/browser verification.
- Specialists: `docs_researcher`, search/data worker, `deploy_specialist`, `correctness_reviewer`, and `docs_reviewer`.

## Verification and Delivery

- Do not weaken RU/EN relevance, strict-mode, restore, resume, coverage, or tenant-isolation tests.
- Completed local gates: focused Stage 2/4/5/6 backend 1,893/1,893, shared 23/23, web 20/20, PostgreSQL 78/78, pinned Qdrant 15/15, applicable local snapshot/restore 5/5, Compose 8/8, `pnpm type-check`, and `pnpm build` 75/75. Process verification, final Graphify refresh, and canonical closeout are recorded at the delivered HEAD.
- Keep durable docs, project index, Graphify (`graphify update .`; `graphify cluster-only . --no-viz`), Beads, artifacts, stage summary, and this handoff synchronized before any Q12 continuation.
- All accepted branches/commits must be pushed under the repo contract.
- Primary worktree may contain unrelated `.claude/settings.json`; do not alter or include it.

## Explicit defers

- Q12 staging mutation is owner-authorized, but remains NO-GO until a current
  verify-full Session pooler URL, a truthful fresh validated database backup,
  and every documented hard gate pass. Browser Supabase CLI login is present but
  is not a substitute for the permanent Session pooler credential. Password
  rotation remains a separate explicit-impact decision. Missing-source product
  truth is resolved by the approved six failed plus eighteen
  retained-derived-only dispositions. Do not partially activate.
- Off-host S3 is not a staging blocker after the 2026-07-12 owner decision; it
  remains the explicit production readiness defer `mc2-jz6y0.13.6`.
- Prometheus retention YAML migration is the bounded nonblocking defer
  `mc2-jz6y0.25`, due before the next Prometheus pin change.
- The current pushed `codex/self-hosted-qdrant-platform` integration branch/worktree is intentionally retained for Q12. Final cleanup returned non-zero only because it correctly refused to delete this checked-out continuation branch; all Q11-owned worktrees, local branches, containers, ports and temporary data are cleaned.
- Stop if snapshot/alert secrets are required and unavailable, source gaps would change product truth, ownership conflicts cannot be isolated, or a required gate repeatedly fails after in-scope diagnosis.
- Capacity-triggered HA, quantization, on-disk hot indexes, custom sharding, and JWT RBAC remain out of scope.

docs-reviewed: updated — the Q12 operator, sole PG17 execution packet, both
runbooks, migration/activation order, rollback, authorization, and sanitized
environment contracts are reconciled; final rereview reported P0-P3 zero.
graph-reviewed: updated — local Graphify `0.9.13` ran `graphify update .` and
`graphify cluster-only . --no-viz`: 52,662 nodes, 79,924 edges, 3,415
communities, zero model/API tokens, zero forbidden runtime/noise source paths,
and no Git hooks. The final post-metadata rerun must report the delivered HEAD.
Optional SQL AST enrichment is deferred: 283 SQL files require the uninstalled
`tree_sitter_sql` extra; this docs-only slice did not install global tooling.
