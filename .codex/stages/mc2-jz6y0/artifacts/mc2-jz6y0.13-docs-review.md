---
schema_version: orchestration-artifact/v1
artifact_type: independent-review
task_id: mc2-jz6y0.13-docs-review
stage_id: mc2-jz6y0
agent_type: docs_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Q12 documentation controls privileged migrations, immutable operator execution, recovery credentials, first bootstrap, evidence activation, and rollback; stale commands can either block recovery or move staging into a partially activated state.
repo: mc2
branch: codex/q12-docs-review
base_branch: codex/self-hosted-qdrant-platform
base_commit: 4267deeee2b9f94781592815b434ecfa652af2d6
reviewed_commit: 9e8403490df6cb854c4f6e06352844d0987e7ee3
worktree: /home/me/code/mc2/.worktrees/q12-docs-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-docs-review.md
success_criteria:
  - Compare integrated Q12 runtime, migration, deployment, recovery, secret, and activation contracts with stable operator documentation.
  - Identify stale host-pnpm/source procedures and missing immutable operator, migration, systemd, secret, owner-decision, and hard-stop guidance.
  - Separate documentation required before any remote mutation from bounded closeout maintenance.
selected_docs:
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .claude/docs/deployment-guide.md
  - .claude/commands/deploy.md
  - packages/course-gen-platform/docs/qdrant-setup.md
  - packages/course-gen-platform/.env.example
  - .codex/handoff.md
  - .codex/stages/mc2-jz6y0/summary.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-authoritative-docs.md
selected_skills:
  - senior-devops
  - verification-before-completion
selected_agents:
  - docs_reviewer
catalog_candidates:
  - none - repository runtime truth and the selected installed skills cover this bounded audit
parallel_group: Q12-docs-closeout
depends_on_streams:
  - mc2-jz6y0.13.1
  - mc2-jz6y0.13.2
  - mc2-jz6y0.13.3
parallel_decision: parallel read-only audit with a disjoint artifact-only write zone
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Review created no runtime resource or remote action; zero-finding review 9bcca13a was merged and accepted.
risk_level: high
docs_impact: ops-deploy-migration-handoff
docs_reviewed: updated
docs_review_notes: Re-review of 9e840349 confirmed all six original P1 and three original P2 documentation findings are resolved with no new P0-P3 finding.
graph_reviewed: updated
graph_review_notes: After review integration, the parent ran Graphify 0.8.45 update and cluster-only locally; report totals were 50,796 nodes and 75,445 edges with no forbidden source paths, external model/API mode, or hook.
verification:
  - Re-reviewed documentation implementation 9e840349 against original audit 2943a942 and accepted code through 6645708d, including release-bound rollback remediation 3e14c922.
  - All six original P1 and three original P2 findings were mapped to exact current docs and implementation contracts: passed with no residual finding.
  - Markdown Prettier, implementation artifact validation, diff whitespace, shell syntax, CI workflow gate, blue-green fail-closed tests, and deploy change-detector tests passed.
  - Stale host-pnpm/authorization/rollback scans returned no unexpected match; the only host-pnpm examples are explicitly local-development-only.
  - Sanitized environment files have unique keys; changed-lines secret/product-ID scan found no credential, product/file UUID, content, or provenance leak.
  - Handoff is 111 lines against the 200-line budget.
  - Parent Graphify refresh completed after durable docs integration; the final report commit is rechecked after the closeout-state commit.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-docs-review.md
explicit_defers:
  - Parent integration must run the remaining Q12 canonical closeout only after live activation gates pass.
  - No staging, production, database, service, secret, queue, image registry, S3, notification, alias, or live Qdrant state was read or mutated.
---

# Summary

## Re-review verdict

**PASS / APPROVED FOR ORCHESTRATOR INTEGRATION.** Documentation commit
`9e840349` resolves all findings from original audit `2943a942`. Final count:
P0: 0, P1: 0, P2: 0, P3: 0. No remote action was performed.

