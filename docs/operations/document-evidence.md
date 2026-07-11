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

## Large-corpus and resume checks

For a stalled or restarted Stage 4 run:

1. Identify the course, organization, accepted/pending run ID, input fingerprint,
   evidence version, and source-manifest count. Do not copy document text into
   incident notes.
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
   document/version identity;
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

## Rollout sequence

Rollout is ordered and must not skip a step:

1. disabled, then shadow evidence collection;
2. active conflict questions for internal/manual courses;
3. automatic system decisions only after manual conflict evidence is reviewed;
4. Stage 5 advisory enrichment for an explicitly bounded deterministic course
   cohort;
5. broader promotion only after every owner decision below is recorded.

Step 4 uses `DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT`. Keep it at `0` until the
owner records the cohort definition and unresolved product gates below. A
nonzero value is not permission to skip the exact global active gate.

Shadow mode is not an acceptance claim. Before advancing, compare exact coverage,
conflict precision, degraded outcomes, model/cost/latency observations, and
baseline/enriched structure diffs. Preserve representative RU and EN evidence
and include no-document, irrelevant-document, oversized-document, large-corpus,
resume, Qdrant-unavailable, and tenant-isolation cases.

## Owner decisions required before promotion

No numeric product rollout thresholds have been accepted. Record all fields
below in the authorized rollout decision; do not infer them from test totals,
historical averages, dashboard defaults, or alert expressions.

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

Rollback must stop new document influence without deleting audit history:

1. set `DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=0` before starting new Stage 5
   work;
2. move Stage 4 from active to shadow if evidence observation should continue, or
   disable `DOCUMENT_EVIDENCE_ENABLED` to stop new preflights. Either action also
   makes the exact shared active gate false, so Stage 5 and Stage 6 stop consuming
   evidence snapshots;
3. stop/pause affected queued work according to the normal worker procedure so
   jobs do not straddle incompatible runtime configuration;
4. verify new Stage 5 results preserve the baseline and no new active decisions
   are being applied;
5. retain `document_evidence_runs`, items, conflicts, decisions, checkpoints,
   retry applications, clarifying questions, and compact course/generation audit
   snapshots. Do not roll back migrations or delete rows as an incident shortcut.

Existing accepted snapshots remain auditable. Stage 6 continues to enforce its
decision/ref scope and required-RAG safety; rollback is not permission to bypass
that fail-closed contract. Any change to Stage 6 evidence consumption requires a
separate reviewed release.

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

Metrics, logs, dashboards, alerts, Beads, and orchestration artifacts may include
IDs, counts, modes, durations, error categories, hashes, and aggregate cost. They
must not include document text, claim bodies, user/system answers, source
excerpts, credentials, or credential-bearing URLs. Preserve durable database
provenance and bounded redacted recovery evidence instead.
