# Q12 Full Completion — design and specification (2026-07-16)

Status: owner-commissioned completion specification for the ENTIRE remaining
Q12 tail, to be executed by a dedicated Fable orchestrator session until the
self-hosted Qdrant platform is the live staging product and every documented
follow-up is either done or an owner-ratified explicit defer.

Epic: `mc2-jz6y0`. Integration branch: `codex/self-hosted-qdrant-platform`.
This document is an umbrella: it binds already-frozen normative contracts to
one ordered completion program. It adds no new normative bytes to any frozen
contract; where a requirement already lives in a frozen contract this spec
cites it and forbids re-deriving it.

---

## 1. Goal (definition of "done product")

The self-hosted Qdrant platform is DONE when all of the following are true on
the approved staging server (`megacampus-prod`, `/opt/megacampus`) and in the
integration branch:

1. Application read/write traffic for course embeddings uses a private
   self-hosted Qdrant `1.18.2` (image-lock `deploy/qdrant/image-lock.json`,
   index `sha256:75eab8c4…`, child `sha256:da65a06b…`), not Qdrant Cloud.
2. The `course_embeddings` data lives in a freshly reindexed physical
   collection behind the stable alias, with Qdrant-native multilingual BM25/IDF,
   server-side RRF/Formula priority ranking, strict indexed filtering, and the
   full payload-index set from the platform design.
3. Authoritative source rows are recovered per the accepted `.13.4.1` audit
   (42 exact no-replace copies applied, six `source_file_unrecoverable` and
   eighteen `retained-derived-only` dispositions recorded) before reindex; no
   `--allow-gaps`, no derived-content substitution.
4. The guarded live migration (base `20260711120000`→`140000`, observability
   `150000`/`151000`) is applied through the frozen barrier with the PG17
   security-manifest allowlist now populated; rollback remains guarded.
5. The blue/green app cutover is committed, nginx points at the self-hosted
   listener, the database barrier is activated, and writers resumed forward.
6. Monitoring is live: pinned Prometheus `3.13.1`, Grafana `12.4.5`,
   Alertmanager `0.33.1`, node_exporter `1.12.0` and the unprivileged textfile
   exporter, per decision `.14`, with the eight Qdrant alerts firing against a
   real scrape and the secure loopback Web UI reachable only on loopback.
7. Local snapshots persist on the named volume and pass the recreate/restore
   matrix; the daily Supabase backup timer (delivered `.13.7`) stays green.
8. A live smoke and a bounded observation window pass with no P0/P1.
9. Every remaining Beads item in the `mc2-jz6y0` lineage is closed or is an
   owner-ratified explicit defer recorded in `.codex/handoff.md`.

Non-goals (unchanged capacity-triggered deferrals from the platform design):
HA/replication, quantization, on-disk hot indexes, custom sharding, JWT RBAC.

---

## 2. Ground truth already delivered (do not redo)

The completion program starts from this accepted baseline; re-verify by reading
`.codex/handoff.md` and `.codex/stages/mc2-jz6y0/summary.md` at the resolved
`origin/codex/self-hosted-qdrant-platform` SHA, then trust it:

- Q1–Q9, evidence E1–E7, 100% local/development document-evidence activation.
- Q12 local remediation: guarded migrations `.13.1`, immutable operator `.13.2`,
  release-bound rollback `.13.3`, staging-local snapshot mode `.13.5`, source
  audit `.13.4` and operator `.13.4.1` (locally accepted, not yet executed live).
- W `.13.10` (barrier quiesce/resume FLIP `60910053`), M `.13.11` (migration
  credentials `a73a3651`+`29d73d04`), H `.13.12` (blue/green nginx `70bf6103`),
  D5J `.13.21`/`.13.22`, publisher `.13.9`, G7 `.13.7.2`, D5 `.13.17`, Root
  producer `.13.18`, D5W seam `.13.20`.
- **`.13.7` backup/restore gate DELIVERED (2026-07-16):** fail-closed operator +
  isolated Supabase-PG17.6 restore drill proven on the live server, daily
  `00:30 Europe/Amsterdam` timer enabled+active, 20+ never-executed operator
  defects fixed with TDD (`dedcc076`..`4fd2bdfa`). PG17 document-evidence
  security-manifest digests computed on the isolated restore and integrated into
  the live-gate allowlists (`b8204cde`).
