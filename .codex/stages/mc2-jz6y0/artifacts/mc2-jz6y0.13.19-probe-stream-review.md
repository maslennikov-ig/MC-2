---
schema_version: orchestration-artifact/v1
artifact_type: independent-correctness-review
task_id: mc2-jz6y0.13.19
stage_id: mc2-jz6y0
review_target: D6 Stream-1 (DB probe) implementation of plan Tasks 1–14
reviewer: claude fable-5 (independent correctness, read-only)
review_date: 2026-07-16
probe_worktree: /home/me/code/mc2/.worktrees/q12-d6-probe
probe_branch: codex/q12-d6-probe
range: 72af414c..1772d54206dc664e02b3af3dad08ea9705824aee (28 commits)
authority_contract: docs/superpowers/specs/2026-07-15-q12-d6-activation-truth-contract.md
authority_contract_tail_sha256: 2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5
verdict: PASS
scores_p0_p1_p2_p3: '0/0/2/4'
suite_result: '72/72 passed (MC2_Q12_REAL_PG17=1), reproduced independently'
---

# D6 probe-stream independent correctness review

## Verdict

**PASS** — 0 P0, 0 P1, 2 P2, 4 P3.

The delivered Stream-1 logic (canonicalization/framing, SQL projection allowlist,
connection/TLS identity, capability projection, managed-inventory + session
projection, database/host projections, H/N evidence table, writer ancestry +
Docker truth, request/frame schemas, CLI/env/FD preflight, runtime-FD baseline,
and the in-memory `db_locked → host_bound → sealed → closed` protocol) is a
faithful, exact transcription of the frozen contract. Every key set, literal,
classification/action pair, endpoint/CA/FD pin, digest binding, and the H/N
table matches the contract bytes; the canonicalizer reproduces the **ratified**
W field-11 hash. The 72-test suite passes against real disposable PG17 and was
reproduced independently.

All findings are completeness / latent-production gaps or one wording note.
None is a logic error, security hole, or secret leak in the tested surface.
**The two P2s must be resolved or explicitly tracked-as-deferred before the
probe is wired as a runnable production artifact / accepted for live use.**

## Stop-condition checks (both clear)

- Contract tail hash: `tail -c 47092 …contract.md | sha256sum` =
  `2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5` ✓ (matches).
- Write-zone scope: `git diff --name-only 72af414c..HEAD` = exactly the four
  authorized files (`deploy/qdrant/q12-activation-truth-projection.sql`,
  `packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs`,
  `.../tests/unit/ops/fixtures/q12-activation-truth-runner.cjs`,
  `.../tests/unit/ops/q12-activation-truth.test.ts`). No file outside the zone.

## Two accepted orchestrator rulings — verified, not re-litigated

1. **`projection_sql_sha256` binds the FD-11 file's own hash
   `ba31de92256bc1f5444ab3b8dbcd814052b54664bd93fc16bc0de55a24050e6d`, not W
   field 5 `a42d6d39…`.** I independently confirm against the contract bytes:
   the request key list (contract :355-366) lists `projection_sql_sha256`
   separately from `w_activation_tuple_sha256`; FD 11 (contract :217) is "exact
   accepted D6 SQL projection"; W field 5 `activation_sql_projection_sha256` is
   the _activation barrier's ~8.8 KB mutation SQL_ — a different artifact.
   Binding the read-only projection to field 5 would be incoherent. Ruling is
   correct; the plan's Task 2 phrase is plan imprecision (the test documents this
   at lines 389-394). Verified: the SQL file hashes to `ba31de92…`.
2. **File-scoped `eslint-disable max-lines` with reason.** Confirmed: line 1 is a
   single reasoned file-scoped disable tied to the contract-fixed single-file
   write zone. Acceptable; not a broad suppression.

## Independent evidence gathered

- `sha256sum q12-activation-truth-projection.sql` → `ba31de92…` (= request
  `projection_sql_sha256`). ✓
