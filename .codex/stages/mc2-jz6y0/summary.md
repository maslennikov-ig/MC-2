# Stage mc2-jz6y0 — Self-Hosted Qdrant Platform

Status: all safe local Q6-Q11 and E1-E7 work accepted; exact Q12 D4 normative design/plan are independently accepted and W is unblocked for local TDD; remote/live activation remains NO-GO
Classification: complex, multi-stream, security/data/operations sensitive
Base branch: `origin/codex/self-hosted-qdrant-platform`
Current accepted integration evidence: pushed head `9d3f3a1c` plus normative clarification SHA `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`
Integration branch: pushed `codex/self-hosted-qdrant-platform`; resolve the current remote SHA before continuation
Implementation scope: Q1-Q11 and E1-E7 are locally accepted. Q12 guarded migration/operator/rollback/local snapshots and source recovery remain the accepted foundation, while the correction streams now reconcile real Supabase PostgreSQL 17 backup/restore, ten Compose writers, file-only migration/handoff, and the sole supervisor. W `.13.10` is the current sequential critical path; live execution remains fail-closed.

## Beads Mapping

- Q1 `mc2-jz6y0.2`
- Q2 `mc2-jz6y0.3`
- Q3 `mc2-jz6y0.4`
- Q4 `mc2-jz6y0.5`
- Q5 `mc2-jz6y0.6`
- Q6 `mc2-jz6y0.7`
- Q7 `mc2-jz6y0.8`
- Q8 `mc2-jz6y0.9`
- Q9 `mc2-jz6y0.10`
- Q10 `mc2-jz6y0.11`
- Q11 `mc2-jz6y0.12`
- Q12 `mc2-jz6y0.13` — authorized staging objective, currently NO-GO until correction implementation and local hard gates pass
- E1 `mc2-jz6y0.18` — evidence contracts, persistence and RLS
- E2 `mc2-jz6y0.19` — large-corpus preflight and allocator
- E3 `mc2-jz6y0.20` — conflicts and manual/automatic decisions
- E4 `mc2-jz6y0.21` — separate conflict UI block
- E5 `mc2-jz6y0.22` — live Stage 5 advisory enrichment/grouping
- E6 `mc2-jz6y0.23` — decision-aware Stage 6 retrieval/grouping
- E7 `mc2-jz6y0.24` — evidence acceptance, observability and rollout

### Q12 Task 5 Parallel Decomposition (2026-07-12)

| Stream | Beads                | Goal                                                                               | Agent                                   | Write zone                                                        | Dependencies                                 | Verification                                          | Decision/reason                               |
| ------ | -------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| R      | `mc2-jz6y0.13.4.1.3` | isolated three-service operator, narrow capability bind, host flock/writer restore | deploy specialist using `senior-devops` | Compose, Dockerfile, entrypoint, host wrapper, ops tests/artifact | accepted workflow/reindex CLIs               | accepted: 34/34 plus final P0-P3-zero rereview        | complete; worktrees/local branches cleaned    |
| A      | `mc2-jz6y0.13.4.1.4` | concrete manifest/journal and accepted evidence adapters                           | search/data correctness worker          | Qdrant adapter/reindex seams, focused tests/artifact              | accepted workflow/reindex/evidence contracts | accepted: 146/146 plus final P0-P3-zero rereview      | complete; worktrees/local branches cleaned    |
| C      | `mc2-jz6y0.13.4.1.1` | crash-order, temp reconciliation and replacement-inode matrix                      | correctness/QA worker                   | recovery crash tests/support/artifact                             | accepted core/workflow                       | accepted: integrated 453/453 plus mutation RED        | complete; final P0-P3-zero review and cleanup |
| X      | `mc2-jz6y0.13.4.1.5` | disposable exact-count end-to-end source recovery acceptance                       | search/data correctness worker          | new focused acceptance test and delegated artifact                | accepted R/A/C plus evidence contracts       | accepted 3/3 and integrated 456/456; final P0-P3 zero | complete; worktrees/local branches cleaned    |

The first three streams inherited the orchestrator model with high reasoning because they cover
filesystem durability, destructive rollback, tenant-bound evidence, secrets,
and service isolation. The exact-count join uses the same reasoning level because
it exercises all accepted boundaries together. Catalog candidates are none; installed skills and local
approved contracts cover the work. All runtime work is local/synthetic and
authorizes no staging or production mutation.

### Q12 Database Backup Gate Decomposition (2026-07-13)