- **W-tuple field 11 PROVISIONALLY frozen (2026-07-16):**
  `managed_inventory_sha256 = c90edb78341fb83a6d954212daca675f5bac89f17bd5611ceb6db3e56559bac6`,
  `deploy/qdrant/q12-managed-session-inventory.provisional.json` (`5836927e`),
  from an authorized read-only live inventory (three identical
  `pg_stat_activity` samples). Classification vocabulary and per-identity
  `allowed_states`/`transaction_free_required` are a documented determination
  **pending independent ratification**.
- Monitoring assets exist and are reviewed under `ops/qdrant/` (Prometheus
  `prometheus.yml`/`alerts.yml`/`alert-tests.yml`, Alertmanager, Grafana
  dashboard/provisioning, textfile `publish-metrics.sh`). Qdrant operator/compose
  entrypoints exist under `deploy/qdrant/` (`operator-compose.sh`,
  `publish-qdrant-operator.sh` → `ghcr.io/maslennikov-ig/mc-2/qdrant-operator`,
  `secret-entrypoint.sh`, `q12-lifecycle-core.py` supervisor, the 20-command
  manifest `q12-command-manifest.json`).

---

## 3. Frozen contracts this program binds (authority, not to be re-derived)

- Platform design/plan: `2026-07-10-self-hosted-qdrant-platform-design.md` /
  `.md` plan.
- Advisory document-evidence: `2026-07-11-advisory-document-evidence-rag-design.md`.
- Source recovery: `2026-07-12-q12-source-recovery-design.md`.
- Live-cutover corrections: `2026-07-13-q12-live-cutover-corrections-design.md`.
- Recoverable lifecycle + durable projections + retained-barrier provenance
  addenda: the three `2026-07-13`/`2026-07-14` addendum specs. Accepted addendum
  SHA-256 `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27`.
- D5J command binding/FWM amendment: `2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md`
  (SHA-256 `d6c4d8e4b2b7f6c53d648fdf587a5520db45fa5d8f3c84668b48b09b6bbe075c`).
- Joined retained-barrier fixture: `2026-07-15-q12-joined-retained-barrier-fixture-design.md`.
- **D6 activation-truth contract (frozen, Option A):**
  `2026-07-15-q12-d6-activation-truth-contract.md`, byte-identity
  `2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5`, final
  review `948982d9…` PASS 0/0/0/0.
- **Reviewed D6 implementation plan:** `docs/superpowers/plans/2026-07-15-q12-d6-activation-truth.md`.

Any change to W executable/SQL bytes, slices, catalog, or order invalidates D6
and requires re-review. The five (now twenty via D5J) retained lifecycle
commands and the manifest hash must stay byte-unchanged except through their
owning stream.

---

## 4. Completion phases (normative sequence)

The program runs in four phases; a later phase must not begin until the earlier
phase's acceptance gate passes. Every remote/live action inside Phase C is
gated by an owner-approved effects/secrets/observation/rollback/downtime packet.

### Phase A — Local implementation (NO remote/live)

A1. **Ratify field 11.** Independent review of the provisional managed-session
inventory and its classification determination; on PASS drop `.provisional`,
re-record `managed_inventory_sha256`, wire it as a request constant. On FAIL,
re-derive from a fresh authorized read-only live sample (the only live-touching
step in Phase A; read-only, no mutation) and re-review.

A2. **D6 `.13.19` implementation Tasks 1–20** exactly per the reviewed D6 plan
and frozen contract: the read-only PG17 probe (`inspect`) and the Root
coordinator lifecycle authority, on the Layer-1 test-reference tuple plus the
Layer-2 catalog-independent invariant. Two disjoint worktree streams (DB probe;
Root coordinator) + integration stream. TDD RED→GREEN per task; the five/twenty
retained commands and their manifest hash proven unchanged.

A3. **Root `.13.13` join local acceptance:** integrate the accepted correction
streams into the sole frozen command supervisor, capability manifest, and local
verification; the joined plan|live|recover controller and rollback/DB classifier
per D5 Task 9. Remote execution stays gated.

A4. **Local release matrix + closeout-lite:** full backend/shared/web/PG17/
Qdrant/snapshot/Compose/monitoring unit matrix, `pnpm type-check`, `pnpm build`,
`run_process_verification.sh`; independent correctness + docs review; integrate,
push, update handoff/summary/Beads.

Acceptance gate A: D6 and Root are integrated with P0/P1 zero, local matrix
green, field 11 ratified, and the live-cutover supervisor is locally accepted.

### Phase B — Image publication (remote, low-risk)

B1. **GHCR publication** of the pinned `qdrant-operator` image via
`deploy/qdrant/publish-qdrant-operator.sh` to
`ghcr.io/maslennikov-ig/mc-2/qdrant-operator`. Requires a classic PAT with
`write:packages` supplied through stdin — this is a credentialed external
action: STOP and request the token from the owner; never place it in argv, git,
logs, or env. Verify the published index/child digests match the image-lock.