- lock-catalog ref → `cbfa2f09…` (= W field 8), lock-order ref → `26163c33…`
  (= W field 9). ✓
- SQL `full_catalog_share_lock` relation order is **byte-order-identical** to the
  79-relation W lock-order reference; catalog set and `capability_lock_rows`
  VALUES set both equal the same 79-relation set. ✓
- `probe.canonicalHash(inventory)` = `c90edb78…` (= ratified W field 11) with
  **no** trailing LF; hashing the same canonical bytes **plus one LF** diverges
  to `0759fe93…`. So the ratified authority used no-LF, and the probe matches it.
- Inventory has 14 identities; the probe's own identity carries
  `transaction_free_required=false` (so its open transaction is correctly the
  sole non-transaction-free exception).
- Probe module imports only `node:crypto`; grep shows **no** `fs`, `pg`, `tls`,
  `net`, `child_process`, `/proc`, or `process.argv/env` I/O. CLI entrypoint is a
  stub (`process.exit(2)`, "inspect flow not yet assembled").
- `MC2_Q12_REAL_PG17=1 … vitest run q12-activation-truth.test.ts` → **72/72
  passed** (incl. real privilege-revoke gate, real SHARE↔ACCESS-EXCLUSIVE
  wait-winner conflict, and the three-classification full-protocol run).

## Findings

| id  | sev | conf     | file:line                                                      | description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --- | -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | P2  | high     | probe.cjs:2266-2269; :2071-2183                                | Production `inspect` CLI is a non-functional stub; the entire live runtime-I/O assembly is unimplemented. `runProbeInspect` consumes pre-digested `ctx`. "Full-run wiring" exists only at the in-memory protocol layer. Tests bypass the CLI and gather DB facts themselves, so they cannot catch this.                                                                                                                                                                                          |
| F2  | P2  | med-high | projection SQL :367-381; probe.cjs:862-874,1000-1036,1059-1097 | `session_activity` template lacks the null→sentinel coalesce the probe's own comment says is "applied upstream at the SQL layer". Real provider-background rows (null `usename`/`datname`/`application_name`) would fail the 4-tuple inventory match (`unknown managed identity (drift)`) and the required-non-null projection. Masked: disposable PG17 has no provider plane; synthetic rows are pre-normalized. Not covered by the W production re-freeze (catalog-bound fields 5/6/8/9 only). |
| F3  | P3  | high     | projection SQL :135-138; probe.cjs:657-660                     | `capability_lock_rows` emits `priv_maintain/priv_update/priv_delete/priv_truncate`; `normalizeLockRow` reads `maintain/update/delete/truncate`. No production mapping layer exists (tests re-alias manually at test :828-832 / :1111-1115). Corollary evidence of the missing SQL→JS glue (F1).                                                                                                                                                                                                  |
| F4  | P3  | high     | contract :342; probe.cjs:40-63,81-83                           | Contract says canonical JSON has "exactly one LF"; `canonicalize`/`canonicalHash` produce **no** trailing LF. The implementation is nonetheless consistent with the ratified W field-11 hash (reproduced no-LF). Cross-stream risk only if Root (Stream 2) hashes frames/objects with a trailing LF. Integration should make the no-LF rule explicit for Stream 2.                                                                                                                               |
| F5  | P3  | med      | projection SQL :44-124,149-228                                 | The delivered SQL projection + lock catalog/order embed the W **Layer-1 test-reference** catalog (per the W artifact, 69/79 relations are synthetic `auth_table_NN`/`public_table_NN` placeholders). Production re-freeze is required (W checklist item 2). The frozen SQL is not production-ready — acceptable given the explicit W deferral, but must be tracked.                                                                                                                              |
| F6  | P3  | low      | test :979-1035                                                 | Container Task-6 conflict proof uses a representative hand-written `LOCK … ACCESS EXCLUSIVE; INSERT` slice, not the actual W activation-slice bytes. Byte-binding is covered separately by `assertActivationDigestsBound` (unit) + W's own PG17 lock proof; adequate in combination. Noted for completeness.                                                                                                                                                                                     |

