# Orchestrator Handoff

Updated: 2026-07-13
Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion
Integration branch: pushed `codex/self-hosted-qdrant-platform`; current remote
baseline commit `835ca195`, with the independently accepted normative addendum
SHA recorded in the current documentation delta. Resolve the remote SHA before any
later continuation. The dedicated integration worktree remains authoritative
for Q12.

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
- `docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md`
- `docs/superpowers/plans/2026-07-13-q12-live-cutover-corrections.md`
- `docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md`
- `docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md`
- `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md`

## Accepted and Open Work

- Accepted and pushed: Q1-Q9, strict Formula index fix `.15`, evidence E1-E7, and exact 100% local/development document-evidence activation. Final independent activation/docs review at `d3417610` reported no P0-P3 findings; integration merge `ea183d83` passed 24/24 focused tests, package type-check, process verification, and canonical closeout dry-run. Integration history and exact evidence are in `.codex/stages/mc2-jz6y0/summary.md`.
- Q7 `.8` is reviewed, integrated as `841812be`, verified at focused 85/85 plus pinned Qdrant `1.18.2` 19/19, and its dedicated local worktree/branch are cleaned. The remote evidence branch remains.
- Q6 `.7`, Q8 `.9`, Q9 `.10`, Q10 `.11` and Q11 `.12` are reviewed and integrated. Q10 reviewed head `42ed1322` merged as `3c9dd641`; 31 Markdown files passed final independent review with P0-P3 zero. The final local release matrix passed backend 1,893/1,893 with zero skips, shared 23/23, web 20/20, PostgreSQL 78/78 with zero skips, exact Qdrant 15/15, applicable local snapshot/restore 5/5, Compose/runtime 8/8, Prometheus 14 rules, Alertmanager config, `pnpm type-check`, and build 75/75. The stale activation-contract test was corrected under `.26`; implementation and independent review are integrated with P0-P3 zero.
- Q12 local remediation includes guarded migrations `.13.1`, immutable operator `.13.2`, release-bound rollback `.13.3`, and accepted staging-local snapshot mode `.13.5`. Local snapshots now live at `/qdrant/storage/snapshots` on the persistent named volume and pass the exact pinned `1.18.2` recreate/restore matrix; they do not protect against volume, disk, host, or datacenter loss. Off-host S3 is explicitly deferred to production gate `.13.6`. No staging mutation has occurred.
- Q12 source audit `.13.4` is independently accepted read-only: 261 catalog rows, 240 Qdrant-eligible and 21 `missing_course`; 42 exact no-replace copies can restore 125 eligible rows and raise recoverable coverage from 109 to 234. Exact originals for the final four missing plus two invalid eligible rows were not found anywhere on the host. Eighteen non-eligible Career Playbook originals are also absent. The owner-approved dispositions are six `source_file_unrecoverable` plus eighteen `retained-derived-only`. The complete `.13.4.1` operator is locally accepted, including core, workflow/CAS, audited reindex, Stage 4 failed-coverage integration, concrete multi-ledger adapters, isolated runtime, crash-residue/inode matrix, and exact-count Task 6. Final Task 6 rereview passed P0-P3 zero; fresh integration passed 3/3 focused and 456/456 recovery/reindex tests plus type-check/artifact/process gates. All Task 6 worktrees/local branches are cleaned. No staging copy or remote mutation has run.
- The downloaded Supabase Root 2021 CA is valid through 2031 and a current owner-supplied Session pooler URI passed PostgreSQL `17.6` `verify-full` read-only inventory. The credential exists only in the owner-only local session file and is never copied into Git, artifacts, argv, environment, logs, or worker prompts. The owner authorized its temporary use for this staging window; terminal rotation remains a separate mutation under `.13.8`. The server still has 12/12 invalid 20-byte legacy backups and zero usable generations, so `.13.7` remains open until the new fail-closed operator creates a fresh four-file generation and its Supabase-compatible isolated restore succeeds. No live mutation has occurred.
- The owner approved the exact Q12 correction specification SHA-256 `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15` on 2026-07-13. On the same date the owner accepted decisions `.13.14` and `.13.15`: the managed Supabase provider plane is an explicit trusted residual boundary, and recovery uses guarded `prepare-recovery`, quiesced completion, no-start mode-bound final manifests, then a separate lease-bound `resume-writers-only` after cleanup. Both decisions are closed. The independently rereviewed normative addendum SHA-256 is `de493383f0daa585174b81457e3150139cb1ab3988421655bf24a53437d3c28c` with P0-P3 zero; it supersedes the initial record at `c8d22c2a`. This permits safe local implementation only; remote/live mutation remains separately gated.
- Publisher `.13.9` is accepted, integrated and pushed. Writer/barrier `.13.10` retains its reviewed dirty candidate in `/home/me/code/mc2/.worktrees/q12-w-writer-barrier`; a visible W worker is implementing the accepted lifecycle delta with RED-first tests. G7 `.13.7.2`, migration `.13.11`, handoff `.13.12`, and root `.13.13` remain dependency-ordered and local-only.
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

Recommended action: finish and independently accept W `.13.10`; then integrate
G7, run M/H in parallel, and finish the root supervisor/journal join. Run the
joined local release matrix before presenting the separate GHCR publication and
live-cutover packet. Keep Q12 remote execution NO-GO until the frozen
supervisor, truthful four-file backup, Supabase-compatible isolated restore,
ten-writer barrier, migrations, handoff and recovery tests all pass. Do not
rotate the database password without the separate `.13.8` effects/rollback
packet and current authorization.

## Starter prompt for next orchestrator

Use $orchestrator-stage.

Use `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md` from the resolved SHA of `origin/codex/self-hosted-qdrant-platform`.

## Parallel Execution After Q7

- E1-E6 and Q7 are accepted and integrated.
- Q8/Q9 are accepted and integrated; their shared metrics-directory contract is reconciled and executable.
- E7, Q10, Q11, and the earlier Q12 foundation/source-recovery work are
  accepted. The correction wave W/G7/M/H/Root remains open locally; only after
  its independent acceptance and joined release matrix may the separate Q12
  live execution/observation boundary be presented.

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

- Q12 staging mutation is owner-authorized, but remains NO-GO until the
  approved local correction streams, truthful fresh validated database backup,
  Supabase-compatible restore and every documented hard gate pass. GHCR
  publication and password rotation retain their separate secret/effects gates.
  Missing-source product truth is resolved by the approved six failed plus
  eighteen retained-derived-only dispositions. Do not partially activate.
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
graph-reviewed: used — the existing report and a focused local query were
consulted, but the graph predates the new Q12 shell lifecycle. Refresh is
deferred until the active dirty isolated streams are integrated; closeout must
run the safe local Graphify refresh with zero model/API modes and no Git hooks,
then record the delivered HEAD.
Optional SQL AST enrichment is deferred: 283 SQL files require the uninstalled
`tree_sitter_sql` extra; this docs-only slice did not install global tooling.
