# Document evidence operations

This runbook covers the optional advisory document-evidence path across Stage 4,
Stage 5, and Stage 6. The owner has authorized the exact staging
`true/active/100` state, but this document is not an activation command. The
current database-credential and source-truth NO-GO inputs below must be resolved
first; no remote mutation has occurred. Development staging uses accepted local
Qdrant snapshots; off-host S3 remains the production gate
`mc2-jz6y0.13.6`.

## Runtime contract

Documents are optional. A course with no uploaded documents remains fully
supported and follows the baseline Stage 4/5/6 path. When evidence processing is
enabled, every source document present at Stage 4 preflight start must have
exactly one durable outcome: `assessed`, `degraded`, or `failed`.

Two invariants are not rollout thresholds and cannot be relaxed:

1. coverage is exactly 100%: source IDs and evidence-item document IDs are the
   same set, with no duplicates or extras;
2. document evidence cannot destructively replace baseline curriculum coverage.

The accepted precedence order is:

1. explicit user conflict resolution;
2. explicit user course requirements and constraints;
3. a persisted automatic resolution for an automatic course;
4. uncontested organization-specific evidence within its stated scope;
5. uncontested high-confidence course-source evidence;
6. baseline curriculum and general model knowledge;
7. low-confidence or unknown-authority claims as optional leads only.

Content quality and authority scope are independent. Poor prose does not remove
the authority of an organization-specific policy, and high writing quality does
not make a general source authoritative for organization-specific facts.

## Cross-stage data flow

```text
Stage 3 summaries and source versions
  -> Stage 4 Phase 1 classification
  -> document-evidence preflight
       -> exact coverage ledger and resumable hierarchy
       -> material conflict detection
       -> tenant/course/document-filtered Qdrant verification
  -> Stage 4 Phase 0.5 decisions
       -> manual stop or atomic system recommendation
  -> Stage 4 compact accepted snapshot
  -> Stage 5 validated baseline
       -> bounded, non-destructive advisory pass
  -> Stage 6 current decision/ref projection
       -> targeted grouped retrieval or required-RAG failure
```

Canonical contracts are in
`packages/shared-types/src/document-evidence.ts`. Full evidence and audit state
stay in tenant-scoped `document_evidence_*` tables. The analysis snapshot and
Stage 5 generation metadata contain compact IDs, counts, statuses, refs, and
hashes rather than document or answer bodies.

## Stage 4 modes

`DOCUMENT_EVIDENCE_ENABLED` is the global Stage 4 switch.
`DOCUMENT_EVIDENCE_MODE` selects behavior when the switch is enabled:

| Configuration                             | Behavior                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `DOCUMENT_EVIDENCE_ENABLED` is not `true` | preflight is disabled; legacy/no-document behavior remains                                                                            |
| enabled and mode is not exactly `active`  | shadow: evidence and its compact audit pointer may be persisted, but conflict decisions and Phase 2-4 advisory inputs remain inactive |
| enabled and mode is `active`              | accepted evidence and decisions may affect downstream advisory context                                                                |

The shared downstream gate is active only when both strings are exact:
`DOCUMENT_EVIDENCE_ENABLED=true` and `DOCUMENT_EVIDENCE_MODE=active`. Stage 5
and Stage 6 do not consume a shadow snapshot. Stage 6 still resolves and
validates course/organization ownership before returning without evidence.

`mc2-jz6y0.24.3` is accepted and integrated in `b5262f4e`, with accepted/pushed
state recorded by `c7a51996`. Shadow mode therefore detects and persists
conflicts for comparison, but it creates no questions or decisions and cannot
influence Phase 2-4, Stage 5, or Stage 6. This current behavior supplies rollout
evidence; it does not itself approve the manual-conflict rollout step.

The preflight runs after Phase 1 and before Phase 0.5. Large corpora use
deterministic token-bounded batches, per-document hierarchy, cross-document
reduction, durable checkpoints, and exact resume. An oversized or unavailable
document receives a visible degraded/failed outcome; it is never dropped because
one prompt cannot fit the corpus.

Targeted verification is not a replacement for the ledger. Qdrant queries must
filter `organization_id`, `course_id`, and the intended document set, group by
document, and validate returned source versions and refs. A Qdrant outage may
degrade verification but cannot erase already persisted cards or conflicts.