Acceptance gate B: the operator image is published and its digests are pinned
and verified; no application traffic changed.

### Phase C — Live cutover (remote/live, high-risk, ONE observed window)

Before Phase C, present the full window packet to the owner (exact commands per
the 20-command manifest, secrets touched, observation plan, rollback path per
phase, and expected downtime/data impact) and obtain explicit approval. The
supervisor (`q12-live-cutover.sh` → `q12-lifecycle-core.py supervisor`) drives
the ordered manifest; the orchestrator observes and gates, it does not hand-run
individual mutations outside the manifest.

Ordered manifest phases (exact command keys):

- C1 `barrier.install`, `operator.self-check`, `barrier.verify-after-base` prep.
- C2 `writers.quiesce` (Compose-aware writer pause, W stream).
- C3 `pg.backup` (fresh four-file generation bound to the exported snapshot),
  `pg.restore` isolated drill (delivered `.13.7` pattern).
- C4 `migration.base.apply` (`…120000`→`140000`), `barrier.verify-after-base`,
  `migration.observability.apply` (`150000`/`151000`),
  `barrier.verify-after-observability`. The PG17 live gate is now populated, so
  `assertLiveMigration` will pass; capture the production
  `expected-post-migration-catalog` produced here for C7.
- C5 `source.forward` — execute the `.13.4.1` recovery: 42 crash-durable exact
  copies and all 24 audited dispositions; forbid `--allow-gaps` and derived
  substitution.
- C6 `reindex.plan` → `reindex.worker.create` → `reindex.execute` →
  `reindex.verify` — rebuild the physical `course_embeddings` collection from
  authoritative sources with Jina-v3 dense + Qdrant-native sparse BM25/IDF, the
  full payload-index set, server RRF/Formula priority, aliases, and a
  checksum-verified snapshot; verify strict indexed filtering and recall.
- C7 **Production RE-FREEZE + ratification:** re-run the field 5/6/8/9 repro tool
  and the D6 parametric mechanical test with
  `MC2_Q12_ACTIVATION_CATALOG_FILE=<production expected-post-migration-catalog>`;
  re-freeze `activation_sql_projection_sha256`, `activation_normal_slice_sha256`,
  `activation_lock_catalog_sha256`, `activation_lock_order_sha256` and drop the
  `.test-reference` suffix on their JSON assets. Confirm field 11 ratified.
- C8 `deploy.prepare`, `deploy.commit` — blue/green app color pointing at the
  self-hosted Qdrant listener (GHCR image from Phase B).
- C9 nginx switch (H stream durable `nginx_switch_intent` before reload),
  `barrier.activate` (activation receipt `state=activated`),
  `writers.resume.forward`.
- C10 Monitoring deploy from `ops/qdrant/` (Prometheus/Grafana/Alertmanager/
  node_exporter/textfile per decision `.14`) and secure loopback Web UI; prove
  the eight Qdrant alerts against a real scrape and loopback-only exposure.

Rollback: any failed phase before `barrier.activate` uses
`writers.resume.rollback` plus the phase-required source/Qdrant/handoff rollback
receipts and the guarded migration rollback; an activated run is finish-forward
only. Cleanup must reach zero disposable-resource residue; cleanup failure
overrides success.

Acceptance gate C: traffic served from self-hosted Qdrant, barrier activated,
writers resumed forward, monitoring live, snapshots green, rollback path proven
available at every pre-activation phase.

### Phase D — Post-cutover hardening and closeout

D1. **Live smoke + observation window:** a real end-to-end course-generation
retrieval path against self-hosted Qdrant, plus a bounded observation window
watching alerts, DB load, and writer health; abort on material impact.

D2. **`.13.8` password rotation — OWNER-GATED.** The owner explicitly deferred
rotation on 2026-07-16 ("Пароль можешь не менять"). The working DSN is
installed and in use by the backup timer. Rotation is destructive (invalidates
existing connections). The orchestrator MUST re-present the rotation
effects/rollback packet and obtain a fresh explicit decision; do NOT rotate on
the strength of the general "довести до конца" instruction.

D3. **`.13.6` off-host S3 production DR:** configure off-host Qdrant snapshot
shipping per the production gate. Requires S3 credentials — credentialed
external action, STOP-and-ask.

D4. **`.25` Prometheus retention YAML:** migrate the deprecated CLI retention
flags into YAML before any Prometheus pin change (bounded, nonblocking).