## Per-focus-area results

1. **Canonicalizer / frame envelope — PASS (F4 wording note).** Exact key set
   `{schema_version, sequence, kind, run_id, payload, previous_frame_sha256,
frame_sha256}` (serialization is contract-mandated recursively key-sorted, so
   the enumerated order is a set spec, not a byte order — correct). NFC via
   `String.prototype.normalize('NFC')`; compact; integer-only (floats throw in
   both `canonicalize` and `parseCanonicalJson`); duplicate keys rejected on the
   parse path (JS objects cannot carry dups on the serialize path);
   `frame_sha256` hashes the object minus that field; sequence starts at 1,
   increments by one, chains `previous_frame_sha256`. Reproduces ratified field 11.

2. **SQL projection — PASS.** Exactly the 16 FD-11 allowlist templates; exact
   `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY` + the three `SET LOCAL`
   timeouts (120s/180s/300s); full-catalog `LOCK … IN SHARE MODE` in exact W
   byte order (79/79 verified); no DDL/DML/COPY/`set_config`/termination/advisory
   unlock (allowlist template-name check + `stripSqlLiterals` forbidden-word
   scan; suite green). Mutation verbs appear only as quoted `has_table_privilege`
   literals (stripped before scanning).

3. **Connection identity / TLS — PASS for logic (F1 for live).** Strict DSN parse
   pins scheme/host/port/user/db and rejects query/fragment and every deviation;
   `verify-full` via `rejectUnauthorized=true` + pinned `servername` + CA hash
   `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` reject
   path; post-connect `session_user`/`current_database`/`transaction_read_only`/
   `transaction_isolation`/version-bounds asserts; PG18 & pre-17 rejected;
   backend-epoch discontinuity forbids reconnect. Live TLS connect itself is not
   wired (F1).

4. **Capability projection — PASS (F3 column-name note).** Nine exact keys; per-OID
   `lock_authorized` = OR of the four strong privileges; every row must be
   authorized (duplicate/empty/security-restricted-null all fail before
   classification); activity visibility only via real `pg_read_all_stats`
   membership or a W-accepted digest-bound equivalent — `D6 cannot invent one`;
   `pg_stat_clear_snapshot()` gate. Real revoke negative proven on PG17.

5. **Managed inventory (Task 7) — PASS (F2 coalesce note).** Exact top-level
   6-key / identity 7-key / observed 11-key sets; sort by first-five identity
   fields then PID; `project_ref`/`database`/`source_decision_sha256`/
   `provider_plane_trusted` pins; drift negatives for unknown identity,
   disallowed state, and false transaction-free predicate; probe is the sole
   non-transaction-free exception; unknown identities never learned/appended;
   canonical hash bound to ratified field 11. Provider-null handling gap = F2.

6. **Projections / H-N / writer / request / frames / CLI / FD baseline — PASS at
   the protocol layer (F1 for the live layer).** DB projection 21 keys with
   `global_pg_net_queue_count=0` and `prepared_xact_count=0` invariants; host
   projection 18 keys; H/N table is a pure function of
   (classification, safe-object-presence) with incident presence-driven H/N,
   `unsafe`→stop-before-seal, and `committed_receipt_pending` legality gate;
   writer-ancestry binding rejects a rollback-final-writer-manifest precondition
   and requires unique-head + required-ancestor; Docker 10+5 exact with drift
   negatives; request 24 keys + restart-rule nullability + evidence≡host
   byte-equality; seven frame payload key sets + strict protocol order/sequence/
   chain; argv exact + env (NODE_OPTIONS absent, only PATH/LC_ALL/LANG/HOME) +
   FD 3-7/9-11 access + FD 8 reserved-reject + FD-3-never-hashed; runtime FD
   baseline keyed by node-sha/major/minor/libuv/kernel. Task 14 wires the four
   probe frames + validates the three Root frames across all three
   classifications against real PG17.