## Conflict and degraded-evidence decisions

Critical and important document conflicts create a distinct required
`document_conflicts` question set. Informational differences remain persisted
and non-blocking.

- Manual courses stop at the existing `stage_4_clarifying` Phase 0.5 boundary
  until every required conflict/degraded-evidence subject is resolved.
- Automatic courses atomically persist the selected recommendation in both the
  question answer and append-only evidence decision ledger. The audit includes
  `answer_source: system`, `resolved_by: system`, rationale, exact recommendation
  identity, run/conflict provenance, and timestamp.
- A later user change appends a superseding decision. Never edit or delete an
  earlier decision to make the current state appear simpler.
- Degraded evidence uses bounded retry. Manual decisions can retry, continue with
  limited evidence, or remove the document. Automatic handling records its
  selected system action after its retry bound.

Do not approve or resume a manual course by editing database rows directly. Use
the existing clarifying-question API so compare-and-swap, actor attribution,
tenant checks, and append-only decision linkage remain intact.

## Stage 5 baseline preservation

Stage 5 first completes its normal graph and structural quality gate. Only then
does the live evidence pass reload the accepted run, exact coverage cards,
conflicts, and current decisions. It retrieves per accepted section with tenant
and course filters, an accepted document allowlist, document grouping, and exact
chunk/version provenance.

The pass may append bounded grounded topics. It cannot remove or reorder
sections or lessons, rename baseline content, change objectives or durations,
remove required topic prefixes, or bypass existing size/structure validation.
Invalid patches receive one bounded retry; the baseline is retained afterward.

When the live evidence adapter runs, its durable result is one of
`not_applicable`, `applied`, `no_relevant_evidence`, `degraded`, or
`failed_open_with_decision`. Outside the cohort, Stage 5 runs the ordinary
baseline pipeline and adds no evidence audit. For an incident, treat `degraded`
and `failed_open_with_decision` as evidence-path outcomes, not as proof that the
baseline course was lost.

Live Stage 5 enrichment additionally requires
`DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT`:

- accepted values are decimal integers from `0` through `100`;
- absent, empty, malformed, fractional, negative, or out-of-range values fail
  closed to `0`;
- `0` disables enrichment for every course and `100` selects every course;
- an intermediate value selects courses whose stable bucket is below the
  percentage. The bucket is the first unsigned 32 bits of
  `SHA-256("document-evidence-stage5-cohort-v1:" + lower-case course_id)`, reduced
  modulo 100.

The hash version is part of the rollout contract. Do not change it during a
cohort rollout: a new version reshuffles course membership. The Stage 5 cohort
percentage does not control Stage 6.

## Stage 6 required-RAG behavior

Stage 6 loads current database truth before retrieval. The cache identity covers
the accepted run, current decision IDs, and accepted source refs/version hashes.
Rejected conflict sides, removed documents, stale versions, cross-tenant refs,
and unknown chunks cannot enter lesson prompts or a reused cache entry.

Every query filters `organization_id` and `course_id`, intersects lesson primary
documents with the accepted allowlist, preserves native hybrid BM25/RRF and
Formula priority weighting, and groups by document with group size two.

No-document courses return the existing optional empty RAG result. When uploaded
documents make RAG required, the bounded preflight/retry path applies. An
unavailable or incomplete required retrieval, or an evidence scope violation,
fails closed through the existing required-RAG error contract. Do not bypass
that error to generate purportedly source-backed content from partial evidence.

When the shared active gate becomes false, Stage 6 stops loading the evidence
snapshot. Its evidence decision/ref allowlist and evidence-aware cache identity
are therefore disabled. The baseline retriever still enforces its normal
`organization_id` and `course_id` scope plus required-RAG availability, retry,
and fail-closed protections. Disabling evidence consumption does not disable
baseline tenant/course isolation or make required RAG optional.

## Large-corpus and resume checks

For a stalled or restarted Stage 4 run:

1. In an access-controlled database session, resolve the affected course,
   organization, accepted/pending run, input fingerprint, evidence version, and
   source-manifest count. Keep product identifiers and hashes inside that session;
   use a separate incident case reference in notes and telemetry.
2. Confirm `source_count = assessed_count + degraded_count + failed_count` for an
   accepted run and that the coverage ratio is exactly one.
