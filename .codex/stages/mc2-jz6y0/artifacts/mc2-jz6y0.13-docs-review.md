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
reviewed_commit: 4267deeee2b9f94781592815b434ecfa652af2d6
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
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Review created no runtime resource and performed no remote action; the dedicated artifact worktree remains for orchestrator inspection.
risk_level: high
docs_impact: ops-deploy-migration-handoff
docs_reviewed: updates-required
docs_review_notes: Six P1 documentation truth gaps must be reconciled before Q12 remote mutation; three P2 maintenance items belong to stage closeout.
graph_reviewed: blocked
graph_review_notes: The local graph available in the integration worktree was built from ebdf9c2e while the reviewed tree is 4267deee; this read-only reviewer did not refresh shared graph state. Parent closeout must run a local no-API refresh after accepted durable documentation changes.
verification:
  - Compared all selected stable docs and current-state files against commit 4267deee runtime, Compose, CI, systemd, migration runners, and package commands.
  - Ran bd show mc2-jz6y0.13 and confirmed current authorization plus the three recorded no-go inputs without reading or mutating staging.
  - Confirmed Graphify report freshness is ebdf9c2e, older than reviewed commit 4267deee.
  - scripts/orchestration/validate_artifact.py on this artifact passed.
  - Prettier check and git diff --check passed.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-docs-review.md
explicit_defers:
  - This review does not edit stable docs; bounded edits belong to the parent integration docs owner after findings are accepted.
  - No staging, production, database, service, secret, queue, image registry, S3, notification, alias, or live Qdrant state was read or mutated.
---

# Summary

## Findings-first verdict

**UPDATES REQUIRED BEFORE Q12 REMOTE MUTATION.** P0: 0, P1: 6, P2: 3,
P3: 0. Commit `4267deee` contains the accepted guarded base-migration runner,
immutable `qdrant-operator` image/profile, digest publication and pre-pull, and
containerized recovery units. Stable documentation still describes the prior
host-source runtime, only half of the migration chain, an authorization state
that has already changed, and an nginx-only rollback that the implementation no
longer performs.

The owner authorization is real and specific, but it does not clear the current
no-go inputs recorded by Beads: off-host S3 credentials are unavailable,
`file_catalog` has 80 missing and 2 invalid canonical source paths, and the
remote PostgreSQL `verify-full` path still needs the project CA certificate.
No remote mutation has occurred. Documentation must preserve those hard stops
rather than treating authorization as activation readiness.

| ID      | Priority | Finding                                                                                                                                                                                                                                 | Required disposition                                                                                                                                              |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q12-DR1 | P1       | The production Qdrant runbook still executes host `pnpm`/source against loopback, while the accepted runtime requires the immutable container operator, Docker-local URL, file secrets, a digest and a dedicated queue/physical target. | Replace production bootstrap/reindex/recovery commands with exact `operator-compose.sh` procedures; retain host `pnpm` only in explicitly local-development docs. |
| Q12-DR2 | P1       | The evidence runbook documents only migrations `150/151`; it omits the guarded `120 -> 130 -> 140` prerequisite runner and the complete remote apply/verification order.                                                                | Add the five-version fail-closed sequence, exact confirmation strings, `verify-full` CA requirement, quiesce window and post-apply catalog/RLS/RPC checks.        |
| Q12-DR3 | P1       | Deployment docs omit the operator build/digest/pre-pull and first-bootstrap sequence; `/deploy` is presented as a normal zero-downtime action even though its pre-cutover verify cannot bootstrap an empty Qdrant.                      | Document the Q12 initial-activation path separately and forbid treating `/deploy` as the bootstrap/reindex command.                                               |
| Q12-DR4 | P1       | Secret guidance is generic and the deployment guide still checks `/usr/bin/pnpm`; exact host paths, owners/modes, metrics GID and containerized systemd commands are missing.                                                           | Add one authoritative secret/path/UID/GID table and exact oneshot/timer install/verification commands for the container operator.                                 |
| Q12-DR5 | P1       | Rollback docs say workers are not restarted, while the accepted script restores immutable color images and recreates main/Stage 6 workers before switching traffic.                                                                     | Reconcile the nine-step rollback, deploy transaction state, immutable images, worker/env coherence, queue pause and evidence containment variants.                |
| Q12-DR6 | P1       | Handoff, stage summary and evidence rollout text still say Q12 awaits authorization and gradual staging promotion; Beads records explicit staging `true/active/100` authorization plus unresolved hard stops.                           | Record the superseding owner decision, current no-go reasons, exact stop gates, current head/accepted Q12 streams and “no remote mutation yet” truth.             |
| Q12-DR7 | P2       | The package Qdrant setup can be read as a production reindex procedure because its second half uses host `pnpm` without a local-only qualifier.                                                                                         | Label the whole command block local-development-only and link production operators to the container runbook.                                                      |
| Q12-DR8 | P2       | Environment examples do not expose the production operator digest, metrics directory/GID, monitoring secret paths or current staging decision context.                                                                                  | Add a sanitized production variable table/template reference; keep secret values absent and preserve local defaults in the package example.                       |
| Q12-DR9 | P2       | Prometheus retention remains on deprecated CLI flags and Graphify/current docs evidence is stale after durable Q12 changes.                                                                                                             | Track the accepted retention-YAML defer and refresh local Graphify after doc reconciliation during closeout.                                                      |

# Required before remote mutation (P1)

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

# Closeout maintenance (P2)

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

# Recommended bounded edit order

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

- `docs-reviewed: updates-required` — production operator, migration,
  deployment, rollback, owner-decision and current-state docs contradict accepted
  commit `4267deee`.
- `graph-reviewed: blocked` — existing local graph is at `ebdf9c2e`; parent must
  refresh locally after durable docs are updated.
- `project-index: review-required` — if it names host pnpm/source as the stable
  production operator entrypoint, replace that pointer with
  `deploy/qdrant/operator-compose.sh` plus the operations runbook; otherwise no
  content expansion is needed.

# Risks / Follow-ups

- Remote mutation remains NO-GO until the S3 credentials, source-path product
  truth, and verified Supabase CA inputs are available and every P1 documentation
  gap above has been reconciled with an independently reviewed command packet.
- This artifact records proposed bounded edits only. It does not attest that the
  stable docs have been corrected or that any live gate has passed.
- Parent closeout owns stable-doc edits, independent docs review, Graphify refresh,
  Beads/handoff/summary reconciliation, commit/push, and worktree cleanup.
