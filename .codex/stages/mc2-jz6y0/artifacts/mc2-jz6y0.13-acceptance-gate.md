---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Staging cutover joins data migration, tenant isolation, recovery, rollout and rollback boundaries; false confidence could cause cross-tenant disclosure or an unrecoverable RAG outage.
repo: /home/me/code/mc2
branch: codex/q12-acceptance-gate
base_branch: codex/self-hosted-qdrant-platform
base_commit: ebdf9c2eb85598c148eeada865378ee51ba2cdf0
worktree: /home/me/code/mc2/.worktrees/q12-acceptance-gate
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-acceptance-gate.md
success_criteria:
  - Every Q12 product, recovery, relevance, strict-mode, resume, observability and isolation invariant has an executable evidence gate and a rollback trigger.
  - Findings-first verdict distinguishes blockers from expected observations and never treats Q11 local evidence as proof of staging state.
  - No staging, production, Cloud, service, secret, database, queue, S3, notification or live Qdrant mutation occurs in this review stream.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - docs/superpowers/specs/2026-07-12-document-evidence-dev-activation-design.md
  - docs/superpowers/plans/2026-07-12-document-evidence-dev-activation.md
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .claude/docs/deployment-guide.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-acceptance.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-focused.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-postgres.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-infra.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-readiness.md
  - /tmp/q12-graphify-query.txt
selected_skills:
  - code-review
  - verification-before-completion
selected_agents:
  - correctness_reviewer persona
catalog_candidates:
  - none - the selected repository skills, accepted designs and operator runbooks cover this evidence-only review
parallel_group: C
depends_on_streams:
  - Q12-P read-only preflight
  - Q12-D deployment execution
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Read-only review started no service and created no runtime resource. Only this tracked artifact is owned; staging cleanup remains an execution-stream gate.
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: This stream derives an acceptance matrix from accepted durable docs and changes no product or operator contract.
verification:
  - Read all selected designs, plans, Q11 artifacts, deployment and operator runbooks: passed
  - Read focused Graphify result from /tmp/q12-graphify-query.txt: passed
  - Repository history and exact deployment/recovery/config sources inspected: passed
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-acceptance-gate.md: passed
  - /home/me/code/mc2/node_modules/.bin/prettier --check .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-acceptance-gate.md: passed; the isolated worktree has no node_modules, so the verified primary-workspace wrapper was used directly after pnpm exec failed with EACCES
  - git diff --check: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-acceptance-gate.md
explicit_defers:
  - Remote mutation remains blocked until findings Q12-G1 through Q12-G4 are resolved with current staging evidence; this reviewer has intentionally performed none.
---

# Summary

## Findings-first verdict

**Verdict: BLOCKED FOR MUTATION, safe to continue read-only preflight.** The user's
current-task authorization resolves the permission boundary, but it does not prove
staging schema, queue, secret, source, recovery-probe or rollback truth. There are
no P0 findings. Four P1 gates must be closed before changing staging.

| ID     | Severity | Confidence | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                             | Required resolution before mutation                                                                                                                                                                                                                                                                                                                     |
| ------ | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q12-G1 | P1       | high       | The five document-evidence migrations are proven only on disposable PostgreSQL. The runbook has a remote-gated runner only for `20260711150000`/`151000`; it does not define an allowlisted remote application path for prerequisite `120000`/`130000`/`140000`. Activating Stage 4/5/6 without all five schemas/RPCs is a deterministic failure, while an unrestricted `db push` may include unrelated pending migrations.                                                        | `docs/operations/document-evidence.md:280-327`; `packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts:80-105,729-755`; Q11 applied-only proof in `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-postgres.md`; Q12 plan omits database activation at `docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md:936-954`. | Read-only migration inventory and backup first. Approve an exact, bounded `120000 -> 130000 -> 140000 -> 150000 -> 151000` execution that rejects every unexpected pending migration; quiesce writers for the documented lock window; verify all catalog/RLS/RPC surfaces before code/flag activation.                                                  |
| Q12-G2 | P1       | high       | `rollback_blue_green.sh` is not a complete Q12 rollback. It starts all infra without the selected environment file and rolls back web/API only; it never restores/recreates the main or Stage 6 workers, evidence flags or their Qdrant contract. An nginx color rollback can therefore leave generation workers on the failed configuration.                                                                                                                                      | `scripts/rollback_blue_green.sh:53-61,125-131`; worker restarts occur only in forward deploy at `scripts/deploy_blue_green.sh:281-299`; coherent evidence rollback requires quiesce plus both worker restarts at `docs/operations/document-evidence.md:401-448`.                                                                                                     | Capture prior env/image digests and define/test a Q12-specific rollback command set that uses `--env-file`, restores API plus both RAG workers coherently, verifies their redacted env, and leaves queues paused until no-document and document-backed checks pass. Do not claim the existing script alone is sufficient.                               |
| Q12-G3 | P1       | high       | Q12 requires a document-backed Stage 2 -> Stage 5/6 smoke and exact restore probe, but the repository has no dedicated live document-evidence staging smoke/cleanup command. The restore service also requires an owner-only probe tied to exact indexed point/document/chunk/content identities. Without predeclared fixtures and cleanup, live proof is irreproducible or may leak product IDs/content into artifacts.                                                           | Q12 plan `docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md:948-954`; probe contract `packages/course-gen-platform/tools/qdrant/restore-drill.ts:32-107,148-279`; systemd credential `deploy/systemd/megacampus-qdrant-restore-drill.service:12-26`; privacy boundary `docs/operations/document-evidence.md:471-510`.                                 | Before mutation, select disposable authorized no-document, manual-conflict and automatic-conflict fixtures; define creation, observation and product-API cleanup commands; generate `/opt/megacampus/recovery/probe.json` mode `0400` inside the controlled operator session. Artifacts record only counts/statuses, never fixture IDs, text or hashes. |
| Q12-G4 | P1       | high       | Immediate staging `active/100` conflicts with the accepted remote rollout contract, which says staging/production must not skip shadow -> manual conflicts -> automatic decisions -> bounded cohort and must record cohort/observation/rollback ownership. The 100% owner decision currently committed is explicitly local/dev only. Current authorization permits remote effects and requests 100%, but the durable staging decision and supersession rationale are still absent. | `docs/operations/document-evidence.md:348-399`; `docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md:443-459`; dev-only boundary `docs/superpowers/specs/2026-07-12-document-evidence-dev-activation-design.md:3-10,28-50,73-77`.                                                                                                             | Before flags change, either execute the ordered staging gates or record an explicit superseding staging owner decision that cites the current authorization, fixes cohort `100`, observation window, rollback authority and the hard stops below. Authorization alone must not be treated as passed shadow/manual/automatic evidence.                   |

