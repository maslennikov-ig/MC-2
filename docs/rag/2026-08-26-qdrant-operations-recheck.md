# The live Qdrant platform, re-checked read-only

**Date:** 2026-08-26 · **Epic:** `mc2-xg6g8` (B1–B4) · **Closes out:** `mc2-jz6y0`

Every check below is read-only. No reindex, no alias change, no collection change, no restore onto
live data. The question asked of each guarantee is not "is it configured" but **"what would make this
fire, and can it"**.

The API key used throughout is the read-only one. Verified that it is genuinely read-only: a write
with no collection lookup in front of it (`POST /collections/aliases` with an empty action list)
returns `403 Forbidden: Global manage access is required`. A write against a _missing_ collection
returns 404 instead, because Qdrant resolves the collection first — worth knowing, because that 404
reads like "the key can write" and it does not mean that.

## B1 — Collection truth

| Check             | Declared                                              | Live (staging, 127.0.0.1:6335) | Verdict |
| ----------------- | ----------------------------------------------------- | ------------------------------ | ------- |
| Alias             | `course_embeddings` → `course_embeddings_v1`          | same                           | ✅      |
| Dense vector      | 768, Cosine, `m:16 ef_construct:100`, `on_disk:false` | same                           | ✅      |
| Sparse vector     | `modifier: idf`, `on_disk:false`                      | same                           | ✅      |
| Strict mode       | 10 settings in `collection-schema.ts`                 | all 10 match                   | ✅      |
| Payload indexes   | 12 in `PAYLOAD_INDEXES`                               | all 12 present                 | ✅      |
| `organization_id` | `is_tenant: true`                                     | `is_tenant: true`              | ✅      |
| Point count       | 6856 recorded                                         | **6856**                       | ✅      |

Status `green`, 2 segments.

Two observations that are not faults but should not surprise the next reader:

- **`chapter` and `section` are indexed over 0 points.** The indexes exist and match the schema; no
  point in the collection carries either field. `heading_path` is `"Root"` everywhere, so there is no
  hierarchy to populate them from. A filter on either would return nothing — correctly, but silently.
- **`indexed_vectors_count` is 13390 against 6856 points.** Dense and sparse are counted separately,
  so ~2x is expected; the shortfall against 13712 is HNSW indexing state, not missing data.

**The dev Qdrant is a different story.** `megacampus-qdrant-dev` (127.0.0.1:6333 on the host) holds
**12 points** across one course. Same alias, same schema, same strict mode — but any RAG lookup on
dev is searching a corpus of twelve chunks. That is the environment where the 2026-08-22 Stage 6 run
happened.

## B2 — Snapshots, retention and the restore drill

Judged by whether the metric answers, not by whether a unit is enabled.

| Guarantee              | Metric value          | Age at check | Rule threshold | Verdict |
| ---------------------- | --------------------- | ------------ | -------------- | ------- |
| On-host snapshot       | `1787768608`          | 0.0 h        | 8 h            | ✅      |
| On-host restore drill  | `1785535395`          | 25.8 d       | 35 d           | ✅      |
| Off-host snapshot      | `1787711026` (103 MB) | 16.0 h       | 36 h           | ✅      |
| Off-host restore drill | `1786265387`          | 17.4 d       | 35 d           | ✅      |
| Supabase backup        | `1787697364`          | 19.8 h       | 30 h           | ✅      |

**Retention is 7 days and the two copies agree.** `megacampus_qdrant_offhost_retention_days = 7`,
`EXPECTED_RETENTION_DAYS = 7` in the production forced command, `RETENTION_DAYS = 7` in the backup
script. This is the number that drifted to 7-against-14 and broke the metric rather than the backup;
the receiving side now refuses a mismatch outright (`[[ $retention == "$EXPECTED_RETENTION_DAYS" ]]
|| die 'retention metric is invalid'`), so the two cannot silently disagree again.

Timers on the deploy host: `megacampus-host-disk-metrics.timer` every 5 min,
`megacampus-qdrant-snapshot.timer` roughly 4-hourly, `megacampus-supabase-backup.timer` daily at
00:30, `megacampus-qdrant-restore-drill.timer` monthly (last 2026-08-01, next 2026-09-01).