7. **Tests actually test the implementation — PASS (F1 caveat).** RED anchors are
   real (negatives assert `toThrow` with specific message patterns); no
   tautologies in the pure-function tests; container tests exercise real
   privilege revoke, a real SHARE↔ACCESS-EXCLUSIVE wait-winner race, real cron/
   net/prepared counts, and drift negatives; `afterAll` runs `docker rm -f`;
   only `127.0.0.1`/local disposable PG17 is contacted (no remote/live path);
   the only password is a synthetic fixture literal; FD 3 is never hashed. **Sole
   caveat:** container tests gather DB facts and feed them to the pure functions,
   validating the functions rather than an end-to-end probe run (F1).

## Significant findings (detail)

**F1 — production `inspect` is a stub; live runtime-I/O assembly unimplemented (P2, high).**
Evidence: `if (require.main === module) { … process.exit(2); }` and
`runProbeInspect(ctx)` receiving `postConnect`, `lockVerification`, `dbFields`,
`capability`, `sessionObservationSha`, `rootPayloads` pre-computed; module
imports only `node:crypto`; no FD open, no `pg` connect, no FD-11 load, no
`request.projection_sql_sha256`↔FD-11 cross-check, no between-read snapshot-clear
discipline in the flow. Implication: the artifact at
`/opt/megacampus/.../q12-activation-truth-probe.cjs inspect` cannot run; the
tested "full-run wiring" is in-memory only. Next action: complete the runtime
assembly (or explicitly record it as a bounded, tracked deferral gated behind the
Root/Stream-2 spawn contract + the remote gate) and re-review before any live use.

**F2 — `session_activity` lacks the provider null→sentinel coalesce (P2, med-high).**
Evidence: template selects `sa.usename AS role` etc. with no `coalesce(...,'')`,
yet probe comment (:862-874) asserts the normalization "is applied upstream at
the SQL layer (coalesce)". Implication: legitimate provider-background rows
(null role/db/app) would be misclassified as `drift_incident` in a real run;
untested because bare PG17 has no provider plane. Not fixed by the catalog-bound
production re-freeze. Next action: add the coalesce to the FD-11 SQL (re-freezing
its hash) or relocate the normalization into the — currently absent — live glue,
with a test that feeds raw null-bearing provider rows.

**F4 — "exactly one LF" wording vs no-LF hashing (P3, high).**
Evidence: contract :342 vs `canonicalize` producing no trailing LF; empirical
`+1 LF` diverges the field-11 hash to `0759fe93…` while no-LF reproduces the
ratified `c90edb78…`. Implication: implementation is correct against the ratified
authority; only Stream-2 (Root) risks a cross-stream mismatch if it appends an LF
before hashing. Next action: integration note pins "hash over compact no-LF
canonical bytes; LF is JSONL line-framing only" for the Root coordinator.

## Notes

- I did not independently re-run full-repo `pnpm type-check`/`pnpm build`
  (Stream-1 focus + read-only); the worker reported type-check 0 and the TS suite
  compiled/ran cleanly under vitest.
- Field-11 ratification (`c90edb78…`) was treated as accepted authority and not
  re-litigated; I only verified the probe reproduces it.

---

# Delta review (correction round)

**Range:** `1772d542..5badf18dfd57e1cfeff62b78336ab2067c590445` (4 commits
`2fa497db..5badf18d`). **Scope:** worker's closure of the round-1 P2s F1 and F2
(+ the F3 corollary). **Verdict: PASS** — 0 P0 / 0 P1 / 0 P2 / 1 new P3 (DF1).
F1, F2, F3 are closed. No regression, no tautology, no out-of-zone write.