## Non-blocking operational observations

1. `deploy_blue_green.sh` starts `qdrant` but not `node_exporter`,
   `alertmanager`, `prometheus` or `grafana` (`scripts/deploy_blue_green.sh:154-158`).
   Q12 must start the five exact monitoring/index services explicitly.
2. Forward deploy runs `qdrant:verify` before starting the new app color
   (`scripts/deploy_blue_green.sh:198-202`). On the first cutover, bootstrap and
   reindex therefore must finish before invoking the deploy script; an empty server
   correctly makes forward deployment fail.
3. The old Cloud endpoint is unusable. The first self-hosted cutover has no usable
   prior index target, so post-cutover failure cannot be repaired by pointing back
   to Cloud. The safe state is paused generation with `RAG_INFRA_UNAVAILABLE` while
   self-hosted recovery proceeds (`docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md:318-328,379-387`).
4. The Q12 plan names only Qdrant, Prometheus and Grafana at startup, while the
   actual Prometheus dependency graph also requires `node_exporter` and
   `alertmanager` (`docker-compose.infra.yml:85-220`). The execution order below
   uses the repository runtime rather than the shortened prose list.

# Hard-stop sequencing

No later phase can compensate for a failed earlier phase.

| Phase | Mutation allowed                                                             | Entry evidence                                     | Exit gate / hard stop                                                                                                                        | Rollback state                                                                                                    |
| ----- | ---------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A     | none                                                                         | user authorization plus this matrix                | G1-G4 resolved; exact change window, executor and rollback authority recorded                                                                | no runtime state changed                                                                                          |
| B     | none                                                                         | SSH/read-only DB/Docker access                     | host, disk, pins, private ports, queue inventory, migration inventory, source counts, secret metadata and pre-change images/env all captured | no runtime state changed                                                                                          |
| C     | queue pause and approved DB migrations only                                  | verified DB backup/PITR and bounded migration plan | all five migrations/catalog/RLS/RPC checks pass; any unexpected pending migration or lock overrun stops                                      | keep queues paused; do not down-migrate evidence tables as an incident shortcut                                   |
| D     | Qdrant and monitoring services, bootstrap, reindex, snapshot/restore         | C green; secrets/directories/Compose green         | exact pins/private binding; zero reindex gaps; schema/relevance/isolation/strict/recovery/notification gates green                           | stop new services without deleting volumes/manifests/snapshots; applications still use old config                 |
| E     | staging env, new app color and both RAG worker recreations                   | D green; Q12-specific worker rollback rehearsed    | three consumers show local URL and coherent evidence flags; Cloud hostname absent; API/web healthy                                           | restore saved env/images and both workers; keep generation paused if prior Qdrant endpoint is unusable            |
| F     | disposable smoke fixtures, 100% evidence activation only after G4 resolution | E green                                            | no-document, coverage, conflicts, automatic audit, Stage 5/6, resume and negative isolation checks all green                                 | quiesce; set cohort `0` or shared gate false; coherently restart workers; retain all audit rows                   |
| G     | timers and normal traffic                                                    | F green                                            | at least 60 minutes and one complete normal cycle inside all thresholds; firing and resolved notification observed; cleanup complete         | same as F; alias rollback only to a previously verified physical collection; never restore over active collection |

# Verification

## Evidence command contract

Commands run inside an access-controlled operator session. `STAGING_DB_URL`, API
keys and fixture IDs are shell variables or owner-only files and must never enter
terminal capture, Beads or `.codex` artifacts. Use `set +x` before reading them.

## A. Read-only preflight

```bash
cd /opt/megacampus
set +x
git rev-parse HEAD
cat active_color
docker version --format '{{.Server.Version}}'
docker compose version
systemd --version | head -1
test "$(systemd --version | awk 'NR==1 {print $2}')" -ge 247
test "$(command -v pnpm)" = /usr/bin/pnpm
id megacampus
df -h / /var/lib/docker
ss -ltn
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
docker inspect -f '{{.Name}} {{.Image}}' megacampus-api-$(cat active_color) megacampus-worker megacampus-worker-stage6
```

Record only secret file owner/mode/size, never value or checksum. Require distinct
admin/read-only files, matching read-only copies for Prometheus, all files mode
`0400`, and the exact mode-`2775` metrics directory from the runbook.

```bash
for f in \
  secrets/qdrant_api_key secrets/qdrant_read_only_api_key \
  secrets/prometheus_qdrant_read_only_api_key \
  secrets/qdrant_s3_access_key secrets/qdrant_s3_secret_key \
  secrets/grafana_admin_password \
  secrets/alertmanager_telegram_bot_token secrets/alertmanager_telegram_chat_id
do
  test -r "$f"
  stat -c '%n %U:%G %a %s' "$f"
done
test "$(stat -c '%a' /var/lib/megacampus/qdrant-metrics)" = 2775
test ! -L /var/lib/megacampus/qdrant-metrics
```

Render the exact deploy model and compare every image reference with both lock
files. The only public listeners allowed are existing application/nginx surfaces;
ports `6335`, `3005`, `9090` and `9093` must resolve to `127.0.0.1` only and
node_exporter remains private-bridge-only.

