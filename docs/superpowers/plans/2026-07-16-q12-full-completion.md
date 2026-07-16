# Q12 Full Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans`
> (or `superpowers:subagent-driven-development` when spawning per-task
> subagents) to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax. For every code task use `superpowers:test-driven-development` (RED →
> GREEN → commit) and `superpowers:verification-before-completion`.

**Goal:** take the self-hosted Qdrant platform from the delivered `.13.7`
backup gate through D6/Root implementation, live cutover, reindex, monitoring,
and closeout to a live staging product, with every remote/live and credentialed
step owner-gated.

**Architecture:** orchestrator-driven Epic → Stage → Session on `mc2-jz6y0`.
Phase A is local (two disjoint worktree streams for D6 + a Root stream). Phase B
publishes the operator image. Phase C runs the 20-command live-cutover manifest
through the frozen supervisor under one owner-approved observed window. Phase D
hardens and closes out. Authority is the spec
`docs/superpowers/specs/2026-07-16-q12-full-completion-design.md` and the frozen
contracts it binds.

**Tech stack:** pnpm monorepo (`packages/course-gen-platform`,
`packages/web`, `packages/shared-types`); PostgreSQL 17.6 (Supabase Session
pooler, verify-full); Qdrant 1.18.2 (image-lock); Docker/Compose; systemd;
Prometheus 3.13.1 / Grafana 12.4.5 / Alertmanager 0.33.1 / node_exporter 1.12.0;
Node 22 + pnpm 8.15.0 + tsx on the server (installed during `.13.7`).

## Global Constraints

- Epic `mc2-jz6y0`; integration branch `codex/self-hosted-qdrant-platform`.
- Never mutate/recover Qdrant Cloud. Never expose credentials in argv/git/logs/
  env; owner secrets stay owner-only 0600 on the server, ingested via stdin.
- Import shared contracts only from `@megacampus/shared-types`.
- Do not weaken strict/recovery tests, the barrier, or the guarded rollback.
- Every remote/live or credentialed action: present exact effects, secrets,
  observation, rollback, downtime/data impact, then STOP for owner approval.
- Beads is the only tracker. No TodoWrite/markdown task lists.
- Frozen bytes are authority: D6 contract `2a2251ac…`, addendum `7188d792…`,
  D5J amendment `d6c4d8e4…`, image-lock digests `75eab8c4…`/`da65a06b…`,
  operator repo `ghcr.io/maslennikov-ig/mc-2/qdrant-operator`.
- Provider-plane roles are the accepted `.13.14` trusted residual boundary.
- Verify canonical commands from `.codex/orchestrator.toml`; use
  `scripts/orchestration/run_process_verification.sh` and
  `run_stage_closeout.py --stage mc2-jz6y0`.

---

# PHASE A — Local implementation (no remote/live)

## Task A0: Rehydrate and baseline (no code)

**Files:** read-only.

- [ ] **Step 1:** `git fetch origin`, resolve `origin/codex/self-hosted-qdrant-platform`,
      read `.codex/handoff.md`, `.codex/stages/mc2-jz6y0/summary.md`, this plan's
      spec, the D6 contract, and the reviewed D6 plan
      `docs/superpowers/plans/2026-07-15-q12-d6-activation-truth.md`.
- [ ] **Step 2:** `bd ready` / `bd show mc2-jz6y0.13.13 mc2-jz6y0.13.19`; confirm
      the delivered `.13.7`/`.13.10` baseline and the provisional field-11 freeze.
- [ ] **Step 3:** Read `graphify-out/GRAPH_REPORT.md`; run focused
      `graphify query/path/explain` for the D6 probe, supervisor, and reindex code
      before broad search.
- [ ] **Step 4:** Confirm the D6 Task 0 precondition gate passes (W `.13.10` +
      `.13.20` accepted; `command_manifest_sha256` matches the accepted successor
      `aaec6fc2…`). If not, STOP.

Verification: baseline SHAs, Beads states, and the Task 0 gate recorded in a
fresh working note; no files changed.

## Task A1: Ratify W-tuple field 11

**Files:**