## Delta scope + independent evidence

- `git diff --name-only 1772d542..HEAD` = exactly three write-zone files (SQL,
  probe, test); fixture runner unchanged. No file outside the zone.
- SQL projection rebound to
  `36d280347650689de1d6c613f164c2eaa622f0eb567b134dd5b3b2cdad5332af`; pinned
  consistently — `PROJECTION_SQL_SHA256` appears 4× in the test (const +
  Task-2 assertion + F1 unit request fixture + F1 E2E request), the new literal
  once, and **zero** stale `ba31de92` in any of the three files.
- `MC2_Q12_REAL_PG17=1 … vitest run` → **78/78 passed**, reproduced
  independently (+6 vs round 1: F2, F3, three F1-unit, one F1-E2E).
- `assertProjectionAllowlist` still passes on the rebound SQL (exact 16-template
  set, no forbidden construct).

## F1 — production entrypoint + raw-I/O assembly — CLOSED

- The CLI now runs `main()` (not the stub). The `is a real child-process
entrypoint` test spawns `node <probe> inspect` and asserts exit
  `EXIT_REJECTED`=3 with `.not.toBe(2)` — proving the wired entrypoint, rejecting
  on argv mismatch in the sandbox (a full production run is impossible locally by
  construction).
- `main(runtime)` consumes raw I/O: reads FD 5 (request), FD 11 (SQL), FD 3
  (URL), FD 4 (CA), FD map via `fdStat`; enforces `sha256Hex(FD-11 bytes) ===
request.projection_sql_sha256`; never hashes FD 3 (`hashedFds=[11]`); the
  URL/CA/PG17 pins are hardcoded constants (`parseProductionUrl(url)`,
  `buildTlsConfig(caPem, {serverName: endpoint.host, expectedCaSha256:
PROD_CA_SHA256})`, `assertPostConnect`) and are **not** env-switchable — the
  only injectable seam is the `runtime` object. `process.env` is referenced once
  (only to feed `assertProductionEnv`, which validates the exact allowed key set).
- Connect-spy negatives assert **zero DB work**: the non-production-URL test
  (`parseProductionUrl` throws before connect) and the SQL-hash-mismatch test
  (throws at the bytes-equality check before reading FD 3) both assert
  `connectCalls === 0` and `EXIT_REJECTED`. Reject-path logging emits only
  `error.message` (endpoint/CA errors carry no URL/CA bytes) — no secret leak.
- `assembleInspect(io)` executes every FD-11 template live via `conn.query`,
  builds capability / lock / session / database projections from live reads,
  drives the seven chained `db_locked → host_bound → sealed → closed` frames,
  and performs the read-only `COMMIT` (`transaction_commit` template) +
  `closeConnection` **before** emitting `closed`. The F1 E2E test connects a real
  `pg.Client` to disposable PG17 and asserts 7 chained frames, `precommit_rollback`,
  `global_pg_net_queue_count=0`, `prepared_xact_count=0`, `active_cron_count=8`,
  79-relation capability, non-empty session observation, and
  `transaction_end=read_only_commit`/`connection_closed=true`. Architecturally
  cleaner than the round-1 `runProbeInspect`: the host projection is a **received
  Root frame** (validated by `validateHostProjectionPayload` + chain), so the
  probe correctly does not build it or run `validateEvidenceTable` /
  `assertRequestMatchesHostProjection` — those remain Root's (Stream 2) concern;
  the request's own H/N table is still validated via `validateRequest`. Not a
  regression.

## F2 / F3 — provider-null coalesce + capability mapping — CLOSED

- `session_activity` now `COALESCE`s `usename→''`, `datname→''`,
  `application_name→''`, `state→'none'`; `backend_type` is intentionally left
  raw (real background workers always report a non-null `backend_type`). These
  sentinels match the frozen inventory **exactly**: every `provider-background`
  identity has `role=''`/`database=''`/`application_identity=''` with
  `allowed_states=['none']`.