```bash
docker compose -f docker-compose.infra.yml --env-file .env.production config --quiet
docker compose -f docker-compose.app.yml --env-file .env.production config --quiet
docker compose -f docker-compose.production.yml --env-file .env.production config --quiet
docker compose -f docker-compose.infra.yml --env-file .env.production config --images
jq -e '.tag == "v1.18.2" and .platform == "linux/amd64"' deploy/qdrant/image-lock.json
jq -e '.prometheus.platform == "linux/amd64" and .grafana.platform == "linux/amd64" and .node_exporter.platform == "linux/amd64" and .alertmanager.platform == "linux/amd64"' ops/qdrant/image-lock.json
```

Before applying anything, use a read-only DB role/transaction to prove the exact
migration history. Expected state is either all five absent in order or an exact,
verified prefix. Any unrelated pending migration, partial object drift or history
row without matching objects is a hard stop.

```bash
cd /opt/megacampus/packages/course-gen-platform
SUPABASE_DB_URL="$STAGING_DB_URL" pnpm exec tsx scripts/check-migration-drift.ts
psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260711120000','20260711130000','20260711140000','20260711150000','20260711151000')
ORDER BY version;
SELECT to_regclass('public.document_evidence_runs') IS NOT NULL AS evidence_runs,
       to_regclass('public.document_evidence_items') IS NOT NULL AS evidence_items,
       to_regclass('public.document_evidence_conflicts') IS NOT NULL AS evidence_conflicts,
       to_regclass('public.document_evidence_decisions') IS NOT NULL AS evidence_decisions,
       to_regclass('public.document_evidence_observability_totals') IS NOT NULL AS evidence_totals;
ROLLBACK;
SQL
```

Queue/in-flight counts, current source/recoverable/gap counts and current evidence
aggregate counts must be captured without selecting IDs or content into the
artifact. Pause Stage 4/5/6 intake before C and choose `drain` or `durable-boundary
requeue` for each in-flight job.

## B. Database gate

Take and validate a database backup/PITR point. Apply only the approved sequence.
The first three migrations need an exact bounded procedure approved by the
orchestrator/database owner; generic `db push` is forbidden unless dry-run proves
that its pending set is exactly the approved prefix and cannot absorb the
concurrent-index files. Apply the last two with the repository runner:

```bash
TMPDIR=${TMPDIR:-/tmp} SUPABASE_DB_URL="$STAGING_DB_URL" \
  pnpm migration:document-evidence-observability:apply -- \
  --allow-remote \
  --confirm 'APPLY REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711150000 20260711151000'
```

Acceptance is all five history rows plus tables, RLS, triggers, functions and
signatures verified, and no unexpected pending migration. Keep decision writers
quiesced until matching consumer code is ready. Rollback of application behavior
retains evidence/audit rows; do not execute `*_rollback.sql` during an incident.

## C. Infrastructure, bootstrap, reindex and pinned retrieval

```bash
cd /opt/megacampus
docker compose -f docker-compose.infra.yml --env-file .env.production \
  up -d qdrant node_exporter alertmanager prometheus grafana
curl --fail --silent http://127.0.0.1:6335/readyz >/dev/null

qdrant_admin pnpm --dir packages/course-gen-platform qdrant:bootstrap -- \
  --physical course_embeddings_v1 --alias course_embeddings
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:verify -- \
  --physical course_embeddings_v1 --alias course_embeddings
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:reindex:plan
```

Plan must have zero gaps. Do not use `--allow-gaps` for cutover. Record one UUID
run and owner-only artifact path, then execute/resume with the same values:

```bash
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:reindex:execute -- \
  --target-collection course_embeddings_v1 --concurrency 2 \
  --run-id "$REINDEX_RUN_ID" --artifact "$REINDEX_ARTIFACT"
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:reindex:verify -- \
  --target-collection course_embeddings_v1
```

`completed == planned`, `failed == 0`, `pending == 0`, expected and indexed
documents/points/courses/organizations match, and verify reports no gaps. Any
missing source stops cutover for an explicit product decision. Re-run execute with
the same run/artifact after interruption; a new run ID is not resume evidence.

The exact live two-file integration is authorized only against disposable test
collections and must finish with collection/alias cleanup. It proves RU/EN native
BM25/IDF, dense+sparse RRF, server Formula, grouping, strict rejection and
negative tenant/course isolation on the actual server version:

```bash
QDRANT_URL=http://127.0.0.1:6335 QDRANT_API_KEY="$QDRANT_API_KEY" \
  pnpm --dir packages/course-gen-platform exec vitest run \
  --config vitest.config.integration-ci.ts \
  tests/integration/ci-qdrant-smoke.test.ts tests/integration/qdrant.test.ts
```

Expected exact total is 15/15 with zero skips, followed by an authenticated list
showing only the production physical collection/alias and no test resources.

## D. Off-host snapshot, restore and notification

Provision the owner-only recovery probe from known reindexed fixture points and
verify its organization/course mismatch controls without writing identifiers to
the artifact. Then install/verify the reviewed units and run both one-shots before
enabling timers:

```bash
sudo systemd-analyze verify \
  deploy/systemd/megacampus-qdrant-snapshot.service \
  deploy/systemd/megacampus-qdrant-snapshot.timer \
  deploy/systemd/megacampus-qdrant-restore-drill.service \
  deploy/systemd/megacampus-qdrant-restore-drill.timer
sudo systemctl daemon-reload
sudo systemctl start megacampus-qdrant-snapshot.service
sudo systemctl is-failed megacampus-qdrant-snapshot.service | grep -qx inactive
sudo systemctl start megacampus-qdrant-restore-drill.service
sudo systemctl is-failed megacampus-qdrant-restore-drill.service | grep -qx inactive
sudo systemctl enable --now megacampus-qdrant-snapshot.timer megacampus-qdrant-restore-drill.timer
systemctl list-timers 'megacampus-qdrant-*'
```

Snapshot acceptance is remote S3 URI, manifest, point count, size, checksum and
age under eight hours. Restore acceptance is isolated exact-version schema/count,
dense, RU, EN, Formula and negative isolation pass; stable alias unchanged; drill
collection/alias absent afterward. Any snapshot/restore failure leaves application
cutover blocked and preserves manifest, failed collection and last known-good
snapshot.