| Original ID | Result   | Re-review evidence                                                                                                                                                      |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q12-DR1     | Resolved | Production/staging use the digest-checked container operator; host pnpm is confined to explicitly local-only setup/module pages.                                        |
| Q12-DR2     | Resolved | The exact guarded `120 -> 130 -> 140 -> 150 -> 151` sequence, project CA, `verify-full`, confirmation strings, quiesce and catalog/RLS/RPC checks are documented.       |
| Q12-DR3     | Resolved | Operator publication/digest/pre-pull and the bootstrap-before-ordinary-`/deploy` initial activation sequence match accepted runtime behavior.                           |
| Q12-DR4     | Resolved | Exact secret paths, owners/modes, UID/GID preflight, operator wrapper, systemd oneshots/timers and credential staging are recorded.                                     |
| Q12-DR5     | Resolved | Rollback commands require the exact 40-character release commit and matching deploy transaction; immutable app images and both workers are restored before nginx moves. |
| Q12-DR6     | Resolved | Handoff, summary and runbooks record staging `true/active/100` authorization, no remote mutation, and the current CA/S3/source NO-GO inputs/hard stops.                 |
| Q12-DR7     | Resolved | Every remaining host-pnpm command is explicitly local-development-only and links to the production operator runbook.                                                    |
| Q12-DR8     | Resolved | The sanitized production environment contract includes operator digest, monitoring paths/GID, S3/recovery inputs and active/100 without real values.                    |
| Q12-DR9     | Resolved | Prometheus retention is a bounded tracked defer and Graphify refresh ownership is explicit for parent closeout.                                                         |

The remaining CA, off-host S3 and source-truth inputs are external Q12 activation
NO-GO conditions, not residual documentation findings. The docs preserve the
ban on `--allow-gaps`, partial activation, unverified TLS, mutable operator tags,
restore-over-active, and incident down-migration.

## Original audit record

The sections below preserve the original `4267deee` findings and bounded edit
rationale for traceability. Each finding is resolved by `9e840349`; none remains
an open P1/P2 blocker.

# Original required-before-remote findings (resolved)

## Q12-DR1 — stable runbook invokes the superseded host runtime

**Evidence.** `docs/operations/qdrant-self-hosted.md:168-200` defines a raw-key
`qdrant_admin` helper and invokes five host `pnpm` commands. Its recovery section
uses host-loopback semantics (`docs/operations/qdrant-self-hosted.md:202-240`),
and the systemd section explicitly requires `/usr/bin/pnpm` plus repository
source (`docs/operations/qdrant-self-hosted.md:254-274`). The deployment guide
repeats that preflight at `.claude/docs/deployment-guide.md:298-310`.

The accepted runtime is different:

- the `qdrant-operator` image target carries exact source/tool entrypoints and
  dispatches them after dropping to UID/GID 1001
  (`packages/course-gen-platform/Dockerfile:165-197`,
  `packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh:206-305`);
- Compose constructs only
  `ghcr.io/maslennikov-ig/mc-2/qdrant-operator@sha256:<digest>`, uses
  `pull_policy: never`, Docker-local `http://qdrant:6333`, root-owned file
  secrets, read-only filesystems, and profile-only services
  (`docker-compose.infra.yml:85-225`);
- `deploy/qdrant/operator-compose.sh:9-46` rejects an absent or malformed
  64-hex digest before Docker runs;
- reindex execution requires UUIDv4 run/queue identity, a non-alias physical
  target and the durable artifact path under
  `/var/lib/megacampus-qdrant-recovery/reindex`
  (`packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh:51-124,233-265`).

**Impact.** Following the stable runbook on the actual host fails because host
Node/pnpm/source are intentionally unnecessary. Worse, it bypasses the accepted
queue, target, file-secret, digest and read-only-container boundaries.

**Bounded edit.** Replace the production command blocks in
`docs/operations/qdrant-self-hosted.md` with a single shell prefix using:

```text
/opt/megacampus/deploy/qdrant/operator-compose.sh \
  --project-directory /opt/megacampus \
  -f /opt/megacampus/docker-compose.infra.yml \
  --env-file /opt/megacampus/.env.production \
  --profile operator run --rm --no-deps -T
```

Document exact `qdrant-operator bootstrap`, `verify`, `reindex plan`, paired
`reindex-worker` plus `reindex execute`, and `reindex verify` examples. Require
one generated UUIDv4 for both `qdrant-reindex-<run-id>` and `--run-id`, an
explicit physical target, the automatic run-bound artifact path, no
`--allow-gaps`, and cleanup/inspection of the dedicated queue. Recovery examples
must use `qdrant-recovery-operator`/`qdrant-restore-operator` and prefer the
accepted systemd units. Delete the host `/usr/bin/pnpm` prerequisite from
production guidance.

## Q12-DR2 — migration documentation omits the first three required versions

**Evidence.** `docs/operations/document-evidence.md:275-327` describes only the
unified observability runner for `20260711150000` and `20260711151000`. The
accepted package now exposes a separate base runner at
`packages/course-gen-platform/package.json:60-61`. It applies only the fixed,
SHA-256-allowlisted `20260711120000`, `20260711130000`, and `20260711140000`
chain and requires exact remote confirmations
(`packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts:96-161,228-264,1169-1242`).
The observability runner then applies `150000` followed by `151000`, and reverses
that order on rollback
(`packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts:661-755`).