| Stream | Beads              | Goal                                                                    | Agent                                   | Write zone                                                    | Dependencies               | Verification                                      | Decision/reason                                       |
| ------ | ------------------ | ----------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- | -------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| B      | `mc2-jz6y0.13.7`   | fail-closed atomic local-disk Supabase/PostgreSQL backup operator       | deploy specialist using `senior-devops` | tracked backup shell, synthetic ops tests, delegated artifact | current local integration  | accepted initial 18/18 plus shell/CI/type/process | complete locally; remote install/live proof pending   |
| D      | `mc2-jz6y0.13.7`   | exhaustive durable Session pooler credential discovery                  | deploy specialist                       | sanitized discovery artifact only                             | accepted CA and server SSH | 16 unique / 6 complete / 0 working                | complete; durable credential remains external         |
| A      | `mc2-jz6y0.13.7`   | browser CLI login and first-party temporary-role contract               | docs researcher                         | login-role research artifact                                  | owner browser approval     | CLI 2.106.0 link plus primary-source review       | accepted; login does not yield permanent DSN          |
| S      | `mc2-jz6y0.13.7`   | current read-only server backup/client preflight                        | deploy specialist                       | server-preflight artifact                                     | SSH access                 | 12 files / 0 usable; PG18 wrapper and PG17 pair   | accepted inventory; execution packet remains NO-GO    |
| P      | `mc2-jz6y0.27`     | pin and fail-close the explicit PostgreSQL 17 dump/restore pair         | deploy specialist using TDD             | operator, focused test, worker/correction artifacts           | A + S                      | RED 2/24; GREEN 24/24 plus shell/type/process     | accepted and integrated                               |
| PR     | `mc2-jz6y0.27`     | independent finding review and corrected rereview                       | correctness/DevOps reviewer             | immutable review/rereview artifacts                           | P                          | initial P2 linked to correction; final P0-P3 zero | accepted; dedicated worktrees cleaned                 |
| T      | `mc2-jz6y0.13.7.1` | pin the isolated PostgreSQL 17 restore target and zero-residue contract | docs/deploy researcher plus reviewer    | immutable research/finding/correction/rereview artifacts      | P                          | four matching digest reads; P1 fixed; P0-P3 zero  | accepted; no image pulled or runtime resource created |
| DR     | `mc2-jz6y0.13.7`   | review the joined PG17 packet, runbooks, and acceptance trail           | docs reviewer                           | immutable docs-review artifact                                | P + T                      | initial P1/P2 findings                            | accepted finding evidence; correction required        |
| D2     | `mc2-jz6y0.13.7`   | independently rereview the corrected sole execution packet              | docs reviewer                           | immutable docs-rereview artifact                              | DR + correction            | P0-P3 zero                                        | accepted; both review worktrees cleaned               |

The corrected implementation is accepted locally and remains uninstalled. It
uses only the explicit `/usr/lib/postgresql/17/bin/{pg_dump,pg_restore}` pair,
rejects missing, malformed, wrong-major and mismatched clients before opening
credentials, and preserves every prior archive/atomicity invariant. Browser
login linked the active Supabase project and read PostgreSQL `17.6` inventory,
but its short-lived `cli_login_postgres` roles do not yield the permanent
Session pooler DSN required by the operator. The 2026-07-13 server audit found
12 retained 20-byte files and zero usable backups; the previous substantive
file has aged out. Remote use still requires an owner-supplied current Session
pooler URL, correction of observed `0775` backup paths, and a fresh successful
dump/restore drill. The prepared restore target is PostgreSQL `17.10` bookworm
at exact `linux/amd64` manifest
`sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`;
its accepted contract pins `/var/lib/postgresql/data`, a read-only secret bind,
loopback-only access, pre-restore mount inspection, and blocking zero-residue
cleanup. No image or layer has been pulled.

The sole executable packet is
`mc2-jz6y0.13.7-server-execution-packet-pg17.md`; every older `.13.7`
`/usr/bin` command snippet is immutable historical evidence only. Correction
`7b446d7d` and rereview `0b7ffe67` close the joined documentation findings.

## Parallel Decomposition

| Stream | Goal                                 | Agent                                        | Write zone                                         | Dependencies          | Verification                                         | Decision                                                          |
| ------ | ------------------------------------ | -------------------------------------------- | -------------------------------------------------- | --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| D      | authoritative version-sensitive docs | `docs_researcher`                            | `artifacts/authoritative-docs.md` only             | none                  | primary links and exact request/config shapes        | parallel now                                                      |
| F      | Q1 schema foundation                 | `backend_developer`                          | config/schema/tests/package pin                    | none                  | RED/GREEN unit and package type-check                | first contract gate                                               |
| S      | Q2-Q5 search correctness             | `backend_developer` + `correctness_reviewer` | Qdrant runtime, Stage 5/6 callers, Qdrant tests/CI | F                     | focused unit and pinned integration                  | parallel with I after F; sequential internally due shared modules |
| I      | Q6 runtime/security                  | `deploy_specialist`                          | Compose, deploy scripts, env examples              | F                     | Compose config, shell syntax, secret/exposure review | parallel with S                                                   |
| L      | Q7-Q8 data/recovery                  | `db_migration_specialist`/worker + reviewer  | Stage 2 contract, Qdrant tools, systemd, tests     | Q2/Q3 and Q6 for Q8   | plan, shared types, snapshot/restore                 | sequential internally due shared tools/package files              |
| O      | Q9 observability                     | `deploy_specialist`                          | monitoring config, Compose, ops runbook            | Q6                    | promtool, Compose, alert/dashboard audit             | parallel with Q7                                                  |
| C      | Q10 docs retirement                  | bounded worker then `docs_reviewer`          | named docs and project index                       | Q1-Q9                 | Cloud/custom-BM25 scans                              | sequential after implementation truth                             |
| A      | Q11 acceptance/closeout              | root + reviewers                             | evidence and in-scope corrections                  | Q1-Q10                | full local gates and canonical closeout              | sequential shared gate                                            |
| X      | Q12 staging                          | root + deploy review                         | live evidence/state only                           | Q11 + DB/source truth | live cutover gates                                   | authorized; NO-GO until hard inputs and gates pass                |