Send a uniquely labeled real Alertmanager probe through the configured receiver,
observe one firing and one resolved delivery, then expire it. Never print token or
chat ID. Missing either delivery blocks cutover; wrong routing stops Alertmanager
first while retaining its volume/config evidence.

## E. Consumer cutover and redacted environment proof

The saved production environment must explicitly set the local Qdrant endpoint,
the raw application key from the same owner-only admin source, and the staging
decision values. Never print the key. After G4 is resolved, expected evidence
values are `true/active/100` on the main and Stage 6 workers; the API needs the
local Qdrant contract but does not own Stage 5/6 job execution.

Run the reviewed blue/green deploy only after C-D pass. Recreate `worker` and
`worker-stage6` coherently, then print only redacted contract values:

```bash
for c in "megacampus-api-$(cat /opt/megacampus/active_color)" megacampus-worker megacampus-worker-stage6
do
  docker exec "$c" node -e '
    const e=process.env;
    const u=new URL(e.QDRANT_URL);
    console.log(JSON.stringify({
      service: process.argv[1],
      qdrant_protocol: u.protocol,
      qdrant_host: u.host,
      key_present: Boolean(e.QDRANT_API_KEY),
      evidence_enabled: e.DOCUMENT_EVIDENCE_ENABLED ?? null,
      evidence_mode: e.DOCUMENT_EVIDENCE_MODE ?? null,
      evidence_stage5_percent: e.DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT ?? null
    }));' "$c"
done
```

All consumers must show `http:` and `qdrant:6333`; key presence is true; no active
container environment contains a retired Cloud hostname. Any mismatch stops new
traffic and triggers the Q12-specific coherent rollback, not nginx-only rollback.

# Product invariant acceptance matrix

Fixture variables are resolved only inside the access-controlled session. SQL
below deliberately outputs booleans/counts, not IDs, content, source names or
hashes.

| Invariant                       | Evidence command / observation                                                                                                                                                                                                                | Pass condition                                                                                                                                               | Hard-stop and rollback trigger                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No-document compatibility       | Run one disposable no-document course through Stage 4 -> Stage 6; inspect final state and confirm no `document_evidence_runs` row for its bound parameter. Re-run the focused no-document unit contracts on the deployed SHA.                 | Baseline course completes; no evidence preflight/conflict UI/enrichment; optional Stage 6 empty RAG remains valid.                                           | Any changed output contract, evidence row or RAG requirement: quiesce, cohort `0`, shared gate false, restore prior consumers.                             |
| Exact durable coverage          | For the accepted smoke run, query source/outcome counts and compare sorted `source_manifest[*].document_id` with `document_evidence_items.document_id` in a read-only transaction.                                                            | `status='accepted'`; source = assessed + degraded + failed; missing, extra and duplicate counts all zero; ratio exactly `1`.                                 | Any ratio below one or missing signal: `DocumentEvidenceCoverageIncomplete`; quiesce immediately and disable active gate while retaining rows.             |
| Large corpus and resume         | Use the approved bounded large-corpus fixture; capture batch/checkpoint counts, interrupt once at a durable boundary, resume with identical fingerprint/evidence version and inspect counts only.                                             | Deterministic completion; no duplicate items/questions/decisions; every source exactly once; bounded retries and no silent truncation.                       | Changed fingerprint reuse, duplicate/missing outcome or unbounded retry: pause queues and retain checkpoint evidence; do not force stale resume.           |
| Separate manual conflicts       | Run a synthetic RU/EN material-conflict course in manual mode and inspect UI/API plus DB counts.                                                                                                                                              | Distinct required block; Stage 4 remains `stage_4_clarifying` until every critical/important question is answered through API; provenance present.           | Course advances with pending material conflict, direct row edit or missing source ref: disable active gate and stop intake.                                |
| Atomic automatic decisions      | Run automatic conflict fixture; join question and decision by bound fixture and select only boolean completeness/counts for `answer_source='system'`, `resolved_by='system'`, rationale, recommendation identity, side handle and provenance. | One atomic question answer and one append-only decision per subject; zero pending required conflicts; repeat creates no duplicate.                           | Partial/missing/duplicate audit or mutable history: stop automatic intake, active gate false, retain rows for diagnosis.                                   |
| Stage 5 baseline-first advisory | Use the accepted deployed-SHA invariant suite plus live document fixture audit. Compare baseline-required section/lesson identity/order against the bounded enrichment result inside the authorized operator session.                         | Baseline structural gate precedes enrichment; 100% required baseline retained; only allowed bounded additions; status is one accepted enum.                  | Any removal/reorder/rename/objective/duration violation or failed-open without decision: quiesce and set cohort `0`; keep Stage 6 active only if intended. |
| Stage 6 decisions and refs      | For one accepted and one rejected conflict side, inspect query audit and generated lesson provenance; run a negative cross-tenant/course ref request.                                                                                         | Current accepted decision/ref/version cache identity used; rejected/stale/foreign refs absent; grouping size two; required-RAG outage fails closed.          | Foreign/rejected ref, stale cache or fabricated source-backed content: pause Stage 6 and disable active gate; never turn required RAG optional.            |
| RU/EN/RRF/Formula/grouping      | Live 15/15 disposable Qdrant gate plus `qdrant:reindex:verify`; controlled CORE/SUPPLEMENTARY fixture.                                                                                                                                        | RU and EN match; hybrid evidence present; CORE outranks equivalent SUPPLEMENTARY; grouped result has max two per document with required evidence retained.   | Any relevance/ranking/grouping failure: no client cutover or alias switch; preserve collection for diagnosis.                                              |
| Strict mode and schema drift    | `qdrant:verify` plus live integration unindexed-filter rejection.                                                                                                                                                                             | All vector/index/strict values exact; incompatible drift refused; unindexed filter rejected.                                                                 | Any drift or unexpectedly accepted filter: no cutover; never auto-mutate the drifted collection.                                                           |
| Tenant/course isolation         | Negative Qdrant queries, restore probe mismatch checks, DB RLS with two tenants, Stage 5/6 foreign-ref request.                                                                                                                               | Zero rows/points/refs across wrong organization or course in every layer.                                                                                    | One violation is P0: stop all evidence/RAG queues, disable active gate, preserve evidence and start security incident handling.                            |
| Reindex resume/parity           | Plan/execute/verify with same run/artifact; compare recoverable distinct documents and expected points/courses/organizations.                                                                                                                 | Zero gaps/extras; exact identity/parity; `completed=planned`, failed/pending zero.                                                                           | Any gap or identity mismatch: no cutover; ask product owner for missing-source decision rather than marking indexed.                                       |
| Snapshot/restore/RPO/RTO        | S3 manifest, restore one-shot, timer list, shared-lock contention test and elapsed time.                                                                                                                                                      | Exact-version isolated restore passes all checks; alias unchanged; cleanup complete; timer max 4h11m; drill under 60m RTO.                                   | Upload/checksum/restore/cleanup failure or lock overlap: block/rescind cutover; keep last good snapshot and failed evidence.                               |
| Alerts and notification         | Prometheus `/api/v1/targets`, `/api/v1/rules`, alert queries; Grafana health/dashboard; real firing/resolved probe.                                                                                                                           | Qdrant/textfile/Alertmanager targets up; 14 rules loaded; expected dashboards; both notification states received.                                            | Any missing target/rule/receiver or missing resolved delivery: do not declare activation complete; stop Alertmanager first if routing is unsafe.           |
| Security/private exposure       | Compose render, `ss -ltn`, authenticated read-only collections/metrics, rejected read-only mutation probe with cleanup guard.                                                                                                                 | Exact digests/amd64; operator ports loopback/private; unauthenticated/invalid requests fail; read-only key cannot mutate.                                    | Public bind, tag drift, key privilege failure or secret in output: stop service before app cutover; rotate exposed credential.                             |
| Cleanup                         | Authenticated collection/alias list, Docker/systemd state, S3 manifest, DB fixture counts and product-API fixture deletion.                                                                                                                   | Only production alias/physical collection and intended persistent volumes/snapshots remain; no drill/test collection, alias, pending probe alert or fixture. | Any unknown resource: keep queues paused; delete only exact owned resource after identity verification, never broad cleanup or `--remove-orphans`.         |