**Impact.** Applying consumer code/flags after only `150/151`, or using a generic
`db push`, can leave prerequisite tables, RLS, conflict RPCs or side identities
absent. The guarded runner intentionally rejects unrelated pending migrations;
the docs currently provide no complete approved remote path.

**Bounded edit.** Add one exact forward procedure after a read-only migration
inventory and backup/PITR confirmation:

1. pause answer/decision writers and affected Stage 4/5/6 queues;
2. require `SUPABASE_DB_URL` with `sslmode=verify-full` and the project CA via
   `sslrootcert` (never `rejectUnauthorized=false`);
3. run `migration:document-evidence-approved:apply -- --allow-remote --confirm
'APPLY REMOTE DOCUMENT EVIDENCE BASE 20260711120000 20260711130000
20260711140000'`;
4. run `migration:document-evidence-observability:apply -- --allow-remote
--confirm 'APPLY REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711150000
20260711151000'`;
5. verify exact contiguous history and live catalog/RLS/RPC/trigger/index state,
   then deploy matching consumers before resuming writers.

Document the reverse confirmation strings but retain the incident rule: do not
down-migrate evidence/audit tables as a shortcut. Any earlier/unknown/gapped/
later migration frontier, CA failure, lock overrun or live/history mismatch is a
hard stop.

## Q12-DR3 — deployment docs have no first-bootstrap/operator release sequence

**Evidence.** `.claude/docs/deployment-guide.md:122-147` still describes the old
13-step flow without an operator release. Its CI matrix section says only web,
API and NotebookLM images are built (`.claude/docs/deployment-guide.md:180-216`).
The accepted detector builds `qdrant-operator` for every deploy-relevant change
(`scripts/ci/detect_deploy_changes.sh:181-204`), and the deploy script resolves
the release tag to a repository digest, pre-pulls it, validates 64 lowercase hex
and persists `QDRANT_OPERATOR_IMAGE_SHA256` before infrastructure Compose
(`scripts/deploy_blue_green.sh:239-252`).

The ordinary deploy then starts Qdrant and monitoring
(`scripts/deploy_blue_green.sh:290-294`) but runs verify-only before starting the
new app color (`scripts/deploy_blue_green.sh:176-209,326-339`). It does not
bootstrap or reindex an empty first-install collection. Nevertheless
`.claude/commands/deploy.md:6-15` promises a normal zero-downtime switch, and the
manual guide still passes mutable `latest`
(`.claude/docs/deployment-guide.md:168-177`).

**Impact.** `/deploy` is fail-closed but cannot be the first Qdrant activation
procedure: the verify gate stops on an unbootstrapped collection. Operators may
otherwise improvise an unpinned image or activate app consumers before reindex,
snapshot and rollback evidence exist.

**Bounded edit.** Add a separate “Q12 initial activation” sequence to the Qdrant
runbook and deployment guide: publish the release-SHA operator image; resolve and
record its digest; copy reviewed assets and provision secrets without switching
app traffic; create directories; pre-pull exact images; start only Qdrant/
monitoring; run operator self-check/metrics-check; bootstrap the physical
collection; run gap-free plan/execute/verify; snapshot/restore; only then invoke
the blue/green consumer cutover. State explicitly that `/deploy`, `--force` and
`latest` are not Q12 bootstrap shortcuts.

## Q12-DR4 — exact secret ownership and containerized systemd contract are absent

**Evidence.** The secret section says only to give each file the consumer UID
and mode 0400 (`docs/operations/qdrant-self-hosted.md:68-80`). It does not list
the actual deployment contract:

- root:root 0400: admin key, server read-only key, S3 access/secret keys;
- 65534:65534 0400: Prometheus read-only copy and both Alertmanager Telegram
  files;
- 472:472 0400: Grafana admin password;
- `/var/lib/megacampus/qdrant-metrics`: `megacampus:megacampus-metrics`, mode
  2775, with a target-host-conflict-free numeric GID;
- operator digest in `.env.production`, not a secret value;
- snapshot manifest at
  `/var/lib/megacampus-qdrant-recovery/manifests/latest-manifest.json` and
  recovery probe at `/opt/megacampus/recovery/probe.json`, both owner-only.

CI installs the static secret files with those owners/modes at
`.github/workflows/ci-cd.yml:801-846`. The systemd units no longer run pnpm: they
stage root-owned credentials into private runtime directories and invoke the
digest-checked Compose operator under host `flock`
(`deploy/systemd/megacampus-qdrant-snapshot.service:6-39`,
`deploy/systemd/megacampus-qdrant-restore-drill.service:6-44`). Current Beads
truth also records that the example GID 995 conflicts on the target; GID 900 is
only a candidate pending an immediate pre-mutation `getent` recheck.

