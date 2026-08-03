# Stage mc2-jz6y0 — Self-Hosted Qdrant Platform

Status: Phases A and B of the Q12 Full Completion program are COMPLETE — D6 `.13.19` (`3d70eaf2`) and Root `.13.13` join (`fcd05e27`) on the ratified 11/11 W tuple; operator image published to GHCR 2026-07-17 (`mc2-rl4p9`, index digest `sha256:0fe4265c…`, provenance verified); next is the Phase C Task C0 window packet (owner-gated); remote/live activation remains NO-GO until the owner-gated window
Classification: complex, multi-stream, security/data/operations sensitive
Base branch: `origin/codex/self-hosted-qdrant-platform`
Current accepted integration evidence: integration HEAD `fcd05e27` (Root-join merge on D6 merges `7f511691`+`3d70eaf2`, field-11 ratification `72af414c`, docs slice `8717f7ac`) on top of `a73a3651`, which carries D5J `66e41cb5`, W FLIP `60910053`, H `70bf6103`, tuple addendum `3da324d8`, D6 contract/plan docs `d1627f1c`, M merge from tip `29d73d04`
Integration branch: pushed `codex/self-hosted-qdrant-platform`; resolve the current remote SHA before continuation
Implementation scope: Q1-Q11, E1-E7, the full Q12 local correction wave, `.13.7` (delivered), field-11 ratification, and D6 `.13.19` are accepted. The remaining tail: GHCR publication, the live-cutover window (incl. the C7 fields-5/6/8/9 re-freeze), `.13.8` rotation (owner-deferred), `.13.6` S3, `.25` retention YAML. Live execution remains fail-closed.

## Q12 D5 Plan Acceptance (2026-07-14)

- Exact plan: `docs/superpowers/plans/2026-07-14-q12-retained-barrier-capability-provenance-addendum.md`, SHA-256 `8278bce9f335bbef1204e60ff7c22383d15abc13237b80abfc53a6d2d285a0ed`.
- Final independent correctness/docs rereview: P0/P1/P2/P3 `0/0/0/0`; report SHA-256 values `db8bf55d…1d09` and `69b49f2b…e3c4`.
- Ordering: Root-D5 `.13.18`, then W `.13.10`, then parallel M/H `.13.11/.13.12`, then Root `.13.13` and full local closeout; Beads cycle check passed.
- No implementation or remote/live mutation occurred during planning. External S3 and Qdrant Cloud remain out of scope; the final activation packet still requires explicit current authorization.

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

### W retained provenance stop (2026-07-14)

- W is pushed clean at `21cff2d0`; the latest exact gates pass runtime 141/141,
  canonical runtime plus database-barrier PostgreSQL 17 192/192, structural
  PostgreSQL 17 34/34, and the five-file aggregate 290/290.
- Independent reviews closed the prior journal graph, immutable publication,
  existing-proof, rollback freeze, retained classifier, phase/context,
  uniqueness, legal recovery, epoch and command-SHA findings.
- The terminal review still reports P0=0/P1=1/P2=0/P3=0: a linked retained
  recovery predecessor is digest-linked but lacks frozen pre-D4
  issuance/claim plus checkpoint provenance.
- Truth-gate inspection found no Root producer in any ref/worktree and no
  normative retained checkpoint filename, journal-head anchor, retention, or
  deterministic reconstruction rule. D4 per-epoch checkpoint filenames are
  explicitly limited to its five commands and cannot be copied by inference.
- Created blocking owner decision `mc2-jz6y0.13.17`; W, M, H and Root remain
  local-only and unaccepted. No remote/live mutation occurred.

- `docs-reviewed: updated` — the source gap and no-invention boundary are
  durable; operator docs are unchanged pending a normative owner decision.
- `graph-reviewed: no-change-needed` — exact frozen docs, refs and producer
  absence determined the blocker; no accepted code/architecture was integrated.

### D5 exact written candidate gate (2026-07-14)

- The owner approved Option A at the architecture level: one immutable
  byte-exact retained launcher-checkpoint copy per retained command execution
  epoch, with no second claimed-input copy.
- The complete exact candidate is
  `docs/superpowers/specs/2026-07-14-q12-retained-barrier-capability-provenance-addendum-design.md`
  at SHA-256
  `b5f63cd6afd64f47822e9534f8193ecb57f471421c9cf8a8f05e7902d85540e8`.
- It freezes the selector/copy/capability lifecycle, direct recovery and
  no-replay result completion, four rollback frontiers, install exclusion,
  activation precommit classifier, crash continuations, Root/launcher/W
  ownership and required TDD/adversarial coverage.
- For a journal-less newest tip `T`, checkpointed non-authority row `R` is its
  sole direct journal reference. The later final-writer-manifest intent and
  accepted row carry exact pre-disposition `F.capability_manifest_sha256`;
  retirement remains transitively bound through `intent.previous_hash` and the
  exact `R` input-checkpoint hash.
- Fresh correctness rereview-6 passed P0/P1/P2/P3 `0/0/0/0`, report SHA-256
  `3907f56b16c52fae26f5eb299595c26678c1874cd9b996e1b798f37e5443b170`.
  Fresh documentation rereview-6 also passed `0/0/0/0`, report SHA-256
  `5e39597adf3b87db066755ccadeab7d359751cd9672a78cabc2fce67ad128cb4`.
- The owner explicitly approved this exact path/SHA on 2026-07-14 by replying
  `Да, подтверждаю, делай` to the exact-SHA request. Decision `.13.17` is
  accepted; local implementation planning and TDD are authorized. W remains
  unintegrated, and no remote or live action is authorized by this decision.
- `docs-reviewed: updated` — exact candidate and decision evidence are current.
- `graph-reviewed: no-change-needed` — acceptance changes no design bytes;
  refresh at the immediately following D5 plan/implementation integration
  boundary avoids redundant full graph rebuilds.
- The exact candidate path is listed in `.prettierignore`: the first local
  commit hook demonstrated that otherwise Prettier rewrites Markdown table
  spacing and invalidates the independently reviewed byte SHA. The original
  reviewed blob was recovered exactly and its SHA reverified before delivery.

## Q12 D5J Joined-Fixture Written Candidate

- Architecture evidence SHA-256
  `8bf9786c1e97ce4a54bc455d37ec052a8658fa110524fbed1a5ab728b3fda379`
  proved that accepted D5W bytes alone cannot join Root's D5-only anchors to
  W's full source/backup/restore/reindex chronology without forbidden copying
  or rehashing.
- On 2026-07-15 the owner approved Option A for drafting: a Root-owned
  test-only closed forward/rollback composer, one canonical journal, W
  read-only consumption, and no deployed CLI test flag.
- The tracked candidate is
  `docs/superpowers/specs/2026-07-15-q12-joined-retained-barrier-fixture-design.md`
  at SHA-256
  `d7e86193142d260a3b8dcd65ef9ce89b64df88d9c93cec68f19705de68edc75d`.
  It requires the real immutable W-owned quiesce preimage for every joined
  profile, including clean rollback prefix 1, while `install` itself remains
  bound to 64 zeroes.
- Final correctness and documentation rereviews both passed P0/P1/P2/P3
  `0/0/0/0`; ignored report SHA-256 values are
  `0eb420fda7099ecdf98d0028cc5f8b89e9a61103018e747228868515eb970bf2`
  and `02770a81c69474a1445fb7c4f2a05edbfa5cee50d18accf502f074d4e79025ba`.
- Baseline serialized Root verification passed 271/271 before drafting; the
  tracked artifact validates. On 2026-07-15 the owner explicitly approved the
  exact corrected candidate SHA and directed uninterrupted local continuation;
  planning/TDD/review/integration are authorized. No remote/live action occurred.
- Converting that accepted design into an executable plan stopped before
  RED/code on a genuine product-truth gap. Independent command-binding audit
  SHA-256 `17f61bc5681a8d19f0a237c6e72aca7a4ed89fbbbe02c28712190a64cbd1148e`
  and architecture map SHA-256
  `942b3423eea39c0fb08606eeb7ddbd32c2e4db11934b4d819f1c9b4898328469`
  both returned `PRODUCT-TRUTH-GAP`: the current canonical manifest/core owns
  only five retained `barrier.*` commands; accepted sources do not freeze the
  ordinary phase/command/outcome/resolved-argv relation; and
  `migrations_applied` is explicitly undefined. W's existing generic command
  and `9*64` hash are nonnormative and were not reused.
- The same preflight found a second independent contradiction at the activation
  rollback frontier: forward and rollback FWM bytes differ but currently target
  one immutable fixed path, and the approved D5J request has no authoritative
  Root source for the full writer inventory. Beads decision `.13.22` now blocks
  `.13.21`. The recommended minimum amendment moves only the required canonical
  manifest slice forward from Task 9, freezes the exact binding/substitution
  table, names the Root inventory producer, and defines collision-free immutable
  FWM paths. No D5J implementation, W edit, or remote/live mutation occurred.
- On 2026-07-15 the owner approved that recommended correction direction and
  delegated all remaining safe local work to Fable, followed by Codex review.
  This authorizes the exact normative amendment, independent reviews, plan,
  TDD, local integration and verification without intermediate owner prompts;
  remote/live actions remain separately gated. The tracked manual handoff is
  `docs/superpowers/prompts/2026-07-15-q12-fable-local-completion-handoff.md`.
- The same delegation supplies D6 `.13.19`'s previously separate local
  implementation authorization after accepted W and an independently reviewed
  D6 plan. It does not change any remote/live boundary. Canonical stage closeout
  must run only when local readiness is true; otherwise the remote/live tail is
  recorded as an explicit defer and Q12 remains open.
- Final Fable handoff correctness and documentation rereviews passed
  P0/P1/P2/P3 `0/0/0/0`; ignored report SHA-256 values are
  `8c56c37720e25a5d213fdc2c1c6c7ea8b1da7f1795f34e9078069b257d306a6e`
  and `b75dccbee85395372e350de79d304647388d8ad061e3b990a261aa9843e00bea`.
- D6 Option A remains dependency-ordered after accepted W and a reviewed D6
  plan. The current Fable delegation supplies local implementation authority;
  the remote gate is unchanged.

## Q12 D5J Amendment and Implementation (2026-07-15)

- Decision `.13.22` closed: normative amendment
  `docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md`
  SHA-256 `d6c4d8e4b2b7f6c53d648fdf587a5520db45fa5d8f3c84668b48b09b6bbe075c`,
  independent correctness and docs reviews both PASS P0-P3 `0/0/0/0`
  (report SHA-256 `5b588dbd…4092` and `fd958193…be8b`). It freezes the
  twenty-command canonical manifest subset moved forward from Task 9, the
  closed substitution domain, every ordinary row binding, two-segment
  quiesce/evidence-stepped resource rules, dual immutable FWM paths with real
  `writers.resume.*` hashes, and the Root-owned deterministic writer inventory.
- `.13.21` implemented under reviewed plan SHA-256 `a05ba3c6…5a662`
  (final plan review PASS `0/0/0/0`) on `codex/q12-d5j-joined-fixture`
  through `bf27f595`, integrated as merge `66e41cb5`. The closed joined
  composer emits the exact 76-row forward chronology and all rollback
  profiles (prefixes 1-4 clean/exact-next-frontier, activation frontier with
  both mode-bound manifests and byte-identical target entries) solely through
  production primitives; deployed wrappers/parser gain no switch.
- Independent implementation reviews: correctness PASS `0/0/0/2` with both
  suites rerun by the reviewer, docs PASS `0/0/1/2`; every P2/P3 finding
  fixed and pushed. Evidence: focused four-file suite 300/300 file-parallel
  and 300/300 serialized (baseline 271/271), static acceptance checks,
  workspace type-check, synthetic build; validated stage artifact
  `mc2-jz6y0.13.21-q12-d5j.md`. Integration rerun and process verification
  recorded at the merged head. No remote/live mutation occurred.

## Q12 `.13.7` Backup/Restore Gate Delivery (2026-07-16)

Owner authorized the remote tail («Да, делай. Делай всё сам по порядку.
Пароль можешь не менять»), so `.13.7` executed against the approved server:
legacy fail-open cron suspended (root-owned rollback evidence), Node 22 +
standalone pnpm 8.15.0 + tsx installed, operator/drill/helpers installed
root-owned, owner DSN written owner-only via stdin, CA hash-verified. The
first real runs surfaced 20+ never-executed defects across
`backup-supabase.sh`, `q12-source-manifest.ts`, `generate-role-bootstrap.ts`,
`restore-supabase-drill.sh`, `scan-pgtle-archive.py`, and the installer —
each fixed with TDD, targeted review, commit, and push
(`dedcc076`..`da512322`; highlights: libpq service-file URI decomposition,
`ProtectHome=tmpfs`, PG17 `datlocale` rename, COPY text decoding,
masquerade-free drill network, host-TCP readiness, supabase_admin bootstrap,
membership grantor ordering, verbatim list-GUC replay, provider-plane actor
collapse per `.13.14`). Canonical installer proof: fresh scheduled generation
`generation-20260716T105950Z-11196fff-…`, isolated Supabase-PG17.6 drill PASS
(cluster-global + cutover + baseline equality, ratio 0.724, zero residue),
timer `00:30 Europe/Amsterdam` enabled+active. PG17 security-manifest digests
computed on the isolated restore and integrated into the live-gate allowlists
at `b8204cde` (review PASS P0-P2 zero). Beads: `.13.7` and `mc2-t7y6d`
closed. Local evidence at `b97a827b`: ops+scripts battery 761 passed /
1 known-env failure / 36 skipped, workspace `pnpm type-check` exit 0.

## Q12 W/M/H/D6 Local Completion (2026-07-15)

- W `.13.10` CLOSED at `60910053` (FLIP): the genesis-rooted joined journal
  prefix is the sole resume acceptance; the fabricated `common_phase_graph`
  branch is removed; the D4 negative is pinned five ways. The composer
  `partial_capture_target_count` lever covers held 1..5 (rollback+prefix-4,
  frontier-free; the frontier held-5 profile is rejected by W at `:1778`).
  Migration suites A 11/11 and B 11/11, D3 6+4 append, three X drops, native
  §5 via D2 (`:2482`), 22 deliberately fabricated C categories, and D4 pass;
  acceptance matrix plus independent P0/P1-zero review recorded. Current
  amendment SHA `e952f724…fcd4b1`; twenty-command manifest SHA
  `aaec6fc2…87a841` (historical `af9b21cb…` = five-command `c93d766d`-era).
  Ruling Z: mutate-then-build reaches §5; in-position stops at the Root-owned
  retained checkpoint (`:1745`).
- Tuple addendum integrated at `3da324d8`: 10/11 W-tuple fields materialized
  (field 10 owner-ratified; 5/6/8/9 catalog-bound), artifact
  `mc2-jz6y0.13.10-q12-w-activation-tuple.md` plus deterministic repro
  validate; the mechanical lock proof passes 2/2 under `MC2_Q12_REAL_PG17=1`.
  Field 11 (managed session roster) is live-only by contract line `:160`.
- H `.13.12` CLOSED at `70bf6103`: three-phase `--q12-mode` quiesced handoff
  with phase-aware rollback, durable `nginx_switch_intent` before reload,
  truthful re-prepare, activation receipt contract; 24 Vitest + 15 shell
  cases; FAIL review → RED-first fixes → delta PASS.
- M `.13.11` CLOSED at merge `a73a3651` from `29d73d04`: file-only Q12
  migration credentials, same-transaction guards, connection-source mutual
  exclusion, concurrent index preflight, and the P2 hardening batch (twelve
  libpq `PG*` variables fail-closed, embedded `;` rejection, five-branch leak
  asserts). Security review PASS P0=0/P1=0, delta PASS; 64/64 focused units;
  e2e 20/20 on the disposable stack. Residual informational P2-4 (five
  client-side libpq TLS/auth variables) is documented in the handoff.
- D6 `.13.19` BLOCKED as an explicit defer: the activation-truth contract is
  frozen (candidate byte-identity `2a2251ac…`, financial review
  `948982d9…ab7a`), the plan is reviewed PASS (successor-aware Task 15/GC4),
  and Task 0 stops on field 11 per the frozen contract. Root `.13.13` is
  transitively blocked. Both resume in the live window via the LIVE-BOUNDARY
  RE-FREEZE CHECKLIST (field 11 roster + production re-freeze of 5/6/8/9).
- Full local release matrix at `a73a3651`: Q12 unit battery 748 passed / 1
  known environment failure (`qdrant-observability-contract.test.ts:223`,
  fails identically on the pre-Q12 base) / 36 skipped; blue/green shell suite
  15/15; `pnpm type-check` exit 0; `pnpm build` exit 0 (synthetic web env).
- Cleaned worktrees/local branches with content integrated: q12-h-handoff,
  q12-d6-activation-truth, q12-w-activation-tuple, q12-p-operator-publisher,
  q12-m-migration-cli (remote evidence branches retained).
  `codex/q12-w-writer-barrier` is preserved by mandate, clean at `60910053`.

- `docs-reviewed: updated` — final independent `.13.7` rereview found P0-P3 zero after sole-packet, PG17 path, metadata, backup/restore, and activation-order corrections.
- `project-index: reviewed-no-change` — this slice changes task evidence and wording inside existing operations entrypoints, not stable navigation or ownership boundaries.
- `project-index: updated` — stable Qdrant/operations entrypoints are current.
- `graph-reviewed: updated` — Graphify 0.9.14 local code graph refreshed with `graphify update .` and `graphify cluster-only . --no-viz --no-label`; no external model/API mode or Git hook was used.
- Q12 remains open until every live gate and observation passes; authorization
  is recorded, while accepted correction code, a truthful fresh backup/restore,
  and the complete local verification matrix remain hard stops.

## Q12 D6 Activation-Truth Implementation (2026-07-16)

- Field 11 RATIFIED at `72af414c` (pushed): independent review PASS P0/P1
  zero (P2=1 F1 carried as the `.13.14` residual note, P3=2); canonical hash
  `c90edb78…` reproduced; inventory renamed to
  `deploy/qdrant/q12-managed-session-inventory.json`; unit pin test 5/5.
  W tuple is now 11/11; the live-boundary checklist retains only the fields
  5/6/8/9 production re-freeze (Task C7).
- D6 `.13.19` implemented per frozen contract `2a2251ac…` in two disjoint
  worktree streams and integrated at `3d70eaf2` (merges `7f511691`,
  `3d70eaf2`):
  - Stream 1 probe (Tasks 1-14): review PASS 0/0/2/4 → corrections (real
    CLI runtime assembly with a single injectable runtime-I/O seam, all
    production URL/CA/PG17 pins hardcoded; session_activity sentinel
    COALESCE with real-background-row PG17 proof; `pg_catalog.coalesce`→
    `COALESCE` latent fix, SQL rebound `36d28034…`) → delta PASS → DF1
    3-point snapshot discipline (orchestrator-upgraded; deterministic
    mid-run-drift RED proof) → 80/80 focused.
  - Stream 2 root (Tasks 15-19): review PASS 0/0/1/4 → corrections (NFC
    canonical, after-read secret revalidation) → delta PASS → final round
    (descriptor rewind before child FD3/FD4 mapping; seal-predecision
    binding enforced in restart authority) → 337/337 focused; five retained
    commands + manifest `aaec6fc2…` proven byte-unchanged (Task 15 guard).
  - Orchestrator rulings recorded in `mc2-jz6y0.13.19-q12-d6.md`: contract
    ownership table governs stream split; Task 15 second-file waived
    (max-lines cap); Stream-2 two-file test extension authorized;
    `projection_sql_sha256` binds the FD-11 file's own hash; Named hashing
    convention (in-memory canonical NFC no-LF; files canonical+LF
    storage-only; validation-at-load parses then hashes) — binding for
    `.13.13`; cross-language byte parity proven (`764d1b37…`).
  - Integration matrix at `3d70eaf2`: focused D6+W battery 424/424
    (`MC2_Q12_REAL_PG17=1`); broad ops+scripts 913/914 (sole failure is the
    known `qdrant-observability-contract.test.ts:223` env failure);
    `pnpm type-check` 0; `pnpm build` 75/75; process verification OK;
    fields 5-10 repro byte-identical incl. recovery slice `c41cf104…`.