The exact coverage query for a bound accepted run is:

```sql
WITH selected_run AS (
  SELECT * FROM document_evidence_runs WHERE id = :'run_id'
), source_ids AS (
  SELECT (entry->>'document_id')::uuid AS document_id
  FROM selected_run, LATERAL jsonb_array_elements(source_manifest) entry
), item_ids AS (
  SELECT document_id, count(*) AS copies
  FROM document_evidence_items WHERE run_id = :'run_id' GROUP BY document_id
)
SELECT
  (SELECT status = 'accepted' FROM selected_run) AS accepted,
  (SELECT source_count = assessed_count + degraded_count + failed_count FROM selected_run) AS totals_exact,
  (SELECT count(*) FROM source_ids s LEFT JOIN item_ids i USING (document_id) WHERE i.document_id IS NULL) AS missing,
  (SELECT count(*) FROM item_ids i LEFT JOIN source_ids s USING (document_id) WHERE s.document_id IS NULL) AS extra,
  (SELECT count(*) FROM item_ids WHERE copies <> 1) AS duplicates;
```

# Observation and rollback matrix

Observe for **at least 60 minutes and one complete normal smoke cycle**, whichever
is longer. Poll Prometheus at five-minute intervals and retain only aggregate
values. Cost, latency, false-conflict rate, degradation rate and enrichment
quality remain observations unless the required staging decision sets stricter
limits; none may override the hard invariants.

| Signal                                                                                            | Activation threshold                                                                 | Action                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| coverage and baseline preservation                                                                | exactly `1.0` / 100%                                                                 | immediate quiesce; cohort `0`; if coverage is affected, make shared active gate false; retain audit rows                                     |
| tenant/course isolation                                                                           | zero violations                                                                      | P0 security stop: pause all RAG/evidence queues, disable active gate, preserve evidence, rotate key if scope failure may involve credentials |
| unresolved P0/P1 review findings                                                                  | zero                                                                                 | no traffic/resume until fixed and independently re-reviewed                                                                                  |
| `QdrantDown`, `QdrantRecoveryMode`, `QdrantPointCountUnexpectedDrop`, `DocumentEvidenceRunFailed` | none firing                                                                          | stop new writes/intake; preserve logs/storage; rollback consumers or keep `RAG_INFRA_UNAVAILABLE`                                            |
| Qdrant REST error ratio                                                                           | at most 2% across the configured 10-minute window                                    | sustained breach blocks completion; inspect 4xx/5xx before retry                                                                             |
| hybrid fallback ratio                                                                             | at most 5% across a full 15-minute window                                            | breach triggers evidence-aware containment and Qdrant compatibility diagnosis                                                                |
| Qdrant resident memory                                                                            | at most 85% of the fixed 2 GiB limit for any 15-minute window                        | stop promotion/new intake; do not raise limit without changing rule and capacity decision                                                    |
| point count                                                                                       | no drop greater than 10% between scrapes                                             | immediate write stop and collection/alias investigation                                                                                      |
| off-host snapshot / restore age                                                                   | one current successful snapshot; one successful drill; subsequent age under 8h / 35d | missing/failed recovery proof blocks Q12 close                                                                                               |
| repeated degraded automatic decisions                                                             | fewer than 3 per 30 minutes for activation window                                    | cohort `0`, review extraction/retry/source quality; do not erase decisions                                                                   |
| critical conflicts                                                                                | smoke subjects resolved before downstream; no stale critical conflict                | manual course remains paused; automatic path must have atomic system decision                                                                |
| cost, p95 latency, false conflicts and enrichment quality                                         | recorded by corpus/language class; no numeric relaxation of hard invariants          | owner review; unexpected regression can extend observation or trigger cohort `0`                                                             |

### Rollback objectives