**One thing to record honestly: the last off-host restore drill restored 13712 points.** That is the
pre-deduplication count, and it is correct — the drill ran on 2026-08-09 and deduplication landed on
2026-08-12. It proves the _mechanism_ works. It does not prove that today's 6856-point collection
restores, because no drill has run against a post-deduplication snapshot. The next monthly run on
2026-09-01 will close that.

## B3 — All 19 alert rules

Every metric was queried against the live Prometheus. "Reachable" means the metric is being produced
now and the condition can be met.

### Reachable and live (15)

| Rule                                                   | Metric source                                                 | Current value                      | Note                                               |
| ------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `QdrantDown`                                           | `up{job="qdrant"}`                                            | 1                                  | scrape is authenticated and up                     |
| `QdrantRecoveryMode`                                   | `qdrant_app_status_recovery_mode`                             | 0                                  |                                                    |
| `QdrantRestErrorRateHigh`                              | recording rule over `qdrant_rest_responses_total`             | 0.0485                             | **fired and resolved during this work**, see below |
| `QdrantMemoryHigh`                                     | `qdrant_memory_resident_bytes`                                | 36 MB of 2 GiB                     | 1.7% of the limit                                  |
| `QdrantPointCountUnexpectedDrop`                       | `qdrant_collection_points`                                    | 6856                               |                                                    |
| `QdrantSnapshotStale`                                  | `megacampus_qdrant_last_successful_snapshot_unixtime_seconds` | fresh                              | textfile                                           |
| `QdrantRestoreDrillStale`                              | `..._restore_drill_...`                                       | 25.8 d                             | textfile                                           |
| `QdrantOffHostSnapshotStale`                           | `..._offhost_last_successful_snapshot_...`                    | 16 h                               | textfile, written by the second host               |
| `QdrantOffHostRestoreDrillStale`                       | `..._offhost_..._restore_drill_...`                           | 17.4 d                             | textfile                                           |
| `SupabaseBackupStale`                                  | `megacampus_supabase_last_successful_backup_...`              | 19.8 h                             |                                                    |
| `SupabaseBackupMetricMissing`                          | `absent(...)` of the above                                    | metric present → silent, correctly | the `absent()` half it was split off for           |
| `HostDiskLow`                                          | `megacampus_host_filesystem_avail_bytes`                      | 52.9% free                         |                                                    |
| `HostDiskCritical`                                     | same                                                          | 52.9% free                         |                                                    |
| `HostDiskMetricMissing`                                | `absent(...)` of the above                                    | metric present → silent, correctly | timer runs every 5 min                             |
| _(recording)_ `megacampus:qdrant_rest_error_ratio:10m` | —                                                             | 0.0485                             | feeds the rule above                               |

**`QdrantRestErrorRateHigh` proved itself during this work.** The Stage 5 defect in §1 of the quality
report produces `Bad Request` responses; running the benchmark against the pre-fix code raised the
4xx ratio above 2%, the rule fired at 21:02 and resolved at 21:07, and the notification reached
Telegram. Metric source, threshold, `for:` window, Alertmanager route and delivery are all confirmed
end to end by an accidental live test.

### Reachable in principle, silent in practice (1)