3. Inspect batch/conflict checkpoint counts, cursor/progress identity, retry
   applications, model attempts, and error categories. Reuse is valid only for
   the same course, organization, fingerprint, evidence version, and checkpoint
   identity.
4. If the source set or a source version changed, start a new run. Do not force a
   stale checkpoint onto the changed corpus.
5. If capacity was exhausted, preserve the detector-capacity decision subject.
   Manual mode remains paused; automatic mode must have a persisted system
   decision before continuing.

## Qdrant verification and recovery

The approved runtime is Qdrant `1.18.2`. The approved monitoring pins are
Prometheus `3.13.1` LTS, Grafana `12.4.5`, node_exporter `1.12.0`, and
Alertmanager `0.33.1`; exact image locks live in
`ops/qdrant/image-lock.json`.

Use [`qdrant-self-hosted.md`](qdrant-self-hosted.md) for credentials, loopback
access, authenticated scrape, snapshot/restore, alert triage, and approved image
validation. In an authorized environment, evidence recovery additionally
requires:

1. verify the stable alias and physical collection before any source check;
2. query with the affected organization and course filters plus the expected
   document/version identity, keeping those product identifiers in the
   access-controlled operator session;
3. validate dense, RU BM25, EN BM25, Formula ordering, document grouping, and
   negative organization/course isolation against known fixtures;
4. if the index is missing or corrupt, rebuild it from authoritative source data
   or follow the isolated Q8 restore drill. Never restore over the active alias;
5. after recovery, rerun the targeted evidence verification/resume path. Database
   evidence rows remain the audit source of truth and are not reconstructed from
   Qdrant points.

Qdrant snapshots preserve the derived indexed refs. Evidence rows are covered by
the PostgreSQL backup policy. A Qdrant restore does not replace database audit
retention.

## Evidence observability integration gate

Tracked remediation `mc2-jz6y0.24.5` is accepted and integrated: final code
`7a7d54ae` received an independent PASS, was integrated as
`b5262f4e`, and was accepted/pushed through `c7a51996`. That satisfies the
`.24.5` code/integration dependency. It does not authorize rollout, remote
migration, or Q12 execution; the owner decisions and authorization gates below
still apply.

The owner-confirmed pins remain unchanged: Prometheus `3.13.1` LTS, Grafana
`12.4.5`, node_exporter `1.12.0`, and Alertmanager `0.33.1`.

- Stage 4 durable work, conflict, and decision metrics are absolute cumulative
  values read in O(1) from one RLS-protected, `service_role`-readable singleton
  with a monotonic reconciliation revision. Trigger-maintained totals cover
  accepted/failed terminal runs, source/outcome documents, all five processing
  modes, batches, model calls, input/output tokens, cost, duration, conflict
  severities, and append-only user/system/degraded-automatic decisions. The
  transactional seed scans canonical tables once while trigger DDL locks the
  affected writers; runtime publication does not rescan history.
- Latest-terminal coverage is separate from lifetime cumulative totals and is
  ordered by completion time plus run ID. Coverage ratio must use only that
  latest coverage snapshot. The aggregate publisher writes the established
  durable metric names only to `service="stage4",instance="aggregate"`, applies
  the lexicographic epoch `(databaseStart, generation, revision)`, treats the
  same epoch as idempotent, and ignores an older epoch. `databaseStart` comes
  from the database postmaster start time; `generation` changes when the
  singleton is recreated. A newer database start or generation replaces all
  durable aggregate series even at a lower revision, so rollback/PITR can catch
  up on the next Stage 4 invocation without allowing delayed pre-restore state to
  overwrite it. Replica files remove durable aggregate names and expose only
  distinct best-effort Stage 4 invocation/failure signals.
- A failed or crashed fail-open sink is not exactly-once. The next Stage 4
  invocation reconciles the absolute singleton and catches up missed durable
  publication; if no later invocation occurs, the textfile remains stale and
  operators must not claim convergence. Durable capacity checkpoints retain
  usage, while terminal detector errors expose typed bounded usage only through
  failure signals.
- The append-only decision ledger and canonical Stage 4 tables remain the source
  of truth. The singleton is derived bounded export state, not permission to
  rewrite or replace history.