- Modify: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md`
- Rename: `deploy/qdrant/q12-managed-session-inventory.provisional.json`
  → `deploy/qdrant/q12-managed-session-inventory.json` (on ratification)
- Test: `packages/course-gen-platform/tests/unit/ops/` (inventory schema/hash pin)

- [ ] **Step 1:** Dispatch an independent read-only review of the provisional
      inventory and its classification determination against the D6 contract's
      managed-session projection (`:255-283`): schema keys, the seven identity keys,
      byte-sort, `allowed_states` including the stateless `none` literal, and
      `transaction_free_required`. Reviewer must confirm no invented identity and no
      synthesis from general Supabase knowledge beyond the observed samples.
- [ ] **Step 2:** If the review finds the live sample insufficient, take ONE more
      authorized read-only `pg_stat_activity` sample over the verify-full DSN (no
      mutation), reconcile, and re-review.
- [ ] **Step 3:** On PASS: drop `.provisional`, re-compute and re-record
      `managed_inventory_sha256` in the tuple artifact, and add a unit test pinning
      the schema keys, the identity-item key set, and the frozen hash.
- [ ] **Step 4:** Run the test; commit; push.

Verification: independent review PASS; inventory file renamed; hash-pin test
green; tuple artifact records the ratified value.

## Task A2: D6 `.13.19` implementation — DB probe stream (Tasks 1–14, 16–17)

**Files (create only, per the reviewed D6 plan Stream 1 write zone):**

- `packages/course-gen-platform/tools/qdrant/q12-activation-truth-probe.cjs`
- `deploy/qdrant/q12-activation-truth-projection.sql`
- `packages/course-gen-platform/tests/unit/ops/fixtures/q12-activation-truth-runner.cjs`
- `packages/course-gen-platform/tests/unit/ops/q12-activation-truth.test.ts`

**Interfaces:** consumes the frozen contract's canonical objects, frame
envelope, SQL projection bundle, capability/lock/session/database/host
projections, classification table, FD/pidfd/spawn gates; produces the read-only
`inspect` probe surface consumed by the Root coordinator (Task A3 stream).

- [ ] **Step 1:** In an isolated worktree
      (`superpowers:using-git-worktrees`) execute reviewed D6 plan Tasks 1–14 and
      16–17 in order, each RED→GREEN→commit exactly as the plan specifies. Do not
      re-derive constants — copy the contract bytes.
- [ ] **Step 2:** Run the focused probe/PG17 suites under `MC2_Q12_REAL_PG17=1`
      on disposable local PG17 fixtures; `pnpm type-check`.
- [ ] **Step 3:** Independent correctness review of the probe stream; fix P0/P1;
      P2+ beyond the correction cap becomes a tracked replan, not a loop.
- [ ] **Step 4:** Keep the stream on its branch for the integration task; do not
      merge yet.

Verification: all probe-stream RED gates pass; type-check 0; review P0/P1 zero.

## Task A3: D6 Root coordinator stream + Root `.13.13` join (Tasks 9–13, 15, 18–20)

**Files (create/modify per Stream 2 write zone):**

- Modify: `deploy/qdrant/q12-lifecycle-core.py` (supervisor spawn/protocol/
  authority; predecision → optional durable `R` → terminal seal)
- Modify (proof-only): the two existing tests that assert the retained-command
  bytes/hashes are unchanged
- Modify: Root join `.13.13` supervisor/capability-manifest/local-verification
  wiring for the joined plan|live|recover controller and rollback/DB classifier
  (D5 Task 9)

- [ ] **Step 1:** In a second isolated worktree execute reviewed D6 plan Tasks 9,
      10, 11, 15, 18, 19 (Root protocol, predecision, optional `R`, terminal seal,
      post-`R` narrowing, restart authority) RED→GREEN→commit.
- [ ] **Step 2:** Task 15 immutability proof: the twenty retained commands and
      `q12-command-manifest.json` `argv_sha256` values are byte-unchanged.
- [ ] **Step 3:** Integrate Root `.13.13`: the sole frozen supervisor consumes
      the probe `inspect` result across the `R` handshake with the SHARE-lock proof;
      local acceptance only, remote execution gated.
- [ ] **Step 4:** Focused suites + `pnpm type-check`; independent correctness
      review of the coordinator/Root stream; fix P0/P1.

Verification: Root protocol RED gates pass; retained-command immutability proven;
type-check 0; review P0/P1 zero; remote path still refuses to execute.

## Task A4: D6 integration + local release matrix + closeout-lite

**Files:**

- Create: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.19-q12-d6.md`
- Modify: `.codex/handoff.md`, `.codex/stages/mc2-jz6y0/summary.md`