1. **Before client cutover:** stop the five new services without deleting named
   volumes, S3 objects, manifests or collection data. Preserve migration and
   reindex evidence. Applications remain on the pre-change configuration.
2. **Evidence-aware containment:** quiesce Stage 4/5/6, set Stage 5
   `100 -> 0`, keep the exact active gate only if Stage 6 must continue honoring
   accepted decisions, recreate both workers, verify no-document and document
   fixtures, then resume gradually.
3. **Audit-only rollback:** quiesce, set cohort `0`, then mode `shadow` or enabled
   false, recreate both workers plus the active API color as required, verify that
   Stage 5/6 consume no evidence snapshot while baseline required-RAG and tenant
   filters remain active. Keep every evidence/conflict/decision/checkpoint row.
4. **Application/image rollback:** restore the saved color env/image digests, use
   the selected env file, recreate API, main worker and Stage 6 worker, and verify
   redacted runtime contract before resuming. The existing nginx rollback script
   is only one substep and is not worker rollback.
5. **Index rollback:** swap the alias only to a previously verified physical
   collection. On this first self-hosted cutover there may be none; in that case
   keep generation stopped, rebuild or restore exact-version into a new isolated
   collection, verify, then swap. Never point to lost Cloud or overwrite the
   active collection.
6. **Monitoring rollback:** stop Grafana, Prometheus, Alertmanager and
   node_exporter without deleting their volumes. If the receiver is wrong, stop
   Alertmanager first. Qdrant and stable alias remain untouched.

# Acceptance conclusion

Q11 proves the code and pinned local runtime but not staging truth. Q12 may move
from read-only preflight to mutation only after Q12-G1 through Q12-G4 are closed
with evidence. Final acceptance requires every matrix row green, 60-minute
observation complete, exact cleanup proven, docs/Graphify reviewed, Beads updated,
canonical closeout passed and the integration branch pushed. Until then
`mc2-jz6y0.13` must remain open.

# Delivery / Cleanup

This artifact is the only change in the reviewer worktree. It awaits orchestrator
inspection; no runtime cleanup is needed because the reviewer performed no remote
or local service mutation.

# Risks / Follow-ups / Explicit Defers

- Resolve Q12-G1 with a database-owner-approved exact migration path; do not
  substitute a broad pending-migration push.
- Resolve Q12-G2 with a coherent API/main-worker/Stage-6 rollback procedure and
  proof, not nginx-only rollback.
- Resolve Q12-G3 with protected disposable fixtures, a real recovery probe and
  exact product-API cleanup.
- Resolve Q12-G4 by honoring the staged remote sequence or recording a durable,
  explicit superseding staging decision with observation and rollback ownership.
- No other defer is accepted: relevance, strict mode, restore, resume, coverage,
  baseline preservation, notification and isolation remain blocking gates.

# Remediation review 8e8b1f30

**Scope:** independent read-only review of `ebdf9c2e..8e8b1f30`. Line numbers
below refer to tree `8e8b1f30`. **Verdict: Ready — no.** P0: 0, P1: 4,
P2: 1, P3: 0. The asset copy, local Qdrant URL, monitoring dependency startup
and newly added infra `--env-file` uses are directionally correct, but the
deployment and rollback are not executable/safe yet.

## Findings

### P1 — required metrics GID is absent from the generated production environment

- **Confidence:** high.
- **Evidence:** `.github/workflows/ci-cd.yml:740-786` writes the complete
  `.env.production` block and includes only
  `QDRANT_METRICS_TEXTFILE_HOST_DIR` at line 764. The rendered services require
  `QDRANT_METRICS_GID` in `docker-compose.infra.yml:348`,
  `docker-compose.app.yml:55-56`, and
  `docker-compose.production.yml:320-321,379-380`.
- **Fresh reproduction:** the commit's own workflow gate passes, but rendering
  the same target Compose with every new non-secret Qdrant value except the GID
  exits `1`: `required variable QDRANT_METRICS_GID is missing a value`.
- **Impact:** forward deploy stops at the first Compose interpolation; rollback
  colors created before Q12 also lack the value and cannot recreate API/workers.
- **Required fix:** provision one approved numeric host group ID through a
  GitHub environment variable, write it to production and color snapshots,
  preflight the actual host group/directory, and add the exact generated-env
  render to the workflow test. A synthetic standalone render is insufficient.

### P1 — automatic rollback can deploy the wrong color after a pre-switch failure

- **Confidence:** high.
- **Evidence:** Qdrant verification occurs before the new app starts at
  `scripts/deploy_blue_green.sh:198-202`; `active_color` changes only at line 271. Nevertheless every deploy-job failure invokes rollback at
  `.github/workflows/ci-cd.yml:845-869`. Rollback always chooses the color
  opposite the still-active color at `scripts/rollback_blue_green.sh:16-37`,
  starts it, recreates workers, and switches nginx at lines 59-139.
- **Impact:** an infra, secret, schema, Qdrant verify, pull, or pre-switch health
  failure can cause the rollback job to start and promote the not-yet-accepted
  target color. This defeats the new fail-closed gate.
- **Required fix:** persist/pass an explicit deployment phase plus previous and
  attempted colors. Before-switch failures must only clean the attempted color
  and leave active traffic/workers untouched; actual rollback is permitted only
  after proving `active_color` changed to the attempted color. Add executable
  tests for pre-switch and post-switch failure branches.

### P1 — rollback recreates mutable `latest`, not the previous immutable image

- **Confidence:** high.
- **Evidence:** app and worker images remain
  `ghcr.io/maslennikov-ig/mc-2/{web,api}:latest` in
  `docker-compose.app.yml:11-12,49-51` and
  `docker-compose.production.yml:314-316,374-375`. The rollback uses
  `up -d --force-recreate` at `scripts/rollback_blue_green.sh:59-61,104-110`
  and records/restores no digest or `master-<sha>` tag.
- **Impact:** after the forward pull moves `latest`, rollback recreates both the
  target color and workers from the same new image that failed. Restoring only
  `.env.$TARGET_COLOR` does not restore code and cannot satisfy immutable-image
  rollback.