- Textfile read-modify-write uses the accepted/integrated `.24.5` Linux kernel
  `flock` on a persistent regular `0600` lock file. The parent keeps the inherited
  FileHandle open while `flock --exclusive --timeout 5 3` is held across read,
  apply, temp-file write, and atomic rename; close or process death releases the
  kernel lock. The runtime Dockerfile explicitly supplies `util-linux`, which
  provides `flock`. A process-local mutex or user-space heartbeat/stale-owner
  protocol is not the accepted cross-process guarantee.
- Stage 5 publishes actual Stage 5 retrieval attempts: increment immediately
  before each live search and preserve the count through success, no-material,
  fallback, fail-open, and unexpected completion paths. Do not infer attempts
  from section count, accepted-run presence, or the final audit status.

Database rollout is deliberately split. The partial unresolved-critical index
uses live-write-safe `CREATE INDEX CONCURRENTLY` and its rollback uses
`DROP INDEX CONCURRENTLY`; execute each statement in autocommit mode, never
inside a transaction. Final code SHA `7a7d54ae` provides one fixed-purpose
unified repo runner at
`packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts`;
it accepts no arbitrary SQL or migration path and uses one `SUPABASE_DB_URL` for
both versions. Apply exact-checks both allowlisted files, installs
`20260711150000` plus its exact history row statement-by-statement in autocommit
mode, then installs `20260711151000` plus its exact history row in one
transaction. Rollback reverses that order: transactional totals SQL/history
first, then concurrent index SQL/history. Validation is deliberately bounded: it
exact-checks allowlisted file SHA/history, the index catalog definition/comment,
totals table columns/RLS, expected trigger names, and RPC presence/signature. It
does not validate arbitrary live function bodies. Mismatches in those checked
surfaces fail closed; exact repeats and bounded partial recovery are idempotent.

The transactional totals step acquires write-conflicting locks on its canonical
source tables, including the decision ledger, before it creates/seeds the
singleton, installs the run/checkpoint, conflict, and decision triggers, and
reconciles history. The nonblocking index proof does not apply to these locks.

### Complete guarded remote migration sequence

The accepted remote chain is exactly
`20260711120000 -> 20260711130000 -> 20260711140000 -> 20260711150000 ->
20260711151000`. A generic `db push`, an unrelated pending migration, a gap,
unknown or later frontier, history/catalog mismatch, lock overrun, or TLS failure
is a hard stop.

The owner authorized the staging migration and the downloaded Supabase Root
2021 CA has been validated. Exhaustive read-only discovery found zero working
credentials among 16 unique candidates and six complete external URIs; the
plausible server `.env.backup` value is stale. The remaining input is an
owner-supplied or rotated current Session pooler URL. Use the validated CA
with both `sslmode=verify-full` and `sslrootcert`; never use
`rejectUnauthorized=false`, `sslmode=require`, or an unverified pooler
connection.

1. Obtain the current Session pooler URL and prove it in a read-only session
   with the validated CA, `sslmode=verify-full`, and the explicit
   `sslrootcert` path.
2. Before pausing writers or applying a migration, complete backup gate
   `mc2-jz6y0.13.7` in this exact order:
   - correct the observed `/opt/megacampus/backups` parent from mode `0775` to
     the approved root/current-owned, non-group/world-writable ownership and
     mode;
   - install the reviewed `deploy/postgres/backup-supabase.sh` operator plus
     owner-only `/opt/megacampus/secrets/supabase_db_url` and validated CA
     inputs;
   - before either credential is opened, require the operator to verify the
     matching `/usr/lib/postgresql/17/bin/pg_dump` and
     `/usr/lib/postgresql/17/bin/pg_restore` pair and reject missing,
     malformed, cross-major, or non-17 client output;
   - create a fresh custom-format dump and require the operator's size, TOC,
     complete offline archive traversal, fsync, and atomic publication checks;
   - restore that exact fresh archive into the approved isolated disposable
     PostgreSQL 17 target using `/usr/lib/postgresql/17/bin/pg_restore` with
     `--exit-on-error` and `--single-transaction`. Run only `linux/amd64`
     `postgres@sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`
     (PostgreSQL `17.10`, bookworm). Require the run-owned named volume at
     `/var/lib/postgresql/data`, the canonical password file bound read-only,
     pre-restore mount-identity checks, loopback-only connectivity, cleanup
     traps installed before create, and zero matching residue after teardown.

   Every 20-byte file produced since 2026-06-28 is a fail-open empty stream,
   not backup or rollback evidence. The historical substantive 2026-06-27 file
   is no longer retained, so the current usable-backup count is zero. Only the
   required fresh restore-validated archive can reopen this gate.