- [ ] **Step 1:** Merge the two D6 worktree streams into the integration branch
      (verify with `git merge-tree` first; scope commits to explicit paths); resolve
      any conflict; validate the tracked artifact with
      `scripts/orchestration/validate_artifact.py`.
- [ ] **Step 2:** Full local release matrix at the integration head: backend
      units, shared, web, PostgreSQL/PG17 (`MC2_Q12_REAL_PG17=1`), exact Qdrant
      15/15, snapshot/restore, Compose/runtime, monitoring rule/alert checks,
      `pnpm type-check`, `pnpm build` (synthetic web env),
      `run_process_verification.sh`. Record the one known-env failure
      (`qdrant-observability-contract.test.ts` `QDRANT_METRICS_GID`) as pre-existing.
- [ ] **Step 3:** Independent docs review (`docs_reviewer`) of handoff/summary/
      runbook impact; apply fixes.
- [ ] **Step 4:** `bd update`/`bd close` for the D6/Root local acceptance;
      `bd dolt push`; commit; `git push`.
- [ ] **Step 5:** `check_stage_ready.py mc2-jz6y0` sanity (not a stage close yet).

Verification: matrix green (only the known-env failure), reviews P0/P1 zero,
artifact valid, branches in sync. **Acceptance gate A reached.**

---

# PHASE B — Operator image publication (remote, low-risk)

## Task B1: Publish the pinned qdrant-operator image to GHCR

**Files:** read-only in repo; runs `deploy/qdrant/publish-qdrant-operator.sh`.

- [ ] **Step 1:** Present the publication packet to the owner: exact command,
      the `ghcr.io/maslennikov-ig/mc-2/qdrant-operator` target, the image-lock
      digests, and that a classic PAT with `write:packages` is required via stdin.
      STOP for approval and the token.
- [ ] **Step 2:** With the owner-supplied PAT piped through stdin (never argv/
      env/logs), run the publisher; it logs in, builds/pushes the pinned image, and
      verifies digests.
- [ ] **Step 3:** Confirm the published index/child digests match
      `deploy/qdrant/image-lock.json`; record the receipt in the stage artifact.

Verification: image present in GHCR with pinned digests; no application traffic
changed; PAT not persisted anywhere. **Acceptance gate B reached.**

---

# PHASE C — Live cutover (remote/live, ONE observed window)

## Task C0: Window packet + owner approval (no mutation)

- [ ] **Step 1:** Assemble the window packet: the ordered 20-command manifest
      (`q12-command-manifest.json`) with each command's exact argv/env, the secrets
      touched (owner DSN, CA, capability files), the observation plan (barrier
      receipts, DB load, writer health, alert scrape), the per-phase rollback path,
      and expected downtime/data impact (writer pause window; no source write).
- [ ] **Step 2:** Present to the owner and STOP for explicit approval to open the
      window. Record the approval in the stage artifact.

Verification: owner approval recorded; nothing mutated yet.

## Task C1: Barrier install + self-check

- [ ] **Step 1:** Start the supervisor
      (`deploy/qdrant/q12-live-cutover.sh --run-id <uuid> …`) for `barrier.install`
      and `operator.self-check`; confirm the capability file, run root, and receipts
      are created owner-only.
- [ ] **Step 2:** `barrier.verify-after-base` prep read; capture the pre-mutation
      frontier and identity.

Verification: barrier installed; self-check green; receipts owner-only.

## Task C2: Writers quiesce

- [ ] **Step 1:** `writers.quiesce` (W Compose-aware pause); confirm the ten
      managed writers stopped and any partial-capture targets held per the tuple.
- [ ] **Step 2:** Record the quiesce receipt; verify no application write path
      remains active.

Verification: quiesce receipt present; writers stopped; rollback (`resume`)
available.

## Task C3: Fresh backup + isolated restore

- [ ] **Step 1:** `pg.backup` — a fresh four-file generation bound to the
      exported snapshot (delivered `.13.7` operator).