- **Required fix:** capture and retain exact pre-change web/API image digests,
  bind each color and worker snapshot to immutable tags/digests, and verify the
  restored container image IDs before switching traffic or resuming queues.

### P1 — the deploy gate verifies a different admin key than applications receive

- **Confidence:** high.
- **Evidence:** `.github/workflows/ci-cd.yml:755-758` writes raw
  `QDRANT_API_KEY` from GitHub while pointing the server secret at an independent
  host file. `qdrant_staging_gate()` reads the host file and injects that value
  only into the one-shot verifier (`scripts/deploy_blue_green.sh:80-91`). There
  is no equality check, and the contract test checks only file-path text
  (`scripts/ci/test_ci_cd_workflow_gates.mjs:75-96`).
- **Impact:** schema verification can pass while API, main worker and Stage 6
  all receive a stale/different raw key and fail authentication after cutover.
- **Required fix:** make the owner-only host file the single source for the app
  value or compare values on-host without printing/checksumming them into logs;
  then run an authenticated request from each new consumer before traffic and
  queue resume. Also verify the Prometheus read-only copy matches the server
  read-only key without exposing either value.

### P2 — monitoring-only changes do not trigger deployment and the new guard is not CI-enforced

- **Confidence:** high.
- **Evidence:** `scripts/ci/detect_deploy_changes.sh:83-161` classifies
  `deploy/*` but never `ops/qdrant/*`. A fresh target-tree invocation with
  `ops/qdrant/prometheus/alerts.yml` returns
  `should_deploy=false` and `deploy_config_changed=false`. The new static guard
  validates copy strings but is not invoked anywhere in
  `.github/workflows/ci-cd.yml`.
- **Impact:** a future alert/dashboard/Prometheus fix can pass CI yet never reach
  staging; regressions such as the missing GID are not blocked by the added test.
- **Required fix:** classify `ops/qdrant/*` as deploy configuration, extend
  change-detector tests, and execute `test_ci_cd_workflow_gates.mjs` in a
  blocking CI job.

## Verified positive surfaces

- `deploy/qdrant`, `deploy/systemd`, and `ops/qdrant` are copied to the expected
  remote parent directories (`.github/workflows/ci-cd.yml:704-734`). Copy remains
  overlay-only, so Q12 preflight must reject stale unexpected remote assets.
- The generated active environment excludes the retired Cloud variable and uses
  `QDRANT_URL=http://qdrant:6333` (`.github/workflows/ci-cd.yml:740-767`).
- Starting Prometheus brings its declared `node_exporter` and Alertmanager
  dependencies; Grafana depends on Prometheus. Exact pins remain in Compose.
- All modified `$INFRA_COMPOSE` calls and rollback infra startup now pass an
  explicit environment file (`scripts/deploy_blue_green.sh:294-304`,
  `scripts/rollback_blue_green.sh:53-55`).
- Main and Stage 6 workers are recreated before nginx traffic switch, which is
  the correct relative ordering once phase selection, immutable images and
  required env are fixed (`scripts/rollback_blue_green.sh:104-123`).
- Fresh target-tree checks: static workflow guard passed; both shell files passed
  `bash -n`; `git diff --check ebdf9c2e..8e8b1f30` passed. Those checks do not
  exercise rollback phases, image identity, key equality, or generated-env
  Compose rendering.

## Ready / residual blockers

**Ready: no.** Do not run staging mutation from `8e8b1f30`. Close the four P1
findings and independently rerun the workflow/change-detector tests plus all
three Compose renders using the literal generated production environment.
Previous Q12 blockers for exact remote evidence migrations, protected live
smoke/recovery probe, and durable staging rollout decision remain outside this
commit and are not resolved by it.

# Remediation review e7130b3e

**Scope:** independent read-only review of `bcfc6b71..e7130b3e`. Line numbers
below refer to tree `e7130b3e`. The approved Qdrant design, operator runbook and
`authoritative-docs.md` were reread; no external web source was used. **Verdict:
Ready — no.** P0: 0, P1: 3, P2: 2, P3: 0. Full-SHA publication, registry
digest resolution, pre-switch transaction refusal, monitoring change detection,
and exact-consumer secret ownership are materially improved, but the rollback
snapshot remains destructible and the first cutover cannot execute its promised
post-switch rollback.

## Findings

### P1 — the first Q12 rollback snapshot cannot render the new Compose contract

- **Confidence:** high.
- **Evidence:** forward deployment backfills only `WEB_IMAGE` and `API_IMAGE`
  into the current color (`scripts/deploy_blue_green.sh:268-274`). It never
  copies the newly mandatory metrics path/GID or the selected local-Qdrant
  contract into that previous-color snapshot. Rollback then renders that old
  file directly (`scripts/rollback_blue_green.sh:64-88,131-137`), while the API
  Compose now requires `QDRANT_METRICS_GID` and
  `QDRANT_METRICS_TEXTFILE_HOST_DIR` (`docker-compose.app.yml:54-78`). The
  generated production environment contains those values only in the new base
  file (`.github/workflows/ci-cd.yml:747-798`).
- **Fresh reproduction:** rendering the target app Compose with an otherwise
  valid legacy color file plus exact web/API digests exits `1` before container
  creation: `required variable QDRANT_METRICS_GID is missing a value` (the same
  run can stop first at the required metrics path depending on interpolation
  order). All three renders with the complete new synthetic environment pass.
- **Impact:** the first post-switch failure cannot restore web/API/main worker/
  Stage 6. In the actual first self-hosted cutover, the legacy color may also
  retain the lost Cloud endpoint, so merely making it render would still risk
  promoting a known unusable RAG configuration.
- **Required fix:** before traffic switch, construct and validate a complete
  previous-color rollback snapshot: prior immutable images plus an explicitly
  approved, usable Q12 runtime contract. Render both app and worker Compose from
  it and reject a retired Cloud hostname. If no usable prior Qdrant target exists,
  encode that as a fail-closed paused recovery state rather than advertising
  automatic rollback as available.