3. Confirm PITR separately and inventory the exact remote migration frontier in
   a read-only session. Do not continue unless it is compatible with the five
   allowlisted versions.
4. Pause answer/decision writers and affected Stage 4, Stage 5, and Stage 6
   queues. Record the bounded expected write pause and keep consumers from
   starting between base and observability steps.
5. Without printing the DSN, require its TLS parameters:

   ```bash
   : "${SUPABASE_DB_URL:?set the owner-only PostgreSQL DSN}"
   [[ $SUPABASE_DB_URL == *'sslmode=verify-full'* ]]
   [[ $SUPABASE_DB_URL == *'sslrootcert='* ]]
   export SUPABASE_DB_URL
   ```

6. Apply and verify the guarded base chain:

   ```bash
   TMPDIR=${TMPDIR:-/tmp} \
   pnpm --filter @megacampus/course-gen-platform \
     migration:document-evidence-approved:apply -- \
     --allow-remote \
     --confirm 'APPLY REMOTE DOCUMENT EVIDENCE BASE 20260711120000 20260711130000 20260711140000'
   ```

7. Apply and verify the observability chain:

   ```bash
   TMPDIR=${TMPDIR:-/tmp} \
   pnpm --filter @megacampus/course-gen-platform \
     migration:document-evidence-observability:apply -- \
     --allow-remote \
     --confirm 'APPLY REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711150000 20260711151000'
   ```

8. Require exact contiguous migration history and the runners' live catalog,
   RLS, policy, RPC signature, trigger, extension, index definition/comment, and
   side-identity checks. Deploy matching consumers before resuming writers and
   queues.

The totals transaction intentionally takes write-conflicting locks; the
concurrent-index proof does not apply to it. Rollback ordering, when a planned
pre-consumer rollback is explicitly approved, is observability first and base
second with these exact confirmations:

```text
ROLL BACK REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711151000 20260711150000
ROLL BACK REMOTE DOCUMENT EVIDENCE BASE 20260711140000 20260711130000 20260711120000
```

Never down-migrate evidence/audit tables as an incident shortcut, and never
remove the base chain while `150/151` or matching consumers remain. No remote
migration was run while preparing this documentation.

### Alerts and dashboard panels

The document-evidence alert set is exactly:

- `DocumentEvidenceRunFailed` — fires for either a durable failed run or a
  best-effort invocation-only failure;
- `DocumentEvidenceCoverageIncomplete`;
- `DocumentEvidenceDegradedAutomaticDecisionsRepeated`;
- `DocumentEvidenceCriticalConflictStale`.

The dashboard evidence section contains exactly these six panels:

- Evidence run status;
- Evidence document coverage;
- Evidence processing modes;
- Evidence cost and duration;
- Evidence conflicts and decisions;
- Evidence Stage 5 / 6 retrieval.

## Authorized staging decision and current NO-GO

On 2026-07-12 the owner explicitly superseded gradual staging promotion and
authorized these exact values for every eligible staging course:

```text
DOCUMENT_EVIDENCE_ENABLED=true
DOCUMENT_EVIDENCE_MODE=active
DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100
```

This authorizes the intended final staging state; it does not waive hard gates.
No remote mutation has occurred. Activation remains NO-GO until:

1. a current Session pooler URL enables the guarded five-migration path with the
   validated CA, `sslmode=verify-full`, and `sslrootcert`;
2. database-backup gate `mc2-jz6y0.13.7` passes: correct the observed
   `/opt/megacampus/backups` parent from `0775`, install the reviewed backup
   operator and owner-only URL/CA inputs, publish a fresh fully validated custom
   dump, and restore that exact archive into the approved isolated target. The
   20-byte files produced since 2026-06-28 are invalid evidence;
3. the accepted checksum-verified local-volume snapshot and isolated restore
   remain green; this is staging evidence only, while production S3 stays gated
   by `mc2-jz6y0.13.6`;