- [ ] **Step 2:** `pg.restore` — the isolated Supabase-PG17.6 restore drill
      (proven pattern) against that generation; require cluster-global + cutover +
      baseline equality and zero residue.

Verification: fresh generation published; isolated restore PASS with zero
residue.

## Task C4: Apply guarded migrations + capture production catalog

- [ ] **Step 1:** `migration.base.apply` (`20260711120000`→`140000`) then
      `barrier.verify-after-base`; the PG17 live gate (`b8204cde`) now passes.
- [ ] **Step 2:** `migration.observability.apply` (`150000`/`151000`) then
      `barrier.verify-after-observability`.
- [ ] **Step 3:** Capture the production `expected-post-migration-catalog.json`
      produced by this run into the run root for Task C7.

Verification: barrier verify-after-base and verify-after-observability receipts
green; production catalog captured; guarded rollback still available.

## Task C5: Execute source recovery (.13.4.1)

- [ ] **Step 1:** `source.forward` — apply the 42 crash-durable exact no-replace
      copies and record all 24 audited dispositions (six `source_file_unrecoverable`,
      eighteen `retained-derived-only`). Forbid `--allow-gaps` and derived
      substitution.
- [ ] **Step 2:** Verify recoverable eligible coverage rose per the audit
      (109 → 234 of 240) and the dispositions are durable.

Verification: recovery receipt matches the `.13.4` exact counts; no gap flag
used.

## Task C6: Reindex rebuild + verify

- [ ] **Step 1:** `reindex.plan` → `reindex.worker.create` → `reindex.execute`:
      rebuild the physical `course_embeddings` collection from authoritative sources
      with Jina-v3 dense + Qdrant-native sparse BM25/IDF, the full payload-index set,
      server RRF/Formula priority, behind the stable alias, with a checksum-verified
      snapshot.
- [ ] **Step 2:** `reindex.verify` — strict indexed filtering, schema, recall,
      and snapshot/restore isolation on the pinned `1.18.2` image.

Verification: `reindex.verify` PASS; alias points at the new physical
collection; snapshot recreate/restore matrix green.

## Task C7: Production RE-FREEZE + field-11 ratification confirm

**Files:**

- Rename: `deploy/qdrant/q12-activation-lock-catalog.test-reference.json`
  → `…-catalog.json`; `…-lock-order.test-reference.json` → `…-lock-order.json`
- Modify: `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md`

- [ ] **Step 1:** Re-run the field 5/6/8/9 repro tool and the D6 parametric
      mechanical test with `MC2_Q12_ACTIVATION_CATALOG_FILE=<production catalog from
C4>`; re-freeze `activation_sql_projection_sha256`,
      `activation_normal_slice_sha256`, `activation_lock_catalog_sha256`,
      `activation_lock_order_sha256` and drop the `.test-reference` suffix.
- [ ] **Step 2:** Confirm field 11 (Task A1) is ratified against the frozen
      schema (field 10 unchanged; field 7 unchanged).
- [ ] **Step 3:** Re-run the D6 mechanical/probe tests against the production
      tuple; commit; push.

Verification: production tuple frozen; D6 tests green on production values; Layer-2
invariant unchanged.

## Task C8: Blue/green deploy prepare + commit

- [ ] **Step 1:** `deploy.prepare` — stage the inactive app color pointing at the
      self-hosted Qdrant listener using the GHCR image from Phase B.
- [ ] **Step 2:** `deploy.commit` — commit the color once verify passes.

Verification: inactive color healthy against self-hosted Qdrant; deploy receipt
present.

## Task C9: nginx switch + barrier activate + resume forward

- [ ] **Step 1:** H-stream nginx switch: durable `nginx_switch_intent` written
      before reload; truthful re-prepare on retry.
- [ ] **Step 2:** `barrier.activate` — the sole supervisor promotes the forward
      resume authority; activation receipt
      `<run-root>/database-barrier-receipt.json state=activated`.
- [ ] **Step 3:** `writers.resume.forward` — lease-bound resume-writers-only after
      cleanup; confirm writers healthy.

Verification: nginx serving self-hosted; activation receipt `state=activated`;
writers resumed forward; from here the run is finish-forward only.

## Task C10: Monitoring deploy + secure Web UI

