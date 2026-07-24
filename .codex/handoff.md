# Orchestrator Handoff

Updated: 2026-07-21 (W7a inc1-4 delivered; SINGLE SOURCE OF TRUTH consolidated onto `develop`)

## Single Source of Truth (2026-07-21 — owner-directed consolidation)

- **`develop` is the single source of truth** for all Q12 self-hosted-qdrant work. A
  content-containment audit (2026-07-21) verified `develop` is the superset of every
  Q12 line: it fully contains `origin/develop`, `codex/self-hosted-qdrant-platform`
  (the former integration branch), `codex/q12-plan-builder`, and
  `codex/q12-w-writer-barrier`, plus the W7a increments (inc1-4) and the three
  orchestration-infra commits (`record_stage_telemetry.py`, `run_stage_closeout.py`,
  `orchestrator.toml` baseline v2.16) cherry-picked in from the stale plan branch.
- **`codex/self-hosted-qdrant-platform`** is the historical feature/integration branch —
  **fully merged into `develop`**; keep for history, do not treat as authoritative.
- **`codex/self-hosted-qdrant-platform-plan`** is **STALE** (≈850 commits behind, does NOT
  contain `deploy/qdrant/q12-lifecycle-core.py`). Do NOT use it as a base or target. Note:
  some environment/session metadata mislabels the working branch as this `-plan` branch —
  ignore that; the working branch is `develop`.
- The other `codex/q12-*` worktree branches and their two contentless merge bubbles
  (`q12-live-controller`) carry no unique content missing from `develop`.

Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion

Historical integration carry (now all in `develop`): the accepted correction wave D5J
`66e41cb5`, W FLIP `60910053`, H blue/green handoff `70bf6103`, the W activation-tuple
addendum `3da324d8`, frozen D6 contract/plan docs `d1627f1c`, and the M migration
credential merge `a73a3651`; `codex/q12-w-writer-barrier` at `60910053` is clean/pushed.

## Product Truth

- Qdrant Cloud data was test-only and is lost. Do not recover or mutate it; rebuild the derived index from authoritative sources.
- Target remains private self-hosted Qdrant `1.18.2`, native multilingual BM25/IDF, server RRF/Formula priority, strict indexes, aliases, source reindex, Prometheus/Grafana/alerts, and secure loopback Web UI. Development staging uses persistent local-volume snapshots; off-host S3 is the production gate `mc2-jz6y0.13.6`.
- Documents are optional but important advisory evidence. A course without documents remains fully supported.
- Every uploaded document must receive a durable `assessed`, `degraded`, or `failed` coverage outcome; none may disappear through context truncation.
- Documents supplement the baseline structure. They may add facts, terminology, constraints, examples, and source-backed topics but cannot silently replace baseline curriculum requirements.
- Material document conflicts use a distinct required-question block. Manual mode pauses at the existing Phase 0.5 boundary. Automatic mode selects the recommendation and appends `resolved_by: system` / `answer_source: system` with rationale.

## Read First

- `AGENTS.md`
- `.codex/orchestrator.toml`
- `.codex/handoff.md`
- `.codex/project-index.md`
- `graphify-out/GRAPH_REPORT.md`
- `docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md`
- `docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md`
- `docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md`
- `docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md`
- `docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md`
- `docs/superpowers/plans/2026-07-13-q12-live-cutover-corrections.md`
- `docs/superpowers/specs/2026-07-13-q12-recoverable-lifecycle-addendum-design.md`
- `docs/superpowers/plans/2026-07-13-q12-recoverable-lifecycle-addendum.md`
- `docs/superpowers/prompts/2026-07-11-self-hosted-qdrant-evidence-continuation-orchestrator.md`

## Accepted and Open Work