4. implementation/review bead `.13.4.1` is locally accepted at 3/3 focused and
   456/456 joined recovery/reindex tests; the authorized window must then run
   the 42 exact source copies through the crash-durable recovery contract. The
   six absent eligible originals receive an explicit audited owner disposition—never
   `--allow-gaps` or derived substitution—and the separate eighteen-row
   Career Playbook retention/data-hygiene disposition is recorded without
   counting those non-eligible rows in the 240-document Qdrant denominator;
5. exact digests, private listeners, secret metadata, free metrics GID, Compose,
   and systemd oneshots pass;
6. deterministic reindex, RU/EN relevance, strict schema, parity, and negative
   tenant/course isolation pass;
7. immutable app/main-worker/Stage-6 rollback and evidence containment pass;
8. coverage and baseline preservation are exactly 100%, with zero isolation
   violations and unresolved P0/P1 findings;
9. real firing/resolved notification, 60-minute observation, one complete
   normal course cycle, cleanup, and retained rollback evidence pass.

The local/development design remains recorded in
[`Document Evidence: 100% Dev Activation Design`](../superpowers/specs/2026-07-12-document-evidence-dev-activation-design.md),
but it is no longer the staging authorization source. A nonzero cohort never
replaces the exact global active gate.

Shadow mode is not an acceptance claim. Before advancing, compare exact coverage,
conflict precision, degraded outcomes, model/cost/latency observations, and
baseline/enriched structure diffs. Preserve representative RU and EN evidence
and include no-document, irrelevant-document, oversized-document, large-corpus,
resume, Qdrant-unavailable, and tenant-isolation cases.

## Decision evidence record

The staging decision is recorded. Cost, latency, false-conflict,
degradation/failure, and enrichment-quality fields remain advisory observation
for the required activation packet; they cannot replace the hard invariants.

| Decision field     | Evidence to present                                                           | Required record                                                          |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Stage 5 cohort     | deterministic course selection and exclusion behavior                         | cohort definition, percentage/size, owner, start/end, rollback authority |
| Cost               | evidence-run model calls, tokens, cost by corpus class                        | accepted limit, aggregation/window, sample size, owner                   |
| Latency            | Stage 4 preflight plus Stage 5/6 added duration                               | accepted percentile/limit, window, sample size, owner                    |
| False conflicts    | reviewed material conflicts by language/source class                          | accepted rate/definition, adjudicator, sample size, owner                |
| Degradation        | failed runs, degraded cards, automatic limited decisions, retrieval fallbacks | accepted rate/count, window, consecutive-period rule, owner              |
| Enrichment quality | baseline/enriched diff plus grounded refs and structural validation           | acceptance rubric, sample size, reviewer, owner                          |
| Rollback           | kill-switch exercise and retained-audit verification                          | trigger, decision maker, executor, communication path                    |

Coverage is always exactly 100%, and baseline preservation is always required;
neither belongs in the table as a negotiable threshold.

## Rollback

Choose one rollback objective before changing configuration:

- **Audit-only rollback:** make the shared active gate false. New Stage 5/6 jobs
  do not consume evidence snapshots. Stage 6 keeps baseline tenant/course and
  required-RAG protections, but its evidence decision/ref allowlist and
  evidence-aware cache identity are off. The integrated shadow path may continue
  collecting cards/conflicts without decisions or downstream influence.
- **Evidence-aware containment:** keep the shared gate exactly active so Stage 6
  continues honoring current decisions/refs, but set the Stage 5 cohort to zero.
  This is not audit-only: admitted Stage 4 jobs remain active and can create
  decisions/downstream evidence. Keep Stage 4 intake paused unless that behavior
  is explicitly intended.

Do not promise audit-only behavior and evidence-aware Stage 6 behavior in the
same configuration; the shared active gate makes them mutually exclusive.

The documented staging containment action is
`DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100 -> 0`. Quiesce first and complete
the coherent restart and verification sequence below; do not flip the value on
an in-flight job. This containment keeps stored evidence and audit rows.

Use this order for either rollback objective:

1. **Quiesce first.** Pause new course-generation intake and the affected Stage
   4, Stage 5, and Stage 6 worker queues before changing flags. Inventory in-flight
   jobs and choose one handling policy per job: let it drain completely under the
   old configuration, or stop it at its durable boundary and requeue it only
   after restart under the new configuration. Never flip evidence flags while a
   job continues across the boundary.
2. Record pre-change aggregate audit counts and the intended rollback objective.
   Do not delete or rewrite evidence state.
3. Set `DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=0`. For audit-only rollback,
   additionally set `DOCUMENT_EVIDENCE_MODE=shadow` or disable
   `DOCUMENT_EVIDENCE_ENABLED`. For evidence-aware containment, keep both global
   active-gate values exact.
4. Restart the main Stage 4/5 worker and the dedicated Stage 6 worker so every
   process reads one coherent environment. Confirm no old-configuration job is
   still running before verification.
5. Verify the selected behavior with a no-document course and an authorized
   document-backed fixture. Audit-only must show no Stage 5 evidence adapter and
   no Stage 6 evidence context while baseline tenant/course and required-RAG
   checks remain active. Evidence-aware containment must show Stage 5 cohort
   exclusion while Stage 6 still uses current decisions/refs. In both cases,
   confirm durable audit counts are unchanged.
6. Resume worker queues and intake gradually. Watch aggregate failure, fallback,
   latency, and coverage signals; re-quiesce before any further flag change.

Retain `document_evidence_runs`, items, conflicts, decisions, checkpoints, retry
applications, clarifying questions, and compact course/generation audit
snapshots. Do not roll back migrations or delete rows as an incident shortcut.

## Local verification before an authorized rollout

Run from the repository root with synthetic local credentials only:

```bash
pnpm --filter @megacampus/shared-types test -- document-evidence
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/stages/stage4-analysis \
  tests/unit/stages/stage5-generation \
  tests/unit/stages/stage6 \
  tests/unit/shared/qdrant
pnpm type-check
pnpm build
scripts/orchestration/run_process_verification.sh
```

Use the pinned Qdrant/database integration harnesses from the accepted stage
artifacts for recovery, exact coverage, append-only decisions, and tenant
isolation. A local pass does not authorize staging activation.

## Privacy and incident evidence

Metrics, dashboards, and alerts contain aggregate counters and gauges only. The
complete evidence-metric label allowlist is `service`, `instance`, `stage`,
`mode`, `status`, `severity`, `actor`, `direction`, and `outcome`; no other label
key is permitted. `service` and `instance` are fixed operational identifiers,
never product IDs and never derived from product IDs. Metrics never contain
product IDs (course, organization, document, run, decision, conflict, question,
chunk, lesson, or user), runtime hashes/fingerprints, document or answer content,
source names/excerpts, raw errors or error names/categories, model names,
credentials, or credential-bearing URLs. Failure conditions are represented by
aggregate status/count signals, not error values.

The same boundary applies to every ordinary new evidence-specific log event: it
may contain aggregate counts, durations, mode/status, and an allowlisted outcome,
but no product IDs, content, source names/excerpts, runtime hashes, raw errors, or
model names. This requirement is specific to new evidence logging and does not
claim that unrelated legacy pipeline logs have already been remediated.

Tracked remediation `mc2-jz6y0.24.4` is accepted and integrated in `b5262f4e`,
with accepted/pushed state recorded by `c7a51996`; the privacy boundary is
current. Its targeted scope remains limited to Stage 4 decision/detector
completion logs, Stage 5 advisory/fail-open/completion logs, and Stage 6
evidence-exclusion logs. Unrelated legacy/general logs are excluded from `.24.4`;
that exclusion does not weaken this boundary or permit evidence rollout through
a log path that emits restricted data.

Repository, stage, Beads, and commit IDs identify engineering work, not product
records. They may appear in Beads and `.codex` orchestration artifacts, but must
never be repurposed as runtime product identifiers or telemetry labels. Product
IDs and durable provenance hashes may exist in approved access-controlled runtime
stores: tenant-scoped PostgreSQL, tenant/course-filtered Qdrant payloads, bounded
caches, compact runtime audit, and access-controlled operator queries. Do not copy
them from those stores into telemetry, Beads, orchestration artifacts, dashboards,
alerts, or ordinary evidence logs. Preserve bounded redacted recovery evidence
instead.
