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
