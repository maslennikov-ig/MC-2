---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8b-2-iv-1
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform-plan
base_commit: e8696ab63
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller) per the
  launching stream's instruction; NOT pushed. This round's gated iv-PART-1 probe stood up ONE
  disposable postgres:17.10-bookworm container (mc2-q12-fw-src-*) plus /tmp/mc2-q12-d5-root-*
  controller run roots and a /tmp/mc2-q12-barrier-* trust root, all torn down in the runner's finally
  block (verified 0 mc2-q12 containers after the run). The new strict-accept unit runner is no-docker
  and rmtree-cleans its own /tmp/mc2-q12-d5-root-* roots in a finally. The barrier claims run in
  bwrap --unshare-net (private isolated loopback), so the host's 5432 (helixa-postgres-1) is never
  touched. Gated iv-PART-1 SKIPS without MC2_Q12_REAL_PG17=1; the strict-accept unit is ungated
  no-docker. No persistent state, no shared/production DB, no Qdrant Cloud, no prod.
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md gains (a) the RATIFIED transport-adaptation
  provenance amended into BUILD BLUEPRINT step 3 (bwrap WITH --unshare-net + in-netns pooler proxy
  bridging via the docker-exec unix socket, strictly better isolation, ratified as reported), and
  (b) the R8-B-2-iv-1 RESUME implementation-log entry: found-defect #16 FIXED via the ratified
  Option-A write_install_baseline strict-accept core edit, and the NEW sanctioned hard stop at the
  post-activate cleanup leg (found-defect #17, harness-level path virtualization; core correct for
  production). Schema-id doubling filed as Beads mc2-evduu (P3).
graph_reviewed: no-change-needed
graph_review_notes: >-
  The core edit is confined to ONE existing function (Engine.write_install_baseline) with unchanged
  public surface (same name/signature/callers at :2407/:2413/:2621); the two new files are a
  no-docker test wrapper + python runner under packages/course-gen-platform/tests/unit/ops/. No new
  module, no durable-workflow edge, no change to the frozen barrier/manifest/catalog or any W-owned
  file. The existing local graph already models the barrier/harness/core lineage at the right
  granularity; no local Graphify refresh performed (delegated worktree, no architecture change).
verification:
  - 'Branch codex/q12-live-controller for every commit; HEAD at session start e8696ab639. base_commit
    e8696ab63 is the parent of the RED commit f59b17934.'
  - 'FOUND DEFECT #16 FIXED (RATIFIED Option-A strict-accept), TDD. RED: the focused no-docker unit
    tests/unit/ops/q12-write-install-baseline-strict-accept.test.ts (+ its -runner.py, minimal Engine
    via __new__) FAILED on unmodified core -- pre-planting the barrier authoritative 0400 baseline made
    write_install_baseline raise "unsafe file identity" (the #16 collision) instead of strict-accepting
    (1 failed | 3 passed). GREEN after the core edit: 4 passed -- strict-accept admits the barrier full
    12-key structural 0400 baseline WITHOUT writing (byte-unchanged, trace install:baseline-strict-accept),
    the ABSENT path still writes the controller 5-key 0600 baseline, and the fail-closed tamper matrix
    (0600 leftover / wrong run_id / wrong schema_version / non-canonical / unparseable) each raises
    LifecycleError.'
  - 'FIXTURE suites stay GREEN (no-docker, controller-write path untouched): pnpm exec vitest run
    tests/unit/ops/q12-write-install-baseline-strict-accept.test.ts tests/unit/ops/q12-live-controller.test.ts
    tests/unit/ops/q12-production-executor-cleanup.test.ts -> 30 passed (4 strict-accept + 23 controller +
    3 ProductionExecutor cleanup). The absent-path controller 0600 write is byte-identical to before.'
  - 'pnpm exec tsc --noEmit -> exit 0.'
  - 'Gated iv-PART-1 probe (MC2_Q12_REAL_PG17=1 SUPABASE_URL=http://127.0.0.1:54321
    SUPABASE_SERVICE_KEY=synthetic-test-key MC2_Q12_PLAN_DOCKER=/usr/bin/docker) now drives PAST install
    (the fix strict-accepts the barrier baseline) through ALL FIVE real barrier legs + BOTH real
    migrations + activate against the disposable postgres:17.10-bookworm, reaching the post-activate
    cleanup -- then hits FOUND DEFECT #17 (below). ~117s wall before the cleanup-leg failure. This is a
    NEW downstream boundary surfaced only because #16 is now fixed; per the stream contract NO workaround
    was applied (SANCTIONED HARD STOP, RED at cleanup).'
  - 'FOUND DEFECT #17 (thirteenth found defect, HARNESS-level; core CORRECT for production). The real
    frozen barrier cleanup child rejects with "q12 database barrier: test capability must use the fixed
    protected active-run path" (q12-database-barrier.sh:214-216: test-mode requires capability_file ==
    $trust_boundary/backups/q12/$run_id/secrets/db-capability). Root cause: ProductionExecutor.
    prepare_barrier_cleanup (q12-lifecycle-core.py:826-847) builds the cleanup argv --q12-db-capability-file
    from context["run_root"], which in run_live is the controller physical /tmp/mc2-q12-d5-root-* fixture
    run root. The harness dual-bind rewrite (_rewrite_opt_to_trust) maps only /opt/megacampus/... -> the
    trust view, so it cannot rewrite the controller /tmp run-root path to the trust view. The FORWARD legs
    pass because their argv comes from run_claim /opt custody (dual-bound); the DIRECT (not-through-run_claim)
    cleanup child is a THIRD path domain the #15 dual-bind ratification never covered. In PRODUCTION
    context["run_root"] == /opt/megacampus/backups/q12/<run-id>, so the barrier non-test-mode check
    (q12-database-barrier.sh:212) accepts it -- CORE IS CORRECT; the gap is the test-harness path
    virtualization for the direct cleanup child. Reported BEFORE reconciliation; harness left byte-unchanged
    from its built state.'
  - 'Scope: git diff --stat e8696ab63..HEAD = deploy/qdrant/q12-lifecycle-core.py (write_install_baseline
    ONLY, +25/-1) + the two new test files. sha256 q12-database-barrier.sh
    bdb9d935e3c09fb01503ba9d016f36a9cf94db5539dfcdc73c1692eb442925ce (UNCHANGED). No frozen
    manifest/catalog edit, no W-owned edit (q12-writer-resume.py, source-recovery-run.sh,
    q12-source-manifest.ts unchanged), no barrier/harness workaround.'