- The F2 test is **honest, not synthetic**: it queries real `pg_stat_activity`
  for `backend_type IN (autovacuum launcher, background writer, checkpointer,
walwriter)` on bare PG17, asserts each coalesces to the sentinels, and proves
  `buildSessionObservation` does not treat those live background rows as drift.
- F3 corollary sound: `assembleInspect` maps `priv_maintain/priv_update/…` →
  `maintain/update/…` before `buildCapabilityObject`, and the dedicated F3 test
  feeds the real `capability_lock_rows` output through `normalizeLockRow`
  (`lock_authorized=true`, numeric `oid`). The round-1 SQL↔JS column-name gap is
  closed and now exercised live.

## Supporting change 1 — `pg_catalog.coalesce` → `COALESCE` (11 sites) — legitimate

`COALESCE` is a SQL keyword expression and **cannot** be schema-qualified, so
`pg_catalog.coalesce(...)` was an invalid call that was latent because the
`structural_catalog` / `database_default` templates were never executed in
round 1. `assembleInspect` now runs them live, which forced (and validates) the
fix. No forbidden construct introduced (`assertProjectionAllowlist` passes); the
E2E run is green, proving the templates execute. Hash rebind is consistent
everywhere pinned (above).

## Supporting change 2 — fixture flags — do not mask a real drift class

- Random loopback publish (`-p 127.0.0.1::5432`) is test-only wiring for the F1
  E2E pg seam.
- `-c max_logical_replication_workers=0` legitimately suppresses the logical
  replication launcher. **Assessment of the F3-review-question:** the frozen
  inventory's launcher identity carries `role='supabase_admin'` (from the
  ratified field-11 live observation), not the `''` sentinel. On bare PG17 that
  launcher would run with `usename=NULL` → coalesced `''` → 4-tuple
  `['','','logical replication launcher','']`, which is **not** in the inventory
  → a false local drift. Suppressing it avoids a known local-vs-production
  divergence and does **not** hide a real drift class: in production the launcher
  runs as `supabase_admin` and matches; a genuinely NULL-usename launcher would
  **correctly** drift (`'' ≠ supabase_admin`), because the coalesce sentinel and
  the inventory identity are distinct. Inherent limitation (not a defect): the
  launcher's production usename is verified only by field 11 / the remote gate,
  never locally.

## New finding

| id  | sev | conf | file:line                                                                          | description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --- | ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DF1 | P3  | med  | probe.cjs assembleInspect (clear before capability + before session_activity only) | Snapshot-clear + fresh-read discipline is partial: two `clear_snapshot` calls feed the single initial db-projection used for `db_locked`; `host_bound` and `sealed` **reuse** that initial projection hash rather than the contract's mandated `pg_stat_clear_snapshot()` + complete fresh read before **each** of `db_locked`/`host_bound`/`sealed` (contract :287). Benign under the frozen `READ COMMITTED READ ONLY` + full-catalog `SHARE` transaction where re-reads are provably identical (so `bound`/`final` hashes are correct), but not the literal three-point discipline. Recommend clearing + re-reading before `host_bound`/`sealed`, or documenting the read-only/SHARE equivalence at those emit points. |

## Round-1 P3 dispositions (unchanged, with delta notes)

- **F4 (no-LF hashing):** unchanged and reinforced — the new `makeFdFrameReader`
  reads Root control frames as newline-delimited JSONL and hashes via the same
  no-LF `canonicalHash`, confirming the LF is line-framing only. Stream-2
  integration should still pin the no-LF rule for Root.
- **F5 (test-reference catalog):** unchanged — the rebound SQL (`36d28034…`) still
  embeds the W Layer-1 placeholder catalog; production re-freeze still required.
- **F6 (representative Task-6 slice):** unchanged.