**Files:** deploys `ops/qdrant/` assets.

- [ ] **Step 1:** Deploy pinned Prometheus `3.13.1`, Grafana `12.4.5`,
      Alertmanager `0.33.1`, node_exporter `1.12.0`, and the unprivileged textfile
      exporter per decision `.14`, with the authenticated main-listener scrape using
      the mounted `api-key` file and no Qdrant `metrics_port`.
- [ ] **Step 2:** Prove the eight Qdrant alerts against a real scrape
      (`promtool`/`amtool` checks already in `ops/qdrant/prometheus`); prove the Web
      UI is reachable only on loopback.

Verification: eight alerts valid against real metrics; Alertmanager routes;
Grafana provisioned; Web UI loopback-only. **Acceptance gate C reached.**

---

# PHASE D — Post-cutover hardening and closeout

## Task D1: Live smoke + observation window

- [ ] **Step 1:** Run a real end-to-end course-generation retrieval path against
      self-hosted Qdrant (Stage 2 ingest + Stage 5/6 retrieval) and confirm BM25/IDF
      consistency and priority ranking.
- [ ] **Step 2:** Watch a bounded observation window (alerts, DB load, writer
      health); abort and roll back forward-safe on material impact.

Verification: smoke green; observation window clean (no P0/P1).

## Task D2: Password rotation — OWNER-GATED

- [ ] **Step 1:** Re-present the rotation effects/rollback packet: rotation
      invalidates existing connections, the timer DSN must be re-ingested, and it is
      a separate destructive action the owner deferred on 2026-07-16.
- [ ] **Step 2:** STOP. Only if the owner now explicitly approves, rotate and
      re-ingest the owner-only DSN via stdin; otherwise record `.13.8` as an
      owner-ratified defer.

Verification: either rotation completed and the backup timer green on the new
DSN, or `.13.8` recorded as an explicit defer.

## Task D3: Off-host S3 DR — CREDENTIAL-GATED

- [ ] **Step 1:** Present the `.13.6` S3 packet; STOP for owner S3 credentials.
- [ ] **Step 2:** With owner-supplied credentials (stdin, never persisted),
      configure off-host snapshot shipping and verify a round-trip restore.

Verification: off-host snapshot shipped and restore-verified, or `.13.6`
recorded as an explicit defer.

## Task D4: Prometheus retention YAML (.25)

**Files:** `ops/qdrant/prometheus/prometheus.yml` (+ any retention config).

- [ ] **Step 1:** Move the deprecated CLI retention flags into YAML; keep the pin.
- [ ] **Step 2:** `promtool check config`; commit; push.

Verification: config valid; no deprecated flags; pin unchanged.

## Task D5: Final closeout (full)

- [ ] **Step 1:** Full release matrix + independent correctness/docs review at the
      release boundary.
- [ ] **Step 2:** Update `docs/operations/qdrant-self-hosted.md`,
      `docs/operations/document-evidence.md`, `.codex/handoff.md`,
      `.codex/stages/mc2-jz6y0/summary.md`.
- [ ] **Step 3:** `run_stage_closeout.py --stage mc2-jz6y0`; Graphify refresh at
      the release boundary (record `graph-reviewed: updated`);
      `cleanup_stage_workspace.py --stage mc2-jz6y0` for safe worktrees/branches.
- [ ] **Step 4:** `bd close` remaining lineage items or record owner-ratified
      defers in `.codex/handoff.md`; `bd dolt push`; `git pull --rebase`;
      `git push`; `git status` shows up to date.

Verification: stage closeout green; graph current; all lineage Beads closed or
owner-ratified defers; branches in sync. **Acceptance gate D — epic done.**

---

## Self-Review (run before declaring the plan done)

1. **Spec coverage:** every Phase/Task in the spec §4/§6 maps to a task here.
2. **No placeholders:** each step names exact files, commands, receipts, or
   review gates; no "handle edge cases".
3. **Sequencing:** no live phase precedes its gate; the RE-FREEZE chicken-and-egg
   is resolved (D6 built on the Layer-1 test-reference tuple + Layer-2 invariant
   in Phase A; production values swapped in Task C7).
4. **Gates:** every remote/live and credentialed step (B1, C0–C10, D2, D3) has a
   STOP-and-ask before the mutation.
