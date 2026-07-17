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
