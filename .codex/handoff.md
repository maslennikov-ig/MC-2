# Orchestrator Handoff

Updated: 2026-07-16
Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion
Integration branch: pushed `codex/self-hosted-qdrant-platform` at `b97a827b`.
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
- Publisher `.13.9`, G7 `.13.7.2`, D5 decision `.13.17`, and Root producer `.13.18` are accepted/integrated. D5W seam `.13.20` is closed: source `3dd9ad53`, correctness/docs delta reviews P0-P3 zero, integration/W reruns 271/271, cleanup evidence `c150a4c2`, source worktree/local branch removed. The preserved W branch is clean and pushed at `60910053`. The joined-fixture task `.13.21` is implemented, independently reviewed, and integrated; W `.13.10`, M `.13.11`, and H `.13.12` are closed and integrated (see below); Root `.13.13` is blocked on the live-only tuple field 11. No remote/live mutation occurred.
- D6 decision `.13.19` has an ignored owner-ready candidate SHA-256 `2a2251ac0c03c042a61cc698728c012b9c68e0a9404df0e2f616eb3ec026aae5`; final independent review SHA-256 `948982d99895489c6fefa1fb831791f7e02bb524bb268713e712629a6bdab5a7` is PASS with P0-P3 zero. On 2026-07-15 the owner approved Option A as the written-contract direction, including its sole narrow post-`R` closed-terminal exception. D6 implementation waits for accepted W and a reviewed plan; the current Fable delegation supplies local implementation authority, while remote/live authority remains separate.
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
- The W activation tuple `.13.10` addendum materialized 10/11 fields
  (field 10 owner-ratified; fields 5/6/8/9 catalog-bound). Field 11 (managed
  session roster) is live-only by contract line `:160`, so D6 `.13.19` Task 0
  and transitively Root `.13.13` are BLOCKED as explicit defers until the live
  window. The frozen D6 activation-truth contract byte-identity is
  `2a2251ac…`; its reviewed plan (successor-aware Task 15/GC4) is
  `docs/superpowers/plans/2026-07-15-q12-d6-activation-truth.md`. The
  LIVE-BOUNDARY RE-FREEZE CHECKLIST (field 11 roster + production re-freeze of
  fields 5/6/8/9) is recorded in the D6 plan and on the beads.
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
- Final `.13.7` execution documentation correction `7b446d7d` is integrated and independently rereviewed at `0b7ffe67` (integration `a0c12554`) with P0-P3 zero. The runbooks identify one sole executable PG17 packet, require the fresh custom-format backup and isolated restore before migrations, place source recovery before reindex, preserve guarded rollback, and reject the observed 20-byte empty backup artifacts.

## Next recommended

Next stage id: `mc2-jz6y0`

All safe LOCAL Q12 correction work is COMPLETE: W `.13.10`, M `.13.11`,
H `.13.12`, D5J `.13.21`/`.13.22` are closed and integrated at `a73a3651`
with the full local release matrix green.

`.13.7` is DELIVERED (backup gate green, PG17 digests integrated). The owner
authorized the remote tail on 2026-07-16 and explicitly deferred `.13.8`
password rotation.

Recommended action: continue the authorized remote tail with the live window:

1. Live window — materialize W-tuple field 11 (managed session roster), run
   the LIVE-BOUNDARY RE-FREEZE CHECKLIST (re-freeze fields 5/6/8/9 against
   production), then execute D6 `.13.19` Tasks 0-20 and the Root join
   `.13.13` local acceptance, GHCR publication, and the live-cutover packet.
2. `.13.8` — owner-deferred password rotation of the working DSN.
3. `.13.6` — off-host S3 remains the production-gate defer.

Before any of these, present exact effects, secrets, observation, rollback
and downtime/data impact, and obtain owner approval.

## Starter prompt for next orchestrator

Use $orchestrator-stage.

Resume from this handoff plus `.codex/stages/mc2-jz6y0/summary.md` at the
resolved SHA of `origin/codex/self-hosted-qdrant-platform`; the remaining Q12
work is the remote/live tail listed above.

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
- D6 `.13.19` and Root `.13.13` are BLOCKED explicit defers: D6 Task 0
  requires W-tuple field 11 (managed session roster), which is live-only by
  the frozen contract; Root joins after D6. Both resume in the live window via
  the LIVE-BOUNDARY RE-FREEZE CHECKLIST. The frozen contract, reviewed plan,
  and 10/11 materialized tuple fields are integrated and pushed. None of this
  permits server, Supabase, service, container, Qdrant, deployment, or live
  actions.
- Known accepted boundaries (documented by design, not debt): the joined
  composer's partial-capture fixture is truthful only while W validates held
  checkpoints as a creation-order prefix without a journaled counter (review
  P2-3); §5 tamper-append of a fully valid row is outside the tamper
  protection by design (append of VALID bytes is indistinguishable from
  authorship — the guarded property is prefix integrity); M's residual P2-4
  libpq variables (`PGSSLCERT`/`PGSSLKEY`/`PGSSLPASSWORD`/`PGCHANNELBINDING`/
  `PGGSSENCMODE`) are proven non-exploitable with the explicit `ssl` object.
- The PG17 security-manifest digest is intentionally not computed locally: it
  must come from the real restore drill and is routed into gate `.13.7` (the
  allowlist `DOCUMENT_EVIDENCE_SECURITY_MANIFEST_SHA256` covers PG15/16 only;
  manifest hashes FAIL on vanilla PG17.10).
- Off-host S3 is not a staging blocker after the 2026-07-12 owner decision; it
  remains the explicit production readiness defer `mc2-jz6y0.13.6`.
- Prometheus retention YAML migration is the bounded nonblocking defer
  `mc2-jz6y0.25`, due before the next Prometheus pin change.
- The current pushed `codex/self-hosted-qdrant-platform` integration branch/worktree is intentionally retained for Q12. Final cleanup returned non-zero only because it correctly refused to delete this checked-out continuation branch; all Q11-owned worktrees, local branches, containers, ports and temporary data are cleaned.
- Stop if snapshot/alert secrets are required and unavailable, source gaps would change product truth, ownership conflicts cannot be isolated, or a required gate repeatedly fails after in-scope diagnosis.
- Capacity-triggered HA, quantization, on-disk hot indexes, custom sharding, and JWT RBAC remain out of scope.

docs-reviewed: updated — W/H/M/D5J closures, the frozen D6 contract/plan, the
10/11 tuple, the full local release matrix, and the blocked live tail now
match Beads and the stage summary.
project-index: reviewed-no-change — this slice changes stage evidence inside
existing entrypoints, not stable navigation.
graph-reviewed: updated — Graphify local code graph refreshed at the delivered
integration HEAD with `graphify update .` and
`graphify cluster-only . --no-viz --no-label`; no external model/API mode or
Git hook was used.