## Approved Evidence Expansion (2026-07-11)

Owner-approved design: `docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md`.

Executable companion plan: `docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md`.

Validated continuation prompt: `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md`.

| Stream | Goal                                                  | Agent                                      | Write zone                                        | Dependencies           | Verification                                            | Decision                       |
| ------ | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- | ---------------------- | ------------------------------------------------------- | ------------------------------ |
| E1     | canonical contracts and tenant-isolated audit storage | data/backend worker + correctness reviewer | shared types, evidence migration/repository/tests | accepted Q1-Q5         | schema, migration, RLS, append-only tests               | start in parallel with Q6/Q7   |
| E2     | complete large-corpus evidence preflight              | search/data worker + correctness reviewer  | Stage 4 allocator/evidence modules/tests          | E1 + accepted Q7       | zero/small/oversized/1,000-doc, resume, budget tests    | sequential after data contract |
| E3     | conflict detection and auditable decisions            | high-reasoning backend worker + reviewer   | Stage 4 Phase 0.5, router/RPC, tests              | E1 + E2                | RU/EN, pause, system-answer, idempotency tests          | contract gate for consumers    |
| E4     | distinct required conflict block                      | frontend worker + UI review                | clarifying UI/messages/tests                      | E3                     | Lazyweb, component, accessibility, Playwright           | parallel with E5/E6            |
| E5     | non-destructive live Stage 5 enrichment               | search/data worker + reviewer              | Stage 5 evidence/live caller/tests                | E1 + E3 + Q5 + Q7      | baseline equivalence, grouping, outage tests            | parallel with E4/E6            |
| E6     | decision-aware live Stage 6 retrieval                 | search/data worker + reviewer              | Stage 6 retriever/cache/tests                     | E1 + E3 + Q5 + Q7      | decision, grouping, required-RAG, isolation tests       | parallel with E4/E5            |
| E7     | cross-stage acceptance and rollout                    | root + docs/correctness reviewers          | metrics/docs/artifacts/in-scope fixes             | E4 + E5 + E6 + Q8 + Q9 | pinned integration, type-check, build, process/closeout | blocks Q10/Q11 close           |

`mc2-jz6y0.16` is closed as superseded: acceptance requires grouping in genuinely production-reachable Stage 5 and Stage 6 callers, not an arbitrary count of dormant helpers.

## Current Recovery Point

- Q12 source recovery is fully accepted locally through Task 6. Its immutable
  manifest, workflow/CAS, audited reindex, Stage 4 failed coverage, concrete
  multi-ledger adapters, isolated runtime, crash-residue/inode matrix, and exact
  count acceptance passed final P0-P3-zero rereview. Fresh integration evidence
  is 3/3 focused and 456/456 combined plus type-check/artifact/process gates;
  every Task 6 worktree/local branch is cleaned. No source copy, database write,
  reindex, deploy, service change, or live mutation has occurred.

- Integration branch contains accepted Q1-Q9 and evidence E1-E7 with exact 100% local/development activation. The combined activation/docs branch passed final independent review at `d3417610`, merged as `ea183d83`, and passed its parent acceptance rerun.
- Q12 local remediation now also includes accepted staging-local snapshot mode
  `.13.5`: exact Qdrant `1.18.2` snapshots persist under
  `/qdrant/storage/snapshots`, survive container replacement with the named
  volume, pass 7/7 exact restore/isolation checks, and fail durably after volume
  deletion. This is not host/disk/off-host DR; production S3 is tracked by
  `.13.6`. The Supabase CA is valid, and the current owner-only Session pooler
  URI passed PostgreSQL 17.6 verify-full read-only probes without disclosure.
  Source audit `.13.4` proves 42 exact copies can restore
  125 eligible rows (109 -> 234/240); six eligible originals and eighteen
  non-eligible Career Playbook originals are absent. No remote mutation or copy
  has occurred.
- On 2026-07-12 the owner approved the narrow exact-copy and audited-disposition
  design and written specification for `.13.4.1`: six eligible rows become durable
  `source_file_unrecoverable` failures and eighteen absent non-eligible Career
  Playbook sources become `retained-derived-only`. The written specification is
  `docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md`; the approved
  executable plan is `docs/superpowers/plans/2026-07-12-q12-source-recovery.md`.
