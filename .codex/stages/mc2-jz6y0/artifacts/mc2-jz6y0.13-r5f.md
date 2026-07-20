---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r5f
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: f1334bf6c
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-live-controller and branch
  codex/q12-live-controller left in place for orchestrator integration; no push. R5 Sub-round F is a
  CLI routing skeleton (shell + argparse + main() dispatch + a production fail-closed post-activate
  gate); no docker/PG17 run and no production run root were created (/opt/megacampus is not writable
  here), so there are no container/host resources to reclaim.
risk_level: medium
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log gained the R5
  Sub-round F entry (RED 9bcc3a38e -> GREEN bb8f93679 -> docs). No design-spec or product-behavior
  doc changed: the operator live/recover invocation shapes were already specified in
  docs/superpowers/specs/2026-07-13-q12-live-cutover-corrections-design.md sections 9/11, and the
  production fail-closed post-activate gate is a safety decision flagged for orchestrator
  confirmation, not a new contract. The R5-E artifact gained one explicit_defers bullet recording a
  P3 test-double fidelity gap surfaced during this round (no code change).
graph_reviewed: no-change-needed
graph_review_notes: >-
  Local change confined to deploy/qdrant/q12-live-cutover.sh (2 elif routing branches),
  deploy/qdrant/q12-lifecycle-core.py (2 argparse subparsers + one main() dispatch branch + one
  production guard inside orchestrate_post_activate_cleanup), a new focused ops test file, and docs;
  no architecture, durable workflow, or public-contract change beyond the already-specified operator
  CLI surface. Worktree is a delegated stream awaiting integration.