**Impact.** Generic ownership advice can make Qdrant/operator secrets unreadable,
or over-broaden them to satisfy multiple consumers. A stale pnpm check falsely
blocks the supported host and encourages unit edits outside the reviewed
contract.

**Bounded edit.** Add an authoritative file/path/consumer/UID:GID/mode table,
the atomic free-GID preflight, `operator-compose.sh ... self-check` and
`metrics-check`, `systemd-analyze verify`, daemon-reload, manual oneshot tests,
timer enablement/listing, and journal/status checks. State that Compose file
secrets do not remap host ownership and that secret values/checksums must never
enter artifacts.

## Q12-DR5 — rollback prose contradicts the accepted immutable rollback

**Evidence.** `.claude/docs/deployment-guide.md:315-329` lists eight actions under
a nine-step heading and says rollback does not restart workers. The command page
calls rollback “instant” without Q12 qualifications
(`.claude/commands/deploy.md:8-15,42-46`). The accepted script instead requires a
switched/accepted deploy transaction, validates immutable API/web image digests,
recreates the target color, health-checks it, recreates main and Stage 6 workers
with the same target-color environment, then switches nginx and stops the broken
color (`scripts/rollback_blue_green.sh:31-176`).

Document-evidence containment additionally requires queue quiescence and a
coherent main/Stage 6 restart (`docs/operations/document-evidence.md:401-452`).

**Impact.** An operator following the prose can leave workers on the failed
Qdrant/evidence environment while web/API traffic returns to the prior color.
“Instant” is not supportable across migrations, reindex, alias or evidence-flag
containment.

**Bounded edit.** Reconcile the deployment guide and command page with the exact
nine-step script and distinguish three rollback scopes: immutable app/color plus
workers; evidence containment (`cohort=0` or shared gate false after quiesce);
and atomic alias rollback to a previously verified physical collection. Preserve
audit rows, failed collection, manifests and snapshots. Never promise database
down-migration or restore-over-active as incident rollback.

## Q12-DR6 — current owner decision and no-go gates are absent from current-state docs

**Evidence.** `.codex/handoff.md:53-57,89-97` still recommends asking for Q12
authorization and calls it an explicit defer. The stage summary remains
“authorization-gated” (`.codex/stages/mc2-jz6y0/summary.md:3-8`), marks stream X
blocked pending authorization (`:32-44`), and repeats that state at
`:130-145`. `docs/operations/document-evidence.md:348-399` still requires a
gradual future staging promotion and explicitly limits the recorded `100%`
decision to development.

Fresh `bd show mc2-jz6y0.13` reports Q12 in progress and records the owner's
2026-07-12 authorization for staging deploy, live reindex, S3 drill,
service/secret changes, real notification and exact staging
`DOCUMENT_EVIDENCE_ENABLED=true`, `DOCUMENT_EVIDENCE_MODE=active`,
`DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100`. It explicitly supersedes only the
gradual staging promotion, not the hard invariants. The same source records the
current NO-GO inputs: missing off-host S3 credentials, 80 missing plus 2 invalid
canonical source paths, and the required Supabase project CA for
`sslmode=verify-full`.

**Impact.** A new operator may unnecessarily re-request authorization or, more
dangerously, see the checked-in `active/100` environment and overlook the
remaining product-truth, recovery and TLS hard stops.

**Bounded edit.** Update handoff and stage summary first, then reconcile the
evidence rollout section with an explicit superseding staging owner decision.
Record exact current branch/head and accepted Q12 migration/operator/immutable
rollback streams. State that no remote mutation has occurred and preserve these
hard stops:

1. project CA plus exact five-migration inventory/apply/verification;
2. off-host S3 bucket/region/HTTPS endpoint, credentials and lifecycle, followed
   by checksum-verified snapshot/isolated restore;
3. zero missing/invalid authoritative source paths or an explicit audited owner
   product-truth decision—never `--allow-gaps`;
4. exact operator/Qdrant/monitoring digests, private listeners, secret metadata,
   free metrics GID and Compose/systemd validation;
5. gap-free deterministic reindex, RU/EN BM25/RRF/Formula, strict schema,
   point/parity and tenant/course isolation;
6. coherent immutable app/worker rollback plus evidence containment rehearsal;
7. exact 100% durable coverage and baseline preservation, zero isolation
   violations and unresolved P0/P1 findings;
8. real firing/resolved notification, 60-minute observation plus one complete
   normal cycle, cleanup and retained rollback evidence.

