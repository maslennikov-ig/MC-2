---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.7.2
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: backup atomicity, exact database restore, Docker cleanup, scheduler replacement, and secret isolation are data-loss and security boundaries
repo: mc2
branch: codex/q12-g7-backup-restore
base_branch: codex/self-hosted-qdrant-platform
base_commit: dfdcdcc7e0a234a3b13b7d905f38eab5869be708
worktree: /home/me/code/mc2/.worktrees/q12-g7-backup-restore
write_zone:
  - deploy/postgres/**
  - deploy/systemd/megacampus-supabase-backup.*
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts
  - packages/course-gen-platform/tests/unit/ops/supabase-restore-drill.test.ts
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-schedule.test.ts
  - docs/operations/qdrant-self-hosted.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.2-q12-g7.md
success_criteria:
  - one exported PostgreSQL snapshot binds an immutable four-file generation and an exact crash-safe latest pointer
  - the digest-pinned Supabase PostgreSQL 17 image restores exact roles, extensions, owners, ACLs, catalog, and authoritative data without source credentials
  - every adopted Docker and temporary resource is removed on success, failure, or signal, and cleanup failure overrides success
  - the replacement systemd schedule is Q12-aware, fixed-hash, deterministic, and enabled only after a fresh backup plus isolated restore proof
selected_docs:
  - owner-approved Q12 corrections design SHA-256 5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15
  - owner-approved Q12 recoverable lifecycle addendum SHA-256 4fb36266b8ae127fd1952e59d565792cb2883255143f5d1d6d88d99c1033ed79
  - superseded independently accepted G7 addendum SHA-256 de493383f0daa585174b81457e3150139cb1ab3988421655bf24a53437d3c28c
  - superseded independently accepted canonicalization/G7 addendum SHA-256 9171fa12a46ec5ffe3add4d0bf7ff4c847520489d650ed22483014248bca5743
  - final independently accepted canonicalization/phase-mapping/G7 addendum SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27
  - PostgreSQL 17 pg_dump https://www.postgresql.org/docs/17/app-pgdump.html
  - PostgreSQL 17 pg_dumpall https://www.postgresql.org/docs/17/app-pg-dumpall.html
  - PostgreSQL 17 pg_restore https://www.postgresql.org/docs/17/app-pgrestore.html
  - PostgreSQL 17 snapshot synchronization https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION
  - Supabase official PostgreSQL image family https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml
  - Docker container and volume CLI references https://docs.docker.com/reference/cli/docker/container/run/ and https://docs.docker.com/reference/cli/docker/volume/create/
  - systemd 255 service/timer references https://www.freedesktop.org/software/systemd/man/255/systemd.service.html and https://www.freedesktop.org/software/systemd/man/255/systemd.timer.html
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - senior-devops
  - graphify-project
  - superpowers:verification-before-completion
selected_agents:
  - deploy/database worker
catalog_candidates:
  - none - installed skills and recorded first-party sources cover this bounded stream
parallel_group: G7
depends_on_streams:
  - mc2-jz6y0.13.10 - final integration must rerun shared lifecycle/structural parity against the independently accepted W commit
parallel_decision: parallel
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: pending
cleanup_notes: dedicated worktree and branch are intentionally retained for independent correctness review and parent integration
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: final independent review of normative addendum 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27 passed with P0=P1=P2=P3=0; qdrant-self-hosted records exact physical source-cutover OIDs, OID-independent restore-only equality, elapsed-epoch retention, and inline authoritative lifecycle trust without authorizing live execution; 9171fa12 and de493383 are historical superseded addenda
graph_reviewed: used
graph_review_notes: local Graphify report and focused backup/restore/scheduler queries were consulted read-only from the canonical primary graph; it is stale at commit 1233be56 and uses pre-1504 IDs, so refresh belongs to safe integration closeout
verification:
  - preserved candidate baseline focused suites: passed 79/79
  - continuation TDD RED backup pointer integrity: failed 2/38 for the expected missing validation
  - continuation TDD RED Docker resource adoption: failed 1/35 for the expected pre-adopted names
  - continuation TDD RED Q12 scheduler markers: failed 1/10 for the expected dangling-symlink acceptance
  - continuation GREEN backup and restore: passed 73/73
  - continuation GREEN scheduler: passed 10/10
  - fresh separate backup restore schedule: passed 38/38, 35/35, and 10/10
  - fresh joined G7 aggregate: passed 83/83
  - accepted-review OID projection RED/GREEN: failed then passed the focused different-source/target-OID partition test
  - accepted-review Docker adoption RED/GREEN: failed 4/4 then passed 4/4 exact post-create fault, retry, and foreign-resource tests
  - accepted-review retention RED/GREEN: failed then passed the exact 14*1440-minute committed/latest/incomplete/incident boundary test
  - accepted-review scheduler RED/GREEN: failed 5/5 then passed 5/5 executed active-Q12, real-flock, failure-disable, Persistent catch-up, and no-duplicate tests
  - fresh post-review joined G7 aggregate: passed 94/94
  - post-review ESLint scope: passed with two non-blocking manifest complexity/file-size warnings and zero errors
  - final independent docs review: PASS with P0=P1=P2=P3=0
  - rereview helper-trust RED/GREEN: failed then passed 2/2 malicious sibling pre-refusal tests
  - rereview source physical-OID RED/GREEN: failed then passed the adversarial stale physical OID test while restore-side OID-independent equality still passed
  - rereview elapsed-retention RED/GREEN: failed 2/2 then passed 2/2 fixed Amsterdam spring/fall DST anchors at exactly 20160 minutes
  - rereview protected retention clock: passed refusal outside the exact synthetic test token
  - fresh rereview backup/restore/schedule aggregate: passed 99/99
  - final normative addendum docs review: PASS with P0=P1=P2=P3=0; SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27 supersedes historical 9171fa12a46ec5ffe3add4d0bf7ff4c847520489d650ed22483014248bca5743 and de493383f0daa585174b81457e3150139cb1ab3988421655bf24a53437d3c28c
  - independent final correctness rereview: PASS with P0=P1=P2=P3=0 at 31b9e6eb17e75e1680c3d53f817f1952ead47cd0
  - merged into codex/self-hosted-qdrant-platform at cb00fd9bcbd2476a9fafd096beb3554e442180f1
  - fresh integration G7 aggregate after merge: passed 99/99
  - fresh integration pnpm type-check: passed all five projects
  - fresh integration bash syntax, artifact validation, and git diff check: passed
  - workspace pnpm type-check: passed all five projects
  - bash syntax: passed for deploy/postgres/*.sh
  - Prettier check: passed for every changed TypeScript, test, Markdown, and artifact file
  - ESLint pre-commit scope: passed with three non-blocking complexity/file-size warnings and zero errors
  - systemd calendar normalization: passed on local systemd 259
  - generic URI and token-shape scan: passed; only the intentional synthetic PostgreSQL fixture URL was found
  - Docker and temporary runtime residue: passed with zero matching containers, networks, volumes, or temporary roots
  - orchestration process verification: passed
changed_files:
  - deploy/postgres/backup-supabase.sh
  - deploy/postgres/create-private-temp-dir.py
  - deploy/postgres/generate-role-bootstrap.ts
  - deploy/postgres/install-supabase-backup-schedule.sh
  - deploy/postgres/open-nofollow.py
  - deploy/postgres/q12-source-manifest.ts
  - deploy/postgres/rename-noreplace.py
  - deploy/postgres/restore-supabase-drill.sh
  - deploy/postgres/restore-docker-lifecycle.sh
  - deploy/postgres/run-restore-cleanup.ts
  - deploy/postgres/scan-pgtle-archive.py
  - deploy/postgres/scheduled-backup-run.sh
  - deploy/postgres/install-supabase-backup-schedule-lifecycle.sh
  - deploy/systemd/megacampus-supabase-backup.service
  - deploy/systemd/megacampus-supabase-backup.timer
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts
  - packages/course-gen-platform/tests/unit/ops/supabase-restore-drill.test.ts
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-schedule.test.ts
  - docs/operations/qdrant-self-hosted.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.2-q12-g7.md
explicit_defers:
  - mc2-jz6y0.13.6 - off-host S3 remains deferred to production readiness and is not a staging dependency
---

# Summary

The preserved G7 candidate now implements the complete local backup boundary:
an atomic owner-only `generation-<UTC>-<run-id>/` with `database.dump`,
`roles.sql`, `source-manifest.json`, and `checksums.json`; strict latest-pointer
and retention semantics; a Supabase-compatible exact restore using the pinned
linux/amd64 image; and a fail-closed replacement systemd timer.

This continuation added three bounded RED/GREEN corrections. Readers now reject
a latest pointer if any of the referenced four files is missing or if the
pointer contains an extra field. The restore adopts only Docker-returned network
and container IDs plus the created volume name, labels each resource with the
run identity, verifies that label before deletion, and cannot remove a
same-named resource that it did not create. The scheduled wrapper treats
dangling Q12 markers and malformed lock files as unsafe and requires exact
owner/mode/non-symlink lock metadata.

No server, hosted Supabase, GHCR, Qdrant Cloud, staging, production, live
database, service, cron, secret, or historical backup was read or mutated.

# Accepted independent-review addendum

The final accepted addendum
`7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`
supersedes historical
`9171fa12a46ec5ffe3add4d0bf7ff4c847520489d650ed22483014248bca5743`
and `de493383f0daa585174b81457e3150139cb1ab3988421655bf24a53437d3c28c`.
Its G7 findings are implemented finding by finding:

1. Physical source OIDs remain in `guarded_relations` for live `q12_guard`
   binding. The fresh live source cutover must match those frozen relation and
   parent OIDs exactly; matching stable names cannot conceal stale physical
   identities. Only restore comparison resolves source and target parents
   through their own OID inventories and compares the stable `schema/name`,
   kind, owner, and parent `schema/name` projection.
2. Docker daemon output is written before identity adoption. An EXIT cleanup
   with an empty in-memory ID rediscovers only an exact run label, resource
   label, and deterministic name. Fault injection after network, volume, and
   container creation proves cleanup and safe retry; an unlabelled colliding
   resource survives.
3. Retention computes `now - RETENTION_DAYS*86400` as an integer epoch and uses
   GNU find against that exact elapsed-time boundary. It is therefore immune to
   Amsterdam spring/fall calendar shifts as well as completed-day `-mtime`
   buckets. Only a complete committed non-latest generation expires; latest,
   incomplete, and uncommitted incident evidence remain.
4. Scheduler tests now execute protected synthetic roots and the shared
   installer lifecycle. They prove active-Q12 refusal, actual kernel flock
   contention, one concurrent launch, Persistent catch-up without a duplicate
   manual service start, and timer stop/disable after backup or restore failure.
5. Restore and installer lifecycle functions are authoritative inline bytes in
   their respective entrypoints. Both malicious-sibling regressions prove that
   invalid argv is refused without executing a mutable adjacent shell file.

# Scope / Routing

The branch stays inside the assigned G7 write zone. It consumes no unfinished W
file or receipt interface. Final parent integration still needs the accepted W
commit so the shared `q12_guard` SQL and lifecycle assumptions can be rerun as
one joined tree.

First-party version truth is frozen in the approved design: PostgreSQL 17,
Supabase image `public.ecr.aws/supabase/postgres:17.6.1.064`, OCI index
`sha256:4c6d67181e482549bab276e8ae933f807be59ea1c371c225d85c189b0c14b9de`,
and linux/amd64 child
`sha256:d00c45c73f9c3d130ea4f379d8ae7748b0711d628eea690d27d03198ed609f2f`.
The local Docker daemon already held that exact child as `linux/amd64`; no pull,
container start, network creation, or volume creation was needed for this
verification pass.

# Verification

The preserved candidate first passed the three focused suites separately at
36/36 backup, 34/34 restore, and 9/9 schedule. The shortened plan command was
diagnosed as stale because it selected the global Vitest setup; all accepted
runs use `--config vitest.config.unit.ts` plus synthetic Supabase placeholders.

Continuation TDD evidence:

1. Pointer RED: 2 of 38 backup tests failed because corrupted referenced
   generations and extra pointer fields were accepted.
2. Docker adoption RED: 1 of 35 restore tests failed because names were assigned
   before creation and later used for cleanup.
3. Scheduler RED: 1 of 10 schedule tests failed because a dangling Q12 marker
   and malformed lock shape were not rejected explicitly.
4. GREEN: backup plus restore passed 73/73, scheduler passed 10/10, and changed
   shell entrypoints passed `bash -n`.
5. Package type-check passed after building the shared logger/types/utils
   dependencies.
6. `systemd-analyze calendar '*-*-* 00:30:00 Europe/Amsterdam'` normalized the
   intended schedule on local systemd 259. Direct `systemd-analyze verify` was
   unable to create `/run/systemd/` under the unprivileged WSL environment; the
   tracked installer performs this gate as root before installation.

Fresh completion evidence:

- backup separately: 38/38 in 24.90 seconds wall time;
- restore separately: 35/35 in 3.49 seconds wall time;
- schedule separately: 10/10 in 1.20 seconds wall time;
- all three together: 83/83 in 25.66 seconds wall time;
- `bash -n deploy/postgres/*.sh`: passed;
- repository Prettier check over every changed TypeScript/test/Markdown file:
  passed;
- `pnpm type-check`: passed for all five workspace projects.
- ESLint over the pre-commit TypeScript/test scope: passed with zero errors;
  the two intentionally exhaustive catalog validators and the manifest file
  retained three non-blocking complexity/file-size warnings.
- generic URI/token scan found only the intentional
  `synthetic-password-never-log` PostgreSQL fixture in the backup unit test and
  found no JWT/PAT-shaped token in the assigned tree;
- Docker filters returned zero matching containers, networks, and volumes;
  one mode-`0700`, current-user synthetic fixture root left by the preserved
  pre-session candidate at `/tmp/mc2-supabase-backup-UU1VmN` (mtime 01:08) was
  inspected, confirmed to contain only the G7 fake commands/inputs, removed,
  and the repeated `/tmp` residue query returned zero.
- `scripts/orchestration/run_process_verification.sh`: passed the balanced-v2.14
  orchestration contract, diff check, dirty-stream status inspection, and
  process gate.

Final rereview evidence:

- malicious installer/restore sibling helpers: RED 2/2, GREEN 2/2;
- stale frozen source physical OIDs with otherwise identical stable identities:
  RED 1/1, GREEN 1/1; the restore-side different-OID comparison also remained
  GREEN;
- fixed Amsterdam spring/fall anchors: RED 2/2, GREEN 2/2 at exactly
  `14 * 1440 = 20160` elapsed minutes;
- protected synthetic retention clock outside the exact test token: refused;
- complete backup/restore/schedule aggregate: 99/99 passed;
- `pnpm type-check`: passed all five workspace projects;
- `pnpm build`: the first environment-free invocation correctly stopped at the
  web environment schema; the canonical rerun with synthetic non-secret
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` passed all five workspace builds;
- scoped ESLint: zero errors and only the two pre-existing manifest
  complexity/file-size warnings;
- final normative docs review: PASS with P0=P1=P2=P3=0 for SHA-256
  `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`;
  historical `9171fa12` and `de493383` are superseded.

Tracked hashes before commit:

- `backup-supabase.sh`:
  `9e43e7908566953d9109de03fca4a3a8ae9d6a87f01b68ee2ed634d1d4e789f4`
- `restore-supabase-drill.sh`:
  `7d4b046637864f91e06c0cf47f27dee84fcca6fdbb4815de60c4947efdee963e`
- `q12-source-manifest.ts`:
  `ec1bb8747329941cd027237a122b7c218d0d62a6024a7ac432771896175c0a94`
- `scheduled-backup-run.sh`:
  `21df48b5475721c4ff6754d9ce3da53d600368cd95cd6c3d423ddcc94813a828`
- `install-supabase-backup-schedule.sh`:
  `612287d1c2b60ed4926707a3ce651a163b21b778e8e243c9f96c73d71ba07099`
- service/timer:
  `b897991ffaf9c6d2a6d0ad8ce9172cc7ffd46ecdfd7b8d384976680a209bab6f` /
  `4d3779bb7a96a8aaeaa0d9538ca8e557760afc5def5bbc4b2de0fb48d94a53f3`

Artifact validation and `git diff --check` are rerun again immediately before
commit.

# Delivery / Cleanup

The worker returns a dedicated pushed branch for independent correctness review.
It does not close Beads. The parent owns integration, joined W parity, Beads
status, stage closeout, and any later separately authorized live packet.

# Risks / Follow-ups

The real diagnostic archive recorded in the approved design (`66,706,978`
bytes, SHA-256
`7aecb6fdc94f6a41decf036b1177f4638b6437798412bd510a8864b2f5ad347c`)
and its `8,030`-byte roles export were not present under `/home/me` or `/tmp`.
Therefore no test copied or fabricated that evidence and the opt-in real-archive
drill remains for an environment where the owner-only fixture is safely
available. This is a pre-existing fixture limitation, not a new G7 defer, and
does not authorize access to a live database as a substitute. Parent
integration still owns the joined W lifecycle/parity rerun and privileged
`systemd-analyze verify` gate.

External S3 remains deliberately deferred. Local/staging generations persist on
the server disk; the runbook does not claim host/disk/datacenter-loss protection.