changed_files:
  - 'deploy/qdrant/q12-lifecycle-core.py: Engine.write_install_baseline ONLY -- the RATIFIED Option-A
    publish-OR-strict-accept core edit (the review-critical surface). No other core function touched.'
  - packages/course-gen-platform/tests/unit/ops/q12-write-install-baseline-strict-accept.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-write-install-baseline-strict-accept-runner.py
  - 'docs/superpowers/plans/2026-07-17-q12-live-controller.md: BUILD BLUEPRINT step-3 transport
    ratification amendment + the R8-B-2-iv-1 resume implementation-log entry (#16 fixed, #17 hard stop).'
  - '.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-iv-1.md: this artifact.'
explicit_defers:
  - >-
    iv-PART-1 GREEN (the 81-row full-window run_live parity + cleanup + seam + resume) is now BLOCKED on
    found-defect #17 (the direct cleanup child's test-harness path virtualization), NOT on #16 (fixed).
    Tracked here + in the plan implementation log. Resolution is a harness change (map the controller
    /tmp/mc2-q12-d5-root-* run root -> the barrier trust view for the direct cleanup argv, mirroring the
    forward-leg dual-bind) requiring orchestrator sign-off BEFORE reconciliation; it may surface further
    real cleanup-leg divergences past that point.
  - >-
    Schema-id doubling (the controller minimal 5-key baseline and the barrier full 12-key structural
    baseline share one schema_version megacampus.q12.database-barrier-baseline/v1) is tracked debt, filed
    as Beads mc2-evduu (P3). NOT fixed this round; needs its own design + re-ratification (barrier frozen).
  - >-
    iv-PART-2 (composed crash -> two-process supervisor -> recover) and iv-PART-3 (multi-epoch cleanup
    re-drive) remain out of this stream (parts 2-3 held).
---

# Summary

R8-B-2-iv-1 RESUME. This round applies the RATIFIED found-defect #16 core fix and resumes the
already-built full-window real `run_live` probe. Two outcomes:

**1. FOUND DEFECT #16 FIXED (RATIFIED Option-A strict-accept) -- the review-critical CORE DIFF.**
The ONLY core edit is `Engine.write_install_baseline` (`deploy/qdrant/q12-lifecycle-core.py`), that
one function, made publish-OR-strict-accept:

```python
def write_install_baseline(self, capability_hash: str) -> None:
    path = self.run_root / "database-barrier-baseline.json"
    if os.path.lexists(path):
        # Found-defect #16: a REAL barrier claim already published its authoritative baseline
        # (0400, full structural schema, load-bearing for activate/rollback restore). The
        # controller's minimal baseline is writers-only (core never reads it), so it MUST NOT
        # overwrite the barrier artifact. Strict-accept it; fail closed on anything else.
        data = validate_regular_file(path, mode=0o400)
        try:
            accepted = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as error:
            raise LifecycleError(f"unsafe install baseline: unparseable barrier baseline {path}") from error
        if not isinstance(accepted, dict) or complete_object(accepted) != data:
            raise LifecycleError(f"unsafe install baseline: non-canonical barrier baseline {path}")
        if accepted.get("schema_version") != "megacampus.q12.database-barrier-baseline/v1":
            raise LifecycleError(f"unsafe install baseline: foreign baseline schema {path}")
        if accepted.get("run_id") != self.request["run_id"]:
            raise LifecycleError(f"unsafe install baseline: foreign baseline run_id {path}")
        self.trace.append("install:baseline-strict-accept")
        return
    claim = next(
        entry for entry in reversed(self.journal)
        if entry["outcome"] == "capability_claimed"
        and entry["capability_manifest_sha256"] == capability_hash
    )
    checkpoint = self.checkpoint_bytes(claim)
    baseline = {
        "schema_version": "megacampus.q12.database-barrier-baseline/v1",
        "run_id": self.request["run_id"],
        "predecessor_journal_entry_hash": claim["entry_hash"],
        "predecessor_checkpoint_sha256": sha256(checkpoint),
        "capability_manifest_sha256": capability_hash,
    }
    immutable_publish(path, complete_object(baseline), 0o600, self.trace)
```

ABSENT path (fixture / fake-barrier) writes the controller 5-key 0600 baseline exactly as before;
PRESENT path strict-accepts the barrier-authoritative 0400 artifact WITHOUT writing, keyed only on
`schema_version` + `run_id` (no shape check, so it admits the barrier's full 12-key structural shape)
and fails closed (`LifecycleError`) on any deviation -- a pre-planted 0600 leftover, unparseable /
non-canonical JSON, a foreign `schema_version`, or a foreign `run_id`. All three install call sites
(`:2407`/`:2413`/`:2621`) are unchanged. TDD: RED strict-accept unit (`f59b17934`) -> GREEN core edit
(`9e352261f`). The strict-accept unit is GREEN, the fixture suites stay GREEN (30 passed), `tsc` 0.

**2. NEW SANCTIONED HARD STOP at the cleanup leg (FOUND DEFECT #17), not a pass.** With #16 fixed, the
gated iv-PART-1 probe drives PAST install (strict-accept) through all five real barrier legs + both
real migrations + activate against the disposable `postgres:17.10-bookworm`, reaching the post-activate
cleanup -- then the real frozen barrier `cleanup` child rejects with `test capability must use the
fixed protected active-run path` (`q12-database-barrier.sh:214-216`). Root cause is HARNESS-level and
core is CORRECT for production: `ProductionExecutor.prepare_barrier_cleanup` (`q12-lifecycle-core.py:826-847`)
builds the cleanup `--q12-db-capability-file` from `context["run_root"]`, which in `run_live` is the
controller physical `/tmp/mc2-q12-d5-root-*` fixture run root; the harness dual-bind rewrite
(`_rewrite_opt_to_trust`) maps only `/opt/megacampus/...` -> the trust view, so it cannot rewrite the
controller `/tmp` run-root path to `$trust_boundary/backups/q12/<run-id>/...`. The forward legs pass
because their argv comes from `run_claim` `/opt` custody (dual-bound); the DIRECT cleanup child is a
THIRD path domain the #15 ratification never covered. In production `context["run_root"] ==
/opt/megacampus/backups/q12/<run-id>` so the barrier non-test-mode check accepts it. Per the stream
contract ("a NEW downstream real divergence past install => STOP + report; no workaround"; "do NOT
ship a fake/rushed green") NO workaround was applied and the harness is byte-unchanged from its built
state -- returned for orchestrator resolution BEFORE reconciliation.

# Verification

See the `verification:` frontmatter list. Highlights: the #16 RED->GREEN TDD triple (strict-accept
unit RED on unmodified core, GREEN after the edit; fixture suites 30 passed; `tsc` 0); the gated
iv-PART-1 probe drives past install through activate then RED at cleanup (found-defect #17); scope
proof (git diff --stat = `write_install_baseline` + the two test files + docs; barrier `bdb9d935…`
UNCHANGED; no frozen/manifest/W-owned edit; no barrier/harness workaround).

# Risks / Follow-ups

- **FOUND DEFECT #17 (blocking iv-PART-1 GREEN, HARNESS-level).** The direct (not-through-`run_claim`)
  cleanup child's capability argv is the controller `/tmp/mc2-q12-d5-root-*` run-root path, which the
  `/opt`->trust rewrite cannot map to the barrier's required trust-view path. Recommended resolution
  (orchestrator sign-off first): extend the harness so the direct cleanup argv is rewritten/bound to
  `$trust_boundary/backups/q12/<run-id>/...` (mirror the forward-leg dual-bind for the controller
  run-root domain). Resuming past this may surface further real cleanup-leg divergences (receipt
  archive, terminal proof, probe receipt, v2 promotion, capability deletion) -- do not rush a green.
- **Schema-id doubling -- Beads `mc2-evduu` (P3, deferred).** The controller minimal 5-key baseline and
  the barrier full 12-key structural baseline share one `schema_version`
  `megacampus.q12.database-barrier-baseline/v1`. Tracked debt; a future schema split or unification
  needs its own design + re-ratification (barrier frozen). Not fixed this round.
- **Transport adaptation (non-blocking, ratified).** bwrap WITH `--unshare-net` (private netns,
  auto-up loopback, uid 1000 preserved) + the pooler proxy inside the netns bridging via the
  docker-exec unix socket -- strictly better isolation than the blueprint's literal shared-net
  host-proxy text (unexecutable where the host binds 5432). Amended into BUILD BLUEPRINT step 3.
- **Parts 2-3 held.** iv-PART-2 (composed crash -> two-process supervisor -> recover) and iv-PART-3
  (multi-epoch cleanup re-drive) remain out of this stream.