verification:
  - 'Commits: RED 9bcc3a38e (new focused test file tests/unit/ops/q12-live-cutover-cli.test.ts; live/recover routing, argparse, main() dispatch, and the production post-activate gate all absent) -> GREEN bb8f93679 (shell routing + argparse subparsers + main() dispatch + the production fail-closed guard). RED evidence: 5/6 tests failed with the feature absent (live routing, recover routing, argparse subparsers, main() dispatch source, and the production gate) while the "keeps plan/supervisor shell routing byte-identical" guard already passed (that routing is unchanged); GREEN 6/6.'
  - 'live/recover argparse args (identical operator argv both controllers consume): --run-id, --release-sha, --operator-digest, --resource-manifest-sha256, --quiesce-manifest-sha256, --expected-catalog-sha256, --quiesce-manifest-path. These are exactly the request fields run_live/run_recover read (Engine.__post_init__ reads run_root/run_id/resource_manifest_sha256/quiesce_manifest_sha256; run_live/run_recover read quiesce_manifest_path + quiesce_manifest_sha256 for the digest check, expected_catalog_sha256 for post-activate, release_sha/operator_digest for the journal rows they append; resource_manifest_sha256 is required at Engine construction then re-derived from genesis (live) or the durable tail (recover)).'
  - 'REQUEST built by main() for live/recover (mirrors the supervisor branch verbatim + adds the run_live/run_recover-only fields): run_root=/opt/megacampus/backups/q12/<run-id> (ensure_directory), lock_path=run_root.parent/cutover.lock opened O_RDWR|O_CREAT|O_NOFOLLOW 0o600 and dup2''d onto FD 9 under fcntl.flock LOCK_EX|LOCK_NB, then request = {run_root, run_id, release_sha, operator_digest, resource_manifest_sha256, quiesce_manifest_sha256, expected_catalog_sha256, quiesce_manifest_path, rotation_required: False, lease_fd: 9, lock_identity: [st_dev, st_ino], production: True}. Dispatch: controller = run_live if arguments.mode == "live" else run_recover; output = controller(request, ProductionExecutor()).'
  - 'SHELL routing: q12-live-cutover.sh adds `elif [[ ${1:-} == live ]]; then mode=live; shift` and `elif [[ ${1:-} == recover ]]; then mode=recover; shift` as a PURE INSERTION before the existing closing `fi`. The plan/--plan decision+action (mode=plan; shift), the mode=supervisor default, and the exec line (exec /usr/bin/python3 "${SCRIPT_DIR}/q12-lifecycle-core.py" "$mode" "$@") are byte-identical (git diff shows zero deletions). No supervisor operation is named live/recover, so the default-supervisor path is uncollided.'
  - 'HOW routing/dispatch was tested WITHOUT a real production run root (/opt/megacampus is not writable in CI): (a) SHELL ROUTING via `<mode> --help` through the REAL shell (spawnSync /usr/bin/bash q12-live-cutover.sh live|recover|plan --help) — argparse prints the subparser usage and exits 0 BEFORE main() opens the /opt run root, so exit-0 + the subparser''s own option surface (--quiesce-manifest-path etc.) proves the shell reached that exact core subcommand; plus the plan/supervisor source bytes asserted verbatim and a bare --fixture invocation proven to still route to the supervisor subparser (exit != 0, argparse rejects). (b) ARGPARSE: python3 q12-lifecycle-core.py live|recover --help exit 0; an unknown mode exits != 0. (c) DISPATCH WIRING: source-structure assertions on q12-lifecycle-core.py (arguments.mode in ("live","recover"); controller = run_live if ... else run_recover; controller(request, ProductionExecutor()); /opt/megacampus/backups/q12/{arguments.run_id}; "production": True) AND that run_supervisor/run_claim/run_plan/run_smoke dispatch lines are unchanged. A full production cutover was deliberately NOT executed (no /opt write, no docker).'
  - 'SAFETY GATE (production-only fail-closed, exact text + location): orchestrate_post_activate_cleanup (deploy/qdrant/q12-lifecycle-core.py) now, when execute_barrier_cleanup or execute_forward_resume is absent, raises LifecycleError("post-activate cleanup/resume executor not wired (deferred to R8)") if request.get("production") is True, else returns None (unchanged degrade). Rationale: a production cutover that ACTIVATES (76th row) then silently skips the post-activate cleanup+resume would leave the paused writers NEVER RESUMED. recover reuses the same path via drive_forward_tail, so the gate protects it too. Proven at the exact seam both controllers funnel through: a python probe imports the core module, builds a stub engine whose executor lacks both hooks, asserts the production request raises exactly that message AND a non-production request returns None. The non-production fixture path (hooks present) is unchanged, so all R5-E tests stay green. FLAGGED for orchestrator confirmation.'
  - 'plan/supervisor/claim/smoke dispatch in main() is BYTE-UNCHANGED: the live/recover branch is inserted before the run_claim fallthrough; git diff of q12-lifecycle-core.py is purely additive (zero deletions), and the source-structure test asserts output = run_supervisor(request, ProductionExecutor()) / run_claim(arguments, ProductionExecutor()) / run_plan(arguments, LivePlanExecutor()) / run_smoke(arguments) all still present.'
  - 'Suites green (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts): the required 4-suite set (q12-live-controller + q12-live-cutover + q12-retained-barrier-quiesce-seam + q12-retained-barrier-w-composition-seam) + the new q12-live-cutover-cli + the shell-driving q12-command-manifest + q12-migration-plan ran 386 passed / 12 skipped across 7 files (q12-live-cutover-cli.test.ts 6/6; the R5-A..E controller + retained-barrier suites re-run green, so the shell/argparse change is parity-neutral). pnpm exec tsc --noEmit = 0.'
  - 'Frozen bytes byte-identical after GREEN: q12-command-manifest.json aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841, q12-database-barrier.sh 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9, q12-structural-catalog.sql 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e. No W-owned file changed (q12-writer-resume.py / source-recovery-run.sh / q12-source-manifest*.ts untouched, verified via git status). No new journal command_id, no frozen manifest/grammar change (the new args are argparse-only operator argv; run_live/run_recover journal exactly the same 76-row forward twin).'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5f.md AND .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5e.md -> both artifact validation OK (re-validated after commit in case lint-staged/prettier reformatted the .md).'
changed_files:
  - deploy/qdrant/q12-live-cutover.sh
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-cutover-cli.test.ts
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5f.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5e.md
explicit_defers:
  - 'REAL post-activate executor hooks are round R8. ProductionExecutor still does NOT expose
    execute_barrier_cleanup / execute_forward_resume (the real docker/PG17 barrier cleanup + sudo
    source-recovery-run.sh writers.resume.forward). Until R8 wires them, a PRODUCTION live/recover
    that reaches the post-activate boundary FAILS CLOSED with the NAMED LifecycleError above rather
    than half-cutting (activate committed, writers never resumed). This is the intended safe
    skeleton behaviour this round, FLAGGED for orchestrator confirmation, not a silent omission.'
  - 'PRODUCTION FAIL-CLOSED GATE is a decision made this round and needs orchestrator sign-off. The
    gate is scoped ONLY to request.get("production") is True; the non-production fixture path keeps
    degrading to None (so all R5-E tests stay green). If the orchestrator instead wants R8 to land
    the hooks BEFORE any operator-reachable live path exists, the alternative is to withhold the
    live/recover CLI entirely until R8 — but that leaves no operator entrypoint to rehearse routing.
    Recorded so the orchestrator can confirm the fail-closed-until-R8 choice.'
  - 'NO real production cutover was executed and no /opt/megacampus run root was created (not
    writable in this worktree). Routing/dispatch are proven via argparse-usage + source structure,
    and the production gate at the orchestrate_post_activate_cleanup seam. A full server-side
    live/recover rehearsal against the real run-root/lease/docker is the pre-window gate + R8 scope,
    unchanged by this round.'