- Q7 / `mc2-jz6y0.8` is accepted: both integration lookups use document-scoped point IDs, the pinned Qdrant `1.18.2` gate passes 19/19, focused Q7 tests pass 85/85, and the dedicated worktree/local branch are cleaned. The remote evidence branch remains.
- E1 / `mc2-jz6y0.18` is accepted: immutable source manifests survive deletion-before-persist, guarded RPCs replace authenticated table writes, terminal coverage and user-only override direction are enforced, PostgreSQL 15.18 applied tests pass 9/9, and the dedicated worktree/local branch/container are cleaned. The remote evidence branch remains.
- E2 / `mc2-jz6y0.19` is accepted: complete authoritative source enumeration, exact durable outcomes, structured per-document and cross-document hierarchy, atomic resume, claim-scoped verification, and exact `tiktoken 1.0.22` safety bounds are integrated. The final independent reviewer reported no findings (`Spec PASS`, `Quality APPROVED`).
- E3 / `mc2-jz6y0.20` is accepted: persisted-card conflict detection, bounded RU/EN classification and Qdrant verification, explicit degraded/capacity questions, atomic manual/system decisions, full snapshots, guarded approval and recoverable multi-document retry lineage are integrated. Final independent review reported no findings (`Spec PASS`, `Quality APPROVED`).
- E4 / `mc2-jz6y0.21`, E5 / `mc2-jz6y0.22`, and E6 / `mc2-jz6y0.23` are accepted and integrated.
- E7 / `mc2-jz6y0.24` is accepted locally. Stage 2/4/5/6 passed 330/330, shared contracts 23/23, web conflicts 20/20, PostgreSQL 16.14 migrations/recovery/isolation 64/64, observability 122/122, Prometheus 3.13.1 checks 14 rules, workspace type-check and independent code/docs reviews P0-P3 zero. Owner decision `.24.2` closed on 2026-07-12 with the exact local/development active gate and Stage 5 cohort `100`. The combined activation/docs branch at `d3417610` passed final independent review with no P0-P3 findings, merged as `ea183d83`, and the parent rerun passed 5/5 files and 24/24 tests, package type-check, process verification, and canonical closeout dry-run.
- Q6 / `mc2-jz6y0.7` is accepted and integrated: Qdrant is pinned to `1.18.2` by index digest and `linux/amd64` child lock, file-backed secrets fail closed, ports remain loopback-only, Stage 7 stays isolated, and deploy gates verify readiness/auth/schema before RAG consumer recreation. Independent final review returned `PASS`; the integration rerun passed focused 8/8 plus artifact/process verification.
- Decision `mc2-jz6y0.14` is owner-approved and closed: Prometheus `3.13.1` LTS, Grafana `12.4.5` extended support, node_exporter `1.12.0`, Alertmanager `0.33.1`, authenticated main-listener scrape, no Qdrant `metrics_port`, and file-backed fail-closed secret transport.
- Q8 / `mc2-jz6y0.9` and Q9 / `mc2-jz6y0.10` are accepted and integrated as `da126a8a` and `5d4282ee`. The shared recovery/textfile contract is unified at `/var/lib/megacampus/qdrant-metrics`; both final independent reviews returned `PASS`.
- Q10 / `mc2-jz6y0.11` is accepted and integrated from reviewed head `42ed1322` as merge `3c9dd641`. Current setup/deployment/module/architecture/design/plan/runbook docs now agree on private pinned Qdrant 1.18.2, native multilingual BM25/IDF, server RRF→Formula, strict indexes, deterministic reindex, exact-version restore, monitoring pins, reproducible credential/systemd commands, rollback and Q12. Historical Cloud materials are explicitly bannered. Three review rounds closed six Important and one Minor finding; final verdict Ready to merge Yes with P0-P3 zero. Parent scans found 0 actionable Cloud instructions, 0 old pins, 0 stale Formula/recovery claims and 86 positive contract references; Prettier, artifact/process verification and canonical closeout dry-run passed. Dedicated worktree/local branch cleaned; remote evidence branch retained.
- Q11 / `mc2-jz6y0.12` is accepted on the integrated local tree. The final expanded Stage 2/4/5/6 matrix passed 125/125 files and 1,893/1,893 tests with zero skips; shared contracts passed 23/23, web conflicts 20/20, and PostgreSQL 16.14 migration/recovery/isolation passed 78/78 with zero skips. The exact-digest Qdrant 1.18.2 gate passed 15/15, with 5/5 applicable local snapshot/restore tests; the two managed-recreate cases are explicitly non-applicable to staging local-volume mode. Compose/runtime passed 8/8, Prometheus 3.13.1 validated 14 rules, Alertmanager 0.33.1 validated its config, `pnpm type-check` passed, and `pnpm build` generated 75/75 pages. Activation-contract correction `.26` and final docs correction both passed independent P0-P3-zero rereviews. All owned containers, ports, temporary data, accepted verification worktrees, and local branches are cleaned; the integration worktree remains for Q12.

## Routing Evidence

- Selected installed skills: `orchestrator-stage`, `task-router`, `senior-architect`, `senior-devops`, `subagent-driven-development`, `test-driven-development`, `test-pass`, `verification-before-completion`, `orchestration-closeout`, and `prompt-authoring`.
- Selected installed agents: `docs_researcher`, `backend_developer`/worker, `deploy_specialist`, `db_migration_specialist`, `correctness_reviewer`, and `docs_reviewer`.
- Catalog candidates: none — installed assets cover the stage.
- Graphify used and refreshed locally after E7 acceptance and again after durable readiness/orchestration updates: focused document-evidence Stage 4/5/6 observability/rollout query, then `graphify update .` and `graphify cluster-only . --no-viz`. The final delivered report must match the delivered integration HEAD; runs use zero external model/API tokens and no Git hooks. Community totals are omitted because reclustering may repartition an unchanged graph.
- Authoritative docs: Qdrant, Prometheus, Grafana, and systemd first-party sources; consulted versions will be recorded in `artifacts/authoritative-docs.md`.

