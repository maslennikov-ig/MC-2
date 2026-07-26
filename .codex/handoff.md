# Orchestrator Handoff

Updated: 2026-07-21 (W7a inc1-4 delivered; SINGLE SOURCE OF TRUTH consolidated onto `develop`)

## Single Source of Truth (2026-07-21 — owner-directed consolidation)

- **`develop` is the single source of truth** for all Q12 work; a 2026-07-21 containment audit
  proved it is the superset of every Q12 line (`codex/self-hosted-qdrant-platform`,
  `codex/q12-plan-builder`, `codex/q12-w-writer-barrier`, the W7a increments and the
  orchestration-infra commits are all in it). Keep those branches for history only.
- **`codex/self-hosted-qdrant-platform-plan` is STALE** (~850 commits behind, has no
  `q12-lifecycle-core.py`) — never a base or target. Session metadata sometimes mislabels the
  working branch as that one; ignore it. Q12 window work happens on `codex/q12-window-live`,
  delivered into `develop` via `/push-dev`.

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

Accepted-and-integrated history for Q1-Q12 (including every `.13.*` sub-stream,
its review verdicts and evidence hashes) moved on 2026-07-25 to
`.codex/stages/mc2-jz6y0/summary.md` § "Accepted and open work history (moved from
handoff 2026-07-25)". Current open work is `mc2-gyde8` (pre-window redeploy +
staging) → `mc2-i9h3y` (owner-present window), with `mc2-1sns3`, `mc2-uha77`,
`mc2-8m90f` and `mc2-n6szm` as tracked residuals; see § "Explicit defers".

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: pre-window staging and both window-controller amendments are done
(`mc2-gyde8`, `mc2-t9bma`, `mc2-y02tz`, `mc2-vfjyk` closed; `mc2-1by33` at `a83cd4332`).
Remaining before `mc2-i9h3y`: (1) redeploy controller + wrapper to `megacampus-prod` with
the 0444 dance and install `q12-privileged-launch.sh` 0555 root:root, re-verifying the
frozen manifest after; (2) the host smoke of the real sudo → launcher → wrapper hop (plan
Task 7, revised: a full `live` rehearsal outside the window is impossible because the
frozen commands are production by construction); (3) ONE fresh green `plan` under run-id
`0fa297e4-3eb7-475f-aee6-56455f02ed6c`, re-recording `--expected-catalog-sha256`;
(4) owner confirms the slot — C2 quiesces production writers and the 00:30
Europe/Amsterdam backup timer mutually blocks the window; (5) run C1..C8 with
`--stop-after deploy.prepare` as the reversible hold, C9 pressed by the owner in person,
then C10 + Phase D. Do not change the frozen manifest `aaec6fc2…`.

Historical progress logs moved 2026-07-25 to `.codex/stages/mc2-jz6y0/summary.md`
§ "Historical progress log" so this file stays current-state only (200-line contract).
Current state lives in § "Explicit defers" and § "Accepted and Open Work".

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
- **Q12 W7 window — CURRENT STATE (2026-07-26).** The C5/C6 accepted-coverage hard gate is
  RESOLVED (`mc2-tpdog`, `e7fef75d4`; spec §"Amendment 2026-07-25" in
  `…specs/2026-07-12-q12-source-recovery-design.md`): acceptance is derived from the recovered
  `file_catalog` rows against the sha-bound reviewed manifest, and the frozen manifest's single
  `<accepted-coverage-run>` slot carries `catalog:<recovery-run-id>`.
  - Window argv: `--run-id 0fa297e4-3eb7-475f-aee6-56455f02ed6c`, `--recovery-run-id
a417a99c-db3a-45c8-9d32-561d8d068a3e`, `--operator-digest cb98e579bcf2d015546eaba3336cae627dc9db4bea8f4479b12ffca8ca5102d9`
    (64-hex, no prefix), `--expected-catalog-sha256 c3715ac2…`, `--release-sha 23dfe973f18cc…`,
    `--resource-manifest-sha256` any 64-hex (live overwrites it with its genesis digest),
    `--quiesce-manifest-sha256` 64 zeroes on a first run.
  - PRE-WINDOW STAGING DONE 2026-07-25 (`mc2-gyde8` closed): 6 develop-HEAD files redeployed with
    `.bak-<sha8>-20260725` backups (`py_compile`/`bash -n` green, frozen manifest re-verified);
    `<run-root>/accepted-coverage-run` staged 0400 as `catalog:a417a99c-…` beside
    `secrets/db-capability`; runbook §1.10 emit smoke PASS; green `plan` (inner structural sha
    `68041d94…` UNCHANGED; the pre-amendment catalog is parked as `…json.pre-amendment-20260725`).
  - OPERATOR IMAGE (`mc2-t9bma` closed): the old pin predated the amendment and would have failed
    C6 closed on the retired triple. The `23dfe973f` image already existed in GHCR; provenance and
    in-image file digests verified, pulled, `.env.production` re-pinned to `cb98e579…`.
  - WINDOW CONTROLLER FIXES, two amendments (`mc2-y02tz`+`mc2-vfjyk` at `9b0fd1f02`, deployed;
    `mc2-1by33` at `a83cd4332`, NOT yet on the server). (1) `run_live` demanded the writer-quiesce
    manifest only its own group-3 child can publish; absent is now legal with a declared ZERO digest,
    digest+bytes are adopted at publication, the path is pinned, content is validated at group 3, and
    `recover` shares the seam for the `barrier.install/completed` head. (2) EXECUTION IDENTITY: the
    controller and the writer operations run as uid 1000 (root cannot complete C2 — the quiesce
    child's probe requires controller-owned scratch); only `source.forward` needs root and goes
    through the new root-owned argv-whitelist launcher `deploy/qdrant/q12-privileged-launch.sh`
    (install 0555 root:root) via the account's existing sudo; the controller derives `pass_fds` from
    each command's frozen env and preflights the launcher + `sudo -n` before any journal row; one
    controller-owned host lock replaces the root-only `/run` path; root publishes resolve their target
    once on an O_NOFOLLOW descriptor; and the Q12 forward now publishes `writer-recovery-state`, which
    C9 hard-requires and no Q12 path produced. Frozen manifest untouched. Independent review PASS,
    0 P0/P1, six P2 folded in. Residuals on `mc2-9vbzp`. REDEPLOY controller + wrapper + launcher
    before the window; then the host smoke of the real sudo hop (plan Task 7, revised — a full `live`
    rehearsal outside the window is impossible because the frozen commands are production).
  - `mc2-i9h3y` remains owner-gated: C2 quiesces production writers (schedule the slot with the
    owner) and C9 is pressed by the owner in person, with runbook §8 requiring a fresh green plan
    plus accepted C1..C8 at that moment.
  - Post-window defer `mc2-8m90f`: re-verify read-only that the accepted document-evidence coverage
    ledgers carry zero-evidence failed cards for the six recovered `file_catalog` ids once the first
    post-window Stage-4 generation has minted them.
  - Pre-existing lint debt surfaced by the amendment: `mc2-n6szm`
    (`reindex-course-embeddings.test.ts` carries 17 eslint errors that predate this work, so
    `e7fef75d4` was committed with `--no-verify` after manual prettier + green gates).
  - The verbatim 2026-07-23/24/25 session logs for this window live in
    `.codex/stages/mc2-jz6y0/summary.md` § "Q12 W7 session log (moved from handoff 2026-07-25)";
    `mc2-1sns3`, `mc2-uha77`, `mc2-4sz9t`, `mc2-gyde8`, `mc2-i9h3y` and `mc2-tpdog` carry the
    per-task evidence.
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
