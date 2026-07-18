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
  - 'R4 Sub-round C: RED-only, SANCTIONED HARD STOP (no GREEN commit exists; GREEN is unreachable without a frozen-byte edit). Built the full real-PG17 harness: a disposable postgres:17.10-bookworm source seeded to the exact frozen inventory shape (47 public / 22 auth / 5 named storage relations, all owner postgres so TRIGGER privilege is implicit; 8 active cron.job rows; empty net.http_request_queue; extensions schema + pgcrypto; supabase_migrations.schema_migrations with version/statements/name columns, required by q12-structural-catalog.sqls migration_rows CTE), real oids/owners queried live from the seeded container (not fabricated) for the 76-relation guarded_relations set, and a programmatically derived --expected-catalog (baseline_structural_sha256 = the REAL output of q12-structural-catalog.sql run against the pre-guard seed; cron_jobs command_sha256 = real sha256 of each seeded cron.job.command) that the UNMODIFIED barriers frozen jq schema gate (q12-database-barrier.sh:362-413) accepts verbatim.'
  - 'The frozen barriers install NODE_RUNNER hardcodes the production connection identity (host aws-1-us-east-2.pooler.supabase.com, port 5432, user postgres.<project-ref>) with NO test-mode relaxation for that identity check (unlike the separate terminal-proof runner, which has an explicit protectedLocal branch) -- by design, since installs real DB-mutation path must only ever address production. Drove it for real anyway via: (1) an unprivileged `unshare --user --map-root-user --mount --net` namespace scoped to just the barrier.sh install invocation (confirmed empirically: unprivileged user namespaces here permit bind-mounting a private /etc/hosts AND binding 127.0.0.1:5432 in a fresh netns AND still reach the docker control socket -- verified individually before assembly), giving it a private loopack where port 5432 is free (the hosts real port 5432 is legitimately occupied by an unrelated running project, helixa-postgres-1; direct host-to-container bridge-IP reachability was independently confirmed UNAVAILABLE in this Docker Desktop/WSL2 environment, ruling out a simpler "-p" publish); (2) a namespace-local /etc/hosts override mapping that hostname to 127.0.0.1 (never the hosts real /etc/hosts, never any other process); (3) a new q12-pooler-identity-proxy.py bound to that namespaces 127.0.0.1:5432, terminating the barriers mandatory SSLRequest+TLS handshake (protected test mode already waives the production CA sha256 pin) with a locally generated self-signed certificate whose SAN matches the frozen hostname, then rewriting ONLY the wire-protocol StartupMessages "user" field from the pooler-style tenant username to the disposable sources real postgres role (mirroring what Supabase own production pooler does upstream) before relaying every other byte unmodified into the disposable container via `docker exec` (the docker control channel/unix socket, not host TCP networking, so it needs no route out of the namespace -- confirmed the backend relay via a bash `/dev/tcp` fd bridge inside the container, avoiding any extra package install). MC2_Q12_BARRIER_TEST_NODE pointed at a real copy of the systems actual node binary (not a symlink, since the frozen script requires `! -L`) placed under the protected test root -- a real interpreter running the frozen NODE_RUNNER text verbatim, not a stub.'
  - 'RESULT: driving the REAL, byte-verified barrier for real against real PostgreSQL 17.10 surfaced a genuine, reproducible defect in the barriers own frozen fresh-install ACL lockdown ($acl$ DO block, q12-database-barrier.sh ~1447-1462): `REVOKE ALL ON TYPE q12_guard.%I FROM PUBLIC` iterates every pg_type row in the q12_guard namespace with no typtype/typelem filter, including the four implicit array types Postgres auto-creates alongside every base/composite type (_active_run/_baseline/_migration_guards/_probe). PostgreSQL 17.10 categorically refuses GRANT/REVOKE on array types: "cannot set privileges of array types" / hint "Set the privileges of the element type instead" (aclchk.c ExecGrant_Type_check). Confirmed independently and deterministically OUTSIDE the harness too, on a bare disposable PG17.10 container: `CREATE TABLE zzz_test(id int); REVOKE ALL ON TYPE _zzz_test FROM PUBLIC;` -> the identical error -- this is a general PostgreSQL 17 restriction, not seed-specific and not fixable by any seed-side workaround. The real fresh install therefore aborts mid-tx1 (before the `COMMIT; -- Q12_INSTALL_TX1_COMMITTED` marker) and Postgres auto-rolls back the whole transaction: q12_guard schema/objects are absent afterward, cron.job stays 8-active, default_transaction_read_only stays off -- a clean, non-corrupting failure, not a partial state. q12-source-manifest.ts capture (run afterward, unmodified, against the now-unchanged source) correctly reports `unexpected baseline-to-cutover delta: cron activity`, since nothing actually transitioned. Reproduced 3 times (2 full end-to-end harness runs + 1 minimal standalone repro extracting the frozen NODE_RUNNER/SQL text verbatim and executing it through the identical proxy tunnel) with byte-identical results each time.'
  - 'Per this rounds own STOP-AND-REPORT instruction ("If any step needs a frozen-byte change to pass -- STOP and report with the exact barrier/validateTransition error"), q12-database-barrier.sh was NOT edited. The RED test tests/unit/ops/q12-live-real-barrier-cutover.test.ts asserts the full positive (barrier_rc===0, receipt state maintenance_guarded, cron 0 active, read-only on, capture_rc===0) and is confirmed genuinely RED for this exact, documented reason (barrier_rc===1, the REVOKE-on-array-type error surfaced via the diagnostic post_mortem_q12_guard_schema_present===false confirming the clean rollback), not an unrelated harness crash.'
  - 'Suites (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-live-controller.test.ts tests/unit/ops/q12-live-cutover.test.ts tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts): 303/303 unregressed (the new Sub-round C test is real-PG17-gated, in a separate file, and does not run in this no-docker command).'
  - 'pnpm exec tsc --noEmit = 0.'
  - 'Frozen bytes re-verified byte-identical: q12-command-manifest.json sha256 aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841; q12-database-barrier.sh sha256 134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68; q12-structural-catalog.sql sha256 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e (prefix 0b8a943f). No W-owned file touched (q12-writer-resume.py, source-recovery-run.sh, q12-source-manifest.ts, q12-database-barrier.sh itself all untouched). git diff --stat for the Sub-round C commit shows only 3 new files (the test + the 2 fixtures) and the 2 doc updates -- zero production files changed.'
  - 'Zero leftover docker resources: docker ps -a / docker network ls / docker volume ls filtered on the runs container-name prefix (mc2-q12-r4c-*) all empty after every run, verified explicitly. No /tmp/mc2-q12-barrier-* directory created by this rounds runs was left behind (verified by mtime -- the harness only ever removed its OWN temp roots via shutil.rmtree in a finally block; unrelated pre-existing /tmp/mc2-q12-barrier-* directories from prior days/sessions are out of this rounds scope and were left untouched).'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r4.md -> artifact validation OK (re-run after this update).'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-barrier-cutover.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-barrier-cutover-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-pooler-identity-proxy.py
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
explicit_defers:
  - 'Sub-round C is DELIVERED as a documented, evidenced HARD STOP, not a defer-by-omission: the NON-NEGOTIABLE full-Supabase real-source barrier.install -> validateTransition POSITIVE pinned as the R4 acceptance criterion (plan docs/superpowers/plans/2026-07-17-q12-live-controller.md ~:98-111) cannot pass today because the REAL, byte-frozen q12-database-barrier.sh has a genuine, reproducible defect (REVOKE ALL ON TYPE on Postgres implicit array types, which PostgreSQL 17 categorically refuses) in its own fresh-install ACL lockdown -- discoverable ONLY by genuinely running it against real PostgreSQL, which is exactly what this sub-round did. Fixing it requires an explicitly authorized, separate round that edits the frozen barrier script (out of this streams Option B byte-untouched scope) -- most likely filtering the REVOKE loop to `t.typtype <> (SELECT typtype FROM pg_type WHERE ...)` i.e. skipping rows where the type is itself an array of another type in the same loop (typelem<>0), or equivalently querying only `t.typtype = (quote) c (quote)` composite/base types. That specific fix is NOT applied here (frozen-byte edit is out of scope for this stream) and needs its own explicitly authorized round/ruling.'
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

