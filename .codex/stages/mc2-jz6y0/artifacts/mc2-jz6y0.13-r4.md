---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r4
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 241ee4e2fc60d6518452d4c70f720d712764a1de
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-live-controller and branch
  codex/q12-live-controller left in place for orchestrator integration; no push.
  Sub-round A is pure in-process fixture journaling (no docker/PG17), so there
  are no container resources to reclaim.
risk_level: medium
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log
  updated (R4 Sub-round A done, under the existing "Round 4 — forward
  ordinary-lifecycle journaling with real child seams (OQ2)" heading) in the
  same delivery; design spec doc unchanged (the seam is exactly what design
  §3/§6.4 already specifies — no new design decision made here). No other
  product-behavior doc changed. Sub-round B adds one further implementation-log
  line ("R4 Sub-round B done ...") under the same heading; no design doc change
  (the real-wrapper barrier claim path is exactly what design §3/§6.4 and
  run_live's existing delegate_claim/executor.launch_claim seam already cover
  — Sub-round A's finding that run_live's barrier chain is executor-injected
  meant no production code change was needed here either).
graph_reviewed: no-change-needed
graph_review_notes: >-
  Local change confined to deploy/qdrant/q12-lifecycle-core.py + ops
  test/fixture files; no architecture, durable workflow, or public-surface
  change. Worktree is a delegated stream awaiting integration, so no local
  Graphify refresh here. Sub-round B touches only ops test/fixture files (no
  production file at all), so the same no-change-needed ruling holds.
verification:
  - 'RED->GREEN: a478a210 -> 292d5177. RED (a478a210, tests-only) added a new q12-live-controller.test.ts describe block requiring (a) the existing groups-1-13 journal twin parity to still hold under BLESSED_EXCLUSIONS (regression guard, unchanged from the R3 assertion), (b) each ordinary lifecycles side result file (ordinary-command-result-<id>-cutover.json) to carry a real-child result_sha256 distinct from the composers "q12-joined-fixture" projection, and (c) the run_live executor audits child_executions to equal exactly 16 (12 ordinary lifecycles via the new seam + 4 pre-existing D5 barrier-chain sandboxed claim delegations through the C7 window, unrelated to this seam). Confirmed RED genuinely failed against unmodified code: TypeError: Cannot convert undefined or null to object at Object.keys(live.resultPaths) (materializeLiveController did not yet expose resultPaths/childExecutions).'
  - 'GREEN (292d5177): append_ordinary_lifecycle (deploy/qdrant/q12-lifecycle-core.py ~1662-1692) now does `hook = getattr(self.executor, "execute_ordinary", None); if hook is not None: result = hook(command, capability); assert result["capability_sha256"] == digest else LifecycleError; else: result = <original hardcoded fixture dict VERBATIM>`, then the existing `if set(result) != RESULT_KEYS: raise` check and the immutable_publish to the per-command side file are UNCHANGED. publish_ordinary_capability`s return is now unpacked as `_, capability, digest = ...` (previously `_, _, digest`) purely to obtain the capability object to pass to the hook; no behavior change to that call. The journal append, phase, capability digest, checkpoint, and accepted_object_sha256 are untouched in both branches, so the seam is parity-neutral by construction (design docs/superpowers/specs/2026-07-17-q12-live-controller-design.md §3/§6.4).'
  - 'The seam is run_live-scoped only. tests/unit/ops/fixtures/q12-retained-barrier-runner.py adds `class LiveOrdinaryExecutor(NoIoExecutor)` with `execute_ordinary(self, command, capability)` returning a RESULT_KEYS-shaped dict: `capability_sha256 = CORE.sha256(CORE.complete_object(capability))` (== the row digest), `result_sha256 = CORE.sha256(f"q12-live-real-child:{command_id}:{run_id}".encode())` (deterministic, distinct from the fixture tag), `status = "accepted"`, and increments `self.child_executions`. run_live_fixture instantiates `LiveOrdinaryExecutor()` (was `NoIoExecutor()`); run_joined_fixture (the composer) is UNCHANGED and still instantiates the plain `NoIoExecutor()` with no execute_ordinary attribute, so `getattr(self.executor, "execute_ordinary", None)` is None there and the composer takes the fallback (original hardcoded) branch, byte-identical to before this round. Verified by reading run_joined_fixture (fixtures/q12-retained-barrier-runner.py:~561) after the change: still `executor = NoIoExecutor()`.'
  - 'Additive fixture plumbing (no existing field touched): run_live_fixture now sets `output["childExecutions"] = executor.child_executions` on the run_live output dict before write_audit/stdout (engine.output() already included resultPaths, list(self.results.items()), unchanged). materializeLiveController (fixtures/q12-retained-barrier-contract.ts) now additionally returns `resultPaths: Record<string,string>` (parsed from output.resultPaths) and `childExecutions: number` (parsed from output.childExecutions), alongside the pre-existing journalEntries and resourceManifestPaths fields.'
  - 'Suites green (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-live-controller.test.ts tests/unit/ops/q12-live-cutover.test.ts tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts): 302/302 (the pre-existing 301 composer/seam + R3 live-controller tests unregressed, plus the new R4 Sub-round A test). Re-run after the GREEN commit for fresh evidence: still 302/302.'
  - 'pnpm exec tsc --noEmit = 0 (re-run after the GREEN commit; exit code 0, no output).'
  - 'Frozen bytes byte-identical, checked before and after the GREEN commit: q12-command-manifest.json sha256 aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841 (matches); q12-database-barrier.sh sha256 134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68 (matches); q12-structural-catalog.sql full-file sha256 prefix 0b8a943f38b43bf9 (matches). No W-owned file changed (q12-writer-resume.py, source-recovery-run.sh, q12-source-manifest.ts untouched; git diff --stat confirms only the 3 intended files changed).'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r4.md -> artifact validation OK.'
  - 'R4 Sub-round B RED->GREEN: 605d359b2 -> 70ee913a4. RED (605d359b2, tests-only) added a new q12-live-controller.test.ts describe block requiring materializeLiveController({..., executeActualWrapper: true}) to (a) keep the groups-1-13 journal a byte/order composer twin under BLESSED_EXCLUSIONS (regression guard, unchanged), (b) report executor-audit.json actualDeployedWrapper === true, and (c) produce a retained-barrier-result side file for each of the 4 in-process barrier claims (install/verify-after-base/verify-after-observability/prepare-recovery). Confirmed RED genuinely failed by git-stashing the fixture/contract changes and running against the unmodified fixture: `RuntimeError: unknown live fixture key: [\'executeActualWrapper\']` (materializeLiveController did not yet forward or support the flag).'
  - 'GREEN (70ee913a4): fixtures/q12-retained-barrier-contract.ts adds `executeActualWrapper?: boolean` to LiveControllerFixtureSpec (additive; forwarded unchanged through the existing `{ liveController: true, ...spec }` spread). fixtures/q12-retained-barrier-runner.py adds `LIVE_SPEC_KEYS |= {"executeActualWrapper"}` and a new `class LiveSandboxedDeployedWrapperExecutor(SandboxedDeployedWrapperExecutor, LiveOrdinaryExecutor)` (no method bodies duplicated — MRO resolves `launch_claim` from `SandboxedDeployedWrapperExecutor` and `execute_ordinary` from `LiveOrdinaryExecutor`, both sharing `NoIoExecutor` state; MRO verified: `LiveSandboxedDeployedWrapperExecutor -> SandboxedDeployedWrapperExecutor -> LiveOrdinaryExecutor -> NoIoExecutor -> object`). `run_live_fixture` now selects this executor when `spec.get("executeActualWrapper")`, else the unchanged plain `LiveOrdinaryExecutor()`. NO production file changed: `deploy/qdrant/q12-lifecycle-core.py` is untouched (`git diff --stat` for this sub-round shows only the 2 fixture/contract files) — run_live''s `retained_chain -> delegate_claim -> executor.launch_claim` call was already executor-injected per Sub-round A''s reading, so wiring in the real-deployed-wrapper executor needed no core change.'
  - 'bwrap ran cleanly with NO harness fix needed: `/usr/bin/bwrap` (bubblewrap 0.11.1) was already present in this environment and `SandboxedDeployedWrapperExecutor.launch_claim` (already used by the existing `q12-live-cutover.test.ts` "executes the actual deployed shell launcher successfully" test) is operation-agnostic, so composing it into run_live''s barrier chain via `LiveSandboxedDeployedWrapperExecutor` worked on the first GREEN run.'
  - 'Suites (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-live-controller.test.ts tests/unit/ops/q12-live-cutover.test.ts tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts): 303/303 (the prior 302 + the 1 new R4 Sub-round B test). Re-run after the GREEN commit for fresh evidence: still 303/303.'
  - 'pnpm exec tsc --noEmit = 0 (re-run after the GREEN commit).'
  - 'Frozen bytes re-verified byte-identical after the GREEN commit: q12-command-manifest.json sha256 aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841; q12-database-barrier.sh sha256 134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68; q12-structural-catalog.sql full-file sha256 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e (prefix 0b8a943f). No W-owned file changed (q12-writer-resume.py, source-recovery-run.sh, q12-source-manifest.ts untouched); `git diff --stat` across both R4 Sub-round B commits confirms only q12-retained-barrier-contract.ts, q12-retained-barrier-runner.py, and q12-live-controller.test.ts changed.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
explicit_defers:
  - 'Sub-round C — the NON-NEGOTIABLE full-Supabase real-source barrier.install -> validateTransition POSITIVE pinned as the R4 acceptance criterion (plan docs/superpowers/plans/2026-07-17-q12-live-controller.md ~:98-111) — is PENDING two orchestrator rulings: (1) the CI identity strategy for running the real barrier.install on a disposable full-Supabase seed (uid 1000 journaler + sudo root children + FD-9 custody, the highest-friction implementation surface per the plans "Open risks carried forward"), and (2) the OQ1 scope boundary (whether/when the quiesce-window-open unknown gates R4 or stays independent of it). Sub-round A does not touch real-PG17, docker, or the barrier.install execution path at all; it is pure in-process fixture journaling on the no-docker suite.'
  - 'Two later-round pins carried from the W-amendment review (not this rounds scope, recorded for the future live-quiesce/resume controller round): (1) run_live must WRITE quiesce-window-mode.json BEFORE writers.quiesce and KEEP it alive through post-activate resume (a marker-lifetime assertion the current round does not exercise, since run_live stops at the C7 planned-exit checkpoint before any resume path); (2) a deferred P3 to consider deriving resume-time mode from the immutable quiesce-manifest barrier.state instead of the mutable marker, plus adding malformed-marker/reverse-flip negatives — flagged for whichever round implements live quiesce/resume, not for Sub-round A.'
---

# Summary

R4 Sub-round A (design docs/superpowers/specs/2026-07-17-q12-live-controller-design.md
§3/§6.4) is delivered on branch `codex/q12-live-controller`: RED `a478a210` ->
GREEN `292d5177` -> docs (this artifact). An injectable, **parity-neutral**
ordinary-execution seam now lets the Task-9 live controllers ordinary command
lifecycles execute a real child through the executor, without changing the
journal (which stays a byte/order twin of the composer oracle) and without
changing the closed composers behavior at all.

`append_ordinary_lifecycle` (`deploy/qdrant/q12-lifecycle-core.py`) now checks for
an optional `executor.execute_ordinary(command, capability)` hook; when present it
delegates to it for the per-command result (asserting the hooks
`capability_sha256` binds to the row digest, else `LifecycleError`), and otherwise
falls back to the original hardcoded `"q12-joined-fixture"` result dict VERBATIM.
Either branch's result is written ONLY to the per-command side file
(`ordinary-command-result-<id>-cutover.json`) — never the journal, a capability
digest, a checkpoint, or an `accepted_object_sha256` — so the journal is
byte/order-identical regardless of which branch runs.

The seam is **run_live-scoped only**: a new `LiveOrdinaryExecutor(NoIoExecutor)`
fixture subclass (`tests/unit/ops/fixtures/q12-retained-barrier-runner.py`) adds
`execute_ordinary` and is wired ONLY into `run_live_fixture`; `run_joined_fixture`
(the composer) is unchanged and keeps the plain `NoIoExecutor` with no
`execute_ordinary` attribute, so it always takes the fallback branch — byte-identical
to before this round.

## R4 Sub-round B

R4 Sub-round B (same design section) is delivered on the same branch: RED
`605d359b2` -> GREEN `70ee913a4` -> docs (this update). This is the
**ORCHESTRATOR-REQUIRED, NO-DOCKER proof** that `run_live`'s in-process barrier
chain (`barrier.install`, `barrier.verify-after-base`,
`barrier.verify-after-observability`, `barrier.prepare-recovery` — the 4
barriers the forward window reaches through the C7 planned-exit checkpoint)
actually drives the **REAL deployed claim wrapper**
`deploy/qdrant/q12-capability-run.sh` end to end — unmodified, executed
verbatim inside a `bwrap` sandbox with only its DB-barrier child
(`q12-database-barrier.sh`) sandbox-faked (the real-PG17/DB transition is a
separate later round). The journal itself stays a byte/order composer twin
regardless of which barrier-claim executor variant runs, since the claim
result lands only in the per-barrier retained-result side file
(`Engine.finish` -> `self.results`), never the journal, a capability digest,
a checkpoint, or an `accepted_object_sha256`.

**No production code changed.** Sub-round A already established that
`run_live`'s `d5()` -> `engine.retained_chain(...)` -> `delegate_claim` ->
`executor.launch_claim(argv, journal_fd)` path is fully executor-injected;
Sub-round B only needed to wire a real-wrapper-capable executor into
`run_live_fixture`, which is test/fixture-only.

`fixtures/q12-retained-barrier-runner.py` adds
`class LiveSandboxedDeployedWrapperExecutor(SandboxedDeployedWrapperExecutor,
LiveOrdinaryExecutor)` — multiple inheritance composes both existing seams
(the real-wrapper `launch_claim` and Sub-round A's `execute_ordinary`) without
duplicating either method body; both share `NoIoExecutor`'s state. `spec.get(
"executeActualWrapper")` selects it in `run_live_fixture` (else the unchanged
plain `LiveOrdinaryExecutor`). `fixtures/q12-retained-barrier-contract.ts`
adds `executeActualWrapper?: boolean` to `LiveControllerFixtureSpec`
(additive; forwarded unchanged through the existing spread into the runner's
stdin payload).

`bwrap` (bubblewrap 0.11.1) was already present and working in this
environment; `SandboxedDeployedWrapperExecutor.launch_claim` is
operation-agnostic (it was already proven against `barrier.install` via the
Root fixture's own `executeActualWrapper` test in `q12-live-cutover.test.ts`),
so composing it into `run_live`'s barrier chain worked without any harness
fix.

# Verification

- RED `a478a210` (tests-only) / GREEN `292d5177` (core + fixture). RED confirmed
  genuinely failing against unmodified code: `TypeError: Cannot convert undefined
or null to object at Object.keys(live.resultPaths)` (the new test needs
  `materializeLiveController` to expose `resultPaths`/`childExecutions`, which did
  not exist pre-GREEN).
- Suites (from `packages/course-gen-platform`,
  `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key
pnpm exec vitest run --config vitest.config.unit.ts
tests/unit/ops/q12-live-controller.test.ts tests/unit/ops/q12-live-cutover.test.ts
tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts
tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts`): **302/302**
  (the pre-existing 301 composer/seam + R3 live-controller tests unregressed, plus
  the 1 new R4 Sub-round A test). Re-run after the GREEN commit for fresh
  evidence: still 302/302.
- `pnpm exec tsc --noEmit` = 0 (re-run after the GREEN commit).
- Frozen bytes verified byte-identical before and after: `q12-command-manifest.json`
  `aaec6fc2…`, `q12-database-barrier.sh` `134255ce…`, `q12-structural-catalog.sql`
  prefix `0b8a943f…`. No W-owned file (`q12-writer-resume.py`,
  `source-recovery-run.sh`, `q12-source-manifest.ts`) touched.
- `validate_artifact.py` on this file -> OK.

## R4 Sub-round B

- RED `605d359b2` (tests-only) / GREEN `70ee913a4` (fixture/contract only, no
  production file). RED confirmed genuinely failing against the unmodified
  fixture (verified by `git stash` of the runner.py/contract.ts changes with
  only the new test committed): `RuntimeError: unknown live fixture key:
['executeActualWrapper']`.
- Suites (same 4-suite command as Sub-round A, run from
  `packages/course-gen-platform`): **303/303** (the prior 302 + the 1 new R4
  Sub-round B test). Re-run after the GREEN commit for fresh evidence: still
  303/303.
- `pnpm exec tsc --noEmit` = 0 (re-run after the GREEN commit).
- Frozen bytes re-verified byte-identical after the GREEN commit:
  `q12-command-manifest.json` `aaec6fc2…`, `q12-database-barrier.sh`
  `134255ce…`, `q12-structural-catalog.sql` prefix `0b8a943f…`. No W-owned
  file touched. `git diff --stat` for the Sub-round B commits shows only
  `q12-retained-barrier-contract.ts`, `q12-retained-barrier-runner.py`, and
  `q12-live-controller.test.ts` changed — `deploy/qdrant/q12-lifecycle-core.py`
  is untouched.
- `bwrap` ran cleanly on the first GREEN attempt; no harness fix was needed.
- `validate_artifact.py` on this file (after this update) -> OK.

# Risks / Follow-ups

- **Sub-round C is PENDING two orchestrator rulings (explicit defer, not attempted
  here):** the NON-NEGOTIABLE full-Supabase real-source `barrier.install` ->
  `validateTransition` POSITIVE pinned as the R4 acceptance criterion needs (1) a
  ruling on the CI identity strategy for running the real `barrier.install` on a
  disposable full-Supabase seed, and (2) a ruling on the OQ1 scope boundary. Sub-round
  A is pure in-process fixture journaling (no docker/PG17) and does not touch the
  real `barrier.install` execution path.
- **Two later-round pins from the W-amendment review (recorded, not in this
  round's scope):** for the future live-quiesce/resume controller round —
  (1) `run_live` must WRITE `quiesce-window-mode.json` BEFORE `writers.quiesce`
  and KEEP it alive through post-`activate` resume (a marker-lifetime assertion);
  (2) a deferred P3 to consider deriving resume-time mode from the immutable
  quiesce-manifest `barrier.state` instead of the mutable marker, plus adding
  malformed-marker/reverse-flip negatives.
- **`child_executions` audit semantics clarified by this round's test:** the
  run_live executor audit's `child_executions` counts BOTH the new
  ordinary-execution seam invocations (12, one per ordinary lifecycle through the
  C7 window) AND the pre-existing D5 barrier-chain sandboxed claim delegations
  (4 — install/verify-after-base/verify-after-observability/prepare-recovery),
  which already crossed a real subprocess boundary before this round via
  `launch_claim`/`delegate_claim` and are unrelated to this seam. The test asserts
  the exact total (16) with this breakdown documented inline, rather than assuming
  the counter is seam-exclusive.
- **R4 Sub-round B is delivered (this update):** the in-process barrier chain
  (`barrier.install`/`verify-after-base`/`verify-after-observability`/
  `prepare-recovery`) now provably drives the REAL deployed
  `q12-capability-run.sh` wrapper end to end (only its DB-barrier child is
  sandbox-faked). This does **not** close Sub-round C: Sub-round C is the
  NON-NEGOTIABLE full-Supabase real-source `barrier.install` ->
  `validateTransition` POSITIVE against a real PG17 DB barrier child (not a
  sandbox fake), which remains PENDING the same two orchestrator rulings
  listed below (CI identity strategy + OQ1 scope boundary). Sub-round B stays
  entirely no-docker/no-real-PG17, proving only the wrapper-custody path.
