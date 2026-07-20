# Orchestrator Handoff

Updated: 2026-07-19 (window executability verified NOT openable; W1-W7 handoff package prepared — see CURRENT STATE below)
Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion
Integration branch: `codex/self-hosted-qdrant-platform` at the Root-join
integration head `fcd05e27` (D6 slice `8717f7ac` pushed; the .13.13 docs
slice pushes with this update).
It carries the full accepted correction wave: D5J `66e41cb5`, W FLIP
`60910053`, H blue/green handoff `70bf6103`, the W activation-tuple addendum
`3da324d8`, frozen D6 contract/plan docs `d1627f1c`, and the M migration
credential merge `a73a3651`. The preserved W branch/worktree
`codex/q12-w-writer-barrier` is clean and pushed at `60910053` (its two
formerly uncommitted files are committed and integrated). The dedicated
integration worktree remains authoritative for Q12.

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