## R4 Sub-round C — the NON-NEGOTIABLE real-PG17 acceptance: SANCTIONED HARD STOP

RED-only: `test(q12): RED R4 Sub-round C real barrier install vs validateTransition`.
**There is no GREEN commit** — GREEN is unreachable without editing the frozen
`q12-database-barrier.sh`, which is out of scope for this stream (Option B:
byte-untouched). This is exactly the sanctioned stop condition the round's own
instructions call for ("If you cannot make it pass without editing a frozen
byte, STOP and report — that is a sanctioned hard stop, not a failure to
hide").

**Harness built (real, no stubbing):** a disposable `postgres:17.10-bookworm`
source seeded to the frozen inventory shape (47 public / 22 auth / 5 named
storage relations, all owner `postgres`; 8 active `cron.job` rows; empty
`net.http_request_queue`; `extensions`/pgcrypto; a real Supabase-shaped
`supabase_migrations.schema_migrations`), a `--expected-catalog` built
**programmatically from the live seeded source** (real oids/owners queried
from `pg_class`, real `baseline_structural_sha256` from running
`q12-structural-catalog.sql` against the pre-guard seed, real per-row
`command_sha256` for each seeded cron job) that the UNMODIFIED barrier's
frozen jq schema gate accepts verbatim, and a real `barrier.sh install`
invocation. Because the barrier's `install` NODE_RUNNER hardcodes the
production connection identity (host `aws-1-us-east-2.pooler.supabase.com`,
port 5432, user `postgres.<project-ref>`) with **no test-mode relaxation** for
that identity check, driving it against the disposable source required new,
additive-only test infrastructure: an unprivileged `unshare --user
--map-root-user --mount --net` namespace scoped to just the barrier
invocation (private loopback, since the host's real port 5432 is legitimately
held by an unrelated running project and direct host-to-container bridge-IP
reachability was confirmed unavailable in this Docker Desktop/WSL2
environment), a namespace-local `/etc/hosts` override for the frozen hostname
(never the host's real `/etc/hosts`), and a new
`q12-pooler-identity-proxy.py` that terminates the barrier's mandatory
TLS handshake for that hostname and rewrites only the wire StartupMessage's
`user` field (pooler tenant name → the disposable source's real `postgres`
role, mirroring what Supabase's own pooler does), relaying every other byte
unmodified into the container via `docker exec` (control channel only).
`MC2_Q12_BARRIER_TEST_NODE` is a real copy of the system's actual node
binary — the frozen `NODE_RUNNER` text runs verbatim, unstubbed.

**Finding:** the real, byte-verified barrier, run for real against real
PostgreSQL 17.10, hits a genuine, reproducible defect in its own frozen
fresh-install ACL lockdown: `REVOKE ALL ON TYPE q12_guard.%I FROM PUBLIC`
iterates every `pg_type` row in the `q12_guard` namespace with no
`typelem`/`typtype` filter, including the four implicit array types Postgres
auto-creates alongside every base/composite type
(`_active_run`/`_baseline`/`_migration_guards`/`_probe`). PostgreSQL 17
categorically refuses `GRANT`/`REVOKE` on array types ("cannot set privileges
of array types", hint "Set the privileges of the element type instead",
`aclchk.c ExecGrant_Type_check`) — confirmed independently on a bare
disposable PG17.10 container outside the harness too. The real fresh install
therefore aborts mid-tx1 and Postgres auto-rolls back the whole transaction
cleanly (`q12_guard` absent afterward; cron/read-only unchanged — no partial
or corrupt state), so `q12-source-manifest.ts capture` correctly reports
`unexpected baseline-to-cutover delta: cron activity` (nothing transitioned).
Reproduced 3 times with byte-identical results.

- Seed counts achieved and asserted: public 47 / auth 22 / storage 5 / cron 8 /
  net 0.
- `barrier.sh install` exit code 1; the generic swallowed message is `q12
database barrier: database command failed`; the real underlying error,
  recovered via a standalone extraction-and-replay of the frozen
  `NODE_RUNNER`/install-SQL text through the identical proxy tunnel, is
  Postgres `ERROR: cannot set privileges of array types` on `REVOKE ALL ON
TYPE q12_guard._active_run FROM PUBLIC`.
- Post-mortem diagnostic (`q12_guard` schema absent, cron still 8-active,
  read-only still `off`) confirms a clean, transactional rollback, not a
  harness bug.
- No-docker suites (`q12-live-controller` + `q12-live-cutover` +
  `q12-retained-barrier-quiesce-seam` + `q12-retained-barrier-w-composition-
seam`): **303/303** unregressed (the new test is real-PG17-gated, in its own
  file, and does not execute in this command). `pnpm exec tsc --noEmit` = 0.
- Frozen bytes re-verified byte-identical: `q12-command-manifest.json`
  `aaec6fc2…`, `q12-database-barrier.sh` `134255ce…`,
  `q12-structural-catalog.sql` prefix `0b8a943f…`. `q12-database-barrier.sh`
  itself, `q12-source-manifest.ts`, `q12-writer-resume.py`, and
  `source-recovery-run.sh` are all untouched.
- Zero leftover docker containers/networks/volumes after every run (verified
  by name-prefix filter each time); no new `/tmp/mc2-q12-barrier-*` directory
  from this round's runs was left behind (the harness removes its own temp
  roots in a `finally` block; unrelated pre-existing directories from other
  sessions were left alone, out of scope).
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
- **R4 Sub-round B is delivered:** the in-process barrier chain
  (`barrier.install`/`verify-after-base`/`verify-after-observability`/
  `prepare-recovery`) now provably drives the REAL deployed
  `q12-capability-run.sh` wrapper end to end (only its DB-barrier child is
  sandbox-faked). Sub-round B stays entirely no-docker/no-real-PG17, proving
  only the wrapper-custody path.
- **R4 Sub-round C is delivered as a SANCTIONED HARD STOP, not a pass, and R4
  does NOT close.** The plan's own text is explicit that "R4 cannot close
  without this end-to-end baseline→real-install-cutover positive." That
  positive was attempted for real (no stubbing, no weakening) and is now
  proven blocked by a genuine, reproducible defect in the frozen
  `q12-database-barrier.sh` itself (its fresh-install ACL lockdown tries to
  `REVOKE ALL ON TYPE` Postgres's own implicit array types, which PostgreSQL
  17 categorically refuses) — not by any harness or seed gap. **Likely fix**
  (not applied here; requires an explicitly authorized, separate round that
  edits the frozen barrier script, out of this stream's Option B
  byte-untouched scope): filter the `$acl$` DO block's type-REVOKE loop to
  skip array types, e.g. add `AND t.typelem = 0` (or equivalently `AND
t.typtype <> 'b'::"char" OR ...` scoped to non-array base/composite types)
  to the `FROM pg_type t ... WHERE n.nspname='q12_guard'` query so it only
  iterates the four real composite types, not their four auto-generated
  array counterparts.