## Baseline Evidence

- `pnpm install --frozen-lockfile`: passed.
- Qdrant unit baseline with CI placeholder env: 3 files passed, 6 tests passed.
- `pnpm --filter @megacampus/course-gen-platform type-check`: passed.
- Initial test attempt without CI placeholder env stopped in `tests/setup-unit.ts` before collection because `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` were absent; no code defect or test weakening was involved.

## Accepted Streams

- Q1 / `mc2-jz6y0.2`: accepted and integrated from commit `91ecd115` (`origin/codex/qdrant-q1-schema`). Independent review: spec compliant, task quality approved, no findings. Integrated rerun: focused Vitest 4/4 and package type-check passed. Dedicated local worktree/branch cleaned; remote evidence branch retained.
- Q2 / `mc2-jz6y0.3`: accepted and integrated from review-fix commit `7c3702d3` (`origin/codex/qdrant-q2-collection-manager`) as merge `fb919ea6`. Bootstrap/verify enforce exact Qdrant `1.18.2` compatibility, complete schema sets, safe alias ordering and explicit legacy deletion; lifecycle course cleanup resolves the stable alias without losing the isolated `course_id` filter. Independent re-review passed with no findings. Integrated combined Q2-Q4 rerun passed 75 tests, package type-check, both CLI help gates and zero-legacy scans.
- Q3 / `mc2-jz6y0.4`: accepted and integrated from commit `bc0ceacf` (`origin/codex/qdrant-q3-native-ingestion`) as merge `b3954e83`. Native Qdrant BM25 documents, complete compacted priority payloads and fail-before-upsert weight validation are in place; process-local BM25 runtime state is removed. Independent re-review approved with no findings. Fresh branch and integrated reruns both passed 21 focused tests, package type-check, strict typed ESLint with zero errors, and the zero-legacy-reference gate.
- Q4 / `mc2-jz6y0.5`: accepted and integrated from review-fix commit `4159c2f4` (`origin/codex/qdrant-q4-hybrid-formula`) as merge `7a5f40df`. Native BM25+dense prefetch, server-side RRF→Formula ranking, optional document grouping, exact cache identity and observable safe dense fallback are implemented; client-side RRF/priority score mutation is removed. Independent re-review passed with no findings. Integrated rerun passed 34 focused tests, package type-check and native-only static gates. Production grouping remains disabled until Q5's pinned RU/EN fixture passes.
- Q5 / `mc2-jz6y0.6`: accepted and integrated from review-fix commit `3c36a6a1` (`origin/codex/qdrant-q5-pinned-integration`) by the required pull-rebase integration. The blocking CI gate pins Qdrant `1.18.2` and proves native multilingual BM25, dense+sparse RRF, strict Formula weighting, document grouping, tenant/course isolation, snapshots and cleanup. Independent re-review passed with no findings. Root acceptance rerun passed 17 workflow/config tests, 19 pinned integration tests, package type-check and build; pre/post collection state was empty and the verification container was removed.
- Q7 / `mc2-jz6y0.8`: accepted and integrated from reviewed recovery commit `49e5e8d7` as merge `841812be`. Source-driven reindex plan/execute/verify is deterministic, resumable and document-scoped; the recovery reviewer found no issues (`PASS`/`APPROVED`). Fresh post-commit evidence: seven focused files 85/85 and pinned Qdrant `1.18.2` integration 19/19. Integration and recovery containers were removed; the dedicated worktree/local branch were cleaned.
- Q6 / `mc2-jz6y0.7`: accepted from commits `bd6237b3` and `14322c8f` as merge `f7930913`. Exact Qdrant `1.18.2` index/amd64 child locks, private Compose services, fail-closed non-leaking file secrets, native S3 mapping, healthy same-model dependencies, Stage 7 isolation and pre-recreate deploy verification are implemented. The final independent review returned `PASS` with no findings. Branch evidence passed focused 8/8, four Compose full/no-env renders, pinned authorization smoke `200/401/200/403/200/200`, package type-check/build, artifact/process validation and cleanup; the integration rerun passed focused 8/8 and process verification. The dedicated worktree/local branch are cleaned; the remote evidence branch remains.
- Q8 / `mc2-jz6y0.9`: accepted through `c4e0a0f3` as merge `da126a8a`. Snapshot create/list/authenticated streaming checksum, immutable/latest manifests, owned deterministic retention, exact 7-part restore relevance/isolation, boolean and postcondition cleanup, stable alias protection, shared lock/metrics and hardened <=6h/monthly systemd schedules are implemented. Three review cycles closed cleanup, semantic-probe and shared-metrics findings; final verdict `PASS`, no findings. Branch evidence: unit 26/26, exact-digest Qdrant 1.18.2 restore 5/5, type-check/build/systemd/artifact/process and empty cleanup; integration unit/type-check/process rerun passed. Worktree/local branch cleaned; remote evidence branch remains.
- Q9 / `mc2-jz6y0.10`: accepted through `9f64b59b` as merge `5d4282ee`. Owner-approved Prometheus 3.13.1 LTS, Grafana 12.4.5 extended support, node_exporter 1.12.0 and Alertmanager 0.33.1 are index/amd64-child locked. Authenticated main-listener scrape, durable application/recovery textfiles, exact eight alerts/two recording rules, Telegram file secrets, persistent single-node Alertmanager, mixed vendor labels, provisioned dashboard and loopback-only runbook are implemented. Independent remediation closed all six findings; final verdict `PASS`. Branch evidence: focused 33/33, promtool/amtool, authenticated `up=1`, firing/resolved delivery, Grafana/dashboard, UID/GID persistence/readability, type-check/build/process and cleanup. Combined integration Q6/Q8/Q9 rerun passed 59/59 plus pinned promtool/amtool. Worktree/local branch cleaned; remote evidence branch remains.
- E1 / `mc2-jz6y0.18`: accepted and integrated from final reviewed commit `fc0d5620` as merge `528fdfc2`. Canonical contracts, compact analysis snapshot, immutable source manifest, guarded tenant RPCs, exact terminal coverage, durable deletion-safe items, immutable conflicts and user-only decision overrides are implemented. Two review cycles closed all findings; final reviewer returned no findings (`Spec PASS`, `Quality APPROVED`). Integrated evidence: shared 11/11, repository 11/11, applied PostgreSQL 15.18 9/9, both package type-checks and process verification passed. Disposable database/container and the dedicated worktree/local branch were cleaned.
- E2 / `mc2-jz6y0.19`: accepted and integrated linearly through final reviewed commit `14277d8a`. Stage 4 now records exactly one durable outcome for every authoritative course source, uses deterministic structured map/reduce and claim-scoped tenant/course/document Qdrant verification, resumes atomic full-ledger checkpoints without replay, and produces one bounded synthetic advisory digest for overflow-only Phase 2/3/4 callers. Per-card material hierarchy is lossless; exact request safety uses `tiktoken 1.0.22` / `cl100k_base` plus the documented 16-token envelope with EN/RU independent boundary tests. Repeated independent review closed all findings; final verdict was no findings (`Spec PASS`, `Quality APPROVED`). Integrated evidence: focused 117/117, shared 11/11, applied PostgreSQL 15.18 9/9, both type-checks, artifact validation and process verification passed. Disposable databases/containers and the dedicated worktree/local branch were cleaned; the pushed remote evidence branch remains.
- E3 / `mc2-jz6y0.20`: accepted and integrated through final reviewed commit `89a7948e`. The detector reads accepted persisted cards, uses exact token-aware bounded mapping, equivalence-preserving value reduction, a hard actual-attempt ceiling, durable capacity outcomes and capped per-side Qdrant verification. Phase 0.5 materializes the exact DB-derived conflict/degraded/capacity subject set; manual and system answers, user supersedes, snapshots, approval guards and plural retry applications are atomic, tenant-scoped and append-only. The final review closed five scale/recovery findings and returned no findings (`Spec PASS`, `Quality APPROVED`). Integrated evidence: focused 136/136, shared 13/13, PostgreSQL 15.18 static/applied 36/36, both type-checks, artifact validation and process verification passed. Exact 1,000-subject gates, 51/1,000 retry recovery, >16 MiB rejection/no partial write, clean rollback/reapply and lossy rollback refusal are covered. Disposable containers/symlinks and the dedicated worktree/local branch were cleaned; the remote evidence branch remains.
- E5 / `mc2-jz6y0.22`: accepted and integrated through final reviewed commit `cf438826`. The live Stage 5 handler constructs the production evidence service after the immutable baseline and structural gate; grouped hybrid Qdrant queries are tenant/course scoped and capped. Accepted decisions filter conflict sides and degraded documents, returned claims require exact document/chunk/version grounding, fallback use is durably degraded, and non-destructive merge/revalidation preserves the baseline. Generation metadata records a bounded canonical audit; JSONB CAS prevents stale decision snapshots from partially overwriting structure/metadata. Two review rounds closed privacy, side identity, chunk relevance, fallback observability, handler reachability, CAS and doc-only-ref findings; final review returned no findings (`Spec PASS`, `Quality APPROVED`). Evidence: focused 52/52, shared 20/20, full Stage5/Qdrant 532/532, workspace type-check/build and process verification passed. Worktree/local branch cleaned; remote evidence branch remains.
- E4 / `mc2-jz6y0.21`: accepted and integrated through rebased final reviewed equivalent `2538bb5c`. The clarifying wizard renders a separate RU/EN document-conflict region with bounded provenance, required/informational/degraded/capacity states, native radios, system audit display and fail-closed invalid metadata. Manual edits preserve `current_decision_id` and send CAS expectation; opaque machine values map to localized labels. The real `ClarifyingPanel` authenticated tRPC fixture covers grouping, focus, pending state and progression across Chromium/mobile/dark; structural axe and independent computed contrast checks pass (minimum ratio 7.23). Lazyweb report: `https://www.lazyweb.com/report/lazyweb/2a7a6a4d-accf-4a2b-a131-8a3ac1b9a2f2/?source=create`. Review remediation closed CAS, value display, invalid metadata, real-panel coverage, dark contrast and selector reliability; final review returned no findings (`Spec PASS`, `Quality APPROVED`). Evidence: web 20/20, shared 2/2, E2E 4 passed/2 expected skips, type-check, build 75/75 and process verification passed. Worktree/local branch cleaned; remote evidence branch remains.
- E6 / `mc2-jz6y0.23`: accepted and integrated linearly through rebased reviewed equivalent `5201a786` from recovery commit `a6c39e7a`. The post-rebase tree `fda761f0` is byte-identical to independently reviewed merge `1e681027`. Stage 6 now loads current accepted evidence and decisions, scopes every live/cache retrieval by organization/course/document/version/exact ref, enables document grouping only in the live caller, preserves native BM25/RRF/Formula, and fails required RAG closed while no-document courses remain compatible. Durable text-independent conflict-side handles cover system/suggested/modified decisions; custom and ambiguous legacy rows fail visibly, pending legacy questions migrate only with a complete unambiguous projection, and rollback refuses any side-aware question payload. Independent integration review found no P0-P3 findings and proved E4/E5 unchanged. Fresh integration evidence: shared 21/21, joined E5/E6 111/111, Stage4 267/267, static migrations 14/14, PostgreSQL 15.18 E3 26/26 and side identity 8/8; reviewer additionally passed E4 20/20, E5 35/35, Qdrant 14/14, E6 76/76, Stage4 evidence 49/49 and package type-check. Disposable containers and the dedicated worktree/local branch were cleaned; the remote evidence branch remains.
- D / authoritative docs: accepted read-only research with 40 first-party references and exact Qdrant 1.18.2/client 1.18.0 shapes. Confirmed core architecture; recorded required corrections for Formula input normalization, S3 restore transport, alias recreation, external backup/fallback metrics, notification delivery, image health probing, and version freshness.