- Accepted and pushed: Q1-Q9, strict Formula index fix `.15`, evidence E1-E7, and exact 100% local/development document-evidence activation. Final independent activation/docs review at `d3417610` reported no P0-P3 findings; integration merge `ea183d83` passed 24/24 focused tests, package type-check, process verification, and canonical closeout dry-run. Integration history and exact evidence are in `.codex/stages/mc2-jz6y0/summary.md`.
- Q7 `.8` is reviewed, integrated as `841812be`, verified at focused 85/85 plus pinned Qdrant `1.18.2` 19/19, and its dedicated local worktree/branch are cleaned. The remote evidence branch remains.
- Q6 `.7`, Q8 `.9`, Q9 `.10`, Q10 `.11` and Q11 `.12` are reviewed and integrated. Q10 reviewed head `42ed1322` merged as `3c9dd641`; 31 Markdown files passed final independent review with P0-P3 zero. The final local release matrix passed backend 1,893/1,893 with zero skips, shared 23/23, web 20/20, PostgreSQL 78/78 with zero skips, exact Qdrant 15/15, applicable local snapshot/restore 5/5, Compose/runtime 8/8, Prometheus 14 rules, Alertmanager config, `pnpm type-check`, and build 75/75. The stale activation-contract test was corrected under `.26`; implementation and independent review are integrated with P0-P3 zero.
- Q12 local remediation includes guarded migrations `.13.1`, immutable operator `.13.2`, release-bound rollback `.13.3`, and accepted staging-local snapshot mode `.13.5`. Local snapshots now live at `/qdrant/storage/snapshots` on the persistent named volume and pass the exact pinned `1.18.2` recreate/restore matrix; they do not protect against volume, disk, host, or datacenter loss. Off-host S3 is explicitly deferred to production gate `.13.6`. No staging mutation has occurred.
- Q12 source audit `.13.4` is independently accepted read-only: 261 catalog rows, 240 Qdrant-eligible and 21 `missing_course`; 42 exact no-replace copies can restore 125 eligible rows and raise recoverable coverage from 109 to 234. Exact originals for the final four missing plus two invalid eligible rows were not found anywhere on the host. Eighteen non-eligible Career Playbook originals are also absent. The owner-approved dispositions are six `source_file_unrecoverable` plus eighteen `retained-derived-only`. The complete `.13.4.1` operator is locally accepted, including core, workflow/CAS, audited reindex, Stage 4 failed-coverage integration, concrete multi-ledger adapters, isolated runtime, crash-residue/inode matrix, and exact-count Task 6. Final Task 6 rereview passed P0-P3 zero; fresh integration passed 3/3 focused and 456/456 recovery/reindex tests plus type-check/artifact/process gates. All Task 6 worktrees/local branches are cleaned. No staging copy or remote mutation has run.
- `.13.7` is CLOSED (2026-07-16, owner-authorized remote window). The owner DSN is installed owner-only at `/opt/megacampus/secrets/supabase_db_url` with the pinned CA; the legacy fail-open cron is suspended (root-owned rollback evidence retained); the fail-closed operator, drill, and helpers are installed root-owned under `/opt/megacampus/deploy` with Node 22 + pnpm 8.15.0 + tsx host prerequisites. The fixed-hash installer finished its canonical proof: fresh scheduled generation `20260716T105950Z-11196fff` published under full systemd hardening, isolated Supabase-PG17.6 drill PASSED (cluster-global + cutover + baseline equality, ratio 0.724, zero residue), daily `00:30 Europe/Amsterdam` timer enabled+active. Twenty-plus never-executed defects in operator/drill/manifest/bootstrap were fixed with TDD and review on the way (`dedcc076`..`da512322`). The owner explicitly deferred `.13.8` password rotation («можешь не менять»).
- The owner approved the exact Q12 correction specification SHA-256 `5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15` on 2026-07-13. On the same date the owner accepted decisions `.13.14` and `.13.15`: the managed Supabase provider plane is an explicit trusted residual boundary, and recovery uses guarded `prepare-recovery`, quiesced completion, no-start mode-bound final manifests, then a separate lease-bound `resume-writers-only` after cleanup. Both decisions are closed. The independently rereviewed normative addendum SHA-256 is `7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27` with P0-P3 zero; it supersedes the earlier package at `099fc44b` only by freezing cross-language canonical journal bytes and exact object-publication phase/outcome mapping. This permits safe local implementation only; remote/live mutation remains separately gated.
- Publisher `.13.9`, G7 `.13.7.2`, D5 decision `.13.17`, and Root producer `.13.18` are accepted/integrated. D5W seam `.13.20` is closed: source `3dd9ad53`, correctness/docs delta reviews P0-P3 zero, integration/W reruns 271/271, cleanup evidence `c150a4c2`, source worktree/local branch removed. The preserved W branch is clean and pushed at `60910053`. The joined-fixture task `.13.21` is implemented, independently reviewed, and integrated; W `.13.10`, M `.13.11`, and H `.13.12` are closed and integrated (see below); Root `.13.13` is CLOSED: the join integrated at `fcd05e27` (smoke/observation gate exact to §13 with rotation_required=true, D6 real frame envelope + R-handshake join with validation-at-load; correctness review PASS 0/0/0/5, docs review PASS 0/0/0/1; manifest and barrier bytes unchanged). No remote/live mutation occurred.
- D6 `.13.19` is IMPLEMENTED and integrated at `3d70eaf2` (contract byte-identity `2a2251ac…`, Option A): the read-only probe (`q12-activation-truth-probe.cjs` + FD-11 SQL, Tasks 1-14) and the Root coordinator authority (`q12-lifecycle-core.py` D6 additions, Tasks 15-19) delivered in two disjoint worktree streams, each independently reviewed (PASS 0/0/2/4 and 0/0/1/4) with delta reviews after correction rounds (real CLI runtime assembly, sentinel coalesce, 3-point snapshot discipline; NFC canonical, after-read secret revalidation + rewind, seal-predecision binding enforced). Cross-language canonical hashing byte parity proven (`764d1b37…`); named convention: hash in-memory canonical NFC no-LF, files store canonical+LF, validation-at-load parses then hashes. Evidence in artifact `mc2-jz6y0.13.19-q12-d6.md`. Pinned-server capability gates stay remote-gated; fields 5/6/8/9 re-freeze stays Task C7.
- Read-only architecture report SHA-256 `8bf9786c1e97ce4a54bc455d37ec052a8658fa110524fbed1a5ab728b3fda379` found that D5W real-preimage binding is insufficient for W chronology: Root D5-only anchors and W's full source/backup/restore/reindex graph cannot be joined by copying or rehashing authority. The owner approved the Root-owned test-only architecture/drafting direction and, on 2026-07-15, explicitly approved the exact tracked candidate SHA-256 `d7e86193142d260a3b8dcd65ef9ce89b64df88d9c93cec68f19705de68edc75d`. It closed the clean-prefix-1 quiesce-preimage gap and passed final correctness/docs rereviews P0-P3 `0/0/0/0` (report SHA-256 `0eb420fda7099ecdf98d0028cc5f8b89e9a61103018e747228868515eb970bf2` and `02770a81c69474a1445fb7c4f2a05edbfa5cee50d18accf502f074d4e79025ba`). Local planning/TDD/review/integration are authorized; production CLI and W ownership stay unchanged, and remote/live authority remains separate.
- The D5J product-truth gap is resolved. Decision `.13.22` is closed by the normative amendment `docs/superpowers/specs/2026-07-15-q12-d5j-command-binding-and-fwm-amendment.md` SHA-256 `d6c4d8e4b2b7f6c53d648fdf587a5520db45fa5d8f3c84668b48b09b6bbe075c` (independent correctness/docs reviews PASS P0-P3 `0/0/0/0`): one canonical twenty-command manifest (the enumerated D5J subset moved forward from Task 9), a closed ten-placeholder substitution domain with single authorities, exact phase/command/outcome bindings for every ordinary row (genesis `operator.self-check`, `pg.backup` selector/target split, phase-internal migrations preserving the D5 predecessor heads, the `migrations_applied` witness milestone), two-segment quiesce and evidence-stepped resource bindings, distinct immutable `final-writer-manifest-forward|rollback-<run-id>.json` paths with real `writers.resume.*` hashes, and the Root-owned deterministic thirteen-key writer inventory.
- `.13.21` is implemented under the reviewed plan SHA-256 `a05ba3c60e1a1a714e7d0ce30298f8124949e67c9dbacc00677a7fc414805b4a` (plan review PASS `0/0/0/0`) and integrated at `66e41cb5`: the Root-owned closed joined composer emits the exact 76-row forward chronology and every rollback profile (prefixes 1-4 clean and exact-next-frontier, activation frontier with both mode-bound manifests and byte-identical target entries) through the production serializer/capability/object/checkpoint primitives; the runner/TS surface is closed; deployed wrappers/parser gain no switch. Independent implementation reviews: correctness PASS `0/0/0/2`, docs PASS `0/0/1/2`, every finding fixed. Evidence: focused four-file suite 300/300 in both file-parallel and serialized modes, static acceptance checks, workspace type-check, synthetic build; stage artifact `mc2-jz6y0.13.21-q12-d5j.md` validated.
- On 2026-07-15 the owner approved the recommended `.13.22` correction and delegated the remaining local work to Fable, followed by Codex review. Fable is authorized to draft and independently review the narrow normative amendment, freeze the exact canonical bindings/inventory/path rule, plan, implement with TDD, integrate and verify locally without intermediate owner confirmations. Remote/live exclusions are unchanged. The tracked copyable handoff is `docs/superpowers/prompts/2026-07-15-q12-fable-local-completion-handoff.md`.
- Final handoff correctness and documentation rereviews passed P0/P1/P2/P3 `0/0/0/0`; report SHA-256 values are `8c56c37720e25a5d213fdc2c1c6c7ea8b1da7f1795f34e9078069b257d306a6e` and `b75dccbee85395372e350de79d304647388d8ad061e3b990a261aa9843e00bea`.
- W `.13.10` is CLOSED. The FLIP is integrated at `60910053`: the
  genesis-rooted joined journal prefix is the sole resume acceptance in
  `q12-writer-resume.py`; the fabricated `common_phase_graph` branch is
  removed; the D4 negative is pinned five ways. Held-capture lever, ruling Z,
  and the full acceptance matrix are recorded in the stage summary and on the
  bead. Current amendment SHA
  `e952f72410c9d49555cd780108e2b94c47284872da69e506b6c2e9ab86fcd4b1`;
  twenty-command manifest SHA
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841` (the
  historical five-command `af9b21cb…` value belongs to `c93d766d`-era bytes).
- H `.13.12` is CLOSED and integrated at `70bf6103`: `--q12-mode`
  prepare/commit/finalize-quiesced with phase-aware rollback, the durable
  `nginx_switch_intent` marker written before reload (review P1-1), truthful
  re-prepare (P1-2), and the activation receipt contract
  (`<run-root>/database-barrier-receipt.json` `state=activated`). Evidence:
  24 Vitest + 15 shell cases; FAIL→RED-first fixes→delta PASS.
- M `.13.11` is CLOSED and integrated at merge `a73a3651` from
  `codex/q12-m-migration-cli` tip `29d73d04`: file-only Q12 migration
  credentials (O_NOFOLLOW + inode/device recheck, field-built ClientConfig, no
  connectionString on the Q12 path), same-transaction guards, connection-source
  mutual exclusion, concurrent index packet preflight, plus the hardening batch
  (fail-closed on twelve libpq `PG*` variables via
  `Q12_REJECTED_LIBPQ_ENV_VARS`, embedded `;` rejection, widened leak asserts
  across five fail-closed branches). Security review PASS P0=0/P1=0 and delta
  PASS on `29d73d04`; 64/64 focused units; formal e2e 20/20 on the disposable
  stack. Residual informational P2-4: `PGSSLCERT`/`PGSSLKEY`/`PGSSLPASSWORD`/
  `PGCHANNELBINDING`/`PGGSSENCMODE` are outside the reject list — proven
  non-exploitable while `ssl` is an explicit object; optional completeness-only
  addition.
- The W activation tuple `.13.10` is now 11/11: field 11 was RATIFIED on
  2026-07-16 by independent review (PASS P0/P1 zero; F1 carried as the
  accepted `.13.14` residual note) at `72af414c` — inventory at
  `deploy/qdrant/q12-managed-session-inventory.json`, canonical hash
  `c90edb78…` unchanged, pinned by unit test. D6 Task 0 gate passed
  (manifest `aaec6fc2…` verified). The LIVE-BOUNDARY RE-FREEZE CHECKLIST now
  covers only item 2: production re-freeze of fields 5/6/8/9 at Task C7.
- Full local release matrix at `a73a3651`: Q12 unit battery 748 passed /
  1 known environment failure (`qdrant-observability-contract.test.ts:223`,
  fails identically on the pre-Q12 base) / 36 skipped; blue/green shell suite
  15/15; `pnpm type-check` exit 0; `pnpm build` exit 0 with the synthetic web
  env. PG17-gated suites run under `MC2_Q12_REAL_PG17=1`.
- PG17 document-evidence security-manifest digests were computed on the isolated restore (pre-120000 `dcc90cc2…`, after-120000 `4df2b22b…`, after-130000 `f7100de0…`, after-140000 `e148e241…`, after-151000 `2597a553…`) and the allowlist delta is integrated at `b8204cde` with independent review PASS P0-P2 zero and new disjointness/hex invariant tests.
- Decision `.14` is owner-approved and closed: Qdrant `1.18.2`, Prometheus `3.13.1` LTS, Grafana `12.4.5`, node_exporter `1.12.0`, Alertmanager `0.33.1`, approved image locks, authenticated main-listener scrape using `api-key` from a mounted file, no Qdrant `metrics_port`, fail-closed Qdrant secret wrapper, textfile-only unprivileged exporter, and single-node Alertmanager.
- Design `.17` is approved/closed; grouping `.16` closed as superseded. E1-E7
  (`.18`-`.24`), Q6 `.7`, Q8 `.9`, Q9 `.10` are reviewed, integrated, and
  verified; evidence lives in `.codex/stages/mc2-jz6y0/summary.md`.
- Historical `.13.7` doc correction `7b446d7d` (rereview `0b7ffe67`, P0-P3 zero) is superseded by the delivered gate; runbook state lives in `docs/operations/qdrant-self-hosted.md`.

## Next recommended

Next stage id: `mc2-jz6y0`

### CURRENT STATE (2026-07-19) — window NOT openable; handoff package ready

Fresh read-only verification (base `8af76cfd4`, bead `mc2-uha77`, artifact
`.codex/stages/mc2-jz6y0/artifacts/mc2-uha77-window-executability-verification.md`)
established that the live cutover window is **not executable against the
deployed tree**: `run_live`/`run_recover` fail closed in production at the
`require_post_activate_executor` pre-flight because `ProductionExecutor` has no
`execute_forward_resume` (it exists only as a test fixture), and the production
`run_live` path substitutes **fixture-derived** placeholder values (not real
snapshot/generation/recovery ids). The R8 controller is a proven journal/parity
twin, not a real driver. This is the D5J §10 "Task-9 live orchestration" scope,
still un-wired. OQ1 is resolved (dual-state quiesce); OQ5/OQ6 remain open.

A complete handoff package for a fresh orchestrator is prepared:

- Design: `docs/superpowers/specs/2026-07-19-q12-window-execution-wiring-design.md`
- Plan + task graph: `docs/superpowers/plans/2026-07-19-q12-window-execution-wiring.md`
- Orchestrator prompt (prompt-check PASS, prompt-card):
  `docs/superpowers/prompts/2026-07-19-q12-window-execution-orchestrator.md`
- Beads W1 `mc2-yz3xe` → W2 `mc2-j58wi` → W3 `mc2-58tnx` → W4 `mc2-dxcaa` →
  W5 `mc2-v68w6` → W6 `mc2-naz8j` → W7 `mc2-i9h3y` (owner-gated), tracker
  `mc2-uha77`.

NEXT: hand off to the new orchestrator per that prompt; execute W1–W6 (real
owner-custody executor + real-value plumbing + snapshot/baseline producers +
STOP-point model + rehearsal + runbook), then W7 opens the window on an explicit
owner go. The historical Phase-A/B and pre-open context below remains accurate;
its "NEXT" pointer (OQ resolution) is now superseded by the W1–W7 plan.

### PROGRESS (2026-07-20) — W0 + W1 delivered; W2/W3/W4 coupling found

- **W0** (rehydrate/baseline) DONE: the §2 gap re-confirmed with fresh evidence
  at HEAD `aeb9cb14a` (main() wires bare `ProductionExecutor()`; no
  `execute_forward_resume`; fixture-derived substitution; no CLI `--stop-after`;
  OQ1 resolved; OQ5/OQ6 open). Baseline matrix GREEN: focused Q12 suite 646
  passed / 72 skipped; type-check clean; frozen manifest sha `aaec6fc2` intact.
- **W1** (`mc2-yz3xe`) DONE, committed **`636e96346`**, pushed. Added
  `OwnerCustodyExecutor(ProductionExecutor).execute_forward_resume` (full
  fail-closed twin of `q12-writer-resume.py:1088-1134` incl. the probe/residue
  nested projection, then drives the frozen manifest `writers.resume.forward`
  under the inherited FD9 lease via `_invoke_resume`, returns
  `validated_receipt_sha256`); `owner_custody_executor()` factory; `main()`
  live/recover now use it; post-activate context carries `release_sha`. Resolved
  the run-id question from frozen truth: resume uses `<run-id>` (cutover), not
  `<recovery-run-id>`. TDD (5 new tests + fixture); correctness-reviewed
  (no P0/P1; one P2 projection gap CLOSED by strengthening the gate; one P3
  low-risk coverage residual noted). Focused Q12 651 passed / 72 skipped;
  type-check clean; manifest `aaec6fc2` intact.
- **W2 acceptance-oracle decision LOCKED (owner, 2026-07-20):** real-run oracle =
  design default — accept iff (1) each real child exits 0 AND (2) barrier receipt
  v2 reaches `guard_cleanup_complete` (state machine intact) AND (3) coverage
  evidence (`org:course:run`) present in the recovery journal; the fixture
  byte-parity suite is kept green separately.
- **MATERIAL REPLAN (dependency finding from repo truth):** the plan framed W1
  and W2/W3 as independent streams converging at W4. Repo truth shows otherwise:
  the controller only COMPOSES the journal and freezes each capability's argv
  (`command_sha256`); ordinary commands EXECUTE out-of-band via the separate
  `claim` entrypoint (`run_claim:3240-3243`), which RE-RESOLVES argv from
  manifest+request and byte-binds `command["command_sha256"]==capability`
  (D5J 2026-07-15 contract). Mid-window real values (`<exported-id>` from the W3
  coordinator, `<immutable-generation>` from `pg.backup`,
  `<accepted-recovery-manifest-sha256>`/coverage after `source.forward`) are
  unknown at a single upfront compose. Therefore the real path is a **staged
  compose→claim→execute→compose** loop, and **W2 (`mc2-j58wi`) + W3
  (`mc2-58tnx`) + W4 (`mc2-dxcaa`) must be CO-DESIGNED as one staged-execution
  effort** intersecting the D5J claim-time binding — not delivered as independent
  slices. This needs its own focused design pass; it was NOT rushed. Window stays
  CLOSED. Full map is on beads `mc2-j58wi` / `mc2-uha77`.

### PROGRESS (2026-07-20, cont.) — W4 delivered; W2+W3 co-design written

- **W4** (`mc2-dxcaa`) DONE, committed **`ffb7da5fc`**, pushed. Carved off from the
  W2/W3 coupling: the `--stop-after` CLI exposure is architecturally INDEPENDENT
  of the real-value work (the internal `stop_after` seam is already end-to-end;
  `run_recover` never reads it). Exposed `--stop-after` on `live` ONLY,
  choices-bound to `_STOP_AFTER_STEP`, reversible/#18 boundary operator-visible in
  the flag help; plumbed into the production request via `getattr`. TDD
  `q12-live-stop-after-cli.test.ts` (3 tests); behavioural stop-after + recover
  convergence already covered by `q12-live-controller.test.ts`.
  Correctness-reviewed: no P0/P1/P2. Focused q12-\* **654 passed / 72 skipped**;
  type-check clean; manifest `aaec6fc2` intact. False W3→W4 dep removed.
- **W3 finding (refines §2.5):** OQ5/OQ6 are NOT un-built — they already exist on
  `LivePlanExecutor` (`q12-lifecycle-core.py:6840` `_open_snapshot_coordinator`,
  `:6917` `produce_run_root_baseline` → `baseline.json` 0400). The real gap is that
  the WINDOW executor (`ProductionExecutor`/`OwnerCustodyExecutor`) can't reach
  them and the window `<exported-id>` is fixture-derived (`:720`,`:4018/:4144`).
  W3 for the window = lift OQ5/OQ6 into the owner-custody path + feed the real
  snapshot id into value resolution (W2), consistent with D5J on compose AND claim.
- **W2+W3 CO-DESIGN WRITTEN:**
  `docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md` — the
  focused design pass §W2/§W3 required. Decisions: clean `production`-gated
  fixture/real FORK (parity oracle untouched); staged resolver advanced by
  lifecycle callbacks (resolve-once, fail-closed on drift); compose↔claim
  consistency via a run-root authority file read by both sides (D5J single
  authority); locked real-run oracle; W3 lifts OQ5/OQ6 into `OwnerCustodyExecutor`
  behind an isolable subprocess seam (W1 pattern).
- **VERIFIABILITY BOUNDARY (honest):** the fork, resolver scaffold, and
  compose↔claim byte-consistency are unit-verifiable HERE with fakes; the real
  `pg_export_snapshot()`/baseline/generation/recovery-manifest/coverage legs and
  the end-to-end real-run oracle are `MC2_Q12_REAL_PG17`-gated and/or IN-WINDOW-only
  (#18), validated at W5 (rehearsal) and W7 (owner-gated). Window stays CLOSED.

### PROGRESS (2026-07-20, cont.²) — W2/W3 EXECUTABLE PLAN prepared; owner authorized real-data work

- **Owner authorization (2026-07-20):** project pre-launch/testing — owner authorized
  touching the production DB for whatever the wiring needs. The earlier "hold W2/W3
  for a window-adjacent session" caveat is LIFTED. Preserved carve-out: the
  irreversible `barrier.activate` / nginx switch (W7 / C9) still requires a fresh
  pre-window `plan` + explicit owner "go".
- **Empirical grounding (`9c49d8599`):** this box has docker 29.5.3 + local PG17; both
  `MC2_Q12_REAL_PG17=1` gated suites (`q12-live-baseline-producer`,
  `q12-live-real-full-window`) PASS against disposable `postgres:17.10`. The un-done
  surface is precisely the data-movement commands (`pg.backup`/`pg.restore`/
  `source.forward`/`reindex.*`/`deploy.*`), currently real-SHAPED stubs on fixture
  values. All W2/W3 increments are now validatable HERE on disposable PG17.
- **EXECUTABLE PLAN WRITTEN:**
  `docs/superpowers/plans/2026-07-20-q12-w2-w3-staged-execution.md` — TDD, bite-sized,
  7 tasks. T1 W3-struct (`mc2-58tnx`): extract `SourceSnapshotSeam` from
  `LivePlanExecutor` → `OwnerCustodyExecutor.open_window_snapshot`. T2 W2-fork /
  T3 W2-consistency / T4 W2-oracle (`mc2-j58wi`): `production`-gated
  `StagedValueResolver`, run-root staged-values authority for compose↔claim
  byte-parity, structural `accept_real_run` (D4). T5 W5 rehearsal (`mc2-v68w6`),
  T6 W6 runbook (`mc2-naz8j`), T7 W7 owner-gated STOP (`mc2-i9h3y`).
- **Beads sequencing fixed:** W3 (`mc2-58tnx`) is the ONLY ready increment; edge
  reversed so W2 depends on W3 (T2 consumes `open_window_snapshot`); W5 depends on
  W2+W3. Chain: W3 → W2 → W5 → W6 → W7.
- **Next executable action:** implement Plan Task 1 (W3-struct), TDD against the fake
  seam here + `MC2_Q12_REAL_PG17=1` live leg. Window stays CLOSED.

### PROGRESS (2026-07-20, cont.³) — W2/W3/W5/W6 + CLI wiring DELIVERED; only owner-gated W7 remains

All non-owner-gated Q12-window work is delivered, TDD, and verified against real PG17.
Commits (all on `codex/self-hosted-qdrant-platform`, manifest `aaec6fc2` intact):

- **W3-struct** `bc4726c1e` (`mc2-58tnx` CLOSED): extracted `SourceSnapshotSeam` +
  `SourceConnectionConfig` mixin; `OwnerCustodyExecutor.open_window_snapshot`/
  `close_window_snapshot` (real held `pg_export_snapshot()` + 0400 baseline.json).
  Refactor-preserving (both gated PG17 suites byte-identical).
- **W2** (`mc2-j58wi` CLOSED): `df86ebea1` StagedValueResolver + `resolve_window_values`
  fork in run_live; `16e09b67a` run-root staged-values authority (recover determinism,
  D5J single-authority); `52881cbce` `accept_real_run` (D4).
- **Correction wave** `4c6d00947`: correctness-review P1 (coordinator-leak guard in
  run_live) + P2a-e (open_snapshot self-release, ephemeral libpq workdir, named
  fail-closed, corrupt-authority LifecycleError).
- **W5** `27d5b2e12` (`mc2-v68w6` CLOSED): production value machinery rehearsed
  end-to-end vs disposable PG17 (fork→real snapshot→persist→recover determinism→D4).
  IN-WINDOW-only residual bounded to W7 (full barrier dual-bind window + real
  data-movement pg.backup/restore/source.forward/reindex/deploy vs real infra).
- **CLI wiring** `09b63b205` (`mc2-pj5f0` CLOSED): `--recovery-run-id` (live+recover) +
  fixed source secret paths (`db_url_file`/`ca_file`) into main() request. main() runs
  live/recover with production=True + owner-custody executor, so the CLI now actually
  drives the staged production path. **Unblocks W7 invocation.**
- **W6** `e3b5148e5` (`mc2-naz8j` CLOSED): operator runbook v2
  `docs/qdrant/q12-window-operator-runbook-v2.md` (invocation incl --recovery-run-id,
  C1..C10, reversible --stop-after boundary, recover, D4, #18 rollback, owner-held C9).

Verification: focused q12 **676 passed / 74 skipped**; gated PG17 (baseline-producer,
full-window byte-parity, migration-plan malformed-snapshot, W3 live-leg, W5 rehearsal)
all PASS; type-check EXIT=0. Plan: `docs/superpowers/plans/2026-07-20-q12-w2-w3-staged-execution.md`.

**REMAINING: W7 (`mc2-i9h3y`, OPEN, OWNER-GATED).** Open the live window C1..C10 +
Phase D closeout. Requires a fresh pre-window `plan`, owner "go" on C1, and the owner
personally presses C9 (`barrier.activate` + nginx switch — the irreversible point of no
return). Everything up to that gate is now runnable via the CLI per the runbook. Preserved
constraints hold: never change manifest `aaec6fc2` (HARD STOP); never mutate Qdrant Cloud;
secrets path-only; no production mutation without a fresh pre-window plan + owner go on C1.

### Historical context (Phase A/B complete; pre-open R8 rehearsals)

The Q12 Full Completion program (spec/plan 2026-07-16) is RUNNING under a
Fable orchestrator. Phase A is COMPLETE (A1 `72af414c`; D6 `.13.19` at
`3d70eaf2`; Root `.13.13` join at `fcd05e27`; final matrix: focused 463/463
PG17, broad 952/953 known-env-only, type-check 0, build 75/75). Phase B is
COMPLETE (`mc2-rl4p9`, owner-approved 2026-07-17): operator image published
`ghcr.io/maslennikov-ig/mc-2/qdrant-operator:266de3d7…` @ index digest
`sha256:0fe4265ca80eb100912f6ce8155b061712db90ace4e0b1641e63e9a1a247e199`,
remote SLSA v1 provenance independently validated (source/revision/
Dockerfile PASS); two latent publisher defects found by the first live run
(metadata-file 0644 vs asserted 0600; validator SLSA v0.2-only) fixed with
TDD, suite 24/24 (receipt: `…artifacts/mc2-rl4p9-q12-b1-publication.md`).
`.13.7` is DELIVERED; the owner explicitly deferred `.13.8` rotation.

Recommended action: continue the completion program:

1. Phase C window is OPEN (owner approved 2026-07-17; packet
   `mc2-jz6y0-c0-window-packet.md`; server brought up, operator image pulled
   by digest). The C1 product-truth gap — the `plan` expected-catalog
   builder — is DELIVERED on this branch (deterministic builder + full live
   orchestration: snapshot-coordinated generation, drill persist-seam
   restore, §3 role bootstrap, structural-equality proof, real loopback
   CLIs, production seam lockdown; reviews PASS 0 P0/P1:
   `mc2-jz6y0.13-plan-builder-review.md`,
   `mc2-jz6y0.13-plan-live-review.md`).
2. Pre-C1 rehearsals are COMPLETE: 13 read-only server rehearsals drove
   rounds 8-19 (scheduled drill mode, tsx shim runners, delta-composed
   prediction ruling, dump-stable identities, delta-neutral extras, frontier
   repair, read-only lift, search_path-independent catalog checks, single-
   entry MIGRATION_MODIFIED_IDENTITY_ALLOWLIST). Rehearsal #13 (run
   `f4afe952`, release `7ba8f372`, core `e287d0fe…` installed 0444 root)
   fully SUCCEEDED: status `planned`, catalog at `/opt/megacampus/backups/