# Original closeout findings (resolved)

## Q12-DR7 — package setup needs an explicit local-only boundary

`packages/course-gen-platform/docs/qdrant-setup.md:7-32` clearly begins as local
development, but its separate reindex/recovery section
(`packages/course-gen-platform/docs/qdrant-setup.md:44-70`) again uses host
`pnpm` and loopback without saying that this is local-only. Add one sentence
above the block: production/staging must use the digest-pinned container operator
from the operations runbook; these commands are for a checked-out local repo and
the isolated dev Qdrant only. `packages/course-gen-platform/src/shared/qdrant/README.md:19-31`
and `COLLECTION_SETUP.md:1-22` should carry the same short qualifier or link.

## Q12-DR8 — env examples do not show the production operator/monitoring contract

`packages/course-gen-platform/.env.example:16-34` documents local Qdrant/S3 and
the local/dev active decision, but it lacks the production-only operator digest,
metrics path/GID, separate Prometheus copy, Grafana/Alertmanager paths and
recovery inputs. The root `.env.example:1-80` has no Qdrant section and is an MCP/
developer template, so overloading it with deployment secrets would be
misleading. Prefer a sanitized production variable table in the operations
runbook (or a dedicated no-values deployment template), and add only a pointer
from the package example. Never add real secret values, fixture IDs or CA
material.

## Q12-DR9 — retention maintenance and Graphify freshness remain closeout work

The accepted authoritative research records that Prometheus 3.13.1 still accepts
the configured retention flags but marks them deprecated
(`.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-authoritative-docs.md:238-252`).
The live Compose still uses those flags (`docker-compose.infra.yml:243-247`).
This is the already bounded `mc2-jz6y0.25` maintenance defer, not a Q12 blocker;
mention it in current handoff and move retention to supported YAML before the
next Prometheus pin change.

The local Graphify report available in the integration worktree says it was
built from `ebdf9c2e`, while this review targets `4267deee`. The fresh worktree
contains no tracked `graphify-out`, confirming the graph is local-only. After
accepted durable docs are merged, parent closeout must run the repository's
local no-API `graphify update .` and `graphify cluster-only . --no-viz`, then
record `graph-reviewed: updated` with the new report commit. Do not use external
model/API modes or install Git hooks.

# Original bounded edit order (completed by 9e840349)

1. Update `.codex/handoff.md` and `.codex/stages/mc2-jz6y0/summary.md` so the
   next actor sees authorization plus the three current NO-GO inputs.
2. Rewrite the production operator, secret and systemd blocks in
   `docs/operations/qdrant-self-hosted.md` around the accepted container runtime.
3. Extend `docs/operations/document-evidence.md` with the complete five-migration
   sequence and the superseding staging `active/100` decision/hard stops.
4. Reconcile `.claude/docs/deployment-guide.md` and `.claude/commands/deploy.md`
   with operator publication/pre-pull, first activation and immutable coherent
   rollback.
5. Add local-only qualifiers/pointers in Qdrant setup/module docs and a sanitized
   production env contract reference.
6. Run Markdown formatting/link/forbidden-pattern checks, process verification,
   independent docs review, local Graphify refresh and canonical stage closeout.

# Verification

- `docs-reviewed: updated` — production operator, complete guarded migrations,
  initial activation, release-bound rollback, owner decision, current NO-GO
  state, sanitized environments, and local-only developer commands match the
  accepted implementation at `9e840349` over integration `6645708d`.
- `graph-reviewed: blocked` — existing local graph is at `ebdf9c2e`; parent must
  refresh locally after the durable docs are integrated.
- `project-index: no-change-needed` — it already points to the stable operations
  runbooks/assets and keeps host commands under the developer-setup entrypoint;
  it does not claim host pnpm/source is the production runtime.
- Fresh mechanical evidence: Markdown Prettier passed; implementation artifact
  validation passed; `git diff --check` passed; all three deploy-contract test
  scripts passed; stale scans returned no unexpected match; environment examples
  have unique keys; handoff is 111/200 lines; changed-lines leak scan was clean.

# Risks / Follow-ups

- Remote mutation remains NO-GO until the S3 credentials, source-path product
  truth, and verified Supabase CA inputs are available. That is expected external
  activation state, not a residual documentation defect.
- This PASS attests only the reviewed repository documentation and local command
  mapping. It does not attest that any live migration, source repair, snapshot,
  restore, notification, deployment, reindex, cutover, or observation gate ran.
- Parent closeout owns integration, Graphify refresh, Beads acceptance, canonical
  closeout, final push, and worktree cleanup.