## Decision Gates From Authoritative Docs

- Formula has no clamp/min/max expression: Q3/Q4 must validate and normalize `document_weight` before storage and use Formula defaults only for missing values.
- Qdrant S3 snapshots exclude aliases and do not document raw `s3://` recovery: Q8 must prove an authenticated download/upload or supported recovery transport and re-verify the alias.
- Prometheus cannot ingest mounted textfiles directly; Q9 needs an explicit exporter path. Qdrant also lacks container-limit and application fallback signals.
- Prometheus rules do not deliver notifications; Q9 needs Grafana Alerting provisioning or Alertmanager.
- Superseded Prometheus/Grafana candidates were rejected; owner-approved Q9 pins are Prometheus `3.13.1` LTS and Grafana `12.4.5` extended support, plus node_exporter `1.12.0` and Alertmanager `0.33.1`.
- Pinned Qdrant has no curl/wget; Q6 now uses a tested Bash `/dev/tcp` `/readyz` probe and retains the stock image.

Accepted `.14` preflight artifacts `b7c38638` and `99e08364` plus the owner's current-task approval close the decision. They establish exact tag+index-digest pins, authenticated Qdrant main-listener scraping through Prometheus `http_headers.api-key.files`, the unsafe unauthenticated dedicated `metrics_port` caveat, a fail-closed mounted-secret wrapper, a textfile-only node_exporter, and single-node Alertmanager.

