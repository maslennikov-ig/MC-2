# Document evidence operations

This runbook covers the optional advisory document-evidence path across Stage 4,
Stage 5, and Stage 6. It does not authorize deployment, live reindex, secret
changes, service activation, or staging/production mutation. Those actions
remain behind the repository's explicit Q12 authorization gate.

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

Use this forward order:

1. quiesce decision writers and answer submission;
2. run
   `TMPDIR=${TMPDIR:-/tmp} SUPABASE_DB_URL=... pnpm --filter @megacampus/course-gen-platform migration:document-evidence-observability:apply`;
3. deploy the matching consumer code;
4. resume answer submission and decision writers.

Use this reverse order:

1. quiesce decision writers and answer submission, then disable or rollback the
   consumer code;
2. run
   `TMPDIR=${TMPDIR:-/tmp} SUPABASE_DB_URL=... pnpm --filter @megacampus/course-gen-platform migration:document-evidence-observability:rollback`;
3. resume answer submission and decision writers.

Plan a bounded expected insert/answer pause around the totals transaction and
consumer cutover. The nonblocking index proof does not apply to the totals
migration: its write-conflicting ledger lock intentionally blocks concurrent
decision inserts/answers until commit. Do not combine the concurrent index
statements with that transaction. Local verification still does not authorize
applying either migration or consumer change to staging or production.

The unified runner accepts loopback targets by default and rejects remote
targets. Only a separately authorized future Q12 may use a DSN with
`sslmode=verify-full` and append
`-- --allow-remote --confirm 'APPLY REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711150000 20260711151000'`.
Rollback requires the exact confirmation
`ROLL BACK REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711151000 20260711150000`.
Neither remote form, nor any Q12 migration execution, was invoked while preparing
this runbook.

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

## Rollout sequence

Any future staging/production rollout is ordered and must not skip a step:

1. disabled, then the current integrated shadow evidence/conflict collection;
2. active conflict questions for internal/manual courses;
3. automatic system decisions only after manual conflict evidence is reviewed;
4. Stage 5 advisory enrichment for an explicitly bounded deterministic course
   cohort;
5. broader promotion only after every owner decision below is recorded.

For local/development, the owner approved the exact active gate and a 100%
Stage 5 cohort on 2026-07-12. Development has no cohort-promotion step: cost,
latency, false-conflict, degradation/failure and enrichment-quality signals are
advisory. Coverage and baseline preservation must remain 100%, tenant/course
isolation violations and unresolved P0/P1 findings must remain zero.
Staging/production activation is not implied and remains Q12-gated. The exact
checked-in development decision and environment are recorded in
[`Document Evidence: 100% Dev Activation Design`](../superpowers/specs/2026-07-12-document-evidence-dev-activation-design.md).

The active development value is
`DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100`. A nonzero value never replaces
the exact global active gate.

Shadow mode is not an acceptance claim. Before advancing, compare exact coverage,
conflict precision, degraded outcomes, model/cost/latency observations, and
baseline/enriched structure diffs. Preserve representative RU and EN evidence
and include no-document, irrelevant-document, oversized-document, large-corpus,
resume, Qdrant-unavailable, and tenant-isolation cases.

## Development decision and future remote promotion

The local/development decision treats the cost, latency, false-conflict,
degradation/failure and enrichment-quality fields below as advisory observation,
not numeric promotion gates. Its hard invariants are 100% coverage, 100%
baseline preservation, zero tenant/course isolation violations and zero
unresolved P0/P1 findings. Any future staging/production promotion must obtain
its own Q12 authorization and record the applicable fields below; the
local/development decision must not be reused as remote authorization.

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

The documented development containment action is
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