---

# Summary

R5 Sub-round F (operator-reachable `live`/`recover` CLI wiring) is delivered on branch
`codex/q12-live-controller`: RED `9bcc3a38e` → GREEN `bb8f93679` → docs. The operator shell
`deploy/qdrant/q12-live-cutover.sh` now routes `$1 == live` → `mode=live` and `$1 == recover` →
`mode=recover` as a pure `elif` insertion before the existing closing `fi`; the `plan`/`--plan`
decision+action, the `mode=supervisor` default, and the `exec` line stay byte-identical.
`parser()` adds `live` + `recover` subparsers carrying the identical operator argv both controllers
consume (`--run-id`, `--release-sha`, `--operator-digest`, `--resource-manifest-sha256`,
`--quiesce-manifest-sha256`, `--expected-catalog-sha256`, `--quiesce-manifest-path`). `main()` gains
one `arguments.mode in ("live", "recover")` branch, inserted before the `run_claim` fallthrough so
`plan`/`supervisor`/`claim`/`smoke` dispatch is byte-unchanged, that mirrors the supervisor
branch's production seam — run root `/opt/megacampus/backups/q12/<run-id>`, canonical parent
`cutover.lock` inherited on FD 9 under an exclusive `flock`, `production: True` — plus the
`run_live`/`run_recover`-only fields, then dispatches
`controller = run_live if mode == "live" else run_recover` with `ProductionExecutor()`.

**Safety gate (production-only fail-closed):** because `ProductionExecutor` does NOT yet expose the
R8 `execute_barrier_cleanup`/`execute_forward_resume` hooks, and a production cutover that ACTIVATES
(the 76th journal row) and then silently skipped the post-activate cleanup+resume would leave the
paused writers NEVER RESUMED, `orchestrate_post_activate_cleanup` now FAILS CLOSED with a NAMED
`LifecycleError("post-activate cleanup/resume executor not wired (deferred to R8)")` when the hooks
are absent AND `request.get("production") is True`. The non-production fixture path (hooks present,
or absent → `None`) is unchanged, so every R5-E test stays green; `recover` reuses the same
post-activate path via `drive_forward_tail`, so the gate protects it too. This makes the R5-F CLI a
real, safe routing skeleton that fails closed until R8 wires the children, not a silent
half-cutover — FLAGGED for orchestrator confirmation.

# Verification

- RED `9bcc3a38e` (5/6 fail: live/recover routing, argparse, main() dispatch, production gate;
  plan/supervisor byte-identical guard already passes) → GREEN `bb8f93679` (6/6).
- Routing/dispatch tested without a real production run root (`/opt/megacampus` not writable):
  `<mode> --help` through the real shell exits 0 in argparse before `main()` touches the run root;
  argparse subparsers exist + unknown mode errors; `main()` dispatch proven by source structure with
  plan/supervisor/claim/smoke unchanged; the production gate proven at the exact
  `orchestrate_post_activate_cleanup` seam both controllers funnel through.
- `q12-live-cutover-cli.test.ts` 6/6; required 4-suite set + cli + shell-driving
  `q12-command-manifest`/`q12-migration-plan` = 386 passed / 12 skipped (7 files); `tsc --noEmit` 0.
- Frozen bytes byte-identical (`aaec6fc2…`/`3673ee49…`/`0b8a943f…`); no W-owned file changed; core +
  shell diff purely additive (zero deletions); no new journal `command_id`.
- `validate_artifact.py` on this file and on `mc2-jz6y0.13-r5e.md` → both OK.

# Risks / Follow-ups

- **Real post-activate children are R8.** `ProductionExecutor` still lacks the docker/PG17 cleanup +
  resume hooks; a production `live`/`recover` correctly FAILS CLOSED at the post-activate boundary
  until R8 wires them. Intended safe behaviour, flagged for orchestrator confirmation.
- **Production fail-closed gate needs sign-off.** The gate is scoped only to `production is True`;
  the fixture path is unchanged. Recorded for the orchestrator to confirm the fail-closed-until-R8
  choice versus withholding the operator CLI until R8.
- **No real production cutover was run.** Routing/dispatch/gate are proven via argparse-usage +
  source structure + the seam; a full server-side rehearsal against the real run-root/lease/docker
  is the pre-window gate + R8 scope, unchanged by this round.
- **P3 test-double fidelity gap** (recorded in the R5-E artifact this round, no code change): the
  R5-E fixture resume validator does not re-check the nested `probes`/`residue` VALUES the real
  W-owned gate enforces at `q12-writer-resume.py:1131-1134`; the real gate is untouched and the
  fixture producer emits correct values. Flagged for the R5 review.