## Accepted Runtime Corrections

- `mc2-jz6y0.15`: Q5 pinned Qdrant `1.18.2` proved strict Formula access requires a numeric `document_weight` payload index. Reviewed fix `d9e01ac0` adds the canonical `float` index and is integrated as `449e7ab1`; 45 affected tests, package type-check, three consecutive 9/9 Formula fixture runs and the root 19/19 pinned gate pass.

## Closeout Evidence

### Q12 correction implementation start (2026-07-13)

- Owner approved the immutable correction specification at SHA-256
  `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15` after
  two independent P0/P1/P2-zero reviews.
- Owner approved `.13.14` and `.13.15` on 2026-07-13. The managed Supabase
  internal superuser/reserved/background plane is an explicit trusted residual
  boundary, and the recoverable lifecycle now requires guarded
  `prepare-recovery`, quiesced recovery completion, final cleanup, and separate
  lease-bound `resume-writers-only`. Both decision Beads are closed.
- The normative addendum is
  `docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md`
  at SHA-256
  `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`;
  its exact command/receipt/checkpoint/journal/CAS/epoch and mode-DAG contract
  passed independent rereview with P0-P3 zero and supersedes the initial
  decision record at `c8d22c2a` and the earlier package at `099fc44b`; the only
  later normative change freezes cross-language canonical journal bytes and
  exact object-publication phases/outcomes.