| Rule                       | Why                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QdrantHybridFallbackHigh` | The counter exists — `megacampus_qdrant_hybrid_requests_total = 2`, `..._fallback_total = 0` — but `worker-worker.prom` was last written **2026-08-12**, fourteen days ago. The rule requires `rate(requests[15m]) > 0`, so with no staging traffic it cannot fire. It is correctly wired, not broken; it is watching an idle environment. |

Note the counter is per `service`/`instance`: `megacampus-worker` writes as `worker/worker`,
`megacampus-worker-stage6` as `stage6/stage6`, `megacampus-api-green` as `api/api-green`. Only
`worker-worker.prom` exists, so Stage 6's own worker has never recorded a hybrid search on staging.

### Currently unreachable — no metric at all (4)

All four document-evidence rules. Every one of their six metrics returned **ABSENT** from Prometheus,
and no `evidence-*.prom` file exists in `/var/lib/megacampus/qdrant-metrics/`:

| Rule                                                 | Metric                                                                                 | Behaviour with the metric absent                                                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DocumentEvidenceRunFailed`                          | `megacampus_document_evidence_runs_total`, `..._stage4_invocations_total`              | `increase()` over an absent series is empty → never fires                                                                                                             |
| `DocumentEvidenceCoverageIncomplete`                 | `..._coverage_ratio`, `..._runs_total`                                                 | `min()` is empty and the `absent()` guard is itself gated on `sum(runs_total) > 0`, which is also empty → **never fires**, including the case it was written to catch |
| `DocumentEvidenceDegradedAutomaticDecisionsRepeated` | `..._degraded_automatic_decisions_total`                                               | never fires                                                                                                                                                           |
| `DocumentEvidenceCriticalConflictStale`              | `..._unresolved_critical_conflicts`, `..._oldest_unresolved_critical_unixtime_seconds` | `max() > 0` is empty → never fires                                                                                                                                    |

**The cause is a configuration split, not broken code.** The writer keys off
`QDRANT_METRICS_TEXTFILE_DIR`. The staging containers (`megacampus-worker`,
`megacampus-worker-stage6`, `megacampus-api-green`) all set it and all have
`DOCUMENT_EVIDENCE_ENABLED=true` — and have run essentially no evidence traffic. The **dev** workers
(`megacampus-worker-dev`, `megacampus-worker-stage6-dev`) set neither variable, and dev is where the
runs actually happen: the only Stage 6 evidence activity in `generation_trace` since the rebuild is
three `evidence_scope_empty` rows from **2026-08-22, on dev**.

So the environment that runs is not the environment that reports. `DocumentEvidenceCoverageIncomplete`
is the one worth fixing rather than merely noting: it carries an `absent()` branch specifically so a
missing signal is reported, and that branch is disarmed by a guard that is absent for the same
reason.

`.codex/repository-failure-modes.md` already records this class twice — a rule that can be
permanently `absent()` and therefore permanently silent, and a tunnel dead for four months behind
`Up (healthy)`. This is a third instance, found by asking each rule what would make it fire.

## B4 — Reindex from source of truth

**The procedure is executable today.** `qdrant:reindex plan` completed against a dry fixture with no
live adapters:

```
PLAN status=ok eligible=7 recoverable=1 audited_failed=6 unresolved=0 action=none
```

Exit code 0. No production mutation: `plan` reads, and `--fixture` constructs no live adapter at all.

**But the fixture shipped for it was stale.** `qdrant:reindex --help` advertises `--fixture <path>` as
the dry-run entry point, and the repository ships exactly one fixture,
`tests/unit/tools/qdrant/fixtures/reindex-dry-fixture.json`. Running the documented command against
it gives:

```
REINDEX_ERROR code=fixture_invalid detail=[ ... "path": ["sources",0,"hash"] ... "recoveryBinding" ]
```

Missing `sources[].hash`, `sources[].errorMessage` and the entire `recoveryBinding`. **Nothing
referenced that file** — not a test, not a script, not a runbook — so nothing noticed when the schema
moved past it. An unused artifact that looks like evidence.

Fixed: the fixture is regenerated from the same builders the CLI test uses, and
`tests/unit/tools/qdrant/reindex-dry-fixture-is-loadable.test.ts` now parses it with the schema the
CLI parses it with. Shown red against the stale file with the same Zod complaint.

Two related notes:

- `qdrant:reindex plan` **without** `--fixture` fails closed with `Exact source recovery adapter
configuration is required`. That is by design: a reindex is bound to a reviewed recovery run and
  cannot be planned outside one.
- `deploy/qdrant/source-recovery-run.sh` is the privileged Q12 wrapper and requires an owner-only
  plan input (UID 1001, mode 0600) that is produced by the Q12 procedure and is not in the
  repository. It was **not** exercised; the application-level `plan` above is the executable proof.

**A reindex is still a production mutation outside standing authorization and was not run.**