- Remote-gate scope unchanged: pinned-server capability gates
  (POSIX_SPAWN_CLOSEFROM, pidfd/ptrace/Yama, production CA acceptance) are
  flagged, never faked; no live/remote action occurred.

## Q12 Root .13.13 Join (2026-07-16)

- Integrated at `fcd05e27` from `codex/q12-root-join` (`dc6c2093`): the
  smoke/observation gate (`deploy/qdrant/q12-live-smoke.sh` → core
  `smoke observe`; 13 thresholds byte-sourced from the 2026-07-13
  cutover-corrections §13, fail-closed, every terminal verdict sets
  `rotation_required=true`) and the D6 real frame envelope + R-handshake
  join (d6_build_frame/emit/validate/load/bind; validation-at-load parses →
  canonical() → hash per the Named convention; genesis
  `previous_frame_sha256=null` verified consistent with the probe).
- Reviews: correctness PASS 0/0/0/5 (`mc2-jz6y0.13.13-join-review.md`),
  docs PASS 0/0/0/1 (`mc2-jz6y0.13.13-docs-review.md`, drove the evaluator
  live on accept/breach fixtures). Integration deltas: runbook genesis-null
  clause; probe raw-NUL sort separator escaped to `\u0000`.
- Frozen bytes unchanged: manifest `aaec6fc2…`, barrier `134255ce…`,
  wrappers and `q12-live-cutover.test.ts` byte-identical.
- Final Phase A matrix at the join head: focused battery 463/463
  (`MC2_Q12_REAL_PG17=1`, 10 files), broad ops+scripts 952/953 (sole
  failure = known `QDRANT_METRICS_GID` env case), `pnpm type-check` 0,
  `pnpm build` 75/75, process verification OK.

## Q12 Phase B GHCR Publication (2026-07-17)

- Task B1 delivered (`mc2-rl4p9`, owner-approved packet + owner PAT via
  stdin from a shredded 0600 scratchpad file; the owner explicitly accepted
  transcript exposure of the one-time token). Published:
  `ghcr.io/maslennikov-ig/mc-2/qdrant-operator:266de3d7457f81a035c9698768e8b7ffb0053495`,
  index digest `sha256:0fe4265ca80eb100912f6ce8155b061712db90ace4e0b1641e63e9a1a247e199`,
  image manifest `sha256:8de97bf3…`, attestation `sha256:ae2289bd…`,
  linux/amd64, built by the publisher from a clean detached worktree.
- The first live run exposed two latent publisher defects (mocked fixture
  had hidden both): buildx writes the metadata file mode 0644 while the
  script asserted 0600 without normalizing, and the embedded provenance
  validator accepted only the legacy SLSA v0.2 shape while the registry
  returns SLSA v1. The push itself had already succeeded; remote digest and
  SLSA v1 provenance (source/revision/Dockerfile) were verified
  independently with the same predicates, then both defects were fixed with
  TDD (RED reproduced the exact live error; publisher suite 24/24; the
  fixed validator re-validated the real registry provenance bytes and
  rejected an adversarial wrong revision). Receipt + rulings:
  `.codex/stages/mc2-jz6y0/artifacts/mc2-rl4p9-q12-b1-publication.md`.
- `deploy/qdrant/image-lock.json` unchanged (it pins the Qdrant base
  container for Phase C, not the operator image). No application traffic
  changed; acceptance gate B reached.

## Q12 Phase C Window Open + Plan Builder Delivery (2026-07-17)

- Owner approved the live-cutover window (packet
  `mc2-jz6y0-c0-window-packet.md`, status accepted). Server bring-up
  completed: root-owned hash-verified `deploy/qdrant` + `ops/qdrant` assets,
  metrics identities, generated secrets, compose replacement, workspace
  install, systemd units (timers disabled), q12-mode `deploy_blue_green.sh`,
  operator image pulled by digest (`4b02d3f9…` config match), pinned isolate
  image present.
- BLOCKING product-truth gap found at the C1 boundary before any mutation:
  the `q12-live-cutover.sh --plan` expected-post-migration-catalog builder
  from the accepted corrections design §2 was specified but never
  implemented (all repo references were consumers). Window paused;
  implemented via worker `q12-plan-builder` on `codex/q12-plan-builder`
  (integrated fast-forward to this branch at `7764cfb4`), seven RED→GREEN
  rounds:
  1. Deterministic builder: `plan` subcommand, injectable PlanExecutor,
     `assemble_expected_catalog`/`validate_expected_catalog` (clause-for-
     clause mirror of the frozen barrier jq program, strictly stricter),
     owner-only 0400 self-binding emission.
  2. Live orchestration: read-only TLS source capture (libpq service file
     0600), snapshot-coordinated generation (one `pg_export_snapshot()`
     binding pg*dump + `q12-source-manifest.ts capture --snapshot` +
     `SET TRANSACTION SNAPSHOT` source capture; roles.sql before/after
     byte-stability), restore through `restore-supabase-drill.sh` via the
     new opt-in `MC2_Q12_RESTORE_PERSIST_HANDLE` seam (default path
     byte-identical, 44 existing drill tests unmodified), §3 allowlisted
     role bootstrap (`q12-migration-plan-roles.py`, frozen allowlists,
     hard-stop before restore), fail-closed pre-migration structural-
     equality proof, real migration CLIs in loopback
     (`document-evidence-approved.ts:648` early-return proven), evidence
     split (source → guarded/cron/baseline/frontier live OIDs; isolate →
     checkpoint hashes/deltas), teardown with cleanup-failure-overrides-
     success + run-scoped label sweep, production seam lockdown (any set
     `MC2_Q12_PLAN*\*` under the production run root → named LifecycleError).
- Orchestrator-found defects during rounds (each fixed with TDD): missing
  §3 role bootstrap (CI-masked), `capture` called without `--snapshot`
  (CLI hard-fail), missing snapshot coordination, pg_isready readiness race,
  RAM-buffered full dump. Worker-found: migration CLIs cryptographically
  bound to the real restore (real-CLI leg CI-unreproducible — validated by
  the read-only server-side pre-C1 `plan` rehearsal instead).
- Reviews (independent, range-pinned): builder range PASS 0 P0/P1
  (`mc2-jz6y0.13-plan-builder-review.md`); live range PASS 0 P0/P1 with
  round-7 delta PASS 0 findings (`mc2-jz6y0.13-plan-live-review.md`).
- Final evidence (orchestrator-rerun): real-PG17 40 passed; no-docker
  79 passed | 7 skipped; drill 46; regression trio 289; type-check 0;
  frozen bytes `aaec6fc2…`/`134255ce…` intact; `q12-live-cutover.test.ts`
  untouched.

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

## Historical progress log (moved from handoff 2026-07-25)

Verbatim history moved out of `.codex/handoff.md` to keep that file current-state
only (repo contract: 200-line limit enforced by
`scripts/orchestration/run_process_verification.sh`). Nothing was edited or dropped.

### CURRENT STATE (2026-07-19) — window NOT openable; handoff package ready

Fresh read-only verification (base `8af76cfd4`, bead `mc2-uha77`, artifact
`.codex/stages/mc2-jz6y0/artifacts/mc2-uha77-window-executability-verification.md`)
established that the live cutover window is **not executable against the
deployed tree**: `run_live`/`run_recover` fail closed in production at the
`require_post_activate_executor` pre-flight because `ProductionExecutor` has no
`execute_forward_resume` (it exists only as a test fixture), and the production
`run_live` path substitutes **fixture-derived** placeholder values (not real
snapshot/generation/recovery ids). The R8 controller is a proven journal/parity
twin, not a real driver. This is the D5J §10 "Task-9 live orchestration" scope,
still un-wired. OQ1 is resolved (dual-state quiesce); OQ5/OQ6 remain open.

A complete handoff package for a fresh orchestrator is prepared:

- Design: `docs/superpowers/specs/2026-07-19-q12-window-execution-wiring-design.md`
- Plan + task graph: `docs/superpowers/plans/2026-07-19-q12-window-execution-wiring.md`
- Orchestrator prompt (prompt-check PASS, prompt-card):
  `docs/superpowers/prompts/2026-07-19-q12-window-execution-orchestrator.md`
- Beads W1 `mc2-yz3xe` → W2 `mc2-j58wi` → W3 `mc2-58tnx` → W4 `mc2-dxcaa` →
  W5 `mc2-v68w6` → W6 `mc2-naz8j` → W7 `mc2-i9h3y` (owner-gated), tracker
  `mc2-uha77`.

NEXT: hand off to the new orchestrator per that prompt; execute W1–W6 (real
owner-custody executor + real-value plumbing + snapshot/baseline producers +
STOP-point model + rehearsal + runbook), then W7 opens the window on an explicit
owner go. The historical Phase-A/B and pre-open context below remains accurate;
its "NEXT" pointer (OQ resolution) is now superseded by the W1–W7 plan.

### PROGRESS (2026-07-20) — W0 + W1 delivered; W2/W3/W4 coupling found

- **W0** (rehydrate/baseline) DONE: the §2 gap re-confirmed with fresh evidence
  at HEAD `aeb9cb14a` (main() wires bare `ProductionExecutor()`; no
  `execute_forward_resume`; fixture-derived substitution; no CLI `--stop-after`;
  OQ1 resolved; OQ5/OQ6 open). Baseline matrix GREEN: focused Q12 suite 646
  passed / 72 skipped; type-check clean; frozen manifest sha `aaec6fc2` intact.
- **W1** (`mc2-yz3xe`) DONE, committed **`636e96346`**, pushed. Added
  `OwnerCustodyExecutor(ProductionExecutor).execute_forward_resume` (full
  fail-closed twin of `q12-writer-resume.py:1088-1134` incl. the probe/residue
  nested projection, then drives the frozen manifest `writers.resume.forward`
  under the inherited FD9 lease via `_invoke_resume`, returns
  `validated_receipt_sha256`); `owner_custody_executor()` factory; `main()`
  live/recover now use it; post-activate context carries `release_sha`. Resolved
  the run-id question from frozen truth: resume uses `<run-id>` (cutover), not
  `<recovery-run-id>`. TDD (5 new tests + fixture); correctness-reviewed
  (no P0/P1; one P2 projection gap CLOSED by strengthening the gate; one P3
  low-risk coverage residual noted). Focused Q12 651 passed / 72 skipped;
  type-check clean; manifest `aaec6fc2` intact.
- **W2 acceptance-oracle decision LOCKED (owner, 2026-07-20):** real-run oracle =
  design default — accept iff (1) each real child exits 0 AND (2) barrier receipt
  v2 reaches `guard_cleanup_complete` (state machine intact) AND (3) coverage
  evidence (`org:course:run`) present in the recovery journal; the fixture
  byte-parity suite is kept green separately.
- **MATERIAL REPLAN (dependency finding from repo truth):** the plan framed W1
  and W2/W3 as independent streams converging at W4. Repo truth shows otherwise:
  the controller only COMPOSES the journal and freezes each capability's argv
  (`command_sha256`); ordinary commands EXECUTE out-of-band via the separate
  `claim` entrypoint (`run_claim:3240-3243`), which RE-RESOLVES argv from
  manifest+request and byte-binds `command["command_sha256"]==capability`
  (D5J 2026-07-15 contract). Mid-window real values (`<exported-id>` from the W3
  coordinator, `<immutable-generation>` from `pg.backup`,
  `<accepted-recovery-manifest-sha256>`/coverage after `source.forward`) are
  unknown at a single upfront compose. Therefore the real path is a **staged
  compose→claim→execute→compose** loop, and **W2 (`mc2-j58wi`) + W3
  (`mc2-58tnx`) + W4 (`mc2-dxcaa`) must be CO-DESIGNED as one staged-execution
  effort** intersecting the D5J claim-time binding — not delivered as independent
  slices. This needs its own focused design pass; it was NOT rushed. Window stays
  CLOSED. Full map is on beads `mc2-j58wi` / `mc2-uha77`.

### PROGRESS (2026-07-20, cont.) — W4 delivered; W2+W3 co-design written

- **W4** (`mc2-dxcaa`) DONE, committed **`ffb7da5fc`**, pushed. Carved off from the
  W2/W3 coupling: the `--stop-after` CLI exposure is architecturally INDEPENDENT
  of the real-value work (the internal `stop_after` seam is already end-to-end;
  `run_recover` never reads it). Exposed `--stop-after` on `live` ONLY,
  choices-bound to `_STOP_AFTER_STEP`, reversible/#18 boundary operator-visible in
  the flag help; plumbed into the production request via `getattr`. TDD
  `q12-live-stop-after-cli.test.ts` (3 tests); behavioural stop-after + recover
  convergence already covered by `q12-live-controller.test.ts`.
  Correctness-reviewed: no P0/P1/P2. Focused q12-\* **654 passed / 72 skipped**;
  type-check clean; manifest `aaec6fc2` intact. False W3→W4 dep removed.
- **W3 finding (refines §2.5):** OQ5/OQ6 are NOT un-built — they already exist on
  `LivePlanExecutor` (`q12-lifecycle-core.py:6840` `_open_snapshot_coordinator`,
  `:6917` `produce_run_root_baseline` → `baseline.json` 0400). The real gap is that
  the WINDOW executor (`ProductionExecutor`/`OwnerCustodyExecutor`) can't reach
  them and the window `<exported-id>` is fixture-derived (`:720`,`:4018/:4144`).
  W3 for the window = lift OQ5/OQ6 into the owner-custody path + feed the real
  snapshot id into value resolution (W2), consistent with D5J on compose AND claim.
- **W2+W3 CO-DESIGN WRITTEN:**
  `docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md` — the
  focused design pass §W2/§W3 required. Decisions: clean `production`-gated
  fixture/real FORK (parity oracle untouched); staged resolver advanced by
  lifecycle callbacks (resolve-once, fail-closed on drift); compose↔claim
  consistency via a run-root authority file read by both sides (D5J single
  authority); locked real-run oracle; W3 lifts OQ5/OQ6 into `OwnerCustodyExecutor`
  behind an isolable subprocess seam (W1 pattern).