### P1 — a bridge-only deployment destroys the accepted rollback target

- **Confidence:** high.
- **Evidence:** `.env.$NEW_COLOR` is unconditionally replaced from
  `.env.production` before `APP_DEPLOY_NEEDED` is checked
  (`scripts/deploy_blue_green.sh:252-260`). A bridge-only change deliberately
  skips the app block (`:268-380`), so it never restores `WEB_IMAGE` or
  `API_IMAGE`; it also leaves the previous accepted `deploy_state` unchanged.
  Rollback later requires those exact keys in the previous color
  (`scripts/rollback_blue_green.sh:31-78`).
- **Fresh reproduction:** with active blue, an accepted transaction pointing
  back to green, and a green snapshot containing both repository digests plus a
  sentinel, a mocked bridge-only run returned success while retaining
  `status=accepted` and erasing the sentinel and both image references.
- **Impact:** a successful, unrelated NotebookLM bridge deployment silently
  converts a previously available rollback into a guaranteed fail-closed error.
- **Required fix:** prepare/replace the inactive color file only inside an app
  deployment transaction, or write a separate attempted-color snapshot and
  atomically promote it only with the traffic state. Add an executable
  bridge-only test proving byte-for-byte preservation of both color snapshots
  and `deploy_state`.

### P1 — web-only deployment can split API and worker runtime contracts

- **Confidence:** high.
- **Evidence:** any web change enters the app path, copies the current generated
  production environment and recreates both web and API
  (`scripts/deploy_blue_green.sh:181-183,252-302`). Main and Stage 6 workers are
  restarted only when API or deploy-config files changed (`:388-404`). GitHub
  secret/environment changes are not Git paths and therefore cannot make either
  detector output true.
- **Impact:** on a web-only commit that coincides with a key, endpoint, evidence
  flag or other environment change, the new API consumes the new snapshot while
  both generation consumers retain the old one. This violates the required
  API/main-worker/Stage-6 coherence and can split authentication or accepted
  document-decision behavior after traffic switch.
- **Required fix:** if both app services are recreated from a new environment
  snapshot, bind main and Stage 6 to that same snapshot before switch regardless
  of which image changed, or cryptographically/structurally prove the relevant
  environment is unchanged. Add web-only, API-only and config-only executable
  assertions for image identity, environment identity and worker restart order.

### P2 — rollback accepts an immutable digest from an arbitrary repository

- **Confidence:** high.
- **Evidence:** forward resolution requires the exact fixed web/API repository
  (`scripts/deploy_blue_green.sh:47-75`), but rollback checks only the suffix
  `@sha256:<64 hex>` (`scripts/rollback_blue_green.sh:72-78`).
- **Impact:** a malformed or tampered color snapshot can pass the rollback guard
  with an unrelated registry repository and be pulled/recreated before nginx
  switch. The digest is immutable, but its provenance is not the approved image.
- **Required fix:** use the same exact repository-plus-digest validator in
  rollback for both keys and test wrong-repository rejection.

### P2 — failed remote secret installation can retain plaintext upload copies

- **Confidence:** high.
- **Evidence:** local temporary cleanup has a trap, but the remote upload is a
  separate directory created and populated in two earlier commands. The final
  remote command uses `set -e` and removes it only after every privileged install
  succeeds (`.github/workflows/ci-cd.yml:809-838`). Any failed `sudo install`, SSH
  disconnect or job cancellation after SCP bypasses that removal.
- **Impact:** the canonical owner-only destination remains protected, but one or
  more `.qdrant-secrets-<run-id>` plaintext copies can persist under the deploy
  account and accumulate outside the documented secret inventory.
- **Required fix:** add failure/cancellation cleanup that is independent of the
  install command's success, preflight stale upload directories without exposing
  contents, and test the mid-install failure path. Preserve the corrected final
  owners `0`, `65534`, `472` and mode `0400`.

## Verified positive surfaces

- CI publishes the exact 40-character `${{ github.sha }}` tag and passes that
  same tag to deployment; the host resolves changed web/API tags to exact
  repository digests and reuses the current digest for unchanged images.
- `preparing` cannot be rolled back or promoted: the workflow and host script
  require `switched|accepted`, and the host also proves `active_color` equals the
  recorded target before selecting the recorded previous color.
- The Qdrant verifier and application admin key now originate from the same
  GitHub secret. The Prometheus file is copied from the exact server read-only
  value. The final secret files have the runbook-required owner UID and mode
  (`root`, `65534`, or `472`; `0400`), and the verifier reads the root-owned key
  through noninteractive sudo without printing it.
- Config-only deployment reuses both current immutable application digests and
  recreates API, web, main worker and Stage 6 from the new snapshot. API-only
  deployment resolves the new API digest and reuses the current web digest.
- `ops/qdrant/*` is deploy-relevant, and all three deploy-contract scripts are
  invoked by the blocking lint job.

## Fresh verification

- Target-tree focused tests: `test_ci_cd_workflow_gates.mjs` passed;
  `test_detect_deploy_changes.sh` passed; `test_blue_green_fail_closed.sh`
  passed; deploy, rollback and fail-closed test scripts passed `bash -n`.
- Synthetic Compose: complete infra, app and production renders passed `3/3`;
  the legacy previous-color render failed as described above.
- Target-tree bridge-only mock reproduced accepted-state retention plus deletion
  of both rollback image refs.
- `git diff --check bcfc6b71..e7130b3e` passed.

The current CI tests are useful static/fail-closed guards, but they contain no
successful post-switch rollback, first-deploy legacy snapshot, bridge-only
preservation or partial-deploy consumer-coherence execution. Their green result
therefore does not resolve the three P1 findings.

## Ready / residual blockers

**Ready: no.** Do not perform staging mutation from `e7130b3e`. Resolve the three
P1 findings, rerun the focused suite plus complete/legacy Compose renders, and
exercise pre-switch failure, successful post-switch rollback, bridge-only,
web-only, API-only and config-only state transitions. The previously recorded
remote migration, protected live smoke/recovery-probe and durable rollout gates
also remain required.