- G7 `.13.7.2` and publisher `.13.9` are accepted and integrated; G7 passed
  independent P0-P3-zero rereview plus fresh integration 99/99 and five-project
  type-check. W `.13.10` candidate `5390a2f6` is not accepted: independent
  review found P1=4/P2=3. Safe TDD correction has 120/120 nonblocked tests GREEN
  while 8 exact-journal and 1 immutable-publication tests remain deliberately
  RED behind decision `.13.16`. D4 candidate v1 `3354379f…` and corrected v2
  `90fcd3ee…` were both independently returned. Candidate v4 `e6ac9c5e…`
  closed all remaining findings and now has independent correctness and docs
  PASS, both P0=P1=P2=P3=0. On 2026-07-14 the owner explicitly approved the
  exact complete D4 v4 sentence by replying `Подтверждаю`. The initial plan
  `82766542…` returned correctness
  P1=2 and docs P1=2/P2=2; round-2 plan `3d5fe077…` returned correctness
  P1=3 and docs P1=1/P2=1. Round-3 plan `30d43610…` passed correctness
  P0-P3 zero but docs returned P1=1/P2=2 for its M gate and two top-level
  references. Round-4 plan `ae4ec2f2…` returned both reviews P1=1 because its
  otherwise exact disposable PostgreSQL gate used the nonisolated package
  Vitest config. Round-5 plan `e891a657…` switches that gate to the proven
  migration-only `../../vitest.shared.ts`; round-5 correctness and docs reviews
  both passed P0=P1=P2=P3=0 on exact design `28655ffe…` and plan `e891a657…`.
  Decision `.13.16` is accepted/closed and W is unblocked for local TDD only.
  Remaining local execution is tracked by W,
  migration `.13.11`, handoff `.13.12`, and root supervisor `.13.13`.
- The inherited base plan is
  `docs/superpowers/plans/2026-07-13-q12-live-cutover-corrections.md`; the current
  conflict-superseding execution plan is
  `docs/superpowers/plans/2026-07-14-q12-durable-recovery-projections-addendum.md`,
  supplementing
  `docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md`.
  Frozen normative mapping: design
  `docs/superpowers/specs/2026-07-14-q12-durable-recovery-projections-addendum-design.md`
  = SHA-256 `28655ffe401efe39b09ba436d101aeed055c8fe25cb8a8e4fd3e90720e745ab4`;
  round-5 plan
  `docs/superpowers/plans/2026-07-14-q12-durable-recovery-projections-addendum.md`
  = SHA-256 `e891a65745210248bf04b325cc7ef7bd1dba562ea5ac40c6b63aa88a6abcd97c`.
  Wave 1 is G7/P/W in isolated worktrees, wave 2 is M/H after the W interface is
  frozen, and root owns only the sequential integration/supervisor join.
- No GHCR, SSH, server, Supabase, migration, database, container, Qdrant,
  source-copy, reindex, service, cron, staging, or production mutation occurred
  while approving/planning this correction wave.

- `docs-reviewed: updated` — final independent `.13.7` rereview found P0-P3 zero after sole-packet, PG17 path, metadata, backup/restore, and activation-order corrections.
- `project-index: reviewed-no-change` — this slice changes task evidence and wording inside existing operations entrypoints, not stable navigation or ownership boundaries.
- `project-index: updated` — stable Qdrant/operations entrypoints are current.
- `graph-reviewed: used` — the existing report and a focused query were consulted, but the graph predates the new Q12 shell lifecycle. Safe local refresh remains a closeout gate after the active dirty isolated worktrees are integrated; no external model/API mode or Git hook is authorized.
- Q12 remains open until every live gate and observation passes; authorization
  is recorded, while accepted correction code, a truthful fresh backup/restore,
  and the complete local verification matrix remain hard stops.

## Explicit Defers

- Q12 staging cutover, remote reindex, secret activation, deploy, and live smoke
  remain NO-GO until the correction streams, a truthful fresh validated
  database backup, and all hard gates pass. The 2026-07-13 preflight
  found that all 12 retained files are 20-byte empty streams and usable backups
  are zero; the previous substantive 2026-06-27 dump has aged out. The accepted
  local operator repair does not substitute for a fresh server backup or real
  isolated PostgreSQL 17 restore. A current owner-only Session pooler URI and
  valid Supabase Root 2021 CA passed verify-full read-only probes without secret
  disclosure. Beads `mc2-jz6y0.13.7` remains open; no migration, dump, service,
  cron, server file, permission, or Qdrant change ran.
- Production off-host S3 remains bounded defer `mc2-jz6y0.13.6`; owner-approved
  local staging snapshots do not satisfy that future production gate.
- Prometheus retention YAML migration remains bounded defer `mc2-jz6y0.25`
  before the next Prometheus pin change.
- Final workspace cleanup intentionally retains the current pushed `codex/self-hosted-qdrant-platform` integration branch/worktree for Q12 continuation. `cleanup_stage_workspace.py` returned non-zero only because it safely refused to delete that checked-out branch; all Q11-owned worktrees, local branches, containers, ports and temporary data are absent.
- Capacity-triggered non-goals remain those listed in the approved design; they are not implementation debt.

docs-reviewed: updated — the owner-approved lifecycle/trust-boundary addendum is
recorded; final independent docs review remains required after implementation
reconciles the operator, migration, activation, rollback, and runbooks.

graph-reviewed: used — current focused queries used the existing local graph,
which predates the Q12 lifecycle delta. Refresh remains required after safe
integration, with zero model/API modes and no Git hooks.

project-index: updated — Q10 added stable Qdrant developer setup, schema/retrieval, reindex/recovery and operations asset entrypoints without stage history.