- **VERIFIABILITY BOUNDARY (honest):** the fork, resolver scaffold, and
  compose↔claim byte-consistency are unit-verifiable HERE with fakes; the real
  `pg_export_snapshot()`/baseline/generation/recovery-manifest/coverage legs and
  the end-to-end real-run oracle are `MC2_Q12_REAL_PG17`-gated and/or IN-WINDOW-only
  (#18), validated at W5 (rehearsal) and W7 (owner-gated). Window stays CLOSED.

### PROGRESS (2026-07-20, cont.²) — W2/W3 EXECUTABLE PLAN prepared; owner authorized real-data work

- **Owner authorization (2026-07-20):** project pre-launch/testing — owner authorized
  touching the production DB for whatever the wiring needs. The earlier "hold W2/W3
  for a window-adjacent session" caveat is LIFTED. Preserved carve-out: the
  irreversible `barrier.activate` / nginx switch (W7 / C9) still requires a fresh
  pre-window `plan` + explicit owner "go".
- **Empirical grounding (`9c49d8599`):** this box has docker 29.5.3 + local PG17; both
  `MC2_Q12_REAL_PG17=1` gated suites (`q12-live-baseline-producer`,
  `q12-live-real-full-window`) PASS against disposable `postgres:17.10`. The un-done
  surface is precisely the data-movement commands (`pg.backup`/`pg.restore`/
  `source.forward`/`reindex.*`/`deploy.*`), currently real-SHAPED stubs on fixture
  values. All W2/W3 increments are now validatable HERE on disposable PG17.
- **EXECUTABLE PLAN WRITTEN:**
  `docs/superpowers/plans/2026-07-20-q12-w2-w3-staged-execution.md` — TDD, bite-sized,
  7 tasks. T1 W3-struct (`mc2-58tnx`): extract `SourceSnapshotSeam` from
  `LivePlanExecutor` → `OwnerCustodyExecutor.open_window_snapshot`. T2 W2-fork /
  T3 W2-consistency / T4 W2-oracle (`mc2-j58wi`): `production`-gated
  `StagedValueResolver`, run-root staged-values authority for compose↔claim
  byte-parity, structural `accept_real_run` (D4). T5 W5 rehearsal (`mc2-v68w6`),
  T6 W6 runbook (`mc2-naz8j`), T7 W7 owner-gated STOP (`mc2-i9h3y`).
- **Beads sequencing fixed:** W3 (`mc2-58tnx`) is the ONLY ready increment; edge
  reversed so W2 depends on W3 (T2 consumes `open_window_snapshot`); W5 depends on
  W2+W3. Chain: W3 → W2 → W5 → W6 → W7.
- **Next executable action:** implement Plan Task 1 (W3-struct), TDD against the fake
  seam here + `MC2_Q12_REAL_PG17=1` live leg. Window stays CLOSED.

### PROGRESS (2026-07-20, cont.³) — W2/W3/W5/W6 + CLI wiring DELIVERED; only owner-gated W7 remains

All non-owner-gated Q12-window work is delivered, TDD, and verified against real PG17.
Commits (all on `codex/self-hosted-qdrant-platform`, manifest `aaec6fc2` intact):

- **W3-struct** `bc4726c1e` (`mc2-58tnx` CLOSED): extracted `SourceSnapshotSeam` +
  `SourceConnectionConfig` mixin; `OwnerCustodyExecutor.open_window_snapshot`/
  `close_window_snapshot` (real held `pg_export_snapshot()` + 0400 baseline.json).
  Refactor-preserving (both gated PG17 suites byte-identical).
- **W2** (`mc2-j58wi` CLOSED): `df86ebea1` StagedValueResolver + `resolve_window_values`
  fork in run_live; `16e09b67a` run-root staged-values authority (recover determinism,
  D5J single-authority); `52881cbce` `accept_real_run` (D4).
- **Correction wave** `4c6d00947`: correctness-review P1 (coordinator-leak guard in
  run_live) + P2a-e (open_snapshot self-release, ephemeral libpq workdir, named
  fail-closed, corrupt-authority LifecycleError).
- **W5** `27d5b2e12` (`mc2-v68w6` CLOSED): production value machinery rehearsed
  end-to-end vs disposable PG17 (fork→real snapshot→persist→recover determinism→D4).
  IN-WINDOW-only residual bounded to W7 (full barrier dual-bind window + real
  data-movement pg.backup/restore/source.forward/reindex/deploy vs real infra).
- **CLI wiring** `09b63b205` (`mc2-pj5f0` CLOSED): `--recovery-run-id` (live+recover) +
  fixed source secret paths (`db_url_file`/`ca_file`) into main() request. main() runs
  live/recover with production=True + owner-custody executor, so the CLI now actually
  drives the staged production path. **Unblocks W7 invocation.**
- **W6** `e3b5148e5` (`mc2-naz8j` CLOSED): operator runbook v2
  `docs/qdrant/q12-window-operator-runbook-v2.md` (invocation incl --recovery-run-id,
  C1..C10, reversible --stop-after boundary, recover, D4, #18 rollback, owner-held C9).

Verification: focused q12 **676 passed / 74 skipped**; gated PG17 (baseline-producer,
full-window byte-parity, migration-plan malformed-snapshot, W3 live-leg, W5 rehearsal)
all PASS; type-check EXIT=0. Plan: `docs/superpowers/plans/2026-07-20-q12-w2-w3-staged-execution.md`.

**REMAINING: W7 (`mc2-i9h3y`, OPEN, OWNER-GATED).** Open the live window C1..C10 +
Phase D closeout. Requires a fresh pre-window `plan`, owner "go" on C1, and the owner
personally presses C9 (`barrier.activate` + nginx switch — the irreversible point of no
return). Everything up to that gate is now runnable via the CLI per the runbook. Preserved
constraints hold: never change manifest `aaec6fc2` (HARD STOP); never mutate Qdrant Cloud;
secrets path-only; no production mutation without a fresh pre-window plan + owner go on C1.

### Historical context (Phase A/B complete; pre-open R8 rehearsals)

The Q12 Full Completion program (spec/plan 2026-07-16) is RUNNING under a
Fable orchestrator. Phase A is COMPLETE (A1 `72af414c`; D6 `.13.19` at
`3d70eaf2`; Root `.13.13` join at `fcd05e27`; final matrix: focused 463/463
PG17, broad 952/953 known-env-only, type-check 0, build 75/75). Phase B is
COMPLETE (`mc2-rl4p9`, owner-approved 2026-07-17): operator image published
`ghcr.io/maslennikov-ig/mc-2/qdrant-operator:266de3d7…` @ index digest
`sha256:0fe4265ca80eb100912f6ce8155b061712db90ace4e0b1641e63e9a1a247e199`,
remote SLSA v1 provenance independently validated (source/revision/
Dockerfile PASS); two latent publisher defects found by the first live run
(metadata-file 0644 vs asserted 0600; validator SLSA v0.2-only) fixed with
TDD, suite 24/24 (receipt: `…artifacts/mc2-rl4p9-q12-b1-publication.md`).
`.13.7` is DELIVERED; the owner explicitly deferred `.13.8` rotation.

Recommended action: continue the completion program:

1. Phase C window is OPEN (owner approved 2026-07-17; packet
   `mc2-jz6y0-c0-window-packet.md`; server brought up, operator image pulled
   by digest). The C1 product-truth gap — the `plan` expected-catalog
   builder — is DELIVERED on this branch (deterministic builder + full live
   orchestration: snapshot-coordinated generation, drill persist-seam
   restore, §3 role bootstrap, structural-equality proof, real loopback
   CLIs, production seam lockdown; reviews PASS 0 P0/P1:
   `mc2-jz6y0.13-plan-builder-review.md`,
   `mc2-jz6y0.13-plan-live-review.md`).
2. Pre-C1 rehearsals are COMPLETE: 13 read-only server rehearsals drove
   rounds 8-19 (scheduled drill mode, tsx shim runners, delta-composed
   prediction ruling, dump-stable identities, delta-neutral extras, frontier
   repair, read-only lift, search_path-independent catalog checks, single-
   entry MIGRATION_MODIFIED_IDENTITY_ALLOWLIST). Rehearsal #13 (run
   `f4afe952`, release `7ba8f372`, core `e287d0fe…` installed 0444 root)
   fully SUCCEEDED: status `planned`, catalog at `/opt/megacampus/backups/
q12/f4afe952-68f9-4fea-873e-2e3809982758/expected-post-migration-catalog.
json` (0400, sha `de9e6b03…`), baseline `edbea709…`, expected post-
   migration sha `68041d94…`, clean teardown. Four never-executed-path
   live-window defects repaired (drill tsx, backup tsx, frontier premise,
   search_path rendering). Independent review of rounds 8-19
   (`7764cfb4..7ba8f372`, artifact `mc2-jz6y0.13-plan-live-review-r2.md`):
   correctness PASS, quality PASS, 0 P0/P1/P2, 3 P3 (handled/recorded).
   HOWEVER the window is BLOCKED pre-open: operator-procedure research
   (`mc2-jz6y0-c0-window-operator-procedure.md`, orchestrator-verified)
   shows the D5J §10 "real plan|live|recover controller … and live
   orchestration" was deliberately kept in Task-9 scope and `.13.13`
   delivered only the synthetic smoke evaluator + D6 frame join. Six open
   questions (OQ1 quiesce-ordering contradiction vs frozen chronology; OQ2
   no production emitter of ordinary journal rows; OQ3 resume needs
   guard_cleanup_complete + final-writer-manifest producers; OQ4 production
   resource_manifest_sha256 undefined; OQ5 no production snapshot exporter
   for pg.backup; OQ6 no baseline.json producer). NEXT: live-controller
   design (OQ resolutions grounded in frozen truth) → plan → TDD rounds →
   re-verify → re-present window open; then C1..C10 with C7 in-window
   re-freeze of W fields 5/6/8/9.
3. `.13.8` — owner-deferred password rotation (re-confirm explicitly; never
   rotate on a general "do it"); `.13.6` — off-host S3 production gate;
   `.25` — Prometheus retention YAML (Phase D). Alertmanager Telegram bot
   token + chat id still owed by the owner before monitoring bring-up.

Before any live mutation, present exact effects, secrets, observation,
rollback and downtime/data impact per the window packet.

## Q12 W7 session log (moved from handoff 2026-07-25)

Verbatim W7 session narrative moved out of `.codex/handoff.md` (current-state only per the
repo contract). Nothing was edited or dropped; the compact current state and the refreshed
window argument values stay in the handoff under § "Explicit defers".

- W7a real-leg CODE SEAM is DELIVERED (2026-07-23, `mc2-1sns3`, three TDD commits on `develop`
  `55d999b15`/`75e2663f6`/`d7c840048`): (1) controller `read_source_forward_acceptance` now READS the
  on-disk `<run_root>/source-forward-acceptance.json` authority (parse+validate `COVERAGE_RUN_RE`
  org:course:run + hex64 x2, fail-closed on missing/malformed) — mirrors `read_pg_backup_generation`,
  no Python fingerprint re-derivation; (2) TS `computeSourceForwardAcceptance` emit-entrypoint
  (`source-recovery-reindex-adapters.ts`) COMPUTES the canonical manifest sha256 +
  `calculateAcceptedFailedCoverageFingerprint` + single org:course:run via the exact existing canonical
  fns (extracted `buildAcceptedCoverageBinding`; the validate path is an unchanged thin wrapper, 20/20
  adapter tests green); (3) `emit-source-forward-acceptance.ts` CLI (`createDefaultSourceForwardAcceptanceDependencies`).
  All infra-free TDD (32/32 affected unit tests green), frozen manifest `aaec6fc2` untouched, type-check clean.
  Defer (a) is CLOSED (2026-07-23, `edac2284e` on `develop`): the wrapper's Q12 forward tail now
  invokes the emit CLI after `verify-dispositions` (tsx shim; `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`
  extracted fail-closed from the frozen-argv `--env-file` and passed only to the emit child) and
  publishes `<run_root>/source-forward-acceptance.json` 0400 controller-owned. Frozen argv unchanged:
  the coverage triple comes from the NEW operator-staged run-root authority
  `<run_root>/accepted-coverage-run` (0400, single `org:course:run` line — window precondition,
  runbook v2 §1.8-1.10). Fail-closed: missing/malformed authority, missing Supabase env values, or
  emit failure fails the forward run and leaves no acceptance file; non-Q12 forwards and
  rollback/resume paths are untouched; `SOURCE_RECOVERY_EMIT_BIN` is local-test-only. Independent
  correctness review found one P1 (root TOCTOU/symlink-follow on the publish) — closed in the
  correction wave `d640f84d2`: the emit CLI publishes with `O_CREAT|O_EXCL` + descriptor-scoped
  `fchmod` (never truncates through or chmods a swapped path), the wrapper chowns
  `--no-dereference`, every post-emit failure removes the leftover, and the coverage-run authority
  is validated byte-exactly. Delta-review PASS (residual: hardlink swap requires
  `fs.protected_hardlinks=0`; runbook §1.11 now asserts the `=1` kernel default). Runtime suite
  164/164 (9 new), CLI writer 7/7, wrapper-adjacent suites green, package type-check 0.
  REMAINING (bounded defers, `mc2-1sns3`): (b) the real VALUES + full forward-window
  rehearsal are window-grade (need a real reviewed recovery manifest + Supabase accepted-coverage
  ledgers) → the W7 owner-gated leg; the wrapper-emit real leg (real tsx/Supabase/env on the server)
  is validated at that same in-window rehearsal. The pg.backup generation seam IS fully real
  (latest.json read). Server re-deploy is DONE (2026-07-23, owner "go"): `megacampus-prod`
  `/opt/megacampus/deploy/qdrant/` now carries develop-HEAD `q12-lifecycle-core.py`
  (`8d62ca02…`, `py_compile` OK; `.bak-aafbb9a1-20260723` retained alongside the earlier
  `.bak-0c9d23cc-20260723`) and `source-recovery-run.sh` (emit tail + `--tsconfig` fix,
  `bash -n` OK; `.bak-9b0b5d53-20260723` retained); frozen manifest `aaec6fc2` re-verified.
  The emit runtime closure was also deployed: missing `emit-source-forward-acceptance.ts` +
  2 stale closure files, built `dist/` for shared-types/logger/utils, and the root
  `/opt/megacampus/tsconfig.json` (its absence silently broke tsx `@/*` alias resolution from
  the controller's cwd — found by on-server smoke, fixed in-repo by pinning
  `--tsconfig` in the wrapper emit argv with a fail-closed tsconfig-chain check; runtime suite
  165/165, CLI 7/7, runbook §1.10 now documents the closure + smoke command). Window
  preconditions verified on-server 2026-07-23: `fs.protected_hardlinks=1`, `.env.production`
  exactly-one non-empty `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, secrets present path-only,
  tsx smoke from `/opt/megacampus` reaches the CLI usage gate.
  FRESH PRE-WINDOW `plan` IS GREEN (2026-07-23, run `fd39fc26-e516-4aef-908e-90475cc5f474`,
  release `2832222cb…`, new controller build): status `planned`, structural catalog sha
  `68041d94…` byte-identical to the 07-17 and 07-21 runs (determinism holds), two known
  delta-neutral extras (test-schema default ACLs), prod containers untouched. Live-invocation
  value: `--expected-catalog-sha256 6f3cd00fd3f017634840e3c909a6f4adce927edb8d5a5823f0547b5e5cb0b8d0`;
  `--operator-digest sha256:0fe4265ca80eb100912f6ce8155b061712db90ace4e0b1641e63e9a1a247e199`
  (Phase B image). `.13.4.1` STAGING LEG (2026-07-23, second owner "go"): the reviewed
  plan-input REGENERATOR is delivered on `develop` (`d7d9725f5`,
  `packages/course-gen-platform/tools/qdrant/generate-source-recovery-plan-input.ts` + 11/11
  unit tests; classification comes from the SAME `buildReindexPlan` the operator plan mode
  re-derives, audited totals pinned fail-closed, identities redacted from every error/report
  surface) and deployed 0444 to `/opt/megacampus` (sha `6f27f996…`, tsx smoke reaches the
  usage gate). Directory layout IS staged on the server: `/var/lib/megacampus-source-recovery/`
  (root 0755) + `state` + `state/progress` + `/opt/megacampus/data/source-recovery-capability`
  (all 1001:1001 0700, empty). The live regeneration run CONFIRMED the audit truth end-to-end
  on today's host+DB — file/copy layer classification passed the exact gate
  (261/240/109/129/2/21, 42 copies / 125 rows, 6 eligible + 18 playbook disposition
  candidates; 261 catalog rows and 138 root files re-verified) — and then FAILED CLOSED at the
  disposition-predicate layer: `career_playbook_sources` is EMPTY on the live DB. HARD GATE
  RESOLVED (2026-07-24, owner-approved amendment `mc2-af1ay`): read-only investigation proved
  the emptiness is LEGITIMATE product behavior, not data loss — pg_stat_user_tables shows
  `career_playbook_sources` n_tup_ins=21 / n_tup_del=21 / n_live_tup=0 (all 21 rows uploaded
  2026-06-09, all cascade-deleted via `playbook_id … ON DELETE CASCADE` when their parent
  playbooks were deleted; `career_playbooks` shows 79 created / 68 deleted, 11 live), while
  all 21 `file_catalog` course-NULL rows survive. The 07-12 audit read `file_catalog` only and
  never verified live playbook-source rows. AMENDMENT DELIVERED (`e29dc188b`, TDD RED→GREEN):
  `.13.4.1` dispositions are now file_catalog-only bookkeeping — manifest schema REJECTS
  `career_playbook_source_id`/`expected_career_playbook`, the `career_playbook_source_applied`
  checkpoint is removed (both kinds go planned→applied via the single file_catalog CAS),
  planner/verify read exactly 24 file rows, the generator no longer loads playbook rows;
  exact totals (42/125/6+18, 261 counts) and frozen manifest `aaec6fc2` unchanged; 515/515
  qdrant unit tests + type-check green; design doc amended
  (`docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md` §Amendment 2026-07-24).
  A SECOND latent contract defect surfaced on live regeneration and was fixed (`d3cb0ee43`):
  the two audited invalid-path rows carry a 23-character legacy non-sha256 `file_catalog.hash`,
  which the frozen `expected_hash` sha256 regex could never represent — the disposition
  predicate is now a byte-exact bounded printable token (`CATALOG_HASH_PATTERN`), while
  physical copy `expected_sha256` stays strict. `.13.4.1` STAGING IS COMPLETE (2026-07-24):
  the amended 4-file closure is deployed 0444 byte-identical to `/opt/megacampus` and the
  plan-input is REGENERATED AND STAGED at `/var/lib/megacampus-source-recovery/plan-input.json`
  (1001:1001 0600; run_id `a417a99c-db3a-45c8-9d32-561d8d068a3e` = the window
  `--recovery-run-id`; canonical sha
  `e9d41b175e09c7a07606e087967a1de93bd8cf6532de1f8a414f5ec878529950` verified equal to the raw
  file bytes; release_sha `d3cb0ee432184dcb8ba939b14c4bda8d22b89209`; exact 42/125/6+18).
  Remaining pre-window queue (Beads, in dependency order): `mc2-4sz9t` redeploy develop-HEAD
  `q12-lifecycle-core.py` + `source-recovery-run.sh` and rerun ONE fresh green plan →
  `mc2-gyde8` derive accepted coverage `org:course:run` + stage `accepted-coverage-run` 0400 +
  `secrets/db-capability` → `mc2-i9h3y` the owner-present window (C1..C8 quiesces production
  writers, C9 owner-pressed). The writer-quiesce manifest is published in-window by
  `writers.quiesce` itself (stepping hash ZERO→QSHA per the C0 operator procedure), not
  pre-staged.
  2026-07-24 (session 2): `mc2-4sz9t` is CLOSED. The server already carried develop-HEAD
  byte-identical (controller `8d62ca02…`, wrapper `94f923d5…`, 4-file generator closure +
  emit CLI byte-exact; manifest `aaec6fc2…` intact; fresh `py_compile`/`bash -n` OK). Fresh
  pre-window `plan` is GREEN under the WINDOW run-id `0fa297e4-3eb7-475f-aee6-56455f02ed6c`
  (plan and window must share the run-id — the claim path re-reads the catalog from the run
  root): release `e840c128034f47bb55d578f7e3aeb16fb4b35714`, status `planned`, catalog FILE
  sha `fa69efb37423990a20ce661a13f8c6ab185dc38e7f6063d5808c24667ab221e1` (this is
  `--expected-catalog-sha256`), inner structural sha `68041d94…` byte-identical to the
  07-17/21/23 runs, same two delta-neutral test-schema ACL extras, prod untouched.
  OPERATOR IMAGE REFRESH: the Phase B digest `sha256:0fe4265c…` NO LONGER EXISTS in GHCR
  (CI republishes per develop push). The current `develop-d3cb0ee` digest
  `sha256:8aedef32717441a1d5b4093cfad094d09bddafffbcf7a3bfa04d0da3a2d957b0` (contains the
  mc2-af1ay amendment) was pulled on the server, its registry-attached SLSA provenance
  verified (revision `d3cb0ee43…`, source MC-2, target qdrant-operator), and
  `.env.production` `QDRANT_OPERATOR_IMAGE_SHA256` re-pinned (backup
  `.env.production.bak-operator-digest-20260724`). This is the refreshed
  `--operator-digest`. `<run-root>/secrets/db-capability` is minted and staged 0400
  uid 1000; emit-CLI smoke (runbook §1.10) passes the usage gate.
  **HARD GATE — WINDOW NOT OPENABLE (`mc2-gyde8` BLOCKED, owner decision required):** the
  C5 acceptance emit + C6 reindex coverage validation cannot pass against live truth.
  (a) The live DB has NO `document_evidence_runs`/`document_evidence_items` tables — they
  are created EMPTY by the C4 migration `20260711120000_document_evidence.sql`, and Stage-4
  failed-coverage cards are minted only by future post-window generation runs, so
  `getAcceptedRun()` can never return an accepted ledger during the window. (b) The staged
  plan-input's six `eligible_unrecoverable` dispositions span SIX org:course scopes across
  THREE organizations, while `computeSourceForwardAcceptance` + the frozen manifest bind
  exactly ONE `<accepted-coverage-run>` slot and `assertExactScopes` demands the full scope
  set — the "single-course-scoped window recovery" design assumption is contradicted by the
  accepted 07-12 audit truth. Consequence: the wrapper forward tail fails closed at C5
  (after C2 quiesce) and C6 fails on the same validation. Candidate resolutions (owner
  call): file_catalog-only acceptance amendment (analogous to mc2-af1ay), narrow the
  recovery to a single course, or (not recommended) in-window ledger seeding. Evidence and
  code cites on `mc2-gyde8`.
  2026-07-25 (session 3): **HARD GATE RESOLVED — owner approved variant A** (file_catalog-only
  accepted coverage) and it is DELIVERED under `mc2-tpdog`. Acceptance is now derived from the
  recovered `file_catalog` rows (`applyDispositionEntry`'s post-state: `vector_status='failed'` +
  `error_message='source_file_unrecoverable; recovery_run=<run>'`) cross-checked against the
  sha-bound reviewed manifest; the six recovered `organization:course` scopes come from the
  manifest, so the frozen manifest `aaec6fc2…` is UNCHANGED and its single `<accepted-coverage-run>`
  slot now carries the self-describing authority token `catalog:<recovery-run-id>` (validated by the
  controller `COVERAGE_RUN_RE`, the wrapper forward tail — which also requires it to equal the run's
  own `--recovery-run-id` — the emit CLI and the reindex CLI). `AcceptedFailedCoverageBinding` carries
  `source: 'file_catalog'` + `scopes` (was `ledgers`); the reindex plan/artifact field
  `acceptedCoverageLedgerIds` became `acceptedCoverageScopes` (sorted `org:course`). Spec:
  `docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md` §"Amendment 2026-07-25"; plan:
  `docs/superpowers/plans/2026-07-25-q12-file-catalog-accepted-coverage.md`; runbook §0 + §1.8/§1.9
  and the C0 operator-procedure placeholder table updated. The dropped downstream guarantee (Stage-4
  zero-evidence cards for the six sources) is tracked as an explicit post-window defer on
  `mc2-8m90f`, and the Stage-4 half stays covered by
  `source-recovery-acceptance.test.ts::proveStage4AcceptsAuditedFailedSources`.
  REDEPLOY REQUIRED before the window: controller + wrapper + emit runtime closure changed, so
  re-deploy develop-HEAD and run ONE fresh pre-window `plan`. The plan's inner structural sha will
  legitimately CHANGE (was `68041d94…`; the fixture `<accepted-coverage-run>` derivation is now the
  catalog token) — the frozen manifest sha must not. `--run-id`
  `0fa297e4-3eb7-475f-aee6-56455f02ed6c`, `--operator-digest sha256:8aedef32…` and
  `--recovery-run-id a417a99c-db3a-45c8-9d32-561d8d068a3e` stay; re-record
  `--expected-catalog-sha256` and `--release-sha` from the fresh plan run. `mc2-gyde8` reduces to:
  stage `<run-root>/accepted-coverage-run` 0400 containing
  `catalog:a417a99c-db3a-45c8-9d32-561d8d068a3e` (db-capability is already staged) and re-run the
  §1.10 emit smoke.

## Accepted and open work history (moved from handoff 2026-07-25)

Verbatim accepted-work history moved out of `.codex/handoff.md` (current-state only per the
repo contract). Nothing was edited or dropped.

- Accepted and pushed: Q1-Q9, strict Formula index fix `.15`, evidence E1-E7, and exact 100% local/development document-evidence activation. Final independent activation/docs review at `d3417610` reported no P0-P3 findings; integration merge `ea183d83` passed 24/24 focused tests, package type-check, process verification, and canonical closeout dry-run. Integration history and exact evidence are in `.codex/stages/mc2-jz6y0/summary.md`.
- Q7 `.8` is reviewed, integrated as `841812be`, verified at focused 85/85 plus pinned Qdrant `1.18.2` 19/19, and its dedicated local worktree/branch are cleaned. The remote evidence branch remains.
- Q6 `.7`, Q8 `.9`, Q9 `.10`, Q10 `.11` and Q11 `.12` are reviewed and integrated. Q10 reviewed head `42ed1322` merged as `3c9dd641`; 31 Markdown files passed final independent review with P0-P3 zero. The final local release matrix passed backend 1,893/1,893 with zero skips, shared 23/23, web 20/20, PostgreSQL 78/78 with zero skips, exact Qdrant 15/15, applicable local snapshot/restore 5/5, Compose/runtime 8/8, Prometheus 14 rules, Alertmanager config, `pnpm type-check`, and build 75/75. The stale activation-contract test was corrected under `.26`; implementation and independent review are integrated with P0-P3 zero.
- Q12 local remediation includes guarded migrations `.13.1`, immutable operator `.13.2`, release-bound rollback `.13.3`, and accepted staging-local snapshot mode `.13.5`. Local snapshots now live at `/qdrant/storage/snapshots` on the persistent named volume and pass the exact pinned `1.18.2` recreate/restore matrix; they do not protect against volume, disk, host, or datacenter loss. Off-host S3 is explicitly deferred to production gate `.13.6`. No staging mutation has occurred.
- Q12 source audit `.13.4` is independently accepted read-only: 261 catalog rows, 240 Qdrant-eligible and 21 `missing_course`; 42 exact no-replace copies can restore 125 eligible rows and raise recoverable coverage from 109 to 234. Exact originals for the final four missing plus two invalid eligible rows were not found anywhere on the host. Eighteen non-eligible Career Playbook originals are also absent. The owner-approved dispositions are six `source_file_unrecoverable` plus eighteen `retained-derived-only`. The complete `.13.4.1` operator is locally accepted, including core, workflow/CAS, audited reindex, Stage 4 failed-coverage integration, concrete multi-ledger adapters, isolated runtime, crash-residue/inode matrix, and exact-count Task 6. Final Task 6 rereview passed P0-P3 zero; fresh integration passed 3/3 focused and 456/456 recovery/reindex tests plus type-check/artifact/process gates. All Task 6 worktrees/local branches are cleaned. No staging copy or remote mutation has run.
- `.13.7` is CLOSED (2026-07-16, owner-authorized remote window). The owner DSN is installed owner-only at `/opt/megacampus/secrets/supabase_db_url` with the pinned CA; the legacy fail-open cron is suspended (root-owned rollback evidence retained); the fail-closed operator, drill, and helpers are installed root-owned under `/opt/megacampus/deploy` with Node 22 + pnpm 8.15.0 + tsx host prerequisites. The fixed-hash installer finished its canonical proof: fresh scheduled generation `20260716T105950Z-11196fff` published under full systemd hardening, isolated Supabase-PG17.6 drill PASSED (cluster-global + cutover + baseline equality, ratio 0.724, zero residue), daily `00:30 Europe/Amsterdam` timer enabled+active. Twenty-plus never-executed defects in operator/drill/manifest/bootstrap were fixed with TDD and review on the way (`dedcc076`..`da512322`). The owner explicitly deferred `.13.8` password rotation («можешь не менять»).
- The owner approved the exact Q12 correction specification SHA-256 `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15` on 2026-07-13. On the same date the owner accepted decisions `.13.14` and `.13.15`: the managed Supabase provider plane is an explicit trusted residual boundary, and recovery uses guarded `prepare-recovery`, quiesced completion, no-start mode-bound final manifests, then a separate lease-bound `resume-writers-only` after cleanup. Both decisions are closed. The independently rereviewed normative addendum SHA-256 is `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27` with P0-P3 zero; it supersedes the earlier package at `099fc44b` only by freezing cross-language canonical journal bytes and exact object-publication phase/outcome mapping. This permits safe local implementation only; remote/live mutation remains separately gated.
- Publisher `.13.9`, G7 `.13.7.2`, D5 decision `.13.17`, and Root producer `.13.18` are accepted/integrated. D5W seam `.13.20` is closed: source `3dd9ad53`, correctness/docs delta reviews P0-P3 zero, integration/W reruns 271/271, cleanup evidence `c150a4c2`, source worktree/local branch removed. The preserved W branch is clean and pushed at `60910053`. The joined-fixture task `.13.21` is implemented, independently reviewed, and integrated; W `.13.10`, M `.13.11`, and H `.13.12` are closed and integrated (see below); Root `.13.13` is CLOSED: the join integrated at `fcd05e27` (smoke/observation gate exact to §13 with rotation_required=true, D6 real frame envelope + R-handshake join with validation-at-load; correctness review PASS 0/0/0/5, docs review PASS 0/0/0/1; manifest and barrier bytes unchanged). No remote/live mutation occurred.
- D6 `.13.19` is IMPLEMENTED and integrated at `3d70eaf2` (contract byte-identity `2a2251ac…`, Option A): the read-only probe (`q12-activation-truth-probe.cjs` + FD-11 SQL, Tasks 1-14) and the Root coordinator authority (`q12-lifecycle-core.py` D6 additions, Tasks 15-19) delivered in two disjoint worktree streams, each independently reviewed (PASS 0/0/2/4 and 0/0/1/4) with delta reviews after correction rounds (real CLI runtime assembly, sentinel coalesce, 3-point snapshot discipline; NFC canonical, after-read secret revalidation + rewind, seal-predecision binding enforced). Cross-language canonical hashing byte parity proven (`764d1b37…`); named convention: hash in-memory canonical NFC no-LF, files store canonical+LF, validation-at-load parses then hashes. Evidence in artifact `mc2-jz6y0.13.19-q12-d6.md`. Pinned-server capability gates stay remote-gated; fields 5/6/8/9 re-freeze stays Task C7.
- Read-only architecture report SHA-256 `8bf9786c1e97ce4a54bc455d37ec052a8658fa110524fbed1a5ab728b3fda379` found that D5W real-preimage binding is insufficient for W chronology: Root D5-only anchors and W's full source/backup/restore/reindex graph cannot be joined by copying or rehashing authority. The owner approved the Root-owned test-only architecture/drafting direction and, on 2026-07-15, explicitly approved the exact tracked candidate SHA-256 `d7e86193142d260a3b8dcd65ef9ce89b64df88d9c93cec68f19705de68edc75d`. It closed the clean-prefix-1 quiesce-preimage gap and passed final correctness/docs rereviews P0-P3 `0/0/0/0` (report SHA-256 `0eb420fda7099ecdf98d0028cc5f8b89e9a61103018e747228868515eb970bf2` and `02770a81c69474a1445fb7c4f2a05edbfa5cee50d18accf502f074d4e79025ba`). Local planning/TDD/review/integration are authorized; production CLI and W ownership stay unchanged, and remote/live authority remains separate.
- The D5J product-truth gap is resolved. Decision `.13.22` is closed by the normative amendment `docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md` SHA-256 `d6c4d8e4b2b7f6c53d648fdf587a5520db45fa5d8f3c84668b48b09b6bbe075c` (independent correctness/docs reviews PASS P0-P3 `0/0/0/0`): one canonical twenty-command manifest (the enumerated D5J subset moved forward from Task 9), a closed ten-placeholder substitution domain with single authorities, exact phase/command/outcome bindings for every ordinary row (genesis `operator.self-check`, `pg.backup` selector/target split, phase-internal migrations preserving the D5 predecessor heads, the `migrations_applied` witness milestone), two-segment quiesce and evidence-stepped resource bindings, distinct immutable `final-writer-manifest-forward|rollback-<run-id>.json` paths with real `writers.resume.*` hashes, and the Root-owned deterministic thirteen-key writer inventory.
- `.13.21` is implemented under the reviewed plan SHA-256 `a05ba3c60e1a1a714e7d0ce30298f8124949e67c9dbacc00677a7fc414805b4a` (plan review PASS `0/0/0/0`) and integrated at `66e41cb5`: the Root-owned closed joined composer emits the exact 76-row forward chronology and every rollback profile (prefixes 1-4 clean and exact-next-frontier, activation frontier with both mode-bound manifests and byte-identical target entries) through the production serializer/capability/object/checkpoint primitives; the runner/TS surface is closed; deployed wrappers/parser gain no switch. Independent implementation reviews: correctness PASS `0/0/0/2`, docs PASS `0/0/1/2`, every finding fixed. Evidence: focused four-file suite 300/300 in both file-parallel and serialized modes, static acceptance checks, workspace type-check, synthetic build; stage artifact `mc2-jz6y0.13.21-q12-d5j.md` validated.
- On 2026-07-15 the owner approved the recommended `.13.22` correction and delegated the remaining local work to Fable, followed by Codex review. Fable is authorized to draft and independently review the narrow normative amendment, freeze the exact canonical bindings/inventory/path rule, plan, implement with TDD, integrate and verify locally without intermediate owner confirmations. Remote/live exclusions are unchanged. The tracked copyable handoff is `docs/superpowers/prompts/2026-07-15-q12-fable-local-completion-handoff.md`.
- Final handoff correctness and documentation rereviews passed P0/P1/P2/P3 `0/0/0/0`; report SHA-256 values are `8c56c37720e25a5d213fdc2c1c6c7ea8b1da7f1795f34e9078069b257d306a6e` and `b75dccbee85395372e350de79d304647388d8ad061e3b990a261aa9843e00bea`.
- W `.13.10` is CLOSED. The FLIP is integrated at `60910053`: the
  genesis-rooted joined journal prefix is the sole resume acceptance in
  `q12-writer-resume.py`; the fabricated `common_phase_graph` branch is
  removed; the D4 negative is pinned five ways. Held-capture lever, ruling Z,
  and the full acceptance matrix are recorded in the stage summary and on the
  bead. Current amendment SHA
  `e952f72410c9d49555cd780108e2b94c47284872da69e506b6c2e9ab86fcd4b1`;
  twenty-command manifest SHA
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841` (the
  historical five-command `af9b21cb…` value belongs to `c93d766d`-era bytes).
- H `.13.12` is CLOSED and integrated at `70bf6103`: `--q12-mode`
  prepare/commit/finalize-quiesced with phase-aware rollback, the durable
  `nginx_switch_intent` marker written before reload (review P1-1), truthful
  re-prepare (P1-2), and the activation receipt contract
  (`<run-root>/database-barrier-receipt.json` `state=activated`). Evidence:
  24 Vitest + 15 shell cases; FAIL→RED-first fixes→delta PASS.
- M `.13.11` is CLOSED and integrated at merge `a73a3651` from
  `codex/q12-m-migration-cli` tip `29d73d04`: file-only Q12 migration
  credentials (O_NOFOLLOW + inode/device recheck, field-built ClientConfig, no
  connectionString on the Q12 path), same-transaction guards, connection-source
  mutual exclusion, concurrent index packet preflight, plus the hardening batch
  (fail-closed on twelve libpq `PG*` variables via
  `Q12_REJECTED_LIBPQ_ENV_VARS`, embedded `;` rejection, widened leak asserts
  across five fail-closed branches). Security review PASS P0=0/P1=0 and delta
  PASS on `29d73d04`; 64/64 focused units; formal e2e 20/20 on the disposable
  stack. Residual informational P2-4: `PGSSLCERT`/`PGSSLKEY`/`PGSSLPASSWORD`/
  `PGCHANNELBINDING`/`PGGSSENCMODE` are outside the reject list — proven
  non-exploitable while `ssl` is an explicit object; optional completeness-only
  addition.
- The W activation tuple `.13.10` is now 11/11: field 11 was RATIFIED on
  2026-07-16 by independent review (PASS P0/P1 zero; F1 carried as the
  accepted `.13.14` residual note) at `72af414c` — inventory at
  `deploy/qdrant/q12-managed-session-inventory.json`, canonical hash
  `c90edb78…` unchanged, pinned by unit test. D6 Task 0 gate passed
  (manifest `aaec6fc2…` verified). The LIVE-BOUNDARY RE-FREEZE CHECKLIST now
  covers only item 2: production re-freeze of fields 5/6/8/9 at Task C7.
- Full local release matrix at `a73a3651`: Q12 unit battery 748 passed /
  1 known environment failure (`qdrant-observability-contract.test.ts:223`,
  fails identically on the pre-Q12 base) / 36 skipped; blue/green shell suite
  15/15; `pnpm type-check` exit 0; `pnpm build` exit 0 with the synthetic web
  env. PG17-gated suites run under `MC2_Q12_REAL_PG17=1`.
- PG17 document-evidence security-manifest digests were computed on the isolated restore (pre-120000 `dcc90cc2…`, after-120000 `4df2b22b…`, after-130000 `f7100de0…`, after-140000 `e148e241…`, after-151000 `2597a553…`) and the allowlist delta is integrated at `b8204cde` with independent review PASS P0-P2 zero and new disjointness/hex invariant tests.
- Decision `.14` is owner-approved and closed: Qdrant `1.18.2`, Prometheus `3.13.1` LTS, Grafana `12.4.5`, node_exporter `1.12.0`, Alertmanager `0.33.1`, approved image locks, authenticated main-listener scrape using `api-key` from a mounted file, no Qdrant `metrics_port`, fail-closed Qdrant secret wrapper, textfile-only unprivileged exporter, and single-node Alertmanager.
- Design `.17` is approved/closed; grouping `.16` closed as superseded. E1-E7
  (`.18`-`.24`), Q6 `.7`, Q8 `.9`, Q9 `.10` are reviewed, integrated, and
  verified; evidence lives in `.codex/stages/mc2-jz6y0/summary.md`.
- Historical `.13.7` doc correction `7b446d7d` (rereview `0b7ffe67`, P0-P3 zero) is superseded by the delivered gate; runbook state lives in `docs/operations/qdrant-self-hosted.md`.

## Live-window defects #7-#9 and the mc2-ipwyc pair (moved from `.codex/handoff.md`, 2026-07-28)

Moved here when `mc2-ot8se` replaced the operator's manual pre-flight checklist with `q12-window-preflight.py`; the handoff is current-state only.

DEFECTS FOUND AND FIXED SINCE (all on `develop`):

- `mc2-8zxlc`/`mc2-34eua` (#7, owner-approved variant B): `cron.job` out of `guarded_relations` (75).
  The guard needs ACCESS EXCLUSIVE AND CREATE TRIGGER on every guarded relation; `cron.job` is owned
  by `supabase_admin` with only SELECT to `postgres` — 42501 both ways, and it was the ONLY one of 76
  out of reach. Retained, privilege-free: the `cron.alter_job` pause, the zero-active-jobs read, the
  read-only default, and the guard trigger on `net.http_request_queue`. Second instance found by the
  amendment: the D6 activation-truth probe locked the same catalog IN SHARE MODE — any D6 request now
  carries `projection_sql_sha256 = d5046e31…`.
- `mc2-2rzf6` (#8): plan and barrier measured the structural catalog in DIFFERENT `search_path`
  contexts (`cfe6b92b` vs `a2b25324`) — deterministic, not drift. Plan capture now pins
  `SET LOCAL search_path=pg_catalog` in the same session the barrier re-measures in.
- `mc2-6fnrt` (#9): the controller opened and HELD the W3 snapshot coordinator before
  `barrier.install`, and the barrier's own `quiesce_client_backends()` terminated it. The codesign
  always resolved `<exported-id>` "at pg.backup open"; `WindowSnapshotHold` now does exactly that.
  Barrier, W-tuple and the client quiesce untouched.
- `mc2-ipwyc` (found during the restore, both latent PAST C9): the barrier armed guard triggers it
  could not disarm (DROP TRIGGER needs OWNERSHIP; auth/storage tables belong to the managed admins) —
  `$restore$` now disarms with one `DROP FUNCTION ... CASCADE` and replays the catalog-captured
  function + six immutable triggers + REVOKE. And the Supavisor pooler NEVER delivers the connection
  `options`, so every `-c default_transaction_read_only=…` proof was asserting the database default;
  each runner now states its intent with a session-level SET. Barrier `f4f90361` -> `56a7a88e`,
  W-tuple fields 4/5/6 amended. `aaec6fc2…` UNCHANGED — `command_sha256` covers argv only.

THE PATTERN behind all of them: the checked environment substituted for the consuming one — a fixture
published the step, an isolate had superuser rights, the real error was swallowed, a host-only gate
hid a rotten fixture, or the pooler silently dropped what the test connection delivered. Model the
constraint, never the convenience.

## Release identity and `.env.green` re-pin (moved from `.codex/handoff.md`, 2026-07-28)

RELEASE IDENTITY SETTLED (`mc2-v7547`): `--release-sha` names the APP release `.env.green` pins,
`--operator-digest` the `qdrant-operator` image `.env.production` pins — different artifacts, once
conflated. `.env.green` is re-pinned (backup `.env.green.bak-4128a938-20260727`) to api@`2f713f87` +
web@`ca9afb99`. The dead GHCR token (`mc2-2vtmk`) does not block the window. Historical progress logs
live in `.codex/stages/mc2-jz6y0/summary.md`; this file is current-state only.

## Window attempts #1-#9 and the 2026-07-28 restore (moved from `.codex/handoff.md`)

WINDOW STATE. Opened NINE times (six 2026-07-27, three 2026-07-28). Attempts 1-8 failed closed with
ZERO mutation; each surfaced a real defect. Attempt #9 INSTALLED the guard and then aborted, leaving
production guarded + read-only with `activated=false`; it was restored by hand the same day using the
barrier's OWN `$restore$` block (extracted programmatically, `drop_schema=true`, under the run's
capability, fail-closed pre-checks). Production re-verified afterwards: 0 q12 schemas / triggers /
event triggers / functions, cron 8/8 ACTIVE, database default writable, no stale sessions, all
containers healthy. Run root `5e9b7256-…` is BURNT — each attempt burns its run-id.

## Deferred review P2 on the `.13.4.1` amendment (moved from `.codex/handoff.md`, 2026-07-28)

- Review P2 on the `.13.4.1` amendment (`mc2-af1ay`): `source-recovery.ts` keeps a second
  operator-side `DispositionSchema` without the kind↔reason↔course_id superRefine from
  `source-recovery-manifest.ts` — rescued today because `assertExactRecoveryContract` runs the
  strict `normalizeRecoveryManifest`. DEFERRED past the live window (no operator churn before
  C1..C10): consolidate the duplicate schema, deduplicate `CATALOG_HASH_PATTERN`, consider
  excluding quote/backslash from its character class.

## Q11 cleanup state (moved from `.codex/handoff.md`, 2026-07-28)

- The current pushed `codex/self-hosted-qdrant-platform` integration branch/worktree is intentionally retained for Q12. Final cleanup returned non-zero only because it correctly refused to delete this checked-out continuation branch; all Q11-owned worktrees, local branches, containers, ports and temporary data are cleaned.

## Completed local gates at the delivered HEAD (moved from `.codex/handoff.md`, 2026-07-28)

- Completed local gates: focused Stage 2/4/5/6 backend 1,893/1,893, shared 23/23, web 20/20, PostgreSQL 78/78, pinned Qdrant 15/15, applicable local snapshot/restore 5/5, Compose 8/8, `pnpm type-check`, and `pnpm build` 75/75. Process verification, final Graphify refresh, and canonical closeout are recorded at the delivered HEAD.

## Known accepted boundaries (moved from `.codex/handoff.md`, 2026-07-28)

- Known accepted boundaries (by design, not debt): the joined composer's partial-capture fixture is
  truthful only while W validates held checkpoints as a creation-order prefix without a journaled
  counter (P2-3); §5 tamper-append of a fully VALID row is outside tamper protection by design (the
  guarded property is prefix integrity); M's residual P2-4 libpq variables are proven
  non-exploitable with the explicit `ssl` object.

## `mc2-38ivn` — the pooler rewrites `application_name` (2026-07-28, delivered)

The tenth instance of the environment-substitution class, and the first one found by the pre-flight
rather than by a window attempt. Probe B3 measured it against the live pooled DSN in seconds: a
session that asks for `megacampus-q12-window-preflight-b3` reads back `'Supavisor'` from both
`current_setting('application_name')` and `pg_stat_activity`. Supavisor does not merely fail to
deliver the startup parameter the way it drops `options` (`mc2-ipwyc`) — it substitutes its own.

Why it blocked the window: the barrier's terminal proof asserts
`barrier_era_session_count == 0`, counting other backends whose `application_name LIKE
'megacampus-q12-%'`. Through the pooler that count could only ever be 0 — not because no
barrier-era session survived, but because none could be recognised. It passed for the wrong reason,
and the same blindness covered every other consumer of the prefix. `quiesce_client_backends()` was
never affected: it matches on `usename` (E1 green throughout).

Fix (delivered as `c0c8d03b3`, `0eb366c33`, `1435aab94`):

- all four barrier clients (`megacampus-q12-database-barrier`, `-install-baseline-proof`,
  `-recovery-readiness-proof`, `-database-terminal-proof`) issue `SET application_name` beside the
  existing `SET default_transaction_read_only`, and each session proof asserts the name twice —
  `current_setting` AND what `pg_stat_activity` publishes for its own backend — so the barrier fails
  closed if a pooler release ever discards the session-level SET as well;
- probe B3 was restructured into B1's shape: it records what the connection delivers, measures the
  session-level repair, and fails only when no repair exists or when a scanned runner still names
  itself on the connection alone. It is therefore red-when-broken and green-when-fixed, instead of
  permanently red against a pooler that always rewrites;
- the contract's B3 row was amended in lockstep, and its E2 row now records that E2 also proves the
  pooler leaves no badged backend behind after one closes — the precondition
  `barrier_era_session_count == 0` needs at C10;
- W-tuple field 4 → `f98a2ce42e6b8992d386aab4e97321d439fa31e7ad0dd268f8d61123ead7be1f`; fields 5-10
  re-measured byte-identical with `mc2-jz6y0.13.10-activation-tuple-repro.cjs`, so no production
  re-freeze, and the frozen 20-command manifest `aaec6fc2…` did not move (argv unchanged).

Evidence beyond the suites: the gated real-PG17 leg reproduces the pooler locally with a PostgreSQL
17 `ON login` event trigger (the session source outranks the startup packet; an in-session SET still
wins) and reads the resolved name back out of the server log through `log_line_prefix=%a`. RED
logged the terminal proof's own statements as `Supavisor|LOG:`. The same test holds one
`megacampus-q12-intruder` session open across a cleanup run and requires the terminal proof to
refuse, so `barrier_era_session_count` is proven live in both directions rather than vacuously zero.

## `mc2-1sns3` — the recover drive path never threaded the staged callbacks (2026-07-28, delivered)

The last open dependency of the window, and the same substitution class as the ten window defects —
this time inside our own increments rather than in production.

W7a increments 2-3 wired the staged resolver callbacks that carry a real value from one
data-movement step to the command that consumes it: `on_pg_backup_done` (pg.backup publishes the
generation dir; `pg.restore` consumes `<immutable-generation>`) and `on_source_forward_accepted`
(source.forward publishes the acceptance authority; `reindex.plan` consumes
`<accepted-recovery-manifest-sha256>` / `<accepted-coverage-fingerprint>` / `<accepted-coverage-run>`).
Both were wired as an `on_staged` hook that **`run_live` passed into `drive_forward_sequence`**.

`run_recover` shares that driver and passed nothing, so the default no-op ran. Two entries of the
generalized R8-I-B head-dispatch table re-drive a staged step:

- head 1 `("barrier.install", "completed") -> "writers.quiesce"` re-drives pg.backup, then
  `pg.restore` raised `unresolved command placeholder`;
- head 4 `("barrier.prepare-recovery", "completed") -> "source.forward"` re-drives source.forward,
  then `reindex.plan` raised the same.

Both heads are only reachable AFTER C2 has quiesced the production writers, so the failure mode was
a fail-closed abort with the writer fleet already stopped — the exact stranded-writer exit the
window's stop rules exist to avoid.

Increment 4 was supposed to cover this and did not: it proved the threaders are re-drive-SAFE by
calling `resolve_pg_backup_generation` DIRECTLY (resolve-once, drift fails closed, authority
uncorrupted). It never proved the recover drive path CALLS them. The checked environment — a direct
call — was more permissive than the consuming one, which made no call at all.

Fix (`1725a2df3`): the staged threading MOVED INTO `drive_forward_sequence`, which already holds
`engine.executor`, `values`, `request` and `engine.run_root`. The `on_staged` parameter is gone, so
there is one implementation and no caller can forget it — the property `WindowSnapshotHold` already
had for `<exported-id>`, whose docstring had described recover-awareness all along.

TDD RED->GREEN, infra-free: `q12-production-recover-staged-threading.test.ts` + runner drive the
REAL `drive_forward_sequence` from each recover head exactly as `run_recover` drives it (no
caller-supplied hook), with a fake `OwnerCustodyExecutor` subclass overriding only the
authority-read seams and an injected `ordinary` that resolves the real frozen-manifest command the
way `Engine.append_ordinary_lifecycle` does. Both heads reported the fail-closed error before the
fix and resolve after.

Parity and freeze: fixture composer path is production-gated and byte-identical
(`q12-live-controller` 26/26, `q12-live-real-full-window` green under `MC2_Q12_REAL_PG17=1`);
frozen manifest `aaec6fc2…` and barrier `f98a2ce4…` unmoved.

Increment 5 boundary settled in the W7a plan: its real leg needs a real reviewed recovery
`manifest.json` plus the recovered Supabase `file_catalog` rows, which exist only once the real
`source.forward` has run — so it IS the window's own forward leg, not a rehearsal that could
precede it. `mc2-1sns3` therefore closes at increment 4b.

## Window identity and capability rulings (2026-07-28)

`--release-sha` = `23dfe973f18cc6067d386b6eb683bf6906142165`, settled from artefacts:

- `.env.green` pins `api@sha256:2f713f87…`, whose `org.opencontainers.image.revision` label on the
  host IS `23dfe973f…`; `web@sha256:ca9afb99…` labels `50f670b9`, and
  `git diff 50f670b9..23dfe973f -- packages/web packages/shared-types packages/shared-utils` is
  empty, so the pair is an exact per-package build of tree `23dfe973f`;
- `.env.production` pins `QDRANT_OPERATOR_IMAGE_SHA256=b5eb528e…`, and that image's revision label
  IS `060b4faea` — the OPERATOR artifact, a different thing;
- `git show 060b4faea` touched only `.codex/`, `deploy/qdrant/`, `docs/` and tests: no application
  source, so no app image was ever built from it;
- the staged run root's own `expected-post-migration-catalog.json` already records
  `release_sha 23dfe973f…`.

`mc2-sdbua`'s closure is therefore SUPERSEDED: it ruled on the now-spent run root `0fa297e4` and
re-made exactly the operator-image/app-release conflation `mc2-v7547` corrected later the same day
(and which re-pinned `.env.green` to this pair). No re-plan; `--expected-catalog-sha256` stays
`6be37e858e4fbd473a298cd1dfdaf49906e2c9964982801b39e1ac6104f7aaaa`.

`secrets/db-capability`: RE-MINT per run root, answered from the barrier's code without an owner
decision. `q12-database-barrier.sh:210` binds only the PATH to the run id, validates 0400 +
non-symlink + O_NOFOLLOW identity stability (`:230`, `:285`) and records the digest into THAT root's
own receipts (`:646`, `:2034`); `install` INSERTs `q12_guard.active_run(run_id, capability_sha256,
…)` from the session GUCs (`:945-948`), and `assert_capability` (`:984`) /
`assert_controller_binding` (`:999`) compare only against that freshly-inserted row, which an UPDATE
may not change (`:1059`). The value is a per-run nonce with no external counterpart. Probe C4 reads
zero `q12_guard` residue, so a byte-identical carry-over would also have worked; re-minting was
chosen because the same 65-byte value was staged into ten run roots across the nine burned attempts,
one of which (#9) installed the guard and published its digest. `accepted-coverage-run` is
deterministic and not secret, so it was copied byte-identically
(`catalog:a417a99c-db3a-45c8-9d32-561d8d068a3e`, 45 bytes, 0400).

## Window attempt #10 and `mc2-lzft4` — the probe carried the substitution (2026-07-28)

The eleventh instance of the environment-substitution class, and the first one where the PROBE built
to catch the class was itself the thing that substituted.

The attempt was set up cleanly: `mc2-1sns3` closed, the `--release-sha` identity ruled from
artefacts, a freshly minted capability and the coverage authority staged into run root
`6544c7dd-e680-462d-bf8f-5db8fc01c9b6` (0700; `accepted-coverage-run` 0400, `secrets/db-capability`
0400 and distinct from all ten priors), the deployed tree reinstalled from `develop` at tree
`1725a2df3`, and a pre-flight at `2026-07-28T15:57:11Z` reading 22 `pass` / 3 `unprovable` with
evidence (C5, C6, H4) / 0 `fail`, which `--assert-fresh-report` accepted.

It ran detached under `/usr/bin/python3.13` (runbook §2) with the settled argv and
`--stop-after deploy.prepare`, wrote 11 durable journal rows — `operator.self-check` accepted,
`barrier.install` completed (production entered `maintenance_guarded`), `writers.quiesce` at
`capability_claimed` — and then its child refused at its FIRST check:

    source-recovery host wrapper: writer resume controller must have exact root ownership and mode 0644

`/opt/megacampus/deploy/qdrant/q12-writer-resume.py` was deployed `root:root 0444`.
`source-recovery-run.sh:246-248` demands EXACTLY `root:root 0644` — the `mc2-jhqpw` hardening, so the
operator account cannot rewrite the privileged child. The tracked
`deploy/qdrant/q12-deployed-asset-manifest.json` DECLARES `0444` for that path, because the manifest
derivation is "mode 0555 where git marks the file executable, else 0444" — a repo-side heuristic that
is simply wrong for this one root-owned asset. Probe H2 asserts mode and owner AGAINST THAT MANIFEST,
so it passed on a host the consumer rejects, and `mc2-jhqpw` (fixed 2026-07-26) had regressed
silently when a 2026-07-28 reinstall re-applied the manifest's `0444`.

No writer was quiesced: the wrapper refuses before acting, and the production worker containers
stayed up 3 weeks / 26 hours untouched. The cost was the run-id and ~9 minutes of guarded production.

RESTORE. The barrier's own `rollback` command was tried FIRST and refused fail-closed —
`missing database lifecycle`, because the journal carries no `barrier.rollback` lifecycle rows and
the controller's supervisor `OPERATIONS` tuple (`install`, `verify-after-base`,
`verify-after-observability`, `prepare-recovery`, `activate`) does not expose rollback. That is why
attempt #9 was restored by hand, and this one was restored the same way: `write_restore_sql true`
(`drop_schema=true`) was extracted programmatically from the DEPLOYED `q12-database-barrier.sh`
(rendered SQL sha256 `2f11b8ed5f8677d2f8a8c657771e833777822fc66ed8aab82ce233d6a5fb0eb0`, verified
byte-identical when rendered from the repo copy) and executed under THIS run's capability by a
one-off runner mirroring the barrier's own database-identity check, CA sha256 check, session proof
and `set_config` GUC binding. The secret was referenced by path and never printed.

Verified read-only afterwards: C4 zero `q12_guard` residue (was schemas=1, relations=8, functions=10,
triggers=158, event_triggers=1), C2 8 cron jobs active, C3 queue empty, A5/B4/D1/E1/E2 `pass`;
`pg_db_role_setting` for the database back to exactly `['app.settings.jwt_exp=3600']` with no
`default_transaction_read_only`; a fresh session reads `default_transaction_read_only=off`; every
production container up and healthy (`api-blue`, `web-blue`, workers); `cutover.lock` free.

Second finding (`mc2-e21lo`): the restore's trailing
`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres' AND pid<>pg_backend_pid()`
failed with `permission denied to terminate process` — the production `postgres` role cannot
terminate `supabase_admin` backends. It runs AFTER `COMMIT`, so nothing was lost, and Supavisor had
already recycled every app backend; but the same statement is on the activate rendering too, so both
paths end on a statement the production role cannot execute.

Third finding (`mc2-zls0f`): `q12-live-cutover.sh` execs `/usr/bin/python3`, which is 3.12.3 on the
host while the runbook requires 3.13+. It did not bite (the only consumer of
`POSIX_SPAWN_CLOSEFROM` is `d6_spawn_probe`, which has no caller in the controller) and the window
was invoked directly under `/usr/bin/python3.13` with the gate run by hand, but no probe asserts
which interpreter the wrapper resolves.

The host file is `root:root 0644` again, so H2 now reports the truth —
`the deployed tree differs from the manifest at 1 point(s): deploy/qdrant/q12-writer-resume.py
(mode 0444 -> 0644)` — and the gate blocks a reopen until the manifest is corrected. A true red
instead of a false green.

## `mc2-lzft4` — the probe asserted the wrong expected value (2026-07-28, `62461e172`)

Window attempt #10 burned its run-id at C2 because `/opt/megacampus/deploy/qdrant/q12-writer-resume.py`
was deployed `root:root 0444` while `deploy/qdrant/source-recovery-run.sh:247` compares
`stat -c '%u:%g:%a'` against `'0:0:644'` and refuses anything else. The tracked
`deploy/qdrant/q12-deployed-asset-manifest.json` DECLARED `0444` — it derived the mode from the git
executable bit — and probe H2 asserts mode and owner AGAINST that manifest, so H2 passed on a host
the window's own child rejects. The `mc2-jhqpw` hardening (root-owned so the operator account cannot
rewrite the privileged child, but readable by the operator that reads it) had regressed silently
when a reinstall re-applied the manifest's value.

FIX. `q12-window-preflight.py` grew `CONSUMER_REQUIRED_IDENTITY`: where a consuming script asserts
an exact identity of its own, that assertion — not the heuristic — is what the manifest declares.
The emitter now fails CLOSED in both directions: `assert_consumer_identity_assertions` re-reads the
consumer's own bytes for the exact assertion the pin was derived from and refuses to emit if it is
gone, and `build_asset_manifest` refuses to emit a manifest that would leave a pinned asset out of
the asset set entirely (the rename hole). The derivation string records the new rule.

TESTS (`tests/unit/ops/q12-asset-manifest-consumer-identity.test.ts`, 5). The first reads the
wrapper directly, regex-extracts `0:0:644`, and asserts the tracked manifest declares
`root:root 0644` — so the two cannot drift again without a red, without trusting the pin table. The
others prove the pin is live against the consumer, that a fresh emission and the tracked file agree
on every pinned path, and that both fail-closed guards bite (drifted consumer; pinned-but-unlisted
asset). RED proven at the parent commit (manifest `root:root:0444` vs the wrapper's `0:0:644`).

GATES. `pnpm type-check` 0, `pnpm build` 0, `tests/unit/ops` 1303/1303 across 67 files run SERIALLY
(`--maxWorkers=1`, exit 0) — which also retires the earlier parallelism-only `q12-live-cutover`
timeout — `q12-window-preflight.test.ts` 43/43 with the gated H2 host probes, process verification
OK. Frozen manifest `aaec6fc2…` and barrier `f98a2ce4…` unmoved.

DEPLOYED. Exactly two assets differed; both backed up to
`/opt/megacampus/backups/q12-assets/20260728T183536Z/` and installed with the manifest's declared
identity. H2 afterwards: "all 26 deployed assets are byte-equal to the manifest generated from tree
`d7471efe956f…`".

## A CI failure that was a test defect, not a product defect (2026-07-28, `8b53e9e43`)

CI run 30387943748 failed on the W7a recover-threading test's head-1 leg with `reached=false`.
Reproduced exactly under `python:3.12-slim`: the head-1 walk publishes a run-root resource manifest,
and `ensure_directory` (`q12-lifecycle-core.py:527-532`) refuses any run-root directory whose owner
is not uid/gid 1000 — `unsafe directory identity`. That refusal is CORRECT production code (the
controller identity is `claude-deploy`), and it is the bound `q12-real-controller-gate.ts` already
documents: GitHub-hosted runners execute as uid 1001.

Head 1 now runs under `RUN_REAL_CONTROLLER`, with the Python runner honouring
`MC2_Q12_REAL_CONTROLLER` at the same precedence so the harness and the test agree on ONE signal
rather than two that can disagree. Where the leg cannot be driven the runner emits `skipped` plus
the concrete reason and a `skipIf` test asserts that bound is STATED — a leg that never ran must not
read as green. Head 4 reaches its observation point without creating a run-root directory and stays
ungated on every runner. Both paths verified green locally (uid 1000, and forced off).

## Window attempt #11 and `mc2-awi6q` — the fixture carried the substitution (2026-07-28)

PREPARATION, all of it green. The Q12 tree was reinstalled from `develop` and H2 re-proven. A fresh
`plan` ran detached under `/usr/bin/python3.13` for a fresh run-id
`8915724a-23ba-42f1-8c25-c08110ca5dc6` and returned `status: planned`, `release_sha
23dfe973f18cc6067d386b6eb683bf6906142165`, `expected_catalog_sha256
1465ab2335b3a43192497d98ceade816b0c769b210178b355e4e2fee1f114342` (taken from `sha256sum` of THAT
root's own catalog file, never retyped). The run root was staged 0700 with `accepted-coverage-run`
0400 carrying `catalog:a417a99c-db3a-45c8-9d32-561d8d068a3e` and a FRESHLY MINTED
`secrets/db-capability` 0400. Runbook preconditions re-verified: the emit CLI smoke fails with the
usage message (not a module-resolution error), `q12-privileged-launch.sh` is `root:root 0555`,
`fs.protected_hardlinks` is 1, and both `.env.blue`/`.env.green` define `WEB_IMAGE` and `API_IMAGE`.
`.env.production` still pins operator digest `b5eb528e…` and that image is present locally. CI was
green at `8b53e9e43`, `Deploy to Dev` was SKIPPED (test-only change), and dev containers were 4
hours old, so H4's host legs were quiet. The 25-probe pre-flight exited 0: 22 `pass`, and C5, C6, H4
`unprovable` each with a named evidence pointer.

THE ATTEMPT. Opened detached at 19:14Z to `--stop-after deploy.prepare`. It cleared C1 — with
`mc2-lzft4` fixed the wrapper's ownership gate passed and C2's child RAN FOR THE FIRST TIME in
production — and the child refused at once:

```
ResumeError: writer quiesce journal graph is invalid   (q12-writer-resume.py:1053 -> :507 -> :80)
```

11 durable rows, receipt `maintenance_guarded`, head `quiesced/capability_claimed`. No writer was
quiesced. Production was guarded for about five minutes.

ROOT CAUSE, from the real journal and the real capability files:

```
quiesced intent             capability_manifest_sha256 = 9c8cb181ef89ed15…
quiesced capability_issued  capability_manifest_sha256 = f6d52d9bd21256d8…
quiesced capability_claimed capability_manifest_sha256 = f6d52d9bd21256d8…
sha256(capabilities/claimed/writers.quiesce--cutover.json)   = f6d52d9bd21256d8…
sha256(capabilities/completed/barrier.install--cutover.json) = 9c8cb181ef89ed15…
```

Issued and claimed match `opened.digest` exactly; the intent row carries the PREDECESSOR command's
capability digest, inherited forward. `q12-writer-resume.py:509` requires the quiesce intent row to
be 64 zeroes and fails closed on the inherited value.

THE CONTROLLER IS NORMATIVE. The ratified D5J amendment freezes inheritance in as many words —
"the next barrier intent inherits it unchanged as `H.capability_manifest_sha256`"
(`…specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md` item 6) — and the retained-barrier
provenance addendum describes the same `H` inheritance. The `intent.capability_manifest_sha256 ==
0×64` rule is real but belongs ONLY to the `barrier.cleanup` lifecycle
(`…specs/2026-07-17-q12-live-controller-design.md:636`, `:867`), which is exactly the distinction
the controller's own grammar validator already makes: ZERO for the cleanup intent
(`q12-lifecycle-core.py:335`), phase-only for ordinary intents (`:356-358`), with the digest set by
`selector_intent_from_head`'s carry rule (`:2711`).

WHY IT SURVIVED THE SUITE. The runtime fixture that exercises this validator defaults
`capabilityManifestSha256` to `'0'.repeat(64)` and appends `append('quiesced','intent')` with it
(`qdrant-source-recovery-runtime.test.ts:1418`, `:1449`). The child agrees with the FIXTURE, and the
fixture's journal is not the one the controller writes. That is the twelfth instance of the
environment-substitution class and the second in two days where the checking artefact — first the
probe (`mc2-lzft4`), now the fixture — carried the substitution itself.

NOT FIXED HERE, deliberately: `deploy/qdrant/q12-writer-resume.py` is outside the authorised write
zone and is the privileged child that stops production writers; the stop rule for a new instance of
this class is to file and report. It is NOT byte-frozen (the W-tuple guard pins only field 2
`q12-command-manifest.json` and field 4 `q12-database-barrier.sh`), so the fix does not move a
frozen artefact — but it does move the asset manifest, which must be re-emitted, redeployed and
re-proven through H2. Full proposal on `mc2-awi6q`.

RESTORE. The barrier's own restore block was rendered from the DEPLOYED barrier
(`write_restore_sql true`, `drop_schema=true`) to rendered SQL sha256
`2f11b8ed5f8677d2f8a8c657771e833777822fc66ed8aab82ce233d6a5fb0eb0` — BYTE-IDENTICAL to the block
used for attempt #10 — and executed under this run's capability with the barrier's exact database
identity, CA digest and session proof. Post-restore pre-flight `--scope database` exits 0: A1-A7,
B1-B4, C1-C4 (zero `q12_guard` residue, 8 cron jobs active, queue empty), D1, E1, E2 all pass; C5/C6
unprovable with evidence. Every production container healthy. Only the post-COMMIT
`pg_terminate_backend` tail failed again — `mc2-e21lo`, unchanged.

STRUCTURAL-CATALOG NOTE (`mc2-ivjyb`). `baseline_structural_sha256` had moved from `a2b25324…`
(12:56Z plan, and confirmed identical in the attempt-#10 barrier baseline at 16:00Z) to `93ca595a…`
(20:44Z plan). Two full captures of the same frozen projection 75 s apart are byte-identical in all
41 sections, and `migration_frontier` is `20260704150249` with 317 rows at both ends, so nothing
volatile and no migration explains it; the plan's restore-completeness gate passed against current
production, so nothing is missing. The pre-change payload in the same projection no longer exists
(plan reclaims its workdir; the two surviving run-root artefacts are different projections with
different identity shapes), so the CONTENT of the delta is unprovable from disk. Attempt #11 then
settled the important half: D1 reported `93ca595a…` both immediately before the window and after the
restore, so a barrier install plus the restore block is structurally NEUTRAL and the earlier change
did not come from the restore path. The remaining action is only to keep one
`plan --keep-equality-diagnostics` source payload so the next comparison is provable.

## Window attempts #12 and #13 — C1 and C2 cleared, blocker moved to C3 (2026-07-29)

`mc2-awi6q` TURNED OUT TO BE TWO GAPS. The filed one was the carry rule: the child demanded the
`writers.quiesce` INTENT row carry `0×64`, while the controller carries the predecessor command's
capability digest forward (ratified D5J item 6, and the controller's own
`selector_intent_from_head`/`append_ordinary_lifecycle`). The child now requires that row to equal
the PRECEDING journal row's digest exactly — a corrected expectation, not a relaxed one, and `0×64`
only when the journal is empty. Past that check a second gap appeared: the child reads
`writer-quiesce-capability-checkpoint-<run-id>-<epoch>.json` (the 12-key projection of the intent
row, whose sha256 IS the capability's `capability_input_checkpoint_sha256`) and
`writer-quiesce-input-checkpoint-<run-id>-<epoch>.json` (the claimed-boundary head, byte-identical
to `phase-checkpoint.json`). The controller computed the first digest and wrote it into the
capability but published NEITHER FILE — the exact mc2-orsez shape, invisible for the same reason:
the runtime fixtures published these files themselves. `Engine.publish_writer_quiesce_child_checkpoint`
now publishes both at the boundaries their contents are taken from and asserts the journal head
rather than assuming it.

THE PLAN IS PERISHABLE (`mc2-0ie27`). Between the two attempts, D1 refused a run root whose plan was
19 minutes old: the plan captured `93ca595a…`, the live database hashed `1a0ac0f0…`, stable on
re-measurement, both under the same pinned `search_path=pg_catalog` (so not the mc2-2rzf6 projection
difference). The highest OIDs in the whole database named the cause: `realtime.messages_2026_08_01`
and its index/pkey. Supabase Realtime keeps a rolling ~7-day window of DAILY partitions of
`realtime.messages` and rotates them on its own service timer — no pg_cron entry, so C2 stays green
— and each create/drop moves the structural catalog the barrier re-measures at C1. D1 is the
detector and it worked: it refused BEFORE the window opened, with zero production mutation. The
mitigation used since is to keep plan → open to a few minutes.

`mc2-1kcbv` — THE WRITER INVENTORY SWEPT WHOLE COMPOSE PROJECTS. Attempt #12 (07:19Z) cleared C1 and
the C2 child ran past both mc2-awi6q gaps into the Docker inventory, where it refused: "writer
quiesce inventory is not exact" (`:961`). It swept `docker ps -aq --filter
label=com.docker.compose.project=<p>` over `megacampus-blue`, `megacampus-green` and `megacampus`
and demanded exactly ten. On production `megacampus` also carries redis, qdrant, qdrant-dev,
docling-mcp, docling-mcp-internal, notebooklm-bridge and notebooklm-bridge-dev — SEVENTEEN. Worse
than the count: had it matched, the classifier one line later ("not api/web, so a worker") would
have labelled redis a `production-worker` and stopped it. The fixture that covered this had exactly
ten containers in the projects, so a sweep and a selection were indistinguishable. The ten writer
SERVICES are now frozen beside `CLASSES` and each is selected with a second label filter.

BOTH FIXES ARE COVERED BY SUITES THAT DRIVE THE REAL CHILD FROM THE REAL CONTROLLER.
`q12-quiesce-child-input-contract.test.ts` (7 tests) drives `Engine.append_ordinary_lifecycle` and
launches the actual `q12-writer-resume.py` from `execute_ordinary` to its `before-inventory`
boundary; it publishes neither checkpoint itself, withdraws each in turn to prove they are
load-bearing, and re-runs the child with the pre-fix `0×64` expression restored, which reproduces
the production message verbatim. `q12-quiesce-writer-inventory.test.ts` (4 tests) does the same to
the `after-inventory` boundary against a fake `docker` seeded with production's REAL composition —
captured read-only, labels and state only, never container env, with each writer's real healthcheck
presence, restart policy `unless-stopped:0` and compose file — and covers production as it is, the
pre-fix sweep restored, a writer removed, and a new platform service added.

ATTEMPT #13 (07:58Z) CLEARED C1 AND C2. Sixteen journal rows: the writer quiesce inventoried the ten
writers, set their restart policies to `no`, stopped api/web, satisfied `probe_closed_inbound()`
against the REAL nginx, stopped the workers, published the final manifest and had it ACCEPTED. It
then died at C3: `Supabase backup failed: pg_dumpall before snapshot failed with status 1`, and
nothing else — `backup-supabase.sh` routes that step's stderr into a file under the run-private
generation directory that `fail` never reads and cleanup reclaims. Filed `mc2-1cxna` and FIXED the
discard in the same pass (`fail_command` prints a bounded, credential-redacted tail; five call
sites). Ruled out read-only afterwards: the identical command with the identical flags, DSN, CA and
libpq service shape exits 0 with 7943 bytes and EMPTY stderr on the restored database, so the cause
lives in the guarded-window state — candidates are the barrier's `ALTER DATABASE postgres SET
default_transaction_read_only=on`, the pooler after C2 terminated backends, or a pooler connection
limit.

RECOVERY FROM #13, the first attempt that actually stopped writers (production down 07:59Z-08:03Z):
(1) the barrier's OWN rendered `$restore$` (sha256 `2f11b8ed…`, byte-identical to #10/#11/#12) under
that run's capability, then (2) every writer replayed from THAT RUN'S OWN
`writer-quiesce-<run-id>.json` — `docker update --restart` back to each recorded prior policy
(`unless-stopped`), then `docker start` where `prior_running` was true. Verified after: 17
containers up and healthy, `https://ai.megacampus.ru/` and `https://dev.ai.megacampus.ru/` both 200,
database-scope pre-flight EXIT=0 with C4 zero `q12_guard` residue and D1 back at `1a0ac0f0…`. Only
the post-COMMIT `pg_terminate_backend` tail failed again (`mc2-e21lo`).

READ-ONLY CHECKS DONE MEANWHILE, so the next attempt has fewer unknowns: no `error_page` or
`charset` override in `/etc/nginx`, so nginx serves its standard error template — which is
byte-for-byte what the child expects; `Server: nginx/1.24.0 (Ubuntu)` matches the child's regex; TLS
validates for both hostnames over `--resolve` to 127.0.0.1; and every one of the ten writers' real
state matches every field `validate_quiesce_writers` checks.

## Window attempts #14 and #15 — C3's two causes, both named by the diagnostics fix (2026-07-29)

`mc2-1cxna` CAUSE ONE — libpq could not stat its default client certificate. Attempt #14 printed
what attempt #13 had discarded: `pg_dumpall: error: connection to server ... failed: could not open
certificate file "/root/.postgresql/postgresql.crt": Permission denied`. The FROZEN pg.backup
manifest env pins `HOME=/root` while the command runs as the deploy operator, and libpq resolves
its default client certificate under `$HOME`. `/root` is 0700 root-owned, so the stat fails with
EACCES rather than "absent" — and libpq treats "cannot determine" as fatal. `/root/.postgresql` does
not even exist; the unreadable parent is the whole failure. Proven on production read-only in both
directions: the identical command exits 1 with exactly that message under `HOME=/root` and exits 0
with 7943 bytes and empty stderr under a run-private HOME. The manifest cannot move, so the script
hands every libpq child `HOME="$TEMP_GENERATION"` — its own adopted 0700 directory, which exists and
holds no `.postgresql`. The barrier was never affected because it drives SQL through node-postgres,
not libpq.

`mc2-1cxna` CAUSE TWO — `/proc/self/fd/N` does not survive the generator's spawn chain. Attempt #15
got BOTH REAL DUMPS through against production and died at `source manifest failed: EACCES:
permission denied, open '/proc/self/fd/14'`. The script already documents this hazard for the
adopted CA in as many words; the two q12-only arguments (`--baseline`, `--expected-catalog`) never
got the same treatment because nothing had ever run the q12 branch. In the generator's own process
that descriptor number resolves to one of ITS descriptors. Both inputs are now materialized into the
run-private generation directory at 0600, byte-verified against the descriptor they came from, and
REMOVED before publication — the published generation must contain exactly four files, and the
existing operator suite caught that second half immediately rather than production doing it.

WHAT MADE BOTH DIAGNOSABLE. `backup-supabase.sh` routed five steps' stderr into a run-private file
that `fail` never read and cleanup then reclaimed, so attempt #13 reported a bare status. The first
pass of `mc2-1cxna` added `fail_command`, which prints a bounded, credential-redacted tail before
failing. Every attempt since has named its own failure on the first try. That change paid for itself
twice in one afternoon.

COST AND RECOVERY. Attempts #13-#15 each stopped the writers, so production was really down: about
four minutes each for #13/#14, and about sixteen for #15 because the real dumps ran to completion.
The recovery is now routine and proven: the barrier's own rendered `$restore$` under that run's
capability, then the ten writers replayed from THAT RUN'S OWN `writer-quiesce-<run-id>.json`. After
each: 17 containers up, both public hosts 200, database-scope pre-flight EXIT=0, C4 zero residue,
D1 back at `1a0ac0f0…`.

## Window attempt #16 — C3 cleared, and the same HOME cause a third time at C4 (2026-07-29)

`pg.backup` ran to COMPLETION against production: 20 journal rows through `backup_committed/
completed`, the real `pg_dumpall`, `pg_dump`, source manifest and both `pg_restore` validation
passes. C4's restore drill then died on `restore image index lookup failed`, with
`WARNING: Error loading config file: open /root/.docker/config.json: permission denied` beside it.

Third face of the same cause. `restore-supabase-drill.sh` runs under the frozen pg.restore env's
`HOME=/root` as the deploy operator; the docker CLI aborts loading `$HOME/.docker/config.json` with
EACCES and then never discovers its CLI plugins, so `docker buildx imagetools inspect "$RESTORE_TAG"
--raw` degrades into `unknown flag: --raw`. Reproduced and cured on the host read-only: the same
argv prints exactly that under `HOME=/root` and returns the OCI image index for
`public.ecr.aws/supabase/postgres:17.6.1.064` under a stat-able HOME. The buildx plugin was never
missing — it is in `/usr/libexec/docker/cli-plugins`. The drill now exports its adopted private temp
root as HOME inside `create_temp_root`, after the 0700 directory exists and before any child runs.

THE LESSON, now three times over in one afternoon: the frozen manifest env pins `HOME=/root` for
every privileged command, while the commands run as the deploy operator. Any child that resolves
something under `$HOME` — libpq's default client certificate, the docker CLI's config and plugin
directory — fails with EACCES rather than falling back, because an unreadable parent is not the
same as an absent file. When adding a consumer to a frozen-env command, give it a HOME it can stat.

## `mc2-bh3ef` — group G, the frozen-env surface of every manifest command (2026-07-29)

Sixteen attempts, five defects in one day, and not one of them logic. Three were the same cause in
three different consumers. The pre-flight had twenty-five probes and none of them measured the
environment the twenty FROZEN commands are handed — groups A-E measure the database, group H the
deployed bytes. Group G closes that reach, for all twenty commands including the ten that have
never run in a window.

- **G1** — `$HOME` per command, per identity. Nineteen commands run as uid 1000 and declare
  `HOME=/root`; `source.forward` runs as root through the argv-whitelist launcher, where the same
  `/root` IS usable, and that difference is measured rather than assumed. A command passes when its
  HOME is usable, when a consumer repairs it, or when nothing in its chain resolves under `$HOME`.
- **G2** — docker CLI plugin discovery, measured under the frozen env verbatim (absent: the C4
  defect, measured rather than recalled) and under the repair the consumer itself establishes,
  executed from the deployed bytes where the shared normalization block exists.
- **G3** — libpq through the POOLED DSN under each frozen env that needs one, both ways.
- **G4** — `/proc/self/fd/N` argv paths, in two halves: the property measured against a real child
  that does not hold the descriptor, and every deployed chain member scanned for a surviving
  dependence, including through a variable — which is how the real 2026-07-29 call site read as
  innocent, since neither `tsx` nor the child is named on the line that spawns them.

TWO REPAIR SHAPES, and the difference is load-bearing. An `export HOME=…` covers the process and
everything it spawns; a `HOME=… <command>` prefix covers exactly that invocation, so the next call
added beside it inherits `/root` again. G1 holds the second shape to a per-invocation rule over
logical lines — which is the rule that catches the NEXT libpq call, not the last one.

NOTHING IS DECLARED THAT CAN BE DERIVED. Consumer sets come from the deployed bytes; repairs are
pinned to a token in the consumer's own file, so one refactored away is a `fail`; exemptions name the
exact consumer classes they cover and are revoked automatically when the consumer reaches further —
`q12-writer-resume.py` is exempt because it reaches only docker's built-in verbs AND because it
asserts `dict(os.environ) == EXPECTED_ENVIRONMENT` with `HOME=/root`, so a repair cannot live there
at all. A behavioural claim ("pnpm warns and continues") is re-measured under the frozen env on every
run, and where the binary is absent G1 is `unprovable` with that gap NAMED, never a pass.

Two false-positive classes were removed by measurement, not by loosening: a filename
(`.pg_dump.stderr`) is not a binary, and an offline `pg_restore --list` opens no connection, so a
libpq call site counts only where the same logical line establishes one. Both had made G1 flag
thirty-eight innocent lines — and a probe that cries wolf closes the window just as hard as one that
sleeps through it.

EVERY PROBE IS SHOWN RED against the state that produced the 2026-07-29 defects, in
`q12-window-preflight.test.ts` § "the frozen-env surface (group G)": the repair removed from a
scratch copy of `backup-supabase.sh` and of `restore-supabase-drill.sh`, the shared block removed
from `operator-compose.sh`, the `/proc/self/fd` argv reinstated on the generator's spawn chain, a
plugin verb introduced into the exempted writer child, and a twenty-first command whose entry point
group G cannot read. Plus the inverse, which matters just as much: a frozen HOME the identity CAN
use passes outright, so the probe is not a constant refusal.

## `mc2-rjy9k` — the data-movement children against the plan's isolate (2026-07-29)

Group G catches "this child cannot START in its environment". This harness is the second net.
`packages/course-gen-platform/tests/unit/ops/fixtures/q12-isolate-dry-run-runner.py` reuses the
isolate the plan's persist seam already hands back (`restore-persist-handle.json`) as a TARGET: no
writer stopped, no guard installed, no run-id burnt, production never written.

It drives `migration.base.apply` and `migration.observability.apply` — the real frozen argv, byte-
identical except for the three credential PATHS, under the command's own frozen env. Those two have
NEVER executed: sixteen attempts died at or before C4, the command immediately before them.

What it cannot carry is structural, not awkward. `source.forward`, `reindex.plan`,
`reindex.worker.create`, `reindex.execute`, `reindex.verify` and `deploy.prepare` each mount or
verify `database-barrier-receipt.json` / `database-barrier-probe-receipt.json`, which only
`barrier.activate` mints; fabricating one to reach them would be the exact substitution this stage
exists to stop. They stay in-window residuals with the barrier's dual-bind,
`quiesce_client_backends` and `probe_closed_inbound`'s real nginx 502/503. A vanilla PostgreSQL
17.10 is not a substitute for the isolate either — the document-evidence migration manifest hashes
fail there — so without a bound handle every child is reported `skipped` with that reason, which is
what CI asserts.

## What the dry run found on its first use (2026-07-29)

Two defects on the C4 path, both read-only, with no writer stopped, no guard installed, no run-id
burnt and zero production downtime. Sixteen window attempts cost ~40 minutes of waiting and 4-16
minutes of real outage each to learn one thing; this cost neither.

**One, fixed.** `restore-supabase-drill.sh` ran `ALTER DATABASE restore_test SET
default_transaction_read_only='on'` without the read-only override the rest of the script already
carries. `database-post.sql` replays the SOURCE's captured `ALTER DATABASE … SET` values, and a Q12
generation is dumped at C3 — after C1's barrier has set `default_transaction_read_only = on` on
production. The replay hands restore_test that default, every session opened afterwards inherits it,
and the statement dies with `cannot execute ALTER DATABASE in a read-only transaction`. The value
being set is the one already in force, so it is a no-op that still fails the window. Fixed with the
file's own remedy (`PGOPTIONS='-c default_transaction_read_only=off'`, spelled out rather than routed
through the helper, because in bash an assignment before a FUNCTION call stays in effect afterwards).

**Two, `mc2-wl5vn`, OPEN and owner-gated.** With that cleared the drill reached the archive restore
and supautils refused:

```
ERROR: Superuser owned event trigger must execute a superuser owned function
DETAIL: The current user "supabase_admin" is a superuser and the function
        "q12_guard.enforce_ddl_barrier" is owned by a non-superuser
```

The dump carries the whole guard — `SCHEMA q12_guard postgres`, `FUNCTION q12_guard
enforce_ddl_barrier() postgres`, the event trigger — because C3 dumps a database C1 has already
guarded. The ownership split is deliberate (`mc2-ipwyc`): the guard belongs to the managed
non-superuser so the barrier can disarm what it armed. The restore reverses the pairing — a
superuser-owned event trigger executing a non-superuser-owned function — and supautils rejects
exactly that. The pg_restore invocation is common to both drill modes, so the window hits it
identically.

This is NOT the environment class. It is the design meeting supautils, and it has never been seen
because C4 has never got this far. The remedy is a real design choice with four candidates recorded
on the bead, so the window stays shut until the owner rules.

**And a third thing, smaller.** `fail 'strict archive restore failed'` threw the reason away: every
log this drill captures lives under a TEMP_ROOT that `on_exit` reclaims unconditionally. The
`mc2-94mmf` remedy is now applied here too — `fail_with_log` carries the scrubbed tail of the
captured log — which is what turned a one-line refusal into the diagnosis above. Inside a window,
with the writers already stopped, that difference is the whole cost of an attempt.

## `mc2-wl5vn` — the owner's remedy (a), and what it uncovered (2026-07-30)

The owner ruled remedy (a): skip exactly the guard's event trigger, and state the skip. Implemented
in `restore-supabase-drill.sh` as `build_restore_toc`, which runs inside `validate_generation` —
before any container exists, so a defect in the archive's guard shape costs nothing to find.

**Derived, never declared.** The drill names no trigger. Each `EVENT TRIGGER` TOC entry is extracted
from the archive through a one-entry `--use-list` and skipped only if the archive's own SQL says it
executes a `q12_guard` function. An unguarded archive therefore excludes nothing, a guard renamed
upstream is still caught, and a production event trigger that is not the guard's is still restored.
A `COMMENT` or `SECURITY LABEL` on a skipped trigger follows it; an entry whose SQL cannot be parsed
fails closed; and the rewrite itself is checked to be a pure comment-out of exactly the derived
lines, because a use-list that silently lost an entry would restore a quietly smaller database and
every comparison downstream would still be measuring the archive.

**What it narrows, stated.** The isolate is no longer a full replay of the archive. What it does not
narrow: the offline full traversal still reads every entry and the pgTLE scanner still sees the
whole stream; `q12-source-manifest.ts` captures `pg_trigger` and never `pg_event_trigger`, and
`q12-structural-catalog.sql:975` already excludes this trigger by name, so no comparison ever
observed the skipped object; and the activation cleanup's `DROP SCHEMA q12_guard CASCADE` is what
deleted it on a full replay anyway, moments later.

**Proven on the real archives, not only in fixtures.** Attempt #16's guarded generation
`20260729T113039Z-96741f4b`: 3525 entries, exactly 1 skipped, the six Supabase event triggers
(`issue_graphql_placeholder`, `issue_pg_cron_access`, `issue_pg_graphql_access`,
`issue_pg_net_access`, `pgrst_ddl_watch`, `pgrst_drop_watch`) untouched. The nightly unguarded
`20260729T223006Z-74f805da`: 3335 entries, 0 skipped, produced list byte-identical to the TOC. Full
drill against the guarded generation: `pg_restore` SUCCEEDED and `cluster-global inventory equality
passed`. Full drill against the nightly one: PASSED end to end, `restore size ratio=0.723494`,
`archive entries skipped: 0` — so the change is a no-op on the ordinary scheduled path, measured
rather than asserted. Seven unit cases run the SHIPPED `build_restore_toc` block, extracted from the
tracked script at run time, against a stubbed `pg_restore`; the load-bearing one is `unguarded`,
where the produced list must be byte-equal to the archive's own TOC, because the dangerous failure
is over-exclusion, not under-exclusion.

## What the dry run found on its SECOND use — `mc2-fxlne` (2026-07-30)

With the restore cleared the drill reached `compare --view cutover_snapshot`
(`restore-supabase-drill.sh:993`) and failed with four deltas. They are one cause, and it is not the
exclusion: `compare` was written for an UNGUARDED source.

- `/database/settings: source-only ["default_transaction_read_only","on"]` — `normalizeForTarget`
  (`q12-source-manifest.ts:841-852`) deliberately strips that setting from the target ("the drill
  pins the isolated copy read-only; the source is writable"); `normalizeSource` does not strip it
  from the source. A Q12 generation is dumped at C3, after C1's barrier set it on production.
- `/catalog/triggers` and `/catalog/object_owners`, source-only x2 —
  `net.http_request_queue.q12_guard_row` and `.q12_guard_truncate`. Twice unreachable:
  `net.http_request_queue` is a `pg_net` extension member, so `pg_dump` does not carry its triggers
  at all; and `isExternalGuardTrigger` (`:1094`) exists to filter exactly this pair, but is reached
  only from `filterApprovedGuardCatalog` (`:1103`), which is called only from `validateTransition`
  (`:1484`).
- `/catalog/object_acls`, target-only x4 — PUBLIC USAGE on the `q12_guard` row types.
  `approvedGuardIdentity` (`:1071-1079`) already covers those `type` identities, again only on the
  `validateTransition` path.

All the guard-aware machinery lives in `validateTransition` (baseline-vs-cutover, run at C3 during
capture). `compare` (source-vs-target, run at C4) has none of it, and a guarded generation had never
reached it — sixteen attempts died at or before C4 and the seventeenth died inside the restore.

Filed `mc2-fxlne` (P0) with four remedies and recommendation (a): make `compare` guard-aware for a
guarded source by reusing the SAME approved-guard predicates that already exist, so it tolerates
exactly the delta the C3 capture already declared approved and nothing more. It is a decision about
what C4 proves, of the same class the owner reserved when ruling on `mc2-wl5vn`, so the window stays
shut. `mc2-i9h3y` depends on it.

Both defects cost no downtime: read-only, no writer stopped, no guard installed, no run-id burnt,
against production's own generations. Sixteen window attempts cost ~40 minutes of waiting and 4-16
minutes of real outage each to learn one thing.

## 2026-07-31 — the Q12 window track is retired, and the ordinary source-recovery route is reopened

The window was abandoned on the owner's 2026-07-30/31 decision in favour of an ordinary release,
which succeeded: five migrations applied, 161 commits deployed, production off Qdrant Cloud,
pipeline green end to end for the first time since 2026-07-04. What was left was the vectors.

### The measurement that matters

Live production, measured 2026-07-31 and matching the 2026-07-24 audit EXACTLY:
`total 261, eligible 240, recoverable 109, missing 129, invalid 2, unsupported 21`. That equality is
what makes the frozen `plan-input.json` (run `a417a99c-…`) still valid: `source-recovery plan`
refuses unless the live inventory equals `EXACT_PRE_COUNTS`, and it does. Its 42 copies restore 125
`file_catalog` rows, taking `missing` from 129 to 4. `/opt/megacampus/data/uploads` holds 75 files
backing those 109 rows; the naive "261 rows − 75 files = 186 without a source" overcounts, because
mirror rows share one file. The honest figures are 131 eligible rows with no readable source today
(129 missing + 2 invalid) and 21 rows Stage 2 cannot process at all.

### Three defects closed the ordinary route; all three were found on the host

1. **Health asserted on a container that is not running.** Docker reports a stopped
   healthcheck-bearing container as `unhealthy` (measured on `megacampus-api-dev`:
   running→`healthy`, after `docker stop`→`unhealthy`). Both non-Q12 routes collect the writer
   inventory AFTER the writers are stopped, so `inspect_writer` and `current_writer_record` demanded
   a state no quiesced writer can be in. The wrapper's own `--stop-writers` branch escaped it only
   because it collects while they still run — and that branch is itself unreachable without Q12
   (`--stop-writers requires --database-barrier-receipt` → `Q12 writer quiesce requires
--q12-db-capability-file`), so the ordinary path documented in the wrapper's own `usage()` did
   not exist. Fixed; health is asserted only while the container runs.
2. **The operator image created both mount parents at 0555.** `assertOwnerOnlyStateDirectory`
   requires the PARENT of every owner-only input to be mode 0700 owned by the operator uid, so
   `source-recovery plan` refused its own bind-mounted plan input. A tmpfs at that path is NOT the
   fix and was measured failing: `compose run` does not nest these binds inside a tmpfs, and the
   plan input arrived as an empty 0755 directory. Fixed in the Dockerfile.
3. **CI wrote container paths into four Compose bind SOURCES.** `SOURCE_RECOVERY_*_HOST_DIR` /
   `_FILE` named `/run/source-recovery/...` in `.env.production`, so a Compose call made without the
   wrapper mounted empty root-owned directories over the real inputs. Invisible because the wrapper
   exports the correct values and the shell environment outranks `--env-file`. Now bound by test to
   the frozen command manifest, which already names every one of those paths.

THE PATTERN, again: the checked environment substituted for the consuming one. The suite's fake
`docker stop` left `Health` at `healthy`, which is why defect 1 stayed green through every run.

### One host-side repair, outside the code

All 42 copy targets land in 24 course directories that did not exist under
`/opt/megacampus/data/uploads`, and the recovery publisher contains no `mkdir` — `resolveRoots`
lstats the target directory and `publishNoReplace` only links into it. The 24 directories were
created with exactly the identity Stage 1 produces (`1001:1001` mode 0755, empty), which is the
precondition the shipped publisher was designed for. `preflightCopies` then passed for all 42.
Whether the recovery should create them itself is a real design question and is NOT fixed.

### Two production writer windows, both fully restored

07:49:31Z–07:50:05Z (34s) and 08:03:15Z–08:03:50Z (35s), owner-authorized. Both restored all ten
writers to `running` with `unless-stopped`, API/Web `healthy`, both public hosts 200. The first
proved defect 1 in production; the second proved the fix and reached the planner.

### The recovery completed, and what it took after the first three defects

Two more contradictions sat behind them, each reachable only once the previous one was cleared:

4. **The manifest had no mode both sides accepted.** `writeImmutableManifest` publishes through
   `link()` from a 0600 temporary and applied no published mode, so the planner produced 0600 while
   `source-recovery-run.sh` refuses a fresh plan whose manifest is not `1001:1001:400` and reads it
   back at 400. The planner's own successful output — `ok, 42 copies, 125 affected rows`, counts
   exactly the audited totals — was discarded by the next line. `readOwnerOnlyFile` then demanded
   0600 of the manifest from the other side, so no single file could satisfy both. The mode is now
   per artifact: manifest 0400, plan input and journal 0600.
5. **Three composed services could not run their own commands.** The disposition service was
   isolated from every upload tree, but `apply-dispositions` and `verify-dispositions` both
   re-derive `readSourceCounts()`, whose probe `realpath()`s the production upload root; the reindex
   service had no recovery-state mount at all; and `qdrant-operator` pinned
   `REDIS_URL=redis://redis:6379` while the deployed Redis answers only to `megacampus-redis`.

Both fixture patterns repeated: the manifest test asserted 0600 on the published file, and the
wrapper's fake planner performed the `chmod 0400` the real one omits.

FOUR production writer windows, all owner-authorized, all fully restored: 34s, 35s, 39s, 44s, 47s.
Every one ended with all ten writers `running` under `unless-stopped`, API/Web `healthy`, and both
public hosts 200.

RESULT. `forward exited 0`; journal `verified` at revision 94; 42 copies `published`; 24 dispositions
`disposition_verified`; uploads 75 → 117 files; live inventory `recoverable 109 / missing 129` →
`recoverable 234 / missing 4`, matching the reviewed `expected_post_counts` exactly. `reindex plan`
then returned `status=ok eligible=240 recoverable=234 audited_failed=6 unresolved=0`, and `execute`
began writing real vectors into `course_embeddings_v1` for the first time since the Cloud data was
lost.

### The honest document count

- **234** eligible documents have a readable source and are being reindexed.
- **6** eligible documents will never come back from a reindex: 4 whose source is absent from both
  upload roots and 2 whose `storage_path` is not a valid path under the upload root. These are the
  owner-approved failed dispositions in the reviewed manifest, not a new loss.
- **21** are not eligible for Stage 2 at all, every one of them for the same reason —
  `missing_course`: 18 Career Playbook markdown sources with `course_id` null, plus 3 others. They
  are the approved retained-derived-only dispositions.
- 261 total = 234 + 6 + 21. The "roughly 186 without a source" figure in the 2026-07-31 brief is
  `261 rows − 75 files`, which overcounts: mirror rows share one file, so 75 files backed 109 rows
  before the recovery and 117 files back 234 after it.

## 2026-07-31 (evening) — the reindex is partial, and the backups are half proven

`reindex verify` ran for the first time and told the truth the execute step had hidden:
`expected_documents=234 indexed_documents=186 expected_points=13382 indexed_points=11714
missing_documents=48 relevance_failures=2 action=repair`. Execute had said `completed=234 failed=0`
and exited 0.

Four further defects, all found after the five recorded above, all in code that had never run:

6. The operator entrypoint injected `--artifact` for `execute` and not for `verify`, so verify
   reached for the tool's relative default inside a `--rm` read-only container that no longer
   existed. `REINDEX_ERROR code=artifact_binding_mismatch`.
7. `loadIndexedDocumentIdentities` scrolled at limit 256 against a collection this repository
   creates with `strict_mode_config.max_query_limit` 100 — the same verify asserts that value is
   still in force. Qdrant: `Bad request: Limit exceeded 256 > 100 for "limit"`.
8. Execute counted a BullMQ job that RETURNED as an indexed document. These handlers return
   `{ success: false }` instead of throwing, so 48 failures reported as zero.
9. Operator secrets were staged into a directory already handed to uid 1001, which a
   capability-dropped root cannot write — then could not chmod a file it no longer owned — and the
   snapshot units' `StateDirectory=` re-asserted root ownership over the state directory for every
   command systemd forks, undoing the units' own chown.

THE 48. 35 Docling conversion failures and 13 counted at the time as finalize races — that reading
did not survive: see the corrected `mc2-3gz2m` note at the end of this file, where the measured
cause is an empty conversion, not a discarded upload. `megacampus-docling-mcp-internal`
restarted seven times during the run; every conversion failure falls before its last restart at
10:47Z and none after. Not the documents — the service (`mc2-lkkcv`).

This run cannot repair itself (`mc2-q3ju4`): the ledger records all 234 as completed, a fresh run id
is refused at journal phase `reindex_started`, and `plan` requires `verified`. Hand-editing the
artifact or the journal would falsify the audit record, so it was not done. The rows carry
`vector_status='failed'`, which is exactly what the product's own `retryDocument` procedure consumes.

BACKUPS. `megacampus-qdrant-snapshot.timer` is enabled and PROVEN: a run published
`megacampus_qdrant_recovery.prom` with `last_successful_snapshot_unixtime_seconds 1785508659`,
Prometheus scraped it, and `QdrantSnapshotStale` went `inactive` on its own — against text that had
first been corrected so it no longer promises off-host retention that does not exist.
`megacampus-qdrant-restore-drill.timer` is enabled and still FAILS: `/opt/megacampus/recovery/
probe.json` has never been authored (`mc2-hfz4a`), so `QdrantRestoreDrillStale` keeps firing, which
is true.

Two production files had to be installed by hand because CI deploys neither `ops/qdrant` nor
`deploy/systemd`: the corrected Prometheus rules and the two corrected units. Both backed up in
place as `*.bak-20260731` (`mc2-ugl5g`).

## 2026-07-31 (late) — the repair landed, and both backup halves are proven

**Vectors.** 218 of 234 documents, 13712 points, up from 186 / 11714. `relevance_failures` went
2 → 0. The 32 DOCX that were permanent losses are all back; the 16 that remain are all PDF.

**What made the DOCX repair possible** was giving that format the fallback extractor PDF already
had. It fired seven times in production during the repair and rescued all seven — direct evidence,
not a unit test.

**What made the repair fail the first time** was not the documents. The job payload carries an
absolute path resolved by the producing container, and the operator resolves `/opt/megacampus/data`
while the workers mount the same bytes at `/app/uploads`. Every job died on ENOENT. The queue name
had the same shape of problem: the operator pins `qdrant-reindex-disabled`, production consumes
`course-generation`. Both are now recorded in the handoff as required flags.

**Backups.** The restore drill PASSED for the first time, all seven checks, against a probe
generated by asking the live collection the drill's own questions. The Supabase backup now publishes
a freshness metric, proven by a real run. All 13 alerting rules are inactive — every one cleared by
making it true.

**Two directories production executes had no delivery path.** `ops/qdrant` was known
(`mc2-ugl5g`); `deploy/postgres` was not, and it holds the scripts an enabled nightly timer runs.
The second was found only because the change was observable: a metric that did not appear after a
run that reported success.

**Still open.** `mc2-3gz2m`: 16 PDFs. CORRECTED 2026-08-01 — the sentence that stood here named two
causes, "scanned PDFs with no text layer" and "a finalize race that discards vectors it has already
uploaded", and BOTH were wrong. There is no race: the log line reads `pointsUploaded: 0`, so nothing
was ever written to discard. They are not scans either: rendering the page shows exported diagrams,
one page 4296pt tall, with the type converted to curves, so no extractor can find a text layer and
OCR returns nothing even forced at 3x. Docling emits `<!-- image -->` — fourteen characters — and
reports success. Reading them is feature work, not a fix.

## Closeout 2026-08-02

`graph-reviewed: updated` — Graphify 0.9.14 local graph refreshed with `graphify update .` after the
2026-07-27 graph fell five days and eighteen code commits behind. Rebuilt to 60288 nodes / 86501
edges / 7222 communities. No external semantic/model/API backend and no Git hook: the run's own tip
about `GEMINI_API_KEY` was deliberately not acted on. Verified the refresh actually took rather than
trusting the exit code — `graphify query assertConversionProducedText` and
`graphify query runRetryFailedDocuments` both resolve, and neither symbol existed on 2026-07-27.

**The Q12 window track is retired bead by bead, not swept.** Nine beads settled 2026-08-01 on
individual reasons, each carrying a REOPEN CONDITION and its findings preserved verbatim rather than
deleted: `mc2-jz6y0.13` (the cutover itself), `mc2-uha77`, `mc2-dizgy`, `mc2-ivjyb`, `mc2-9vbzp`,
`mc2-xssva`, `mc2-evduu` retired as unreachable without a barrier install; `mc2-urw5d` obsolete
because no window day exists; `mc2-oa7om` superseded by `mc2-qd12b`, which already contained it as
one of its three options. `mc2-jz6y0.13.6` was reparented to the epic because the off-host gate
outlives the staging cutover.

**Two beads were closed on evidence that contradicted their own text.** `mc2-jz6y0.13.4` met its
acceptance criterion exactly — 42/42 `copy_states` published and 24/24 dispositions verified, read
from the production journal. `mc2-6l2yz` and `mc2-oc83n` turned out to be the SAME restore-drill
failure filed twice from two rounds, already fixed in `mc2-34eua` and never closed; re-verified 47/47
at uid 1000, which is what turns the `RUN_REAL_CONTROLLER` gate ON, with `-t "exact guard"` proving
the case ran rather than skipped.

**The measurement that moved the risk.** Asked why local-only backup was not enough, the honest
answer turned out to be about something else entirely. `file_catalog.storage_path` is a RELATIVE
FILESYSTEM PATH, not a Supabase Storage key — 261 rows, 128 distinct paths, none starting with
`http`. The uploaded originals live at `/opt/megacampus/data/uploads` and NOWHERE else: 206MB, 117
files. Everything else on that host is recoverable: Qdrant vectors are derived and regenerable, the
Supabase dumps are redundant against Supabase's own managed backups, enrichments cost generation
spend but come back. So the only irreplaceable artifact on the box is also the smallest, and it had
no bead until `mc2-bygu1`. Six documents have already lost their sources permanently, which is what
this failure looks like when it happens. Owner decided 2026-08-02 to stay local for now and give
off-host backup its own dedicated server later; both beads are parked on that.

## Closeout 2026-08-03 — mc2-0tcyw

graph-reviewed: updated — `graphify update .` after the code and docs changes, no external
semantic/model backend and no git hooks. 60296 nodes / 86509 edges / 7224 communities, up from
60288 / 86501 / 7222. Verified with two focused queries: the new
`q12-source-manifest-psql-diagnostic.test.ts` is a start node, and `backup-supabase.sh` resolves
with its `fail()` and `main()`.

**The alert was right and the message was useless.** At 00:30 CEST the nightly Supabase backup ran
for seven minutes, got through `pg_dump`, and died in the source-manifest phase. `SupabaseBackupStale`
fired thirty hours later, correctly: there was no backup that night. What the operator got was one
line — `source manifest failed: PostgreSQL 17 manifest query failed with status 1` — naming no
relation, no SQL state and no reason. An identical manual re-run at 07:26 published
`generation-20260803T052610Z-a499f10d-951a-4324-8739-8d2b07a0faf1` and the alert cleared itself,
Prometheus `/api/v1/alerts` returning an empty list rather than a silence. So the cause was
transient — and unattributable, which is the part worth fixing.

**Where it went.** `deploy/postgres/q12-source-manifest.ts` ran psql through `spawnSync`, and on a
non-zero exit called `fail()` with the exit STATUS only. `result.stderr` was captured and discarded;
it was read one line further down, but only on the success path. The fix appends it, collapsed to
one bounded line because the shell surfaces just the last ten lines of that stderr. Safe for the
same reason `backup-supabase.sh` already cats `pg_dump`'s stderr into the service log: the password
reaches psql through `PGPASSFILE`, never argv and never the environment.

**The second half is that nothing retried.** `megacampus-supabase-backup.service` had no `Restart=`
at all, so one blip cost a whole night of coverage and woke a person. It now carries
`Restart=on-failure`, `RestartSec=10min`, `StartLimitIntervalSec=6h` and `StartLimitBurst=4`, so a
genuinely broken backup still reaches failed state and still alerts, and `RestartPreventExitStatus=64
75` — 64 is the wrapper's usage refusal and 75 its contention refusal (Q12 active, or another backup
holding the lock), both decisions rather than failures a retry could change. `systemd-analyze verify`
passes on the host's own systemd, which is where `Restart=` under `Type=oneshot` was confirmed legal.

**Two guards fired during delivery, both correctly.** Editing `q12-source-manifest.ts` left
`deploy/qdrant/q12-deployed-asset-manifest.json` stale — it is one of the 26 assets the window
pre-flight byte-checks on the host — and `q12-window-preflight.test.ts` went red in CI rather than
letting H2 pass against stale expectations on the server. Regenerated with `--emit-asset-manifest`.
Then the monitoring-drift job went red because `/etc/systemd/system` still held the old unit: CI
deploys `deploy/systemd` to `/opt/megacampus` but never installs into systemd, by design. That is
also how the remediation text turned out to be too generic, and it now names
`install-supabase-backup-schedule.sh` for this pair specifically.

**Installed with proof, not with a copy.** `install-supabase-backup-schedule.sh` ran as root with the
two unit digests taken from `sha256sum` output on the host, stopped the timer, installed both units,
reloaded systemd, then PROVED the schedule: a real backup, `pg_restore` validation, and the isolated
restore drill — `3540 archive entries, 0 skipped`, `restore size ratio=0.800917`, cluster-global
inventory plus both manifest equalities passing — before re-enabling the timer. It disables the timer
if any of that fails, which is why it is the right installer here and the generic one is not.
Published `generation-20260803T062215Z-d5b90a18-3d1f-420f-9229-d06dc6fc9c52`.

**A test that skips is not a guard.** The behavioural test drives the real tool at a socket directory
that does not exist, so psql genuinely fails and its words are proven to survive; an unbound TCP port
is not equivalent, because under WSL it hangs instead of being refused. But it needs
`/usr/lib/postgresql/17/bin/psql`, the interpreter the tool hardcodes, and GitHub's runners carry
PostgreSQL 16 — so in CI it skipped and guarded nothing. A source guard that runs everywhere was
added alongside it, anchored on the interpolation rather than the phrase, because the same words
appear in the comment above the failure site.

**End state.** Pipeline green end to end, `Deploy to Production` success, `Rollback` skipped —
the 2026-08-01 job split holding. Drift check on the host: `monitoring config OK: 20 files match the
repository`. Timer enabled and active, next 2026-08-04 00:30 CEST. Alerts firing: NONE.

## Review round 2026-08-03 — the mc2-0tcyw fix reviewed against itself

graph-reviewed: updated (see below). docs-reviewed: handoff and this summary updated; no README,
AGENTS.md or runbook claim changed behaviour, so nothing else was in scope.

No delegation. The diff was six files and roughly 150 lines with the whole context already in the
session, so none of parallel latency, context isolation, specialist capability or write isolation
applied. Reviewed locally against the delivered diff.

**Finding 1, ACCEPTED, P1 — the fix reintroduced its own disease.** `spawnSync` leaves `stdout` and
`stderr` UNDEFINED when the process never starts, and `psqlDiagnostic(result.stderr)` read it
unconditionally. Reproduced before fixing:

    status = null   stderr = undefined
    error  = spawnSync .../psql-DOES-NOT-EXIST ENOENT
    CRASH  = TypeError: Cannot read properties of undefined (reading 'replace')

So a psql that cannot be executed would have produced `source manifest failed: Cannot read
properties of undefined` — less attributable than the message the change was written to replace.
Not theory: the interpreter is an absolute path under a unit with `ProtectSystem=strict` and
`ReadOnlyPaths`, and an ordinary deploy rewrites asset modes. Fixed two ways: the diagnostic is
nullish-guarded, and a spawn failure became its own differently-worded failure carrying
`result.error.message`, because "failed with status signal" names the wrong thing for a process
that never ran. Proven against an absent binary:

    source manifest failed: PostgreSQL 17 manifest query could not start: spawnSync .../psql-ABSENT ENOENT

**Finding 2, ACCEPTED, P2 — the retry policy could disable backups through the installer.** A unit
that has exhausted `StartLimitBurst` refuses every further start until the window elapses, including
the one `prove_supabase_backup_schedule` issues. Its `disable_unproven_timer` trap then turns the
timer OFF. The night after a run of failures is exactly when an operator reaches for that installer,
so the guard against a broken backup could have become the thing that stopped backups. The installer
now clears the counter before proving; the lifecycle harness asserts the call lands before the timer
start, and the 07:29 reinstall exercised it live.

**Finding 3, ACCEPTED, nit — a comment that flattered the design.** "Four starts per six hours ...
it cannot loop" is false: `StartLimitIntervalSec` is a sliding window, so a run that hangs to
`TimeoutStartSec=2h` ages its own earlier starts out of it and keeps retrying about every two hours.
Harmless — a hang publishes no metric either way, so `SupabaseBackupStale` still fires — but the
unit now says that instead of promising otherwise.

**Finding 4, ACCEPTED as a gap, fixed — a test that skipped everywhere it ran.** The behavioural
test needs the interpreter the tool hardcodes and GitHub's runners carry PostgreSQL 16, so CI
executed 0 of 2 cases. The new spawn-failure test is its mirror: `skipIf(existsSync(PSQL))`, so it
runs exactly where the other cannot. CI now reports `4 tests | 2 skipped` instead of `2 tests | 2
skipped`, and the ENOENT path is exercised on every push.

**REJECTED — psql stderr could quote row data into a log.** True in principle for some error
classes, and dismissed on consequence: the log lives on the same host as the pg_dump archives, which
contain every row already, so the marginal exposure is nil. Rejecting it here rather than silently.

**REJECTED for now — raise `statement_timeout` for the manifest transaction.** It is the obvious
move and the wrong first one: it removes the only bound on a session holding an exported snapshot,
leaving `TimeoutStartSec=2h` as the sole stop. Tracked in `mc2-0rj7i` behind confirmation.

**The measurement that replaced a guess.** mc2-0tcyw's leading hypothesis — the coordinator's
idle-in-transaction session being terminated — was FALSIFIED by read-only catalog query:
`idle_in_transaction_session_timeout` and `idle_session_timeout` are both 0 by default, and
`pg_db_role_setting` carries no override for `postgres`, which `backup-supabase.sh:934` asserts is
the connecting role. What replaced it fits every observation: `statement_timeout = 120000` from the
configuration file, inherited by `postgres`, against per-relation hash queries that serialize an
entire table to JSON, sort by that text and concatenate it before hashing — `file_catalog` is 129MB
across 261 rows. Still a hypothesis, and deliberately left as one: the next occurrence will print
`canceling statement due to statement timeout` verbatim now, which is the whole point of the fix.

graph-reviewed: updated — `graphify update .`, no external semantic/model backend and no git hooks.
60297 nodes / 86510 edges / 7197 communities.

**Verification.** Ops acceptance set green (9 files, including the window pre-flight ratchet and the
asset-manifest consumer identity after re-pinning), `pnpm type-check` clean, prettier clean. Pipeline
green with `Deploy to Production` success and `Rollback` skipped; the monitoring-drift job went red
once in between, correctly, because `/etc/systemd/system` still held the previous unit. Host reads
`monitoring config OK: 20 files match the repository`, alerts firing NONE, timer next 2026-08-04
00:30 CEST. Installed and proven: `generation-20260803T072934Z-e542a166-fe96-43f5-a150-ff0a5fd760aa`,
restore `3540 archive entries, 0 skipped`, `restore size ratio=0.800961`.

## Continuation 2026-08-03 — the suspect measured, and the handoff cap stopped costing truth

Level: `slice_acceptance`. One owner, local, no delegation — the work was one read-only measurement,
one SQL preamble change with a guard, one docs extraction and one test nit. None of parallel
latency, context isolation, specialist capability or write isolation applied.

**The suspect became a measurement.** `mc2-0rj7i` was recorded yesterday as a named suspect and
deliberately not acted on. It is now evidence-backed as REACHABLE. The Supabase MCP session connects
as `postgres` with `statement_timeout` of 2min — the same role and the same ceiling the backup gets,
verified in-session rather than assumed — so `EXPLAIN (ANALYZE, BUFFERS)` against the tool's own hash
formula measures exactly what the nightly run experiences:

    file_catalog       261 rows / 129MB   34.5s   external merge, 276MB spilled
    lesson_contents   4140 rows /  63MB   20.4s   external merge, 202MB spilled
    generation_trace 36824 rows /  40MB    5.5s   external merge, ~100MB spilled

One relation was already spending 29% of the whole budget, warm, with nothing else running — and the
nightly does this AFTER `pg_dump`, with workers active. The cost tracks table BYTES rather than rows:
`file_catalog` is 261 rows and the slowest of the three, so it grows with every upload. Every sort
spills because `work_mem` is 2184kB and the sort key is the full row JSON.

That is enough to justify a bounded, reversible mitigation and NOT enough to call it the cause of
the 2026-08-03 00:30 failure. Both halves are stated on the bead; the second is not quietly dropped.

**The fix, and what it deliberately is not.** All four transactions the manifest opens — catalog
capture, per-relation hash, barrier probe, inventory — now `SET LOCAL statement_timeout = '10min'`.
`SET LOCAL`, so it reverts at COMMIT and cannot leak onto the connection; verified against the live
source that a READ ONLY REPEATABLE READ transaction accepts it and reads back `10min` inside the
transaction. Sizing is ~17x the worst measured relation, generous on purpose: a cancelled manifest
costs a night of backup coverage, while the headroom costs only a longer-held snapshot, still
bounded and far inside `TimeoutStartSec=2h`. Setting it to 0 was REFUSED and the guard enforces
that, because removing the timeout would leave the 2h unit timeout as the only bound on a session
holding an exported snapshot. `q12-source-manifest-statement-timeout.test.ts` also fails if a fifth
transaction is added without the ceiling — the silent-inheritance trap this whole thread is about.

This raises a ceiling. It does not make the hash cheaper. Serializing an entire table to JSON,
sorting by that full text and concatenating it is O(table bytes) and will keep growing; changing it
alters manifest semantics and invalidates baselines, so it is deliberate work, not a tweak. Recorded
with `work_mem` as the measured-next lever, unmeasured because that experiment exceeded the client
timeout and was cancelled server-side by the 2min ceiling — leaving nothing behind, checked.

**Proven in production rather than assumed.** The changed SQL runs nightly, so it was exercised
immediately instead of at 00:30: `generation-20260803T083159Z-4c363f02-61b9-48eb-aa49-40c5fea7a9f0`
published, metric stamped, alerts still empty. A syntax error in a transaction preamble would
otherwise have surfaced as a failed backup tonight.

**The handoff cap stopped costing truth.** Four sessions running, something true had to be shortened
to fit something else true, because "How this repository fails" was competing for room in a file
capped at 200 lines and defined as CURRENT STATE ONLY. It is neither current nor state. Extracted to
`.codex/repository-failure-modes.md` — allowlisted in `.gitignore` next to `handoff.md`, since
`.codex/` is an allowlist rather than a tracked directory — and expanded there with what these two
days added: staged-versus-active systemd units, that a diagnostic which only runs where the tool
cannot fail is not a diagnostic, and that a named suspect with evidence beats a confident cause
without it. Raising the limit was the alternative and was rejected: the cap is what keeps the
handoff current-state, so the fix is to stop putting non-current things under it. Handoff is now
196 lines; the two costliest traps stay duplicated there.

**Nit from the review round, closed.** The diagnostic test wrote to a fixed `/tmp/unused.json`; it
now owns a per-run `mkdtemp` directory and removes it, and a stale comment about an unbound TCP port
was corrected to the socket directory the test actually uses.

**NOT started, and why.** `mc2-bygu1` — the 206MB of uploads with no off-host copy — stays untouched
despite being the highest-value item on the list. The owner parked it on 2026-08-02 pending a
dedicated server, and the one thing that would move it, choosing where a copy goes, is the owner's
to answer. A blanket "finish everything" is not a revocation of a specific decision.

graph-reviewed: updated — `graphify update .`, no external semantic/model backend and no git hooks.
60306 nodes / 86517 edges / 7245 communities. docs-reviewed: handoff, stage summary and the new
`.codex/repository-failure-modes.md`; no README, AGENTS.md or runbook claim changed behaviour.

**Verification.** Ops acceptance set green (7 files, 107 passed / 27 skipped), `pnpm type-check`
clean, eslint and prettier clean, process verification OK. Pipeline green end to end with
`Deploy to Production` success, `Rollback` skipped and `Monitoring Config Drift` passing — no unit
changed this round, so no reinstall was needed. Host: `monitoring config OK: 20 files match the
repository`, timer enabled, alerts firing NONE.

## Continuation 2026-08-03 — mc2-0rj7i finished

**The lever I planned to pull turned out not to exist.** The bead's next step was to measure
`work_mem`, on the theory that three sorts spilling 200-276MB were spilling because 2184kB is small.
They were — but the reason the sort was that big is that the sort key was a whole row of JSON.
Hashing each row first and sorting the 64-byte digests instead makes every sort fit in the
`work_mem` that is already there. Raising it would have bought a fraction of what removing the need
for it did, and would have cost backend memory on a box that also runs the workers.

**Measured warm against the live source, before → after.** Same role, same 2min ceiling as the
backup, `EXPLAIN (ANALYZE, BUFFERS)` on the tool's own formula:

    file_catalog       261 rows / 129MB   37.2s, 276MB spilled  →   8.9s, no spill
    lesson_contents   4212 rows /  63MB   20.4s, 202MB spilled  →   5.8s, no spill
    generation_trace 37085 rows /  40MB    5.5s, ~100MB spilled →   4.3s, no spill

`generation_trace`, the widest sort left, uses 1537kB of the 2184kB available. Cost now grows with
ROW COUNT, not with table bytes, which is the part that mattered: `file_catalog` is 261 rows and was
the slowest relation in the manifest because it carries 129MB of TOAST, and it gains bytes with
every upload.

**A cliff that had nothing to do with time.** `string_agg` built a single text value the size of the
table, and `text` tops out at 1GB. `file_catalog` was at 129MB of that budget and climbing, and
nothing in the tool would have explained the failure when it arrived — it would have read as one
more unattributable night. The aggregate is now 65 bytes per row.

**`AS MATERIALIZED` is load-bearing, and I only know that because I measured the version without
it.** The obvious first cut — a plain subquery — was 13.4s and still spilled 122MB, because the
planner inlines the subquery and sorts the underlying rows anyway. It looks like a stylistic
keyword. It is the difference between 8.9s and 13.4s. `COLLATE "C"` came free with the rewrite and
removes a dependency nobody had noticed: the digest ordering was the database's collation, so a
source and a restored target were trusting a locale to agree.

**The schema is v2, deliberately.** The same database now yields different digests, so v1 and v2
manifests are not comparable and a v1 generation drilled by this tool stops at `source manifest
schema mismatch`. The alternative was to leave the version alone and let that case surface as every
authoritative relation reporting drift at once, which is the exact shape of failure this repository
keeps paying for. Those generations stay restorable; only the comparison is gone. All 14 pins moved
together.

**A red I found by running the gate, and it was not the flake it looked like.**
`qdrant-source-recovery-runtime` sits on the known "times out under full-suite parallelism, passes
alone" list, so its failure in the ops sweep read as that. It was not: it reproduced alone, in 76ms,
deterministically. `stage_owner_only_directory` hands the staged directory to `0:0` before setting
its mode — correct in the image, where it runs as root — and the isolated copy the test builds
substitutes four uid/gid literals but not that one, so as an ordinary uid it died on EPERM before
asserting anything. Red since 2026-07-31, when that `chown` was introduced. Fixed in the shim, and
the file is 205/205 alone. The lesson is on the failure-modes doc's own terms: a known-flaky label
is a place for a real failure to hide.

**Proof, in the order it was taken.** Real PostgreSQL 17.10 in docker
(`q12-cron-row-hash-normalization`, `MC2_Q12_REAL_PG17=1`, 111s): the new SQL executes for real, the
sanctioned `cron.job` `active`-only flip still leaves `row_sha256` unchanged, and a real command
tamper still changes it. Both new source guards proven red before green. Then production: a fresh
backup published `generation-20260803T094814Z-36a4cc27-5afb-4e6c-982d-08e1249dc5bf` with the metric
stamped, and a full restore drill on it returned `cutover_snapshot manifest equality passed`,
`baseline manifest equality passed`, `restore size ratio=0.800987`. That last one is the proof that
counts: the digests computed on the live source and on the fully restored target agree under the new
formula.

**What is still NOT proven.** Nothing here demonstrates that `statement_timeout` caused the
2026-08-03 00:30 failure. It remains a measured, reachable suspect, and the confirmation is still
free — the next manifest failure prints psql's own words (`mc2-0tcyw`).

graph-reviewed: updated — `graphify update .`, no external semantic/model backend and no git hooks.
docs-reviewed: handoff (`mc2-0rj7i` paragraph rewritten, still exactly 200 lines) and this summary;
no README, `AGENTS.md` or runbook claim changed behaviour.

**Verification.** `pnpm type-check` clean, eslint and prettier clean on the changed tree. Ops
acceptance set green, including the four files that fail only under parallelism — each re-run alone:
`q12-live-controller` 26/26, `q12-live-quiesce-deferred` 8/8,
`q12-retained-barrier-w-composition-seam` 30/30, `qdrant-source-recovery-runtime` 205/205. Pipeline
`30801561042` green end to end with `Deploy to Production` success, `Rollback` skipped and
`Monitoring Config Drift` passing. Host: timer next 2026-08-04 00:30 CEST, alerts firing NONE.