D5. **Final closeout:** full release matrix, independent review, docs/runbook/
handoff/summary updates, Graphify refresh at the release boundary, Beads
closures, `bd dolt push`, `git push`, workspace cleanup.

Acceptance gate D (epic done): all lineage Beads closed or owner-ratified
defers; live smoke green; docs and graph current; branches in sync with origin.

---

## 5. Safety invariants (apply to every phase)

- Never recover or mutate Qdrant Cloud; the old DB was test-only and is lost.
- Never expose or reuse credentials in prompts, git, argv, logs, or env; owner
  secrets stay owner-only 0600 on the server, ingested via stdin.
- Import shared contracts only from `@megacampus/shared-types`.
- Do not weaken strict/recovery tests, the barrier, or the guarded rollback to
  manufacture a green result; a real defect gets a real fix with TDD + review.
- Every remote/live or credentialed action: present exact effects, secrets,
  observation, rollback, and downtime/data impact, then STOP for owner approval.
- Beads is the single task tracker; no TodoWrite/markdown task lists.
- Provider-plane roles (`postgres`↔`supabase_admin`, reserved/background) are the
  accepted `.13.14` trusted residual boundary; do not attempt to control them.

---

## 6. Task inventory (maps to the plan; each has an acceptance test)

| ID    | Phase | Deliverable                                               | Owning stream     | Beads             |
| ----- | ----- | --------------------------------------------------------- | ----------------- | ----------------- |
| T-A1  | A     | Ratified field-11 inventory + wired constant              | D6 probe + review | `.13.19`          |
| T-A2  | A     | D6 probe + Root coordinator (Tasks 1–20)                  | two worktrees     | `.13.19`          |
| T-A3  | A     | Root join local acceptance                                | Root supervisor   | `.13.13`          |
| T-A4  | A     | Local matrix + closeout-lite                              | orchestrator      | `.13.13`/`.13.19` |
| T-B1  | B     | GHCR operator image published + verified                  | deploy            | `.13`             |
| T-C1  | C     | Barrier install + self-check                              | supervisor        | `.13`             |
| T-C2  | C     | Writers quiesced                                          | W                 | `.13`             |
| T-C3  | C     | Fresh backup + isolated restore                           | `.13.7` operators | `.13`             |
| T-C4  | C     | Base + observability migrations applied, catalog captured | M/barrier         | `.13`             |
| T-C5  | C     | Source recovery executed (42 copies, 24 dispositions)     | `.13.4.1`         | `.13.4.1`         |
| T-C6  | C     | Reindex rebuilt + verified behind alias                   | reindex operators | `.13`             |
| T-C7  | C     | Fields 5/6/8/9 re-frozen to production; field 11 ratified | D6                | `.13.19`          |
| T-C8  | C     | Blue/green deploy prepared + committed                    | H/deploy          | `.13`             |
| T-C9  | C     | nginx switch + barrier activate + resume forward          | H/W/supervisor    | `.13`/`.13.13`    |
| T-C10 | C     | Monitoring live + secure loopback Web UI                  | monitoring        | `.13`/`.14`       |
| T-D1  | D     | Live smoke + observation window pass                      | orchestrator      | `.13`             |
| T-D2  | D     | Password rotation (owner-gated)                           | `.13.8`           | `.13.8`           |
| T-D3  | D     | Off-host S3 DR (credential-gated)                         | `.13.6`           | `.13.6`           |
| T-D4  | D     | Prometheus retention YAML                                 | monitoring        | `.25`             |
| T-D5  | D     | Final closeout: docs, graph, beads, push                  | orchestrator      | epic              |

---

## 7. Verification

Per-task RED→GREEN plus:

- Local gates: `pnpm type-check`, `pnpm build` (synthetic web env),
  the focused unit suites, PG17-gated suites under `MC2_Q12_REAL_PG17=1`,
  `scripts/orchestration/run_process_verification.sh`, and
  `scripts/orchestration/run_stage_closeout.py --stage mc2-jz6y0` at stage close.
- Live gates: `barrier.verify-*` receipts, `reindex.verify` recall/schema,
  isolated restore equality, the eight-alert scrape proof, loopback-only exposure
  proof, and the observation window.
- No completion claim without fresh command evidence
  (`superpowers:verification-before-completion`).

---

## 8. Explicit stop conditions

Stop and ask the owner at: any remote/live boundary before its approved packet;
any credentialed action (GHCR PAT, S3, password rotation); a genuine new
product-truth gap (e.g. a source row disposition not covered by `.13.4.1`); an
ownership conflict that cannot be isolated to a worktree; or a required gate
that keeps failing after in-scope systematic debugging.