q12/f4afe952-68f9-4fea-873e-2e3809982758/expected-post-migration-catalog.
json` (0400, sha `de9e6b03…`), baseline `edbea709…`, expected post-
   migration sha `68041d94…`, clean teardown. Four never-executed-path
   live-window defects repaired (drill tsx, backup tsx, frontier premise,
   search_path rendering). Independent review of rounds 8-19
   (`7764cfb4..7ba8f372`, artifact `mc2-jz6y0.13-plan-live-review-r2.md`):
   correctness PASS, quality PASS, 0 P0/P1/P2, 3 P3 (handled/recorded).
   HOWEVER the window is BLOCKED pre-open: operator-procedure research
   (`mc2-jz6y0-c0-window-operator-procedure.md`, orchestrator-verified)
   shows the D5J §10 "real plan|live|recover controller … and live
   orchestration" was deliberately kept in Task-9 scope and `.13.13`
   delivered only the synthetic smoke evaluator + D6 frame join. Six open
   questions (OQ1 quiesce-ordering contradiction vs frozen chronology; OQ2
   no production emitter of ordinary journal rows; OQ3 resume needs
   guard_cleanup_complete + final-writer-manifest producers; OQ4 production
   resource_manifest_sha256 undefined; OQ5 no production snapshot exporter
   for pg.backup; OQ6 no baseline.json producer). NEXT: live-controller
   design (OQ resolutions grounded in frozen truth) → plan → TDD rounds →
   re-verify → re-present window open; then C1..C10 with C7 in-window
   re-freeze of W fields 5/6/8/9.
3. `.13.8` — owner-deferred password rotation (re-confirm explicitly; never
   rotate on a general "do it"); `.13.6` — off-host S3 production gate;
   `.25` — Prometheus retention YAML (Phase D). Alertmanager Telegram bot
   token + chat id still owed by the owner before monitoring bring-up.

Before any live mutation, present exact effects, secrets, observation,
rollback and downtime/data impact per the window packet.

## Starter prompt for next orchestrator

Full completion program authored (prompt-check pass): copy
`docs/superpowers/prompts/2026-07-16-q12-full-completion-orchestrator.md`
(authority: spec `…specs/2026-07-16-q12-full-completion-design.md` + plan
`…plans/2026-07-16-q12-full-completion.md`; Phase A local D6/Root → B GHCR
publish → C live cutover → D closeout; every remote/live and credentialed step
owner-gated). Fallback: Use $orchestrator-stage from this handoff plus the stage
summary at the resolved `origin/codex/self-hosted-qdrant-platform`.

Use visible subagents, `.codex/subagent-spawn-template.md`, strict write zones, selected installed skills/personas, artifacts, exact verification, and independent review. Do not accept reports without inspecting diffs and evidence.

## Required Skills and Review

- Orchestration: `orchestrator-stage`, `task-router`, `subagent-driven-development`.
- Behavior changes: `brainstorming` where decisions remain, `test-driven-development`, `verification-before-completion`.
- Risk/closeout: `senior-architect`, `senior-devops`, `test-pass`, `orchestration-closeout`.
- Specialists: `docs_researcher`, search/data worker, `deploy_specialist`, `correctness_reviewer`, and `docs_reviewer`.

## Verification and Delivery

- Do not weaken RU/EN relevance, strict-mode, restore, resume, coverage, or tenant-isolation tests.
- Completed local gates: focused Stage 2/4/5/6 backend 1,893/1,893, shared 23/23, web 20/20, PostgreSQL 78/78, pinned Qdrant 15/15, applicable local snapshot/restore 5/5, Compose 8/8, `pnpm type-check`, and `pnpm build` 75/75. Process verification, final Graphify refresh, and canonical closeout are recorded at the delivered HEAD.
- Keep durable docs, project index, Graphify (`graphify update .`; `graphify cluster-only . --no-viz`), Beads, artifacts, stage summary, and this handoff synchronized before any Q12 continuation.
- All accepted branches/commits must be pushed under the repo contract.
- Primary worktree may contain unrelated `.claude/settings.json`; do not alter or include it.

## Explicit defers

- Review P2 on the `.13.4.1` amendment (`mc2-af1ay`, independent review PASS 0 P0/P1):
  `source-recovery.ts` keeps a second operator-side `DispositionSchema` without the
  kind↔reason↔course_id superRefine that lives in `source-recovery-manifest.ts` — currently
  rescued because `assertExactRecoveryContract` runs `normalizeRecoveryManifest` (strict
  schema). DEFERRED until after the live window: consolidate the duplicate disposition
  schema, deduplicate the `CATALOG_HASH_PATTERN` constant across both copies, and consider
  tightening its character class (exclude quote/backslash) — no operator churn before
  C1..C10. Delta-review of `d3cb0ee43` also PASS 0 P0/P1 (both review passes and both
  root-owned passes agree). Tracked on `mc2-af1ay`.
- Q12 staging mutation is owner-authorized, but remains NO-GO until the
  approved local correction streams, truthful fresh validated database backup,
  Supabase-compatible restore and every documented hard gate pass. GHCR
  publication and password rotation retain their separate secret/effects gates.
  Missing-source product truth is resolved by the approved six failed plus
  eighteen retained-derived-only dispositions. Do not partially activate.
- D6 `.13.19` is integrated (see above); Root `.13.13` join is the next
  implementation stream. D6 pinned-server capability gates and the fields
  5/6/8/9 production re-freeze (Task C7) stay live-window scope. No live
  action outside the owner-gated window.
- Known accepted boundaries (documented by design, not debt): the joined
  composer's partial-capture fixture is truthful only while W validates held
  checkpoints as a creation-order prefix without a journaled counter (review
  P2-3); §5 tamper-append of a fully valid row is outside the tamper
  protection by design (append of VALID bytes is indistinguishable from
  authorship — the guarded property is prefix integrity); M's residual P2-4
  libpq variables (`PGSSLCERT`/`PGSSLKEY`/`PGSSLPASSWORD`/`PGCHANNELBINDING`/
  `PGGSSENCMODE`) are proven non-exploitable with the explicit `ssl` object.
- PG17 security-manifest digests are DONE: computed on the `.13.7` isolated
  restore and integrated into the allowlists at `b8204cde`.
- Off-host S3 is not a staging blocker after the 2026-07-12 owner decision; it
  remains the explicit production readiness defer `mc2-jz6y0.13.6`.
- Prometheus retention YAML migration is the bounded nonblocking defer
  `mc2-jz6y0.25`, due before the next Prometheus pin change.
- The current pushed `codex/self-hosted-qdrant-platform` integration branch/worktree is intentionally retained for Q12. Final cleanup returned non-zero only because it correctly refused to delete this checked-out continuation branch; all Q11-owned worktrees, local branches, containers, ports and temporary data are cleaned.
- Stop if snapshot/alert secrets are required and unavailable, source gaps would change product truth, ownership conflicts cannot be isolated, or a required gate repeatedly fails after in-scope diagnosis.
- W7a real-leg CODE SEAM is DELIVERED (2026-07-23, `mc2-1sns3`, three TDD commits on `develop`
  `55d999b15`/`75e2663f6`/`d7c840048`): (1) controller `read_source_forward_acceptance` now READS the
  on-disk `<run_root>/source-forward-acceptance.json` authority (parse+validate `COVERAGE_RUN_RE`
  org:course:run + hex64 x2, fail-closed on missing/malformed) — mirrors `read_pg_backup_generation`,
  no Python fingerprint re-derivation; (2) TS `computeSourceForwardAcceptance` emit-entrypoint
  (`source-recovery-reindex-adapters.ts`) COMPUTES the canonical manifest sha256 +
  `calculateAcceptedFailedCoverageFingerprint` + single org:course:run via the exact existing canonical
  fns (extracted `buildAcceptedCoverageBinding`; the validate path is an unchanged thin wrapper, 20/20
  adapter tests green); (3) `emit-source-forward-acceptance.ts` CLI (`createDefaultSourceForwardAcceptanceDependencies`).
  All infra-free TDD (32/32 affected unit tests green), frozen manifest `aaec6fc2` untouched, type-check clean.
  Defer (a) is CLOSED (2026-07-23, `edac2284e` on `develop`): the wrapper's Q12 forward tail now
  invokes the emit CLI after `verify-dispositions` (tsx shim; `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`
  extracted fail-closed from the frozen-argv `--env-file` and passed only to the emit child) and
  publishes `<run_root>/source-forward-acceptance.json` 0400 controller-owned. Frozen argv unchanged:
  the coverage triple comes from the NEW operator-staged run-root authority
  `<run_root>/accepted-coverage-run` (0400, single `org:course:run` line — window precondition,
  runbook v2 §1.8-1.10). Fail-closed: missing/malformed authority, missing Supabase env values, or
  emit failure fails the forward run and leaves no acceptance file; non-Q12 forwards and
  rollback/resume paths are untouched; `SOURCE_RECOVERY_EMIT_BIN` is local-test-only. Independent
  correctness review found one P1 (root TOCTOU/symlink-follow on the publish) — closed in the
  correction wave `d640f84d2`: the emit CLI publishes with `O_CREAT|O_EXCL` + descriptor-scoped
  `fchmod` (never truncates through or chmods a swapped path), the wrapper chowns
  `--no-dereference`, every post-emit failure removes the leftover, and the coverage-run authority
  is validated byte-exactly. Delta-review PASS (residual: hardlink swap requires
  `fs.protected_hardlinks=0`; runbook §1.11 now asserts the `=1` kernel default). Runtime suite
  164/164 (9 new), CLI writer 7/7, wrapper-adjacent suites green, package type-check 0.
  REMAINING (bounded defers, `mc2-1sns3`): (b) the real VALUES + full forward-window
  rehearsal are window-grade (need a real reviewed recovery manifest + Supabase accepted-coverage
  ledgers) → the W7 owner-gated leg; the wrapper-emit real leg (real tsx/Supabase/env on the server)
  is validated at that same in-window rehearsal. The pg.backup generation seam IS fully real
  (latest.json read). Server re-deploy is DONE (2026-07-23, owner "go"): `megacampus-prod`
  `/opt/megacampus/deploy/qdrant/` now carries develop-HEAD `q12-lifecycle-core.py`
  (`8d62ca02…`, `py_compile` OK; `.bak-aafbb9a1-20260723` retained alongside the earlier
  `.bak-0c9d23cc-20260723`) and `source-recovery-run.sh` (emit tail + `--tsconfig` fix,
  `bash -n` OK; `.bak-9b0b5d53-20260723` retained); frozen manifest `aaec6fc2` re-verified.
  The emit runtime closure was also deployed: missing `emit-source-forward-acceptance.ts` +
  2 stale closure files, built `dist/` for shared-types/logger/utils, and the root
  `/opt/megacampus/tsconfig.json` (its absence silently broke tsx `@/*` alias resolution from
  the controller's cwd — found by on-server smoke, fixed in-repo by pinning
  `--tsconfig` in the wrapper emit argv with a fail-closed tsconfig-chain check; runtime suite
  165/165, CLI 7/7, runbook §1.10 now documents the closure + smoke command). Window
  preconditions verified on-server 2026-07-23: `fs.protected_hardlinks=1`, `.env.production`
  exactly-one non-empty `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, secrets present path-only,
  tsx smoke from `/opt/megacampus` reaches the CLI usage gate.
  FRESH PRE-WINDOW `plan` IS GREEN (2026-07-23, run `fd39fc26-e516-4aef-908e-90475cc5f474`,
  release `2832222cb…`, new controller build): status `planned`, structural catalog sha
  `68041d94…` byte-identical to the 07-17 and 07-21 runs (determinism holds), two known
  delta-neutral extras (test-schema default ACLs), prod containers untouched. Live-invocation
  value: `--expected-catalog-sha256 6f3cd00fd3f017634840e3c909a6f4adce927edb8d5a5823f0547b5e5cb0b8d0`;
  `--operator-digest sha256:0fe4265ca80eb100912f6ce8155b061712db90ace4e0b1641e63e9a1a247e199`
  (Phase B image). `.13.4.1` STAGING LEG (2026-07-23, second owner "go"): the reviewed
  plan-input REGENERATOR is delivered on `develop` (`d7d9725f5`,
  `packages/course-gen-platform/tools/qdrant/generate-source-recovery-plan-input.ts` + 11/11
  unit tests; classification comes from the SAME `buildReindexPlan` the operator plan mode
  re-derives, audited totals pinned fail-closed, identities redacted from every error/report
  surface) and deployed 0444 to `/opt/megacampus` (sha `6f27f996…`, tsx smoke reaches the
  usage gate). Directory layout IS staged on the server: `/var/lib/megacampus-source-recovery/`
  (root 0755) + `state` + `state/progress` + `/opt/megacampus/data/source-recovery-capability`
  (all 1001:1001 0700, empty). The live regeneration run CONFIRMED the audit truth end-to-end
  on today's host+DB — file/copy layer classification passed the exact gate
  (261/240/109/129/2/21, 42 copies / 125 rows, 6 eligible + 18 playbook disposition
  candidates; 261 catalog rows and 138 root files re-verified) — and then FAILED CLOSED at the
  disposition-predicate layer: `career_playbook_sources` is EMPTY on the live DB. HARD GATE
  RESOLVED (2026-07-24, owner-approved amendment `mc2-af1ay`): read-only investigation proved
  the emptiness is LEGITIMATE product behavior, not data loss — pg_stat_user_tables shows
  `career_playbook_sources` n_tup_ins=21 / n_tup_del=21 / n_live_tup=0 (all 21 rows uploaded
  2026-06-09, all cascade-deleted via `playbook_id … ON DELETE CASCADE` when their parent
  playbooks were deleted; `career_playbooks` shows 79 created / 68 deleted, 11 live), while
  all 21 `file_catalog` course-NULL rows survive. The 07-12 audit read `file_catalog` only and
  never verified live playbook-source rows. AMENDMENT DELIVERED (`e29dc188b`, TDD RED→GREEN):
  `.13.4.1` dispositions are now file_catalog-only bookkeeping — manifest schema REJECTS
  `career_playbook_source_id`/`expected_career_playbook`, the `career_playbook_source_applied`
  checkpoint is removed (both kinds go planned→applied via the single file_catalog CAS),
  planner/verify read exactly 24 file rows, the generator no longer loads playbook rows;
  exact totals (42/125/6+18, 261 counts) and frozen manifest `aaec6fc2` unchanged; 515/515
  qdrant unit tests + type-check green; design doc amended
  (`docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md` §Amendment 2026-07-24).
  A SECOND latent contract defect surfaced on live regeneration and was fixed (`d3cb0ee43`):
  the two audited invalid-path rows carry a 23-character legacy non-sha256 `file_catalog.hash`,
  which the frozen `expected_hash` sha256 regex could never represent — the disposition
  predicate is now a byte-exact bounded printable token (`CATALOG_HASH_PATTERN`), while
  physical copy `expected_sha256` stays strict. `.13.4.1` STAGING IS COMPLETE (2026-07-24):
  the amended 4-file closure is deployed 0444 byte-identical to `/opt/megacampus` and the
  plan-input is REGENERATED AND STAGED at `/var/lib/megacampus-source-recovery/plan-input.json`
  (1001:1001 0600; run_id `a417a99c-db3a-45c8-9d32-561d8d068a3e` = the window
  `--recovery-run-id`; canonical sha
  `e9d41b175e09c7a07606e087967a1de93bd8cf6532de1f8a414f5ec878529950` verified equal to the raw
  file bytes; release_sha `d3cb0ee432184dcb8ba939b14c4bda8d22b89209`; exact 42/125/6+18).
  Remaining pre-window queue (Beads, in dependency order): `mc2-4sz9t` redeploy develop-HEAD
  `q12-lifecycle-core.py` + `source-recovery-run.sh` and rerun ONE fresh green plan →
  `mc2-gyde8` derive accepted coverage `org:course:run` + stage `accepted-coverage-run` 0400 +
  `secrets/db-capability` → `mc2-i9h3y` the owner-present window (C1..C8 quiesces production
  writers, C9 owner-pressed). The writer-quiesce manifest is published in-window by
  `writers.quiesce` itself (stepping hash ZERO→QSHA per the C0 operator procedure), not
  pre-staged.
  2026-07-24 (session 2): `mc2-4sz9t` is CLOSED. The server already carried develop-HEAD
  byte-identical (controller `8d62ca02…`, wrapper `94f923d5…`, 4-file generator closure +
  emit CLI byte-exact; manifest `aaec6fc2…` intact; fresh `py_compile`/`bash -n` OK). Fresh
  pre-window `plan` is GREEN under the WINDOW run-id `0fa297e4-3eb7-475f-aee6-56455f02ed6c`
  (plan and window must share the run-id — the claim path re-reads the catalog from the run
  root): release `e840c128034f47bb55d578f7e3aeb16fb4b35714`, status `planned`, catalog FILE
  sha `fa69efb37423990a20ce661a13f8c6ab185dc38e7f6063d5808c24667ab221e1` (this is
  `--expected-catalog-sha256`), inner structural sha `68041d94…` byte-identical to the
  07-17/21/23 runs, same two delta-neutral test-schema ACL extras, prod untouched.
  OPERATOR IMAGE REFRESH: the Phase B digest `sha256:0fe4265c…` NO LONGER EXISTS in GHCR
  (CI republishes per develop push). The current `develop-d3cb0ee` digest
  `sha256:8aedef32717441a1d5b4093cfad094d09bddafffbcf7a3bfa04d0da3a2d957b0` (contains the
  mc2-af1ay amendment) was pulled on the server, its registry-attached SLSA provenance
  verified (revision `d3cb0ee43…`, source MC-2, target qdrant-operator), and
  `.env.production` `QDRANT_OPERATOR_IMAGE_SHA256` re-pinned (backup
  `.env.production.bak-operator-digest-20260724`). This is the refreshed
  `--operator-digest`. `<run-root>/secrets/db-capability` is minted and staged 0400
  uid 1000; emit-CLI smoke (runbook §1.10) passes the usage gate.
  **HARD GATE — WINDOW NOT OPENABLE (`mc2-gyde8` BLOCKED, owner decision required):** the
  C5 acceptance emit + C6 reindex coverage validation cannot pass against live truth.
  (a) The live DB has NO `document_evidence_runs`/`document_evidence_items` tables — they
  are created EMPTY by the C4 migration `20260711120000_document_evidence.sql`, and Stage-4
  failed-coverage cards are minted only by future post-window generation runs, so
  `getAcceptedRun()` can never return an accepted ledger during the window. (b) The staged
  plan-input's six `eligible_unrecoverable` dispositions span SIX org:course scopes across
  THREE organizations, while `computeSourceForwardAcceptance` + the frozen manifest bind
  exactly ONE `<accepted-coverage-run>` slot and `assertExactScopes` demands the full scope
  set — the "single-course-scoped window recovery" design assumption is contradicted by the
  accepted 07-12 audit truth. Consequence: the wrapper forward tail fails closed at C5
  (after C2 quiesce) and C6 fails on the same validation. Candidate resolutions (owner
  call): file_catalog-only acceptance amendment (analogous to mc2-af1ay), narrow the
  recovery to a single course, or (not recommended) in-window ledger seeding. Evidence and
  code cites on `mc2-gyde8`.
- Capacity-triggered HA, quantization, on-disk hot indexes, custom sharding, and JWT RBAC remain out of scope.

docs-reviewed: updated — the D6 integration, ratified 11/11 tuple, review
lineage, and the next-step Root `.13.13` join now match Beads, the stage
summary, and the D6 artifact (independent docs review PASS after fixes).
project-index: reviewed-no-change — this slice changes stage evidence inside
existing entrypoints, not stable navigation.
graph-reviewed: updated — Graphify local code graph refreshed at the delivered
integration HEAD with `graphify update .` and
`graphify cluster-only . --no-viz --no-label`; no external model/API mode or
Git hook was used.
